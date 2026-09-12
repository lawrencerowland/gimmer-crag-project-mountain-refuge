# Forward marking-to-plan engine

`engine.mjs` exports `analyse(model,limits={})`, `validate(model)`, `checkJointStart(model,marking,firedIds,selectedIds)`, `verifySchedule(model,events,schedule)`, `compareModels(base,changed)`, `ENGINE_VERSION` and `LIMITS`. Functions are pure. `scenarios.mjs` exports `SCENARIOS` with `{id,title,description,model,resourcePlaces,notes,comparison?}`. A comparison is `{kind:'marking'|'mechanism',model}`.

The existing causal-lab Petri schema is used. This forward subset supports at most eight transition occurrences, each with `maxFirings:1`, and at most 64 places. Counts are nonnegative safe integers, durations finite and positive, and every transition consumes at least one positive input. The goal is explicit marking coverage. The model and its initial marking are supplied assumptions, not inferred physics or engineering approval.

## Two different completion policies

`states` and `steps` describe the **whole once-only count mechanism**, including goal-covered states and possible later work. A state key includes both its marking and fired subset. A joint step requires the sum of all inputs at the current idle marking; its outputs are unavailable to other starts in that same step. Its target is the marking after all selected work completes. This is an untimed start/effect contract, not an assertion that different-duration tasks finish simultaneously or a state of ongoing work.

`traces` and `plans` apply a separate **first-goal atomic-trace policy**: stop a sequential firing trace at its first goal-covered marking. A legal prefix is never promoted to a completed plan. An initially satisfied goal gives the identity plan. Simultaneous starts may commit additional work which no first-goal atomic trace retains; such start sets remain visible in the whole state/step contract but are not silently added to this plan policy.

## Analysis result

- `ok`, `errors`, `version`, `modelId`, `limits`, `stats`, `complete`, `completeness:{states,steps,traces,ancestries,representations}`. `complete` requires every component. Reached budgets appear in `stats.reachedLimits`; interrupted enumeration never proves impossibility.
- `states:[{id,marking,fired,goalReached,enabled,canReachGoal,goalGaps}]`. IDs are stable fired-subset ids (`s0`, etc.); internal identity also checks marking. `canReachGoal` is true if a route is found, false only after complete state exploration rules one out, otherwise null. `goalGaps` entries are `{place,needed,available,shortfall}`.
- `steps:[{id,from,to,transitionIds,needed,jointlyEnabled:true}]`, including singleton firings. Non-singleton sets certify joint input availability; they do not derive concurrency from equality of serial languages.
- `traces:[{id,transitionIds,scopeId,finalStateId}]`, all retained first-goal atomic traces.
- `scopes:[{id,transitionIds,traceIds,planIds,complete,minFinish,maxFinish}]`. Scope transition IDs are in model order. Different method/task sets remain separate; no single global DAG or WBS is asserted across them.
- `plans:[{id,scopeId,transitionIds,traceIds,events,allocations,edges,order,tree,exactTree,obstruction,schedule,makespan,timedReplay,monoidal,goalReached:true}]`. A plan is a distinct producer-count ancestry, deduplicated across compatible input traces. `transitionIds` is one first-goal representative trace; `traceIds` names the retained traces represented. Event IDs are existing `transitionId#1` occurrence IDs. Initial tokens and same-producer tokens are quotiented by count, not permuted as separate options. Different count/place assignments remain distinct even with equal DAGs or schedules.
- `summary` gives retained state/step/trace/scope/plan counts, `goalReachable`, `initialGoalReached`, exact `fastestFinish` only when enumeration is complete, and `observedFastestFinish` for retained representatives. Finish comparisons range over earliest schedules of the generated fixed ancestry witnesses, not arbitrary inserted idle time or unmodelled resource policies.
- `goalGaps:{initial,deadEnds,unreachableStateIds}` distinguishes missing goal tokens from a proof that no completion route exists.

