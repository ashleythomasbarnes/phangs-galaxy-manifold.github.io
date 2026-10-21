"""Small synthetic checks, without Java or the real mosaic."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from build_hips import image_wcs, select_hdu, stretch_image, write_properties


def image(name=None):
    w = WCS(naxis=2)
    w.wcs.ctype = ['RA---TAN', 'DEC--TAN']
    w.wcs.crpix = [3, 3]
    w.wcs.crval = [24.17, 15.78]
    w.wcs.cdelt = [-.001, .001]
    return fits.ImageHDU(np.arange(25, dtype=float).reshape(5, 5), w.to_header(), name=name)


class BuildTests(unittest.TestCase):
    def test_science_preferred_and_explicit_override(self):
        hdul = fits.HDUList([fits.PrimaryHDU(), image('ERR'), image('SCI')])
        self.assertEqual(select_hdu(hdul), 2)
        self.assertEqual(select_hdu(hdul, '1'), 1)
        self.assertEqual(select_hdu(hdul, 'SCI'), 2)

    def test_primary_and_first_valid_image(self):
        good = image()
        primary = fits.PrimaryHDU(good.data, good.header)
        self.assertEqual(select_hdu(fits.HDUList([primary, image()])), 0)
        hdul = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.ones((3, 3))), good])
        self.assertEqual(select_hdu(hdul), 2)

    def test_invalid_wcs_or_dimensions(self):
        for hdu in [fits.PrimaryHDU(), fits.ImageHDU(np.ones((3, 3))), fits.ImageHDU(np.ones((2, 3, 3)))]:
            with self.assertRaises(ValueError):
                image_wcs(hdu)
        with self.assertRaises(ValueError):
            select_hdu(fits.HDUList([fits.PrimaryHDU()]))
        with self.assertRaises(ValueError):
            select_hdu(fits.HDUList([fits.PrimaryHDU(), image('SCI')]), '0')

    def test_global_stretch_preserves_missing_pixels(self):
        data = np.array([[np.nan, -1, 0], [1, 5, np.inf]], dtype=float)
        result, limits = stretch_image(data, [0, 5])
        np.testing.assert_array_equal(np.isnan(result), ~np.isfinite(data))
        self.assertEqual(limits, [0, 5])
        self.assertEqual(result.dtype, np.float32)
        self.assertEqual(result[0, 1], 0)
        self.assertAlmostEqual(result[1, 1], 255)
        self.assertGreater(result[1, 0], 51)  # asinh reveals faint structure
        _, automatic = stretch_image(np.arange(100.))
        np.testing.assert_allclose(automatic, [.495, 98.505])
        for values, cuts in [(np.full((2, 2), np.nan), None), (np.ones((2, 2)), None), (data, [5, 0])]:
            with self.assertRaises(ValueError):
                stretch_image(values, cuts)

    def test_properties_describe_only_published_format(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'properties'
            path.write_text('hips_tile_format = fits png\nhipsgen_params = in=/private/data\nhips_order = 9\n')
            write_properties(path, {'hips_tile_format': 'jpeg'})
            self.assertEqual(path.read_text(), 'hips_order = 9\nhips_tile_format = jpeg\n')


if __name__ == '__main__':
    unittest.main()
