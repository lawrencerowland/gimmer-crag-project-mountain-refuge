# Mountain Refuge Stage 1 Self-Validating Handover

This is a small example handover pack for the first stage design of a mountain refuge built on a crag. It turns the handover into a declarative pack with checks that fail closed:

- schema check: does the pack have the required shape?
- policy check: are the required roles, gates, evidence classes, and digests present?
- digest check: do the listed evidence hashes match the files on disk?
- provenance check: does a minimal in-toto/SLSA-style statement bind the handover and evidence together?

The example is deliberately local-first. It includes the OPA/Rego policy, but also a small Python validator so the pack can be tried without installing AJV, OPA, or cosign first.

## Quick Start

From this folder:

```sh
make refresh
make validate
make fail-demo
```

Expected result:

- `make refresh` regenerates evidence digests and a local in-toto statement.
- `make validate` writes `PASS` to `handover.status`.
- `make fail-demo` simulates a missing required evidence class and writes `FAIL` to `handover.fail-demo.status`, while returning success because the failure was expected.

## Pack Layout

```text
handover/
  handover.json
  digests.json
  attestations/
    handover.intoto.json
  evidence/
    access-logistics-and-rescue.md
    cost-schedule-baseline.md
    environment-planning-note.md
    handover-operating-notes.md
    risk-register.md
    site-context-and-constraints.md
    stage-1-concept-design.md
    structural-safety-basis.md
policy/
  handover.rego
schema/
  handover.schema.json
  digests.schema.json
scripts/
  create_local_attestation.py
  update_digests.py
  validate_handover.py
```

## What The Board Sees

The board-facing signal is intentionally boring:

```text
handover.status = PASS
```

The audit detail is in `handover.status.json`, which records the checked pack, result, and denial reasons if the pack fails.

## Strict CI Path

The included workflow in `.github/workflows/validate.yml` is written as if this example folder is the root of a repo. It runs the local validator and can also run OPA when available.

For a real project, replace the local `handover/attestations/handover.intoto.json` with a GitHub artifact attestation or cosign/SLSA provenance statement emitted by the producing workflow, then wire the strict verification command into `make validate-strict-provenance`.

