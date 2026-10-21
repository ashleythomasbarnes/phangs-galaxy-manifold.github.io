# NGC 628 JPEG HiPS preview

1. Install Java (tested with Java 17) and the project's Python dependencies:
   `uv sync`.
2. Download the official CDS generator outside the website:

   ```sh
   curl -fL https://aladin.cds.unistra.fr/hips/Hipsgen.jar -o /tmp/Hipsgen.jar
   ```

3. From the repository root, build the supplied PHANGS JWST MIRI F770W mosaic:

   ```sh
   uv run tools/phangs_hips/build_hips.py --hipsgen /tmp/Hipsgen.jar
   ```

   The default input is
   `/Users/abarnes/Library/CloudStorage/Dropbox/Data/Extragalactic/ngc628mosaic/jwst/phangs/ngc0628_miri_lv3_f770w_i2d_anchor.fits`.
   Use `--input /path/to/image.fits` on another machine. Output defaults to
   `site/data_phangs/hips/ngc0628-f770w/`, independent of the launch directory.

4. Serve the website:

   ```sh
   python3 -m http.server 8000 -d site
   ```

   Open http://localhost:8000, search for **NGC628**, and select it. The inspector widens to show the static survey and JWST F770W side by side.
   The interactive panel appears automatically and shows only JWST, with zoom
   and reset controls. The default and Reset views centre on the PHANGS galaxy
   position with a one-arcminute field, focusing on the central region.
   On narrow screens the two maps stack vertically.

## Display choices

The script selects `SCI`, otherwise the first 2D image with celestial WCS,
including the primary HDU. `--hdu SCI` or `--hdu 0` overrides that selection.
Only the selected image array is read. ERR, weight and other extensions are
not tiled. A declared but invalid SCI image fails clearly.

Defaults: one global 0.5–99.5 percentile asinh stretch (softening 0.1), order 12,
512-pixel tiles, grayscale JPEG quality 80. Pixels are approximately 0.101
arcsec across, close to the source sampling of 0.111 arcsec, for sharper zooming. The finite science values define the percentiles; NaNs/infinities
stay missing through reprojection, then appear black in JPEG.

Optional settings:

```sh
uv run tools/phangs_hips/build_hips.py --hipsgen /tmp/Hipsgen.jar \
  --input /path/to/image.fits --hdu SCI --order 10 --quality 85 \
  --limits 0.06 15 --output /tmp/ngc628-f770w
```

Use `--overwrite` to replace a previously generated output containing
`build.json`. Generation completes in a temporary directory before replacement.
Order 12 preserves native sampling; use order 9 for a smaller 0.805 arcsec preview.
Each additional order increases tile volume.
The generator uses lossless PNG intermediates and encodes final JPEGs once.
Intermediate FITS, PNG and index files are discarded. The tiny `Moc.fits`
coverage file is retained; it contains no science image tiles.

`build.json` records the input filename/hash, selected HDU, stretch limits,
footprint, sampling, tile count and generator hash. The script prints these
plus the final total byte count. The committed order-12 example contains 46
image tiles and one Allsky preview, totalling about 752 KB including metadata.
The JPEGs are display products, not calibrated MJy/sr measurements.

The script supplies an intermediate HTML template on Java's classpath because
recent Hipsgen jars omit the offline landing-page fallback. The template is
not published. Tiling itself runs locally without external science services.

## Hosting and checks

GitHub Pages already publishes `site/`. Only the JPEG pyramid, properties,
coverage and build report need hosting. `site/js/config/hips.js` contains the
survey URL; an external host must serve it over HTTPS with CORS enabled.
Aladin Lite 3.8.1 is downloaded from CDS only when NGC 628 is inspected. The static survey retains its existing network requirements. The viewer runs in an iframe which is removed when
closing the inspector or inspecting another galaxy.

```sh
uv run python -m unittest discover -s tools/phangs_hips -v
node --test site/tests/
```

Check simultaneous static/JWST display, static survey switching, JWST pan/zoom
and reset, closing/reopening the inspector, another galaxy, and narrower windows. A missing properties/build file
or representative JPEG tile produces a visible error while the separate static map stays
available. Outside the mosaic or beyond available coverage, blank sky is black.

Reference: [CDS Hipsgen manual](https://aladin.cds.unistra.fr/hips/HipsgenReferenceManual.html).
