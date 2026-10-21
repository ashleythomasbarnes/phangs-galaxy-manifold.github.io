#!/usr/bin/env python3
"""Make a compact display-only JPEG HiPS from one celestial FITS image."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = Path('/Users/abarnes/Library/CloudStorage/Dropbox/Data/Extragalactic/ngc628mosaic/jwst/phangs/ngc0628_miri_lv3_f770w_i2d_anchor.fits')
DEFAULT_OUTPUT = ROOT / 'site/data_phangs/hips/ngc0628-f770w'


def image_wcs(hdu):
    if not isinstance(hdu, (fits.PrimaryHDU, fits.ImageHDU, fits.CompImageHDU)) or hdu.header.get('NAXIS') != 2:
        raise ValueError('HDU must be a two-dimensional image')
    wcs = WCS(hdu.header).celestial
    if not wcs.has_celestial or not all(hdu.header.get(f'NAXIS{i}', 0) > 0 for i in (1, 2)):
        raise ValueError('Image needs valid celestial WCS and nonempty axes')
    ny, nx = hdu.shape
    sky = wcs.pixel_to_world([0, nx - 1, nx / 2], [0, ny - 1, ny / 2]).icrs
    if not np.all(np.isfinite(sky.ra.deg)) or not np.all(np.isfinite(sky.dec.deg)) or np.linalg.det(wcs.pixel_scale_matrix) == 0:
        raise ValueError('Invalid celestial WCS')
    return wcs


def select_hdu(hdul, explicit=None):
    if explicit is not None:
        key = int(explicit) if str(explicit).isdigit() else explicit
        index = hdul.index_of(key)
        image_wcs(hdul[index])
        return index
    # Prefer SCI, including failing clearly if a declared SCI image is invalid.
    if 'SCI' in hdul:
        index = hdul.index_of('SCI')
        image_wcs(hdul[index])
        return index
    for index, hdu in enumerate(hdul):
        try:
            image_wcs(hdu)
            return index
        except (ValueError, TypeError):
            continue
    raise ValueError('No two-dimensional science image with celestial WCS found')


def stretch_image(data, limits=None):
    valid = np.isfinite(data)
    if not valid.any():
        raise ValueError('Science image has no finite pixels')
    lo, hi = map(float, limits if limits is not None else np.percentile(data[valid], [0.5, 99.5]))
    if not np.isfinite([lo, hi]).all() or hi <= lo:
        raise ValueError('Intensity limits must be finite and increasing; use --limits for a constant image')
    # Global asinh softening = 0.1 of the selected intensity range.
    result = np.full(data.shape, np.nan, dtype=np.float32)
    result[valid] = 255 * np.arcsinh(10 * np.clip((data[valid] - lo) / (hi - lo), 0, 1)) / np.arcsinh(10)
    return result, [lo, hi]


def write_properties(path, updates):
    lines = path.read_text().splitlines()
    lines = [line for line in lines if line.split('=', 1)[0].strip() not in updates and not line.startswith('hipsgen_params')]
    path.write_text('\n'.join(lines + [f'{key} = {value}' for key, value in updates.items()]) + '\n')


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--hipsgen', type=Path, required=True, help='Path to official CDS Hipsgen.jar')
    parser.add_argument('--hdu', help='Explicit HDU index or extension name')
    parser.add_argument('--order', type=int, default=12, choices=range(3, 15), metavar='3..14')
    parser.add_argument('--limits', type=float, nargs=2, metavar=('MIN', 'MAX'))
    parser.add_argument('--quality', type=int, default=80, choices=range(1, 96), metavar='1..95')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and not args.overwrite:
        parser.error(f'Output exists: {output}; use --overwrite to replace it')
    if output.exists() and not (output / 'build.json').is_file():
        parser.error('Only an existing generated HiPS with build.json may be overwritten')
    if not args.hipsgen.is_file():
        parser.error('Hipsgen.jar does not exist; see README.md')
    if shutil.which('java') is None:
        parser.error('Java runtime is required')
    # Never allow replacement of a parent directory or the directory containing the input.
    if output == ROOT or output in ROOT.parents or args.input.resolve().is_relative_to(output):
        parser.error('Unsafe output directory')
    with fits.open(args.input, memmap=True) as hdul:
        index = select_hdu(hdul, args.hdu)
        hdu = hdul[index]
        wcs = image_wcs(hdu)
        stretched, limits = stretch_image(hdu.data, args.limits)
        ny, nx = stretched.shape
        center = wcs.pixel_to_world((nx - 1) / 2, (ny - 1) / 2).icrs
        corners = wcs.pixel_to_world([-.5, nx - .5, nx - .5, -.5], [-.5, -.5, ny - .5, ny - .5]).icrs
        # A diameter enclosing every corner, with a little room around the mosaic.
        fov = float(2.1 * center.separation(corners).deg.max())
        selected = {'index': index, 'name': hdu.name, 'shape': [ny, nx]}
        header = wcs.to_header(relax=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Work next to the destination, then publish only after successful generation.
    with tempfile.TemporaryDirectory(prefix='.hips-build-', dir=output.parent) as temp:
        work = Path(temp)
        source = work / 'display.fits'
        fits.PrimaryHDU(stretched, header).writeto(source)
        hips = work / 'hips'
        # Recent Hipsgen jars omit the offline landing-page template. Supply a
        # harmless classpath fallback; this intermediate page is never published.
        (work / 'index-template.html').write_text('<!doctype html><title>Display HiPS</title>')
        classpath = os.pathsep.join([str(args.hipsgen.resolve()), str(work)])
        subprocess.run(['java', '-Xmx1g', '-Djava.awt.headless=true', '-cp', classpath, 'cds.hipsgen.HipsGen',
                        f'in={source}', f'out={hips}', f'order={args.order}', 'tileWidth=512',
                        'frame=equatorial', 'pixelCut=0 255 linear', 'maxThread=2',
                        'id=local/P/PHANGS/NGC0628/F770W', 'INDEX', 'TILES', 'PNG'], check=True)
        # Encode once from lossless previews rather than re-compressing existing JPEGs.
        pngs = list(hips.glob('Norder*/*/*.png')) + list(hips.glob('Norder*/Allsky.png'))
        if not pngs:
            raise RuntimeError('Hipsgen produced no preview tiles')
        published = work / 'published'
        published.mkdir()
        for png in pngs:
            target = (published / png.relative_to(hips)).with_suffix('.jpg')
            target.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(png) as image:
                rgba = image.convert('RGBA')
                background = Image.new('RGB', image.size, 'black')
                background.paste(rgba, mask=rgba.getchannel('A'))
                background.convert('L').save(target, quality=args.quality, optimize=True)
        for name in ('properties', 'Moc.fits'):
            shutil.copy2(hips / name, published / name)
        write_properties(published / 'properties', {
            'hips_tile_format': 'jpeg', 'hips_pixel_bitpix': '8',
            'obs_title': 'NGC 628 JWST MIRI F770W (display preview)',
            'obs_description': 'PHANGS JWST anchored mosaic; grayscale asinh JPEG preview, not calibrated science data.',
            'hips_initial_ra': center.ra.deg, 'hips_initial_dec': center.dec.deg,
            'hips_initial_fov': fov, 'hips_status': 'private clonableOnce',
            'obs_regime': 'Infrared',
        })
        # Do not publish local filesystem paths in provenance.
        report = {'source': args.input.name, 'source_sha256': sha256(args.input),
                  'hdu': selected, 'stretch': 'asinh', 'asinh_softening': 0.1,
                  'limits': limits, 'percentiles': [0.5, 99.5] if args.limits is None else None,
                  'order': args.order, 'tile_width': 512, 'jpeg_quality': args.quality,
                  'pixel_arcsec': float(np.sqrt(np.pi / 3) * 180 / np.pi * 3600 / (512 * 2**args.order)),
                  'center': [float(center.ra.deg), float(center.dec.deg)], 'fov_deg': fov,
                  'footprint': [[float(ra), float(dec)] for ra, dec in zip(corners.ra.deg, corners.dec.deg)],
                  'jpeg_files': len(pngs), 'display_only': True,
                  'preview_tile': str(sorted(published.glob(f'Norder{args.order}/Dir*/*.jpg'))[0].relative_to(published)),
                  'hipsgen_sha256': sha256(args.hipsgen)}
        (published / 'build.json').write_text(json.dumps(report, indent=2) + '\n')
        if output.exists():
            shutil.rmtree(output)
        shutil.move(str(published), output)
    report['total_bytes'] = sum(p.stat().st_size for p in output.rglob('*') if p.is_file())
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
