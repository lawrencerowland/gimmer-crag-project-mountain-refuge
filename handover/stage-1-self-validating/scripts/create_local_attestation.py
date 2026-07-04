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
    parser.add_argument("--handover", required=True)
    parser.add_argument("--digests", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    handover_path = Path(args.handover)
    digests_path = Path(args.digests)
    output = Path(args.output)

    handover = json.loads(handover_path.read_text(encoding="utf-8"))
    digest_doc = json.loads(digests_path.read_text(encoding="utf-8"))
    digests = digest_doc.get("digests", digest_doc)

    materials = []
    for evidence in handover["evidence"]:
        digest_value = digests[evidence["digest_ref"]]
        materials.append({
            "uri": evidence["path"],
            "digest": {
                "sha256": digest_value
            }
        })

    payload = {
        "_type": "https://in-toto.io/Statement/v1",
        "subject": [
            {
                "name": str(handover_path),
                "digest": {
                    "sha256": sha256_file(handover_path)
                }
            }
        ],
        "predicateType": handover["provenance"]["predicateType"],
        "predicate": {
            "buildDefinition": {
                "buildType": "https://example.org/handover/stage-1-design",
                "externalParameters": {
                    "handover_id": handover["handover_id"],
                    "project": handover["project"]["name"],
                    "stage": handover["project"]["stage"]
                }
            },
            "runDetails": {
                "builder": {
                    "id": "local-codex-example"
                },
                "metadata": {
                    "invocationId": f"local-{handover['handover_id']}",
                    "startedOn": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                }
            },
            "materials": materials
        }
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote local in-toto statement: {output}")


if __name__ == "__main__":
    main()

