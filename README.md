# Gimmer Crag Project Mountain Refuge

An example project exploring ways to make project planning assumptions and their consequences
inspectable. The public lab uses fictional refuge scenarios.

## Published lab

Start at [the Process-to-Plan Lab](process-to-plan-lab/).

- [Causal Plan Lab](apps/causal-plan-lab/) constructs a chosen token-flow execution witness,
  derives its causal dependency DAG and schedule, and checks whether an elementary sequence/parallel
  task tree preserves exactly the same order. An obstruction leaves the exact DAG available.
- [Two processes, one chosen plan](apps/mountain-refuge-petri-wbs-demo/#same-plan-witness)
  is the retained comparison: different process assumptions can generate the same complete baseline
  plan while responding differently to a change in resources or priority.
- [Causal method and limits](planning/causal-plan-method.md) and
  [autonomous run record](planning/autonomous-run-2026-09-07.md) state the new construction, counterexamples and evidence.
- [Witness method note](planning/two-process-same-plan-witness.md) states the earlier comparison's
  model, projection, expected outcomes and tests.
- [Earlier translation contract](planning/process-to-plan-contract.md) and
  [route boundary](planning/process-to-plan-route-boundary.md) describe the original Petri/WBS slice.

The causal lab's claims concern its explicit finite models and chosen token ancestry. A failure of
the restricted task/sequence/parallel grammar does not show that general symmetric monoidal
diagrams cannot represent the process. The scenarios and durations are illustrative assumptions,
not verified construction methods.

## Source lineage

This is the public, watchable home for the Gimmer Crag mountain-refuge experiment. The earlier
simulator began in `lawrencerowland/gimmer-crag` on `codex/process-to-plan-lab`.
Its current mirror was refreshed from source commit
`03e778b9e2e4b5162167785d6f3f3dc1fe79cf6a` on 2026-09-07, retaining the original
model and adapting its return links to this site's landing page.

## Check and serve locally

The applications are static files. The tests use Node's built-in test runner; no package installation
is required.

```sh
node --test tests/*.test.mjs
python3 -m http.server 8000
```

Open `http://localhost:8000/process-to-plan-lab/`. Pull requests run the test suite.
Pushes to `main` also run it before the existing Jekyll Pages build and deployment.

The optional ordinary-browser regression script requires Playwright and a Chromium installation:

```sh
LAB_BASE_URL=http://localhost:8000 node scripts/browser-check.mjs
```

It uses a fresh disposable browser profile and writes screenshots, exported result files and its
report into `/tmp/causal-plan-browser-evidence`. `LAB_EVIDENCE_DIR` changes that location.
`LAB_BROWSER_CHANNEL=chrome` selects an installed Chrome; `PLAYWRIGHT_MODULE` can point to an
existing Playwright module. No production account or server-side write is involved.

## Provenance rule

Public artifacts stay at cluster level. Detailed DEVONthink record titles, UUIDs and record-level
provenance remain in the private Portfolio Wave working folder. Public notes name the reusable
concepts and explicit assumptions.

The broader hill/travel process-to-plan scenario remains private. Dynamic project states remain
outside this public slice.

## Earlier views

- [Graph view](graph.html)
- [Multilayer view](multilayer_graph.html)
