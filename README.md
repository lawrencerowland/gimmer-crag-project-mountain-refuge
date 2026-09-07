# Gimmer Crag Project Mountain Refuge

An example project exploring ways to make project planning assumptions and their consequences
inspectable. The public lab uses fictional refuge scenarios.

## Published lab

Start at [the Process-to-Plan Lab](process-to-plan-lab/).

- [Process Contract Lab](apps/process-contract-lab/) explores the producer-count ancestry families
  compatible with a selected complete trace, preserves their alternative sequential event orders,
  and tests whether one dependency graph can express that language. It also compiles typed
  process fragments through selective input/output wires and generates their complete executions.
- [Causal Plan Lab](apps/causal-plan-lab/) constructs a chosen token-flow execution witness,
  derives its causal dependency DAG and schedule, and checks whether an elementary sequence/parallel
  task tree preserves exactly the same order. An obstruction leaves the exact DAG available.
- [Two processes, one chosen plan](apps/mountain-refuge-petri-wbs-demo/#same-plan-witness)
  is the retained comparison: different process assumptions can generate the same complete baseline
  plan while responding differently to a change in resources or priority.
- [Causal method and limits](planning/causal-plan-method.md) and
  [earlier autonomous run record](planning/autonomous-run-2026-09-07.md) state the single-witness construction, counterexamples and evidence.
- [Process contract method](planning/process-contract-method.md) and
  [process contract run record](planning/process-contract-run-2026-09-07.md) describe the ancestry-family and typed-composition increment.
- [Witness method note](planning/two-process-same-plan-witness.md) states the earlier comparison's
  model, projection, expected outcomes and tests.
- [Earlier translation contract](planning/process-to-plan-contract.md) and
  [route boundary](planning/process-to-plan-route-boundary.md) describe the original Petri/WBS slice.

The experiments progress from two processes sharing one plan, through a single causal witness,
to alternatives across a selected trace's ancestry family and composition through typed wires.
Exactness is always tied to the declared object and completed enumeration. An exact sequential-order
language does not establish concurrent-step or timed equivalence. Computation limits remain visible.
A failure of the restricted task/sequence/parallel tree grammar does not rule out a richer typed
wire construction. Scenarios and durations are illustrative, not verified construction methods.

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

The optional ordinary-browser regression scripts require Playwright and a Chromium installation:

```sh
LAB_BASE_URL=http://localhost:8000 node scripts/process-contract-browser.mjs
```

The contract script covers alternative languages, typed wires, joint starts, correction, persistence, portable results, cancellation and mobile navigation. Its evidence defaults to `/tmp/process-contract-browser-evidence`. The earlier causal lab retains its own browser journey:

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
