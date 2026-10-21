"""Export the supplied PHANGS sample and positional matches to committed SDSS rows.

Run from any directory: python3 pipeline/export_phangs.py
Requires numpy and astropy, as listed in pyproject.toml. No network requests.
"""

from pathlib import Path
import csv
import gzip
import hashlib
import json
import math

import numpy as np
from astropy.table import Table

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "site/data_phangs/phangs_sample_table_v1p6.fits"
SDSS = ROOT / "site/data"
RADIUS = 10.0
FIELDS = ("props_mstar", "props_sfr", "props_mhi", "dist")
SIZE_FIELDS = ("size_r90", "size_r25", "size_reff", "size_scalelength")


def clean(value):
    """FITS masks, NaNs and blank strings become JSON null."""
    if value is None or np.ma.is_masked(value):
        return None
    if isinstance(value, (bytes, str)):
        text = value.decode() if isinstance(value, bytes) else value
        return text.strip("\x00 ") or None
    if isinstance(value, (float, np.floating)):
        return float(value) if np.isfinite(value) else None
    if isinstance(value, (int, np.integer)):
        return int(value)
    raise TypeError(type(value))


def positive(value):
    value = clean(value)
    return value if value is not None and value > 0 else None


def properties(row):
    logs = {key: math.log10(v) if (v := positive(row[src])) is not None else None
            for key, src in (("logM", "props_mstar"), ("logSFR", "props_sfr"),
                             ("logHI", "props_mhi"))}
    angle, distance = positive(row["size_r90"]), positive(row["dist"])
    r90_kpc = angle * distance * 1000 * math.pi / (180 * 3600) if angle and distance else None
    # Total stellar mass divided by a circular R90 area, with no enclosed-mass
    # fraction or inclination correction. Distinct from SDSS Mstar/(2*pi*R50^2).
    log_sigma = logs["logM"] - math.log10(math.pi * r90_kpc ** 2) if logs["logM"] is not None and r90_kpc else None
    return {"logM": logs["logM"], "logSFR": logs["logSFR"], "logSigma": log_sigma,
            "logsSFR": logs["logSFR"] - logs["logM"]
            if logs["logSFR"] is not None and logs["logM"] is not None else None,
            "logfHI": logs["logHI"] - logs["logM"]
            if logs["logHI"] is not None and logs["logM"] is not None else None}


def sizes(row):
    """Angular radii to kpc, using PHANGS distances; dist_unc is in dex.

    Uncertainties assume independent radius/distance errors. No Petrosian
    conversion or universal R25-to-half-light conversion is applied.
    """
    distance = positive(row["dist"])
    distance_dex = positive(row["dist_unc"])
    out = {}
    for field in SIZE_FIELDS:
        angle = positive(row[field])
        sigma = positive(row[field + "_unc"])
        radius = angle * distance * 1000 * math.pi / (180 * 3600) if angle and distance else None
        frac = math.hypot(sigma / angle, math.log(10) * distance_dex) if angle and sigma and distance_dex else None
        out[field] = {"arcsec": angle, "unc_arcsec": sigma, "kpc": radius,
                      "unc_kpc": radius * frac if radius is not None and frac is not None else None}
    return out


def ned_exponential_size(record, distance, distance_dex):
    """Use the newest referenced SDSS r-band exponential half-light diameter.

    NED standardizes its axes as diameters, hence /2. This is a model effective
    radius, not a conversion to Petrosian R50. Keep its definition and reference.
    """
    if not record or record["status"] != "ok" or not distance:
        return None
    eligible = [m for m in record["measurements"] if m["optical_half_light"]
                and (m.get("freq_target") or "").lower() == "r (sdss exponential)"
                and positive(m.get("dia_maj"))]
    if not eligible:
        return None
    eligible.sort(key=lambda m: (-int(str(m["refcode"])[:4]) if str(m.get("refcode", ""))[:4].isdigit() else 0,
                                 m.get("refcode") or "", m.get("row", 0)))
    chosen = eligible[0]
    angle = chosen["dia_maj"] / 2
    sigma = positive(chosen.get("dia_unc_maj"))
    sigma = sigma / 2 if sigma else None
    radius = angle * distance * 1000 * math.pi / (180 * 3600)
    frac = math.hypot(sigma / angle, math.log(10) * distance_dex) if sigma and distance_dex else None
    return {"arcsec": angle, "unc_arcsec": sigma, "kpc": radius,
            "unc_kpc": radius * frac if frac is not None else None,
            "band": chosen["freq_target"], "definition": chosen["dia_type"],
            "reference": chosen["refcode"], "query_url": record["query_url"]}


