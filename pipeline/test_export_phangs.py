"""Focused offline checks: python3 -m unittest discover -s pipeline -p 'test_*.py'."""
import json
import math
import unittest

import numpy as np
from astropy.table import Table

import export_phangs as ep
from fetch_phangs_ned import parse_sizes


class ExportTests(unittest.TestCase):
    def test_missing_values(self):
        for x in (None, np.ma.masked, np.nan, np.inf, 0, -1):
            self.assertIsNone(ep.positive(x))
        row = {"props_mstar": 1e10, "props_sfr": 1, "props_mhi": np.ma.masked,
               "size_r90": np.ma.masked, "dist": 10.}
        self.assertEqual(ep.properties(row), {"logM": 10, "logSFR": 0, "logsSFR": -10, "logfHI": None, "logSigma": None})

    def test_circular_r90_surface_density(self):
        # This angle at 10 Mpc is a 1 kpc radius. The full mass, not 0.9 M,
        # must be divided by pi R^2 (not the half-light 2 pi R^2).
        row = {"props_mstar": math.pi * 1e8, "props_sfr": 1, "props_mhi": 1e8,
               "size_r90": 648000 / (math.pi * 10000), "dist": 10.}
        self.assertAlmostEqual(ep.properties(row)["logSigma"], 8.)
        row["dist"] = 20.
        self.assertAlmostEqual(ep.properties(row)["logSigma"], 8. - math.log10(4))
        for field in ("props_mstar", "size_r90", "dist"):
            for bad in (None, np.ma.masked, np.nan, np.inf, 0, -1):
                with self.subTest(field=field, bad=bad):
                    self.assertIsNone(ep.properties({**row, field: bad})["logSigma"])

    def test_matching_wraparound_and_ambiguity(self):
        ra, dec = np.array([359.999, 10.0]), np.array([0., 0.])
        m = ep.match_position(.001, 0, ra, dec)
        self.assertEqual(m["status"], "matched")
        self.assertAlmostEqual(m["candidates"][0]["separation_arcsec"], 7.2, places=6)
        self.assertEqual(ep.match_position(9, 0, ra, dec)["status"], "unmatched")
        self.assertEqual(ep.match_position(None, 0, ra, dec)["status"], "missing_coordinates")
        self.assertEqual(ep.match_position(10, 0, np.array([10., 10.001]), dec)["status"], "ambiguous")
        self.assertEqual(ep.match_position(0, 90, np.array([180.]), np.array([90.]))["status"], "matched")

    def test_angular_sizes_and_distance_uncertainty(self):
        row = {"dist": 10., "dist_unc": .05}
        for field in ep.SIZE_FIELDS:
            row[field], row[field + "_unc"] = 20., 2.
        size = ep.sizes(row)["size_reff"]
        self.assertAlmostEqual(size["kpc"], (20 * ep.math.pi / 648000) * 10000)
        expected = size["kpc"] * np.hypot(.1, np.log(10) * .05)
        self.assertAlmostEqual(size["unc_kpc"], expected)
        row["size_reff"], row["size_scalelength_unc"] = np.ma.masked, np.nan
        self.assertIsNone(ep.sizes(row)["size_reff"]["kpc"])
        self.assertIsNone(ep.sizes(row)["size_scalelength"]["unc_kpc"])

    def test_ned_definitions_are_not_interchangeable(self):
        xml = b'''<VOTABLE version="1.3" xmlns="http://www.ivoa.net/xml/VOTable/v1.3"><RESOURCE>
        <TABLE><PARAM name="QUERY_STATUS" datatype="char" arraysize="*" value="OK"/>
        <FIELD ID="freq_target" name="Bandpass" datatype="char" arraysize="*"/>
        <FIELD ID="dia_type" name="Type" datatype="char" arraysize="*"/>
        <FIELD ID="Comments" name="Comments" datatype="char" arraysize="*"/>
        <DATA><TABLEDATA>
        <TR><TD>r (SDSS Petrosian)</TD><TD>See comments</TD><TD></TD></TR>
        <TR><TD>r (SDSS Exponential)</TD><TD>Half-light (effective) diameter</TD><TD>Effective radius</TD></TR>
        <TR><TD>r (SDSS Petrosian)</TD><TD>Half-light diameter</TD><TD>50% of Petrosian flux</TD></TR>
        <TR><TD>0.5-7 keV Chandra</TD><TD>Half-light diameter</TD><TD></TD></TR>
        </TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>'''
        rows = parse_sizes(xml)
        self.assertFalse(rows[0]["petrosian_r50"])
        self.assertTrue(rows[1]["optical_half_light"])
        self.assertFalse(rows[1]["petrosian_r50"])
        self.assertTrue(rows[2]["petrosian_r50"])
        self.assertFalse(rows[3]["optical_half_light"])

    def test_ned_exponential_selection_and_diameter_to_radius(self):
        def measurement(year, band, diameter):
            return {"optical_half_light": True, "freq_target": band, "dia_maj": diameter,
                    "dia_unc_maj": 2., "dia_type": "Half-light diameter", "refcode": f"{year}SDSS.C", "row": year}
        record = {"status": "ok", "query_url": "https://ned.ipac.caltech.edu/", "measurements": [
            measurement(2004, "r (SDSS Exponential)", 20.),
            measurement(2020, "r (SDSS deVaucouleurs)", 99.),
            measurement(2007, "r (SDSS Exponential)", 22.)]}
        size = ep.ned_exponential_size(record, 10., .05)
        self.assertEqual(size["reference"], "2007SDSS.C")
        self.assertEqual(size["arcsec"], 11.)
        self.assertEqual(size["unc_arcsec"], 1.)
        self.assertAlmostEqual(size["kpc"], 11 * 10 * 1000 * np.pi / 648000)
        self.assertIsNone(ep.ned_exponential_size(record, None, None))

    def test_real_export_and_determinism(self):
        saved = json.loads(ep.SOURCE.with_name("phangs.json").read_text())
        self.assertEqual(saved, ep.build_catalogue())
        rows = saved["galaxies"]
        self.assertEqual(len({r["name"] for r in rows}), 118)
        table = Table.read(ep.SOURCE)
        for src, row in zip(table, rows):
            self.assertEqual(row["ra"], float(src["orient_ra"]))
            for key, field in (("logM", "props_mstar"), ("logSFR", "props_sfr")):
                value = src[field]
                if np.ma.is_masked(value) or not np.isfinite(value) or value <= 0:
                    self.assertIsNone(row["values"][key])
                else:
                    self.assertEqual(row["source"][field], float(value))
                    self.assertAlmostEqual(row["values"][key], math.log10(float(value)))
            self.assertEqual(row["sizes"], ep.sizes(src))
            sigma = row["values"]["logSigma"]
            if sigma is not None:
                radius = row["sizes"]["size_r90"]["kpc"]
                self.assertAlmostEqual(10 ** sigma, row["source"]["props_mstar"] / (math.pi * radius ** 2), places=5)
        self.assertEqual(sum(saved["match_counts"].values()), 118)
        self.assertEqual(sum(r["values"]["logSigma"] is not None for r in rows), 112)
        self.assertTrue(all(set(r["values"]) == {"logM", "logSFR", "logsSFR", "logfHI", "logSigma"} for r in rows))


if __name__ == "__main__":
    unittest.main()
