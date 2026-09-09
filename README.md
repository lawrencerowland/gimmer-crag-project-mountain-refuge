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
- [Causal method and limits](planning/causal-plan-method.md) and
  [earlier autonomous run record](planning/autonomous-run-2026-09-07.md) state the single-witness construction, counterexamples and evidence.
- [Process contract method](planning/process-contract-method.md) and
  [process contract run record](planning/process-contract-run-2026-09-07.md) describe the ancestry-family and typed-composition increment.
- [Witness method note](planning/two-process-same-plan-witness.md) states the earlier comparison's
  model, projection, expected outcomes and tests.
- [Earlier translation contract](planning/process-to-plan-contract.md) and
  [route boundary](planning/process-to-plan-route-boundary.md) describe the original Petri/WBS slice.

The autonomous experiments develop a single causal witness into ancestry families and composition through typed wires.
Exactness is always tied to the declared object and completed enumeration. An exact sequential-order
language does not establish concurrent-step or timed equivalence. Computation limits remain visible.
A failure of the restricted task/sequence/parallel tree grammar does not rule out a richer typed
wire construction. Scenarios and durations are illustrative, not verified construction methods.

## Inherited baseline — main Gimmer collection

[Two processes, one chosen plan](https://lawrencerowland.github.io/gimmer-crag/apps/mountain-refuge-petri-wbs-demo/#same-plan-witness) is earlier human-steered, AI-assisted work and is not a higher-autonomy experiment. It supplies the starting question. The [canonical application](https://github.com/lawrencerowland/gimmer-crag/blob/main/apps/mountain-refuge-petri-wbs-demo/index.html), [baseline tests](https://github.com/lawrencerowland/gimmer-crag/blob/main/scripts/process-witness.test.js) and [method](https://github.com/lawrencerowland/gimmer-crag/blob/main/planning/two-process-same-plan-witness.md) are maintained in `lawrencerowland/gimmer-crag`.

On 9 September 2026 the duplicated application and baseline-only test were withdrawn from this repository at Lawrence’s request. The old application URL is a redirect preserving query and fragment; active references go directly to the canonical main collection. The former “Experiment 01” label is retired. The two autonomous engines do not depend on the withdrawn implementation.

The mirror had been refreshed from upstream `03e778b9e2e4b5162167785d6f3f3dc1fe79cf6a` on 7 September. Historical run counts below and in dated run records describe that earlier repository state. [Withdrawal and preservation record](planning/inherited-baseline-withdrawal-2026-09-09.md).

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

The baseline-withdrawal navigation check uses `node scripts/inherited-baseline-browser.mjs` and the same environment options. It verifies external references, redirects, fragment/query preservation and canonical return links.

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

## Public collection identity — 8 September 2026

This is the higher-autonomy parallel experiment: agents pursue the same Petri → SMC → WBS aim as Lawrence’s main Gimmer collection through repeated bounded build/review loops as compute permits. The site records completed results, not live scheduler status. Keep this identity visible on the landing page and lab entry pages. The baseline is now an external inherited reference in the main Gimmer collection. Project graphs remain inherited background, not new autonomous results.

Main collection: https://lawrencerowland.github.io/gimmer-crag/petri-smc-wbs.html. Broader non-route experiments: https://lawrencerowland.github.io/gimmer-crag/app-index.html. Directory: https://lawrencerowland.github.io/side-projects.html#gimmer-projects.
