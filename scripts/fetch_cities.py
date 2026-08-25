#!/usr/bin/env python3
"""fetch_cities.py — build the offline place list behind the location picker.

Why offline rather than a geocoding API: an online geocoder sends whatever
the viewer types, plus their IP, to a third party on every keystroke. This
app tells people their drafts are never transmitted; quietly shipping their
search queries elsewhere would sit badly beside that, and it would also
break on a static host with no key management. A bundled list needs no
network at use time and no account.

Why cities5000 and not cities15000 — this is the part worth not
"optimising" later. A population-ranked gazetteer omits exactly the places
this project centres. Measured against the real files:

    Hanga Roa (Rapa Nui)         in cities5000, NOT in cities15000
    Waimea (Hawai'i)             in cities5000, NOT in cities15000
    Ollantaytambo, Pisac,
      Chinchero (Cusco region)   in NEITHER

The last line is the important one: even the larger list misses the Quechua
towns that are Yana Phuyu's own sky. So the list is a convenience only, and
the UI must keep latitude/longitude entry as a first-class path rather than
an "advanced" fallback. Do not swap this for a shorter list of major cities.

Source: GeoNames (https://www.geonames.org), CC BY 4.0. Attribution is
required and is rendered in the app's Sources & attribution panel.

Usage:
    python scripts/fetch_cities.py --dest web/public/cities.json
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

CITIES_URL = "https://download.geonames.org/export/dump/cities5000.zip"
COUNTRY_URL = "https://download.geonames.org/export/dump/countryInfo.txt"

# Column indices in the GeoNames "cities" dump, per its readme.txt.
COL_NAME = 1
COL_LAT = 4
COL_LON = 5
COL_COUNTRY = 8
COL_POPULATION = 14


def fetch_country_names(url: str = COUNTRY_URL) -> dict[str, str]:
    """ISO country code -> country name, for display ("Hanga Roa, Chile")."""
    with urllib.request.urlopen(url) as resp:
        text = resp.read().decode("utf-8")
    out: dict[str, str] = {}
    for line in text.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) > 4:
            out[parts[0]] = parts[4]
    return out


def parse_cities(raw: str, countries: dict[str, str]) -> list[list]:
    """Trim the dump to what the picker needs, as compact arrays.

    Arrays rather than objects because this ships to the browser: the key
    names would otherwise repeat ~70,000 times for no benefit. Coordinates
    are rounded to 4 decimal places (~11 m), far finer than an observer
    location needs and a meaningful size saving.
    """
    rows = []
    for line in raw.splitlines():
        parts = line.split("\t")
        if len(parts) <= COL_POPULATION:
            continue
        try:
            lat = round(float(parts[COL_LAT]), 4)
            lon = round(float(parts[COL_LON]), 4)
            pop = int(parts[COL_POPULATION] or 0)
        except ValueError:
            continue
        cc = parts[COL_COUNTRY]
        rows.append([parts[COL_NAME], countries.get(cc, cc), lat, lon, pop])
    # Most populous first: the picker shows the top matches, and without an
    # ordering "Springfield" returns an arbitrary one.
    rows.sort(key=lambda r: -r[4])
    return rows


def build(dest: Path, cities_url: str = CITIES_URL) -> int:
    countries = fetch_country_names()
    with urllib.request.urlopen(cities_url) as resp:
        blob = resp.read()
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".txt"))
        raw = zf.read(name).decode("utf-8")
    rows = parse_cities(raw, countries)
    payload = {
        "attribution": "GeoNames (https://www.geonames.org), CC BY 4.0",
        "source": cities_url,
        "fields": ["name", "country", "lat", "lon", "population"],
        "places": rows,
    }
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")
    return len(rows)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dest", default="web/public/cities.json")
    args = ap.parse_args(argv[1:])
    dest = Path(args.dest)
    n = build(dest)
    size_mb = dest.stat().st_size / 1024 / 1024
    print(f"fetch_cities: wrote {n} places to {dest} ({size_mb:.1f} MB)")
    # Sanity-check the coverage claim in this module's docstring rather than
    # trusting it: if a future dataset swap silently drops these, say so.
    data = json.loads(dest.read_text(encoding="utf-8"))
    names = {p[0] for p in data["places"]}
    for expected in ("Hanga Roa", "Cusco", "Waimea"):
        print(f"fetch_cities: {expected!r} present: {expected in names}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
