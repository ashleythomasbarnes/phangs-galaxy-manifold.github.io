"""Export MUSE v3 H II regions and galaxy summaries, without network access.

Run from any directory: python3 pipeline/export_nebulae.py
The browser reads these JSON exports, never the FITS file or column guide.
"""

from pathlib import Path
import hashlib
import json

import numpy as np
from astropy.table import Table

from config import PP04_A, PP04_B, PP04_O3N2_RANGE, LINE_SNR_MIN

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site/data_phangs"
SOURCE = DATA / "Nebulae_catalogue_v3.fits"
LINES = ("HA6562", "HB4861", "OIII5006", "NII6583")
RATIOS = {"N2Ha": ("NII6583", "HA6562"),
          "O3Hb": ("OIII5006", "HB4861"),
          "HaHb": ("HA6562", "HB4861")}
KEYS = (*RATIOS, "OH_PP04")
NATIVE = ("met_scal", "Delta_met_scal", "EBV", "logq_D91", "Lum_HA6562_CORR")
NATIVE_ERRORS = ("met_scal_err", "EBV_ERR", "logq_D91_err")
FLAGS = ("flag_edge", "flag_nearby", "flag_star", "BPT_NII", "BPT_SII", "BPT_OI", "HII_class_v3")


def numbers(column):
    return np.asarray(np.ma.filled(np.ma.asarray(column, dtype=float), np.nan))


def clean(value):
    return float(value) if np.isfinite(value) else None


def valid_line(flux, error):
    return (np.isfinite(flux) & np.isfinite(error) & (flux > 0) & (error > 0)
            & (flux > LINE_SNR_MIN * error))


def metallicity(o3n2):
    lo, hi = PP04_O3N2_RANGE
    return np.where(np.isfinite(o3n2) & (o3n2 > lo) & (o3n2 < hi),
                    PP04_A + PP04_B * o3n2, np.nan)


def region_values(flux, error):
    good = {line: valid_line(flux[line], error[line]) for line in LINES}
    values = {}
    for key, (num, den) in RATIOS.items():
        ok = good[num] & good[den]
        out = np.full(len(flux[num]), np.nan)
        out[ok] = np.log10(flux[num][ok] / flux[den][ok])
        values[key] = out
    values["OH_PP04"] = metallicity(values["O3Hb"] - values["N2Ha"])
    return values


def weighted_stats(values, weights):
    ok = np.isfinite(values) & np.isfinite(weights) & (weights > 0)
    x, w = values[ok], weights[ok]
    if not len(x):
        return dict(n=0, mean=None, median=None, p16=None, p84=None)
    order = np.argsort(x, kind="stable")
    x, w = x[order], w[order]
    cumulative = np.cumsum(w / w.sum())
    quantile = lambda p: float(x[min(np.searchsorted(cumulative, p), len(x) - 1)])
    return dict(n=len(x), mean=float(np.average(x, weights=w)),
                median=quantile(.5), p16=quantile(.16), p84=quantile(.84))


def summed_values(flux, error):
    """Each diagnostic sums its required lines over a common eligible subset.

    Individual PP04 validity is deliberately NOT a cut on the four-line sum.
    """
    good = {line: valid_line(flux[line], error[line]) for line in LINES}
    out, counts = {}, {}
    for key in KEYS:
        needed = LINES if key == "OH_PP04" else RATIOS[key]
        ok = np.logical_and.reduce([good[line] for line in needed])
        counts[key] = int(ok.sum())
        if not ok.any():
            out[key] = None
            continue
        total = {line: flux[line][ok].sum() for line in needed}
        if key == "OH_PP04":
            index = np.log10(total["OIII5006"] / total["HB4861"]) - np.log10(total["NII6583"] / total["HA6562"])
            out[key] = clean(metallicity(index))
        else:
            num, den = RATIOS[key]
            out[key] = float(np.log10(total[num] / total[den]))
    return out, counts


def host_name(value):
    if isinstance(value, bytes):
        value = value.decode()
    return str(value).strip().lower()


