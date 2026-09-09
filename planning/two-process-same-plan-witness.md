# Two processes, one chosen plan

Implemented upstream: 2026-09-05. Refreshed into this public mirror on 2026-09-07 from
`lawrencerowland/gimmer-crag` commit `03e778b9e2e4b5162167785d6f3f3dc1fe79cf6a`.
The application copy and duplicate tests were withdrawn here on 9 September 2026. This is historical baseline documentation, not an autonomous result. Current code and the 12 baseline tests are maintained only in the [main Gimmer repository](https://github.com/lawrencerowland/gimmer-crag/blob/main/apps/mountain-refuge-petri-wbs-demo/index.html); see the [withdrawal record](inherited-baseline-withdrawal-2026-09-09.md).

The original translation panel explained that a plan loses process information. The app now
computes a concrete example: two different process models produce the same complete baseline
plan, but respond differently to the same changes in resources or preference.

Open [the mountain-refuge app](https://lawrencerowland.github.io/gimmer-crag/apps/mountain-refuge-petri-wbs-demo/#same-plan-witness).
The section **One plan can hide two different processes** is visible on entry. Select each of the
three comparison buttons and expand **Inspect both complete plans and the hidden rule** to see
the complete task tables, WBS, model difference and computed plan JSON.

## The actual process difference

Both models are independent copies of the existing fictional mountain-refuge Petri net, with
the same 14 tasks, default durations and resource rules.

- **A:** walls and roof both require the completed frame. They can overlap if every required
  resource is available.
- **B:** roof also requires the `wallsDone` token. It returns that token on completion, preserving
  the downstream utilities path. The exact changes are `roof.pre.wallsDone = 1` and
  `roof.post.wallsDone = 1`.

This is a timed requires/returns self-loop, not a non-consuming read arc. Model B holds the
walls-complete token while roof work is running. Omitting the return would deadlock the model.
The added rule is an illustrative process assumption, not a verified construction dependency.

## What counts as the same plan

`projectWitnessPlan` accepts only completed executions whose task end times are finite. Each
projection has schema `chosen-execution-plan-v1` and includes:

- units, resource settings and priority policy;
- all tasks, ordered by start time and label, with ID, label, start, end and duration;
- makespan, complete SMC-style expression and complete schedule-derived WBS.

Both executions are computed independently. `samePlan` requires both valid projections and exact
equality across this complete serialized schema. Two failed executions cannot count as a match.
Matching a heading, a first WBS line or a finish date is insufficient.

The projection omits enabling arcs, token provenance and unchosen execution possibilities. The
example establishes non-injectivity of this chosen-execution projection at the baseline settings:
the full visible plan cannot identify which of these two source models produced it. It does not
establish a categorical functor, equivalence of the source processes, or correctness under
substitution. The same-start SMC-style grouping is illustrative notation; it does not guarantee
that every task in one group finishes before the next group starts.

## Computed outcomes

All durations are fixed toy values in days. Both models receive the same settings in each row.

| Comparison | Model A: walls / roof | Model B: walls / roof | Finish A / B | Full plans match? |
|---|---|---|---|---|
| One crew, tools and lift token; walls first | 19–23 / 23–26 | 19–23 / 23–26 | 36 / 36 | Yes |
| Two of every resource; walls first | 19–23 / 19–22 | 19–23 / 23–26 | 31 / 34 | No |
| One of every resource; roof first | 22–26 / 19–22 | 19–23 / 23–26 | 36 / 36 | No |

A tested control doubles crew only, leaving tools and lift at one: both still finish on day 34
with the same plan. The shared tools and lift still prevent walls and roof from overlapping.
Calling the second button simply “add a crew” would therefore misstate the experiment.

The management question is concrete: **is the observed sequence caused by a shared-resource
bottleneck or by a required handoff?** Before promising acceleration, the underlying dependency
needs evidence from the actual method and its owner. This demonstration supplies a question to
test in ordinary planning work; it does not yet demonstrate that a practitioner makes a better
decision using it.

## Interaction and boundaries

The comparison clones the original model and uses fixed default durations. It is independent of
the resource, duration, marking and candidate controls in the main scheduler. Its three buttons
replace the temporary comparison immediately; reload restores the baseline. Nothing is stored,
exported, approved or sent by the comparison. There is deliberately no save or correction record;
the selected case can be changed or reset while the page is open.

The implementation remains inside `FORAY-WBS-PATHS`, under `FORAY-PROCESSES-TO-PLANS`.
`FORAY-DYNAMIC-PROJECT-STATES` remains adjacent and deferred. This increment uses the existing
public toy model; record-level source provenance and the local experiment receipt stay private.

## Validation

Run from the **main `gimmer-crag` repository** root with Node:

```sh
node --test scripts/process-witness.test.js
```

The 12 focused tests use the app's actual pure core, not a second implementation. They cover the
declared model difference, full baseline timing, complete projection fields, all three comparisons,
crew-only bottleneck, incomplete and deadlocked executions, token return, model-specific enabling
and completion, and mutation isolation.

The upstream method note records these additional checks performed on 2026-09-05
(they are historical checks, not a report that this mirror reran them):

- Original and refactored simulator results matched across 768 deterministic combinations of
  resource capacities, policies and step limits.
- Browser interaction covered baseline → capacity → keyboard preference → reset → inspect all
  14 tasks → main scheduler generation → independent controls → clear → reload.
- Desktop and 390-pixel layouts were checked; expanded details caused no page overflow. Buttons
  worked with Enter and Space, and no uncaught page errors were observed.

These are agent checks. Screen-reader behavior, practitioner usefulness and human-user testing
have not been established. Historical validation does not establish this mirror's current deployment state.

Mirror refresh check on 2026-09-07: the 12 focused tests above passed against the refreshed
page in this repository using Node's built-in test runner. The source app is unchanged apart
from its two return links, which now point to this site's Process-to-Plan Lab. This local check
does not establish publication or human use.