Each schedule is independently replayed against counts at every event start/completion time. Completion outputs are credited before starts at the same timestamp; all simultaneous starts consume their aggregate demand. `timedReplay` includes `{ok,errors,goalReached,finalMarking,checkpoints,scope}`. A schedule certificate is accepted only after every scheduled event finishes and its final marking covers the goal. Earliest calculations retain resource-allocation edges separately from condition edges.

`monoidal` exposes a counted typed linear-token diagram: `{mode,wires,events,boundaryInputs,boundaryOutputs,goalProjection,term,verified,reason}`. Wires are `{id,place,type,kind,count,from,to}`; endpoints are `{kind:'input'|'output',place}` or `{kind:'event',eventId}`. Every consumed bundle has exactly one source; every residual output becomes an explicit boundary wire, including unused frame resources. Counts expand to parallel individual wires conceptually. When the existing compiler's 64-port bound permits expansion, `term` is an actual event/identity/permutation/tensor/sequence term, checked by that compiler and against the ancestry order. Otherwise the exact counted diagram remains and expansion is explicitly unavailable. This is a concrete chosen token-flow witness, not a claim about an unrestricted free-SMC quotient or canonical collective-token causality.

For efficiency, traces differing only by swaps of transitions with no shared consumed place or producer/consumer interference share one ancestry analysis. Their full producer-count families are equal under the retained occurrence IDs. Shared-output-only transitions may commute. This cache does not identify different resource orders or silently expand a selected-trace language. The existing family analyser is used for ancestry enumeration; its alternative-language enumeration is deliberately not requested here because all first-goal atomic traces are generated directly.

## Interactive checks

`checkJointStart` returns `{ok,errors,marking,fired,selected,individual:[{id,enabled,shortfalls}],needed,jointlyEnabled,shortfalls,scope}`. Inputs must identify distinct, unfired transitions and a consistent reachable idle marking; invalid states are rejected. The check is consume-at-start only and does not invent ongoing-progress state.

`compareModels` returns `{ok,errors,category,changes,scope}`. `changes` separates `marking`, `goal`, `mechanism`, `timing`, and `metadata`; category is `identical`, one of those names, or `mixed`. Adding capacity changes the marking; changing prerequisite arcs changes the mechanism. Goal and duration changes are separate assumptions.

## Bounds

Every supported run records effective caps for state nodes, joint steps, trace path nodes, retained traces, ancestry analyses/states, plans, and serialized collections. Exact-at-cap completion is distinguished from finding an additional item beyond the cap. Numeric overflow or erased positive durations produce a reviewable error. Large multiplicities stay counted; they are never expanded merely to search ancestry or validate resource use.

Defaults are `maxStates:256`, `maxSteps:6500`, `maxTraceNodes:150000`, `maxTraces:40320`, `maxTraceCharacters:12000000`, `maxContractCharacters:6000000`, `maxFamilies:4096`, `maxAncestryStates:500000`, `maxPlans:4096`, `maxPlanCharacters:12000000`, `maxPlanTraceLinks:200000`. Positive integer overrides must not exceed `LIMITS`. Definitions are limited to 250,000 serialized characters and place/transition ids to 100 characters. Character budgets use JSON string lengths rather than UTF-8 file bytes and bound retained collections rather than an entire export wrapper. Trace links are separately bounded so deduplicating a plan across many histories cannot create an unbounded membership list.

Per-family language limits are intentionally tiny because this API generates atomic traces directly. Those unused language-limit flags do not truncate ancestry; only that analyser's ancestry completeness and errors are propagated. An ancestry cap prevents a universal claim even if the retained examples all agree. Optional individual-port term expansion is not a prerequisite for a complete counted-wire certificate.

If a jointly requested input sum exceeds safe-integer precision, the exact oversized `needed` and `shortfall` quantities are decimal strings. Such a start set cannot be enabled at a supported safe-integer marking. Enabled steps retain ordinary numeric counts.
