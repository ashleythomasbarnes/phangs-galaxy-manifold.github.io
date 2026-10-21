"""Scientific aggregation and real-catalogue checks for the MUSE export."""

import json
import unittest

import numpy as np
from astropy.table import Table

import export_nebulae as en


class NebulaeTests(unittest.TestCase):
    def test_validity_and_pp04_boundaries(self):
        flux = np.array([4., 3., 0., -1., np.nan, 9., 9., 9.])
        error = np.array([1., 1., 1., 1., 1., 0., -1., np.nan])
        np.testing.assert_array_equal(en.valid_line(flux, error), [True] + [False] * 7)
        z = en.metallicity(np.array([-1., -.999, 0., 1.899, 1.9, np.nan]))
        self.assertTrue(np.isnan(z[[0, 4, 5]]).all())
        np.testing.assert_allclose(z[[1, 2, 3]], 8.73 - .32 * np.array([-.999, 0., 1.899]))
        np.testing.assert_allclose(en.numbers(np.ma.array([1, 2], mask=[0, 1])), [1., np.nan])

    def test_weighted_mean_quantiles_and_missing(self):
        result = en.weighted_stats(np.array([3., 1., 2., np.nan, 99., 99.]),
                                   np.array([1., 1., 2., 100., 0., -1.]))
        self.assertEqual(result, dict(n=3, mean=2., median=2., p16=1., p84=3.))
        self.assertEqual(en.weighted_stats(np.array([1., 2.]), np.array([1., 1.]))["median"], 1.)
        self.assertEqual(en.weighted_stats(np.array([np.nan]), np.array([1.]))["n"], 0)

    def test_summed_lines_differ_and_use_common_sets(self):
        flux = {"HA6562": np.array([100., 10.]), "HB4861": np.array([30., 2.]),
                "OIII5006": np.array([3., 30.]), "NII6583": np.array([50., 1.])}
        errors = {k: np.full(2, .01) for k in flux}
        values = en.region_values(flux, errors)
        # The second region has O3N2 > 1.9 but its flux still belongs in the sum.
        self.assertTrue(np.isnan(values["OH_PP04"][1]))
        summed, counts = en.summed_values(flux, errors)
        expected = 8.73 - .32 * np.log10((33 / 32) / (51 / 110))
        self.assertAlmostEqual(summed["OH_PP04"], expected)
        self.assertEqual(counts["OH_PP04"], 2)
        mean = en.weighted_stats(values["N2Ha"], np.array([100., 10.]))["mean"]
        self.assertNotAlmostEqual(mean, summed["N2Ha"], places=3)
        errors["OIII5006"][1] = np.nan
        summed, counts = en.summed_values(flux, errors)
        self.assertEqual(counts["OH_PP04"], 1)
        self.assertEqual(counts["N2Ha"], 2)
        self.assertAlmostEqual(summed["O3Hb"], np.log10(3 / 30))

    def test_real_catalogue_and_independent_summary(self):
        summary, region_data = en.build_catalogues()
        self.assertEqual(summary["counts"], dict(nebulae=31497, hii_regions=23244, galaxies=19, pp04_regions=23237))
        regions = region_data["regions"]
        self.assertEqual(len({(r["galaxy"], r["id"]) for r in regions}), 23244)
        self.assertTrue(all(r["flags"]["HII_class_v3"] == 1 for r in regions))
        self.assertTrue(all(set(r["values"]) == set(en.KEYS) for r in regions))
        table = Table.read(en.SOURCE)
        names = np.asarray(table["gal_name"]).astype(str)
        for name in ("NGC0628", "NGC1365", "IC5332"):
            rows = table[(names == name) & (np.asarray(table["HII_class_v3"]) == 1)]
            ha, hb, o3, n2 = [np.asarray(rows[k + "_FLUX"]) for k in en.LINES]
            index = np.log10(o3 / hb) - np.log10(n2 / ha)
            good = (index > -1) & (index < 1.9)
            z = 8.73 - .32 * index[good]
            weight = np.asarray(rows["Lum_HA6562_CORR"])[good]
            expected = np.sum(z * weight) / np.sum(weight)
            host = next(g for g in summary["galaxies"] if g["name"] == name.lower())
            self.assertAlmostEqual(host["values"]["mean"]["OH_PP04"], expected)
            summed = 8.73 - .32 * np.log10((o3.sum() / hb.sum()) / (n2.sum() / ha.sum()))
            self.assertAlmostEqual(host["values"]["summed"]["OH_PP04"], summed)
        # Regeneration must agree with the web products, with strict JSON serialization.
        for name, product in (("nebulae_summary.json", summary), ("nebulae_regions.json", region_data)):
            self.assertEqual(json.loads((en.DATA / name).read_text()), product)
            json.dumps(product, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
