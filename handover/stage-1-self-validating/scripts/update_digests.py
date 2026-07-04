#!/usr/bin/env python3
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def sha256_file(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    evidence_dir = Path(args.evidence_dir)
    output = Path(args.output)

    if not evidence_dir.is_dir():
        raise SystemExit(f"Evidence directory not found: {evidence_dir}")

    digests = {}
    for path in sorted(evidence_dir.iterdir()):
        if path.is_file() and not path.name.startswith("."):
            digests[f"{path.name}.sha256"] = sha256_file(path)

    payload = {
        "schema": "https://example.org/schemas/handover-digests.schema.json",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "evidence_dir": str(evidence_dir),
        "digests": digests,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {output} with {len(digests)} evidence digests")


if __name__ == "__main__":
    main()

