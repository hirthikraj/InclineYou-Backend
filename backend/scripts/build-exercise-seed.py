#!/usr/bin/env python3
"""
Rebuilds src/main/resources/seed/exercises.json from the upstream dataset.

Upstream is hasaneyldrm/exercises-dataset — 1,324 exercises with instructions in
ten languages, plus a 180x180 thumbnail and a 180x180 animation GIF each.

Why this script exists rather than committing upstream's file verbatim: upstream
ships 17 MB, and 16 of those are nine languages the app does not render. The
seeder parses the whole file into memory on every boot, so we carry only what we
seed. Re-run this with --languages when the app learns to speak another one.

The trimmed file is committed, so a fresh clone builds without network access.
This script is only run when we want to pull upstream changes.

Usage:
    scripts/build-exercise-seed.py                    # fetch upstream, write the seed
    scripts/build-exercise-seed.py --source local.json
    scripts/build-exercise-seed.py --languages en hi  # keep Hindi too

MEDIA IS DELIBERATELY DROPPED. Upstream's licence is split and only half of it
is ours: the exercise *data* — names, body parts, equipment, targets, steps — is
MIT, while the media is (c) Gym visual (https://gymvisual.com/) and is
redistributed there under a written permission granted to that repository, not to
whoever clones it. That covers the stills as well as the GIFs; they are frames of
the same artwork, and dropping only the animations would leave the same problem
in a quieter form. So `image` and `gif` are read from upstream and then not
written, which is what keeps the paths out of the classpath entirely rather than
relying on the seeder to ignore them.

If a Gym visual licence is ever bought, this is the first place to change: put
the two fields back in `trim`, restore the media columns in ExerciseSeeder, and
mirror the files to a bucket rather than hotlinking raw.githubusercontent.com.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

UPSTREAM = (
    "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json"
)

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "src/main/resources/seed/exercises.json"


def load(source: str) -> list[dict]:
    if source.startswith("http://") or source.startswith("https://"):
        print(f"==> Fetching {source}", file=sys.stderr)
        with urllib.request.urlopen(source) as response:
            return json.load(response)
    print(f"==> Reading {source}", file=sys.stderr)
    return json.loads(Path(source).read_text(encoding="utf-8"))


# Four upstream names carry a mis-decoded degree sign: "sled 45в° leg press",
# where U+0432 (Cyrillic ve) sits in front of the "°" that survived. It is a
# round trip through the wrong code page somewhere upstream, and it is the only
# such damage in the file — the fix is this narrow, deliberately, so that it
# repairs what is known to be broken instead of "cleaning" names nobody checked.
#
# Repaired here rather than in the seeder because it is a property of the source
# file, and a trainer should never see it: "Sled 45в° leg press" in a library is
# indistinguishable from us not caring.
MOJIBAKE = {"в°": "°"}


def repair(name: str) -> str:
    for broken, fixed in MOJIBAKE.items():
        name = name.replace(broken, fixed)
    return name


def trim(records: list[dict], languages: list[str]) -> list[dict]:
    out = []
    for r in records:
        steps = {lang: r["instruction_steps"][lang] for lang in languages}

        out.append(
            {
                "id": r["id"],
                "name": repair(r["name"]),
                "bodyPart": r["body_part"],
                "equipment": r["equipment"],
                # Upstream's `target` is the primary muscle ("abs"); `muscle_group`
                # is the synergist ("hip flexors"). Our `exercise.muscle_group`
                # column means primary, so `target` is what lands in it.
                "target": r["target"],
                "synergist": r["muscle_group"],
                "secondaryMuscles": r["secondary_muscles"],
                # Ordered arrays, not the single blob: the app renders numbered
                # steps, and re-splitting prose into them loses to the source.
                "steps": steps["en"] if languages == ["en"] else steps,
                # No "image" / "gif": see the module docstring. Upstream has them,
                # and they stop here.
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=UPSTREAM, help="URL or path to upstream exercises.json")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="where to write the trimmed seed")
    parser.add_argument(
        "--languages",
        nargs="+",
        default=["en"],
        help="ISO 639-1 codes to keep. One code writes `steps` as a flat array; "
        "two or more write it as an object keyed by code.",
    )
    args = parser.parse_args()

    records = load(args.source)
    trimmed = trim(records, args.languages)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(trimmed, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(
        f"==> Wrote {len(trimmed)} exercises to {out} "
        f"({out.stat().st_size / 1_048_576:.1f} MB, languages: {', '.join(args.languages)})",
        file=sys.stderr,
    )
    print(
        "==> Text only. Upstream's images and GIFs are (c) Gym visual and are not "
        "seeded — see the module docstring.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