def match_position(ra, dec, sdss_ra, sdss_dec):
    """Great-circle search, including RA wraparound; never force ambiguous matches."""
    if ra is None or dec is None:
        return {"status": "missing_coordinates", "candidates": []}
    a, d = np.deg2rad(sdss_ra), np.deg2rad(sdss_dec)
    r, b = np.deg2rad([ra, dec])
    hav = np.sin((d - b) / 2) ** 2 + np.cos(b) * np.cos(d) * np.sin((a - r) / 2) ** 2
    sep = np.rad2deg(2 * np.arcsin(np.sqrt(np.clip(hav, 0, 1)))) * 3600
    indices = np.flatnonzero(np.isfinite(sep) & (sep <= RADIUS))
    indices = sorted(indices, key=lambda i: (sep[i], i))
    candidates = [{"index": int(i), "separation_arcsec": float(sep[i]),
                   "ra": float(sdss_ra[i]), "dec": float(sdss_dec[i])} for i in indices]
    status = "matched" if len(indices) == 1 else "ambiguous" if len(indices) > 1 else "unmatched"
    return {"status": status, "candidates": candidates}


def build_catalogue():
    table = Table.read(SOURCE)
    manifest_bytes = (SDSS / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    meta = {k: np.frombuffer(gzip.decompress((SDSS / f"meta/{k}.f32.gz").read_bytes()),
                             dtype="<f4").astype(float) for k in ("ra", "dec")}
    assert len(meta["ra"]) == len(meta["dec"]) == manifest["n"]
    keep = [k for k in table.colnames if k in ("name", "alias", "pgc", "orient_ra", "orient_dec", "orient_ra_unc", "orient_dec_unc", "orient_pos_ref", "size_r25")
            or k.startswith(("survey_", "props_", "dist", "size_"))]
    ned_path = SOURCE.with_name("ned_sizes.json")
    ned = json.loads(ned_path.read_text()) if ned_path.exists() else None
    rows = []
    for row in table:
        source = {k: clean(row[k]) for k in keep}
        for k in FIELDS:
            source[k] = positive(row[k])
        ned_record = ned["galaxies"].get(source["name"]) if ned else None
        rows.append({"name": source["name"], "ra": source["orient_ra"],
                     "dec": source["orient_dec"], "values": properties(row), "source": source,
                     "sizes": sizes(row), "ned_sizes": ned_record,
                     "ned_exponential_size": ned_exponential_size(ned_record, source["dist"], positive(row["dist_unc"])),
                     "match": match_position(source["orient_ra"], source["orient_dec"],
                                             meta["ra"], meta["dec"])})
    assert len(rows) == 118 and len({r["name"] for r in rows}) == 118
    counts = {k: sum(r["match"]["status"] == k for r in rows)
              for k in ("matched", "ambiguous", "unmatched", "missing_coordinates")}
    out = {"version": "v1p6", "source": SOURCE.name,
           "source_sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
           "sdss": {"n": manifest["n"], "created": manifest["created"],
                    "manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest()},
           "match_radius_arcsec": RADIUS, "match_counts": counts,
           "ned_summary": ned["summary"] if ned else None,
           "units": {k: str(table[k].unit) if table[k].unit else None for k in keep},
           "notes": "All table entries, including possible targets. Survey statuses refer to v1p6. "
                    "PHANGS WISE/GALEX and SDSS MPA-JHU estimates use different methods; "
                    "no calibration offsets applied. Distance uncertainty is in dex. "
                    "PHANGS logSigma = log10(Mstar / (pi R90^2)) in Msun/kpc^2, using size_r90 "
                    "and dist, total stellar mass, a circular area and no inclination correction. "
                    "This differs from SDSS Mstar/(2 pi R50^2). R90 uncertainties are unavailable; "
                    "no surface-density uncertainty is estimated.",
           "galaxies": rows}
    return out


def export():
    out = build_catalogue()
    rows, counts = out["galaxies"], out["match_counts"]
    path = SOURCE.with_name("phangs.json")
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False, allow_nan=False) + "\n")
    summary = SOURCE.with_name("sdss_matches.csv")
    with summary.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "status", "candidate_count", "sdss_row_indices", "separations_arcsec"])
        for r in rows:
            c = r["match"]["candidates"]
            writer.writerow([r["name"], r["match"]["status"], len(c),
                             ";".join(str(x["index"]) for x in c),
                             ";".join(f'{x["separation_arcsec"]:.6f}' for x in c)])
    print(f"{len(rows)} galaxies -> {path}\nMatches within {RADIUS:g} arcsec: {counts}\nReview: {summary}")


if __name__ == "__main__":
    export()
