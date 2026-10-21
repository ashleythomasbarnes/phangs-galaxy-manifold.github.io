"""Cache NED diameter measurements for every PHANGS entry, without guessing R50.

python3 pipeline/fetch_phangs_ned.py
python3 pipeline/export_phangs.py

Successful responses are cached under pipeline/cache/ned/. At most three requests
are in flight, starting at most one per second. The public snapshot retains
measurement types and references.
"""
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import io
import json
import re
import time
from threading import Lock
from urllib.parse import urlencode
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from astropy.io.votable import parse
from astropy.table import Table
from astropy import units as u

from export_phangs import ROOT, SOURCE, clean

CACHE = ROOT / "pipeline/cache/ned"
OUTPUT = SOURCE.with_name("ned_sizes.json")
API = "https://ned.ipac.caltech.edu/NED::API/DiametersOfObject"


def parse_sizes(content):
    root = ET.fromstring(content)
    params = {el.attrib.get("name"): el.attrib.get("value")
              for el in root.iter() if el.tag.endswith("PARAM")}
    if params.get("QUERY_STATUS") != "OK":
        raise ValueError(f"NED query status: {params.get('QUERY_STATUS', 'missing')}")
    table = parse(io.BytesIO(content), verify="ignore").get_first_table().to_table()
    if "dia_maj" in table.colnames and table["dia_maj"].unit != u.arcsec:
        raise ValueError("NED major-axis units must be arcsec")
    measurements = []
    for row in table:
        m = {key: clean(row[key]) for key in table.colnames}
        band = (m.get("freq_target") or "").lower()
        kind = (m.get("dia_type") or "").lower()
        comments = (m.get("Comments") or "").lower()
        half = "half-light" in kind or "effective" in kind
        optical = bool(re.match(r"[ugrizbv] \(", band)) or "johnson b" in band
        # Generic 'SDSS Petrosian' entries do NOT establish petroR50: NED may
        # mean the Petrosian aperture radius. Require an explicit 50% definition.
        explicit50 = half or bool(re.search(r"r_?50|50\s*%|half.light", comments))
        m["optical_half_light"] = bool(half and optical)
        m["petrosian_r50"] = bool(band.startswith("r (") and "petrosian" in band and explicit50)
        measurements.append(m)
    return measurements


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    rows = Table.read(SOURCE)
    names = [clean(row["name"]) for row in rows]
    request_lock = Lock()
    last_start = 0.

    def fetch_one(name):
        nonlocal last_start
        url = API + "?" + urlencode({"TARGET": name})
        path = CACHE / f"{name}.xml"
        try:
            if path.exists():
                content = path.read_bytes()
            else:
                with request_lock:
                    time.sleep(max(0, 1 - (time.monotonic() - last_start)))
                    last_start = time.monotonic()
                with urlopen(url, timeout=30) as response:
                    content = response.read()
            measurements = parse_sizes(content)
            if not path.exists():
                path.write_bytes(content)
            print(f"{name}: {len(measurements)} diameter measurements", flush=True)
            return {"status": "ok", "query_url": url, "measurements": measurements}
        except Exception as e:
            print(f"{name}: unavailable ({e})", flush=True)
            return {"status": "unavailable", "query_url": url, "error": str(e), "measurements": []}

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = dict(zip(names, pool.map(fetch_one, names)))
    summary = {
        "queried": len(results),
        "ok": sum(r["status"] == "ok" for r in results.values()),
        "optical_half_light_galaxies": sum(any(m["optical_half_light"] for m in r["measurements"]) for r in results.values()),
        "explicit_petrosian_r50_galaxies": sum(any(m["petrosian_r50"] for m in r["measurements"]) for r in results.values()),
    }
    out = {"service": API, "retrieved": datetime.now(timezone.utc).isoformat(),
           "notes": "NED major/minor axes are standardized diameters (arcsec). "
                    "Model half-light radii differ from Petrosian R50. Generic Petrosian diameters are not assumed to be R50.",
           "summary": summary, "galaxies": results}
    OUTPUT.write_text(json.dumps(out, separators=(",", ":"), allow_nan=False) + "\n")
    print(summary, flush=True)
    print(f"Wrote {OUTPUT}", flush=True)


if __name__ == "__main__":
    fetch()