def build_catalogues():
    table = Table.read(SOURCE)
    hosts = {host_name(name) for name in Table.read(DATA / "phangs_sample_table_v1p6.fits")["name"]}
    names = np.array([host_name(name) for name in table["gal_name"]])
    ids = numbers(table["region_ID"])
    if not np.all(np.isfinite(ids) & (ids == np.floor(ids))):
        raise ValueError("Region IDs must be finite integers")
    if len(set(zip(names, ids))) != len(table):
        raise ValueError("Duplicate galaxy/region IDs")
    if set(names) - hosts:
        raise ValueError(f"Unmatched hosts: {sorted(set(names) - hosts)}")
    selected = numbers(table["HII_class_v3"]) == 1
    table, names, ids = table[selected], names[selected], ids[selected]
    flux = {line: numbers(table[line + "_FLUX"]) for line in LINES}
    error = {line: numbers(table[line + "_FLUX_ERR"]) for line in LINES}
    values = region_values(flux, error)
    native = {key: numbers(table[key]) for key in (*NATIVE, *NATIVE_ERRORS)}
    weights = native["Lum_HA6562_CORR"]
    galaxies = []
    for name in sorted(set(names)):
        mask = names == name
        stats = {key: weighted_stats(value[mask], weights[mask]) for key, value in values.items()}
        summed, counts = summed_values({k: v[mask] for k, v in flux.items()},
                                       {k: v[mask] for k, v in error.items()})
        galaxies.append(dict(name=name, n=int(mask.sum()), stats=stats,
                             values={"mean": {k: s["mean"] for k, s in stats.items()},
                                     "median": {k: s["median"] for k, s in stats.items()},
                                     "summed": summed}, summed_counts=counts,
                             native={key: weighted_stats(native[key][mask], weights[mask]) for key in NATIVE}))
    regions = []
    for i, row in enumerate(table):
        regions.append(dict(galaxy=names[i], id=int(ids[i]), ra=clean(row["cen_ra"]), dec=clean(row["cen_dec"]),
                            flags={key: clean(row[key]) for key in FLAGS},
                            values={key: clean(value[i]) for key, value in values.items()},
                            native={key: clean(value[i]) for key, value in native.items()}))
    sources = [SOURCE, DATA / "Nebulae_Catalog_columns_list.xlsx", DATA / "Nebulae_Readme.txt",
               DATA / "phangs_sample_table_v1p6.fits"]
    provenance = dict(schema=1, source=SOURCE.name,
                      source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                      source_hashes={path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sources},
                      selection="HII_class_v3 == 1; finite positive flux/error and S/N > 3 per diagnostic",
                      calibration=dict(name="PP04 O3N2", a=PP04_A, b=PP04_B, range=list(PP04_O3N2_RANGE),
                                       flux="*_FLUX, without internal attenuation correction"),
                      weighting="Lum_HA6562_CORR, dust-corrected Halpha luminosity; mean of displayed log values",
                      quantiles="First sorted value reaching the requested cumulative positive weight",
                      counts=dict(nebulae=len(selected), hii_regions=len(table), galaxies=len(galaxies),
                                  pp04_regions=int(np.isfinite(values["OH_PP04"]).sum())),
                      notes="Catalogued H II regions within the MUSE footprint; excludes diffuse emission. "
                            "Same PP04 calibration does not match the SDSS fibre aperture or classification. "
                            "Native S-calibration and nebular reddening are distinct from T04 and stellar A_V.")
    return dict(**provenance, galaxies=galaxies), dict(schema=1, source=SOURCE.name,
                source_sha256=provenance["source_sha256"], regions=regions)


def export():
    summary, regions = build_catalogues()
    for name, data in (("nebulae_summary.json", summary), ("nebulae_regions.json", regions)):
        path = DATA / name
        path.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False) + "\n")
        print(f"{path}: {path.stat().st_size:,} bytes")
    print(summary["counts"])


if __name__ == "__main__":
    export()
