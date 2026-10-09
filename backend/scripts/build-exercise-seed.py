#!/usr/bin/env python3
"""
Builds src/main/resources/seed/exercises.json — what ExerciseSeeder loads at boot — from the authored library,
exercise-library/exercises-india.json.

This REPLACES the old script of the same name, which fetched hasaneyldrm/exercises-dataset (Gym visual-derived
names and steps) and wrote the same output file. The library is now written by us, one equipment and one muscle at
a time, and exercise-library/exercises-india.json is the only thing to edit. Re-run this after editing it:

    python3 scripts/build-exercise-seed.py            # writes the seed
    python3 scripts/build-exercise-seed.py --check    # exits 1 if the committed seed is stale

What goes in: every entry of `exercises`. What stays out: `parked` (cut on purpose, kept in the authoring file so
nothing is lost), the vocabulary, and the equipmentLookup (V9 already holds it). Each entry keeps its review
status, so the seeder can store it and the app can later tell reviewed exercises from draft ones.

The seeder treats this file as authoritative: an exercise whose id is no longer in it is retired on the next boot.
Text only — no image or video fields exist, by licence and by design.
"""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "exercise-library" / "exercises-india.json"
OUT = ROOT / "src" / "main" / "resources" / "seed" / "exercises.json"
KEEP_META = ("commonMistakes", "safety", "reviewNote", "equipmentNeeded", "category")


def build() -> str:
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    vocab = doc["vocab"]
    out, seen = [], set()
    for e in doc["exercises"]:
        assert e["id"] not in seen, f"duplicate id {e['id']}"
        seen.add(e["id"])
        assert e["logType"] in vocab["logTypes"], e["id"]
        assert e["bodyPart"] in vocab["bodyParts"] and e["target"] in vocab["targets"][e["bodyPart"]], e["id"]
        meta = {k: e["metadata"][k] for k in KEEP_META if k in e["metadata"]}
        meta["review"] = e["review"]["status"]
        out.append({
            "id": e["id"], "name": e["name"], "bodyPart": e["bodyPart"], "target": e["target"],
            "secondaryTargets": e["secondaryTargets"], "equipment": e["equipment"],
            "movementPattern": e["movementPattern"], "level": e["level"], "logType": e["logType"],
            "aliases": e["aliases"], "steps": e["steps"], "formCues": e["formCues"], "metadata": meta,
        })
    return json.dumps(out, ensure_ascii=False, indent=1) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if the committed seed differs from a fresh build")
    args = ap.parse_args()
    fresh = build()
    if args.check:
        same = OUT.exists() and OUT.read_text(encoding="utf-8") == fresh
        print("seed is up to date" if same else "seed is STALE — run scripts/build-exercise-seed.py", file=sys.stderr)
        sys.exit(0 if same else 1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(fresh, encoding="utf-8")
    print(f"==> Wrote {len(json.loads(fresh))} exercises to {OUT} ({OUT.stat().st_size / 1_048_576:.1f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
