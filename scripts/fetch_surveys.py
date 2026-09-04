#!/usr/bin/env python3
"""fetch_surveys.py — mirror a HiPS survey from data.stellarium.org locally.

Mirroring rather than pointing the app at data.stellarium.org directly is a
deliberate rule of this project, recorded in CLAUDE.md: that server is the
Stellarium project's bandwidth, not ours, and a deployed viewer that streams
tiles from it on every pan is helping itself to someone else's hosting. A
mirror also keeps the app working offline and pins what we ship.

Not every survey CAN be mirrored. Measured 2026-08-25:
  dso, dso2        orders 0-3 only, ~1020 tiles each      -> mirrorable
  gaia_dr2_v2      order 3 upward, order 3 alone ~67 MB,
                   full survey hundreds of GB              -> not mirrorable

Attribution travels with the data: each survey's `properties` carries
obs_copyright / obs_ack, and this script keeps that file verbatim so the
app can render the required acknowledgement rather than someone
hand-copying it. The Gaia survey's obs_ack is a specific text ESA requires.

Usage:
    python scripts/fetch_surveys.py dso dso2 --dest web/public/skydata/surveys
    python scripts/fetch_surveys.py dso --max-order 2 --dry-run
"""
from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://data.stellarium.org/surveys"


def fetch(url: str) -> bytes | None:
    """Return the body, or None for a 404 — HiPS surveys are sparse and a
    missing tile is normal, not an error."""
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def mirror(survey: str, dest: Path, max_order: int = 3, dry_run: bool = False,
           ext: str = "eph", min_order: int = 0) -> tuple[int, int]:
    """Copy `survey` into dest/<survey>/. Returns (tiles, bytes).

    `min_order` matters for surveys that do not start at 0. Gaia's
    hips_order_min is 3, so orders 0-2 are entirely absent; without this the
    empty-order break below would stop the walk at order 1 and mirror
    nothing at all.
    """
    out = dest / survey
    if not dry_run:
        out.mkdir(parents=True, exist_ok=True)

    props = fetch(f"{BASE}/{survey}/properties")
    if props is None:
        raise SystemExit(f"fetch_surveys: {survey!r} has no properties file")
    if not dry_run:
        (out / "properties").write_bytes(props)

    tiles = total = 0
    for order in range(min_order, max_order + 1):
        n_pix = 12 * (4 ** order)
        found_this_order = 0
        for pix in range(n_pix):
            # HiPS groups tiles into Dir<N> folders of 10000.
            d = (pix // 10000) * 10000
            rel = f"Norder{order}/Dir{d}/Npix{pix}.{ext}"
            body = fetch(f"{BASE}/{survey}/{rel}")
            if body is None:
                continue
            found_this_order += 1
            tiles += 1
            total += len(body)
            if not dry_run:
                path = out / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
        print(f"  {survey} order {order}: {found_this_order}/{n_pix} tiles",
              file=sys.stderr)
        # A whole empty order means the survey stops here; deeper probing
        # would be thousands of pointless 404s.
        if found_this_order == 0 and order > min_order:
            break
    return tiles, total


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("surveys", nargs="+")
    ap.add_argument("--dest", default="web/public/skydata/surveys")
    ap.add_argument("--max-order", type=int, default=3)
    ap.add_argument("--min-order", type=int, default=0,
                    help="first order to walk; Gaia's survey starts at 3")
    ap.add_argument("--ext", default="eph")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv[1:])

    grand = 0
    for s in args.surveys:
        tiles, size = mirror(s, Path(args.dest), args.max_order, args.dry_run,
                             args.ext, args.min_order)
        grand += size
        print(f"fetch_surveys: {s}: {tiles} tiles, {size/1024/1024:.1f} MB")
    print(f"fetch_surveys: total {grand/1024/1024:.1f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
