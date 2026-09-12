# Feedback-to-plan engine

Pure exports: `analyse(model, options={})`, `validate(model)`, `replayTrace(model, trace, options={})`, `certifyTrace(model, trace, options={})`, `verifySchedule(model, events, schedule)`, `ENGINE_VERSION` and `LIMITS`. No existing engine is modified.

## Definition and game semantics

Use the existing ordinary count-Petri schema: `{id,title?,description?,places,transitions,goal}`. A place is `{id,label?,kind:'condition'|'resource',initial}`. A transition is `{id,label?,owner:'planner'|'environment',inputs,outputs,duration}`. Inputs and outputs are place/count records. Counts are nonnegative safe integers, inputs contain a positive count, and durations are positive finite numbers. The goal is an explicit positive marking-coverage requirement. Definitions support 32 transitions, 64 places, identifiers up to 100 characters and 250,000 JSON string characters.

**Do not supply `maxFirings`.** The engine rejects it: a per-transition cap could remove a repeated adverse outcome and falsely certify success. The same transition can fire repeatedly. An explicit global horizon from 1 through 8 bounds **total event occurrences**, not transition definitions or retries of each action.

A game state is the complete count marking and remaining occurrence budget. States with the same marking but different remaining budgets are different. A reached goal is terminal immediately. At any explored non-goal marking, all count-enabled transitions are checked; if both owners are present, the model is rejected with the marking and a witness prefix. No planner/environment priority is invented. This ambiguity check also applies at non-goal cutoff markings. Goal markings are terminal and need no owner. With zero remaining budget a non-goal state is a cutoff; with positive budget and no enabled transition it is a deadlock.

At a planner state, the planner chooses one enabled transition. At an environment state, **every** enabled transition remains an outcome. The bounded game has full observation after each atomic outcome. Planner decisions use only current marking and remaining horizon, never a future result. There are no probabilities, fairness assumptions, strong-cyclic guarantees, concurrency policies or inferred physical rules.

Backward solution makes goal states winning and cutoff/deadlock states losing. A planner state wins if at least one successor wins; an environment state wins iff every successor wins. `possible` uses existential reachability for both owners. False guarantee means no policy forces the goal **within this horizon**, not global impossibility. A possible success can coexist with no bounded guarantee.

For winning states the default policy minimises worst **sequential atomic duration**: minimum over winning planner choices, maximum over every environment outcome, adding transition durations. Ties follow model transition order. Every winning planner choice is retained; the selected default is not claimed uniquely optimal. Numeric overflow or loss of a positive duration produces errors and no guarantee rather than omitting a transition.

## Analysis API

`analyse(model,{horizon:6,...limits})` returns:

```js
{
 ok, errors, version, modelId, horizon, limits, stats,
 complete, completeness:{graph,paths,policy}, initialStateId,
 states, edges, paths, summary, policy, scope
}
```

- State: `{id,key,marking,remaining,owner,terminal,enabled,possible,guaranteed,winningChoices,bestChoice,worstDuration,exampleTrace}`. `terminal` is null, `goal`, `cutoff` or `deadlock`; `enabled` contains transition IDs. `key` serializes remaining budget and marking counts in model place order. `winningChoices` is a planner transition-ID array, empty for other owners; it is null when the result is incomplete. `bestChoice` is null outside a winning nonterminal planner state. `worstDuration` is 0 at a goal and null at a losing/unknown state.
- Edge: `{id,from,to,transitionId,owner,duration}`. Every enabled transition has its own edge, even if another transition leads to the same state.
- Path: `{id,trace,terminal,stateId,duration}`. `trace` is an array of transition IDs and can repeat IDs. Terminal paths include first-goal successes, deadlocks and horizon cutoffs; duration is their sequential total.
- Summary: `{possible,guaranteed,worstDuration,winningChoices,bestChoice,stateCount,edgeCount,pathCount,goalPathCount,cutoffPathCount,deadlockPathCount}`. Counts refer to retained records. Boolean false is supplied only after complete computation. On a partial search, an observed goal can still prove `possible:true`, but absence means null.
- Policy: `{complete,scope,decisions,proof}`. Each decision is `{stateId,stateKey,transitionId}` and depends only on that current state. Decisions cover every computed winning planner state. When the initial state wins, `proof` traverses the default policy and **all** environment edges: `{ok,stateIds,checkedStates,environmentBranches,allTerminalsGoal,horizon,worstDuration}`. A losing or incomplete initial state has no success proof. This is an executable bounded certificate from this solver, independently challenged by tests; it is not an imported proof or a general feedback theorem.

All computation caps are distinct from the semantic horizon. Defaults are `maxStates:6000`, `maxEdges:24000`, `maxPaths:2500`, `maxPathNodes:30000`, `maxCharacters:12000000`. Hard maxima respectively are 20,000; 100,000; 10,000; 100,000; 24,000,000. Overrides must be positive safe integers. `maxCharacters` counts serialized search records as retained during enumeration; it is not an entire result/export byte limit. Final verdict fields and policy references are additionally bounded by the state/edge caps. IDs and definitions are separately bounded. A worker can be terminated by the host.

`stats` includes reached limit names, retained search-record characters and entered path nodes. Exact-at-cap exhaustion can be complete: truncation is recorded only when another record/node is required. Graph, path or size truncation conservatively suppresses all guarantee, winning-choice and timing verdicts to null, even if a partial proof seems favourable. Path enumeration is not a substitute for the universal environment check. No omitted environment edge can prove a win. Invalid input or numeric error has `ok:false`; an ordinary capped search can have `ok:true,complete:false`.

## Prefix and realised-branch evidence

`replayTrace(model,trace,{horizon:8})` accepts legal prefixes of at most the horizon. It returns `{ok,errors,trace,events,markings,marking,remaining,goalReached,owner,enabled,terminal}`. Events are `{id,transitionId,label,duration,owner,index}` with stable occurrence IDs such as `revise#1`, `revise#2`. `markings` includes the initial snapshot and every atomic completion; it is not a concurrent timeline. The trace may not continue after first goal coverage. Unknown/disabled transitions and ownership ambiguity are errors. The legacy core replay is used as a second count/occurrence check with an internal copy setting `maxFirings=horizon`; that adapter cannot suppress any event in a trace of length at most horizon and is never used for game search.

`certifyTrace(model,trace,{horizon:8,...familyLimits,maxCertificateCharacters})` requires a completed first-goal trace. It returns `{ok,errors,trace,events,markings,witnesses,complete,reason,stats,bounds,scope}`. Each witness contains the retained family fields `{id,allocations,edges,order,reducedEdges,tree,exactTree,obstruction,schedule,makespan}` plus `timedReplay` and `monoidal`.

The existing family engine enumerates producer-count ancestries for this **selected realised trace**, not every possible future outcome. Identical tokens from the same producer are counted together. A repeated transition has distinct producer occurrence IDs. The exact elementary Seq/Par tree is present only when its order is preserved; otherwise the induced N and richer typed dependency graph remain. This does not equate a conventional WBS with that restricted tree grammar.

The counted typed diagram and optional term construction are adapted from R-023 `marking-plan-lab/engine.mjs` at `84f8cb1`. `monoidal` retains `{mode,wires,events,boundaryInputs,boundaryOutputs,goalProjection,term,verified,reason}`. Wires have `{id,place,type,kind,count,from,to}`; boundary endpoints are `{kind:'input'|'output',place}`, event endpoints `{kind:'event',eventId}`. All unused initial resources remain explicit frame wires. `verified` is `{tokenBalance,framePreserved,orderPreserved,compiled}`. Counted diagrams remain exact when optional individual expansion exceeds the existing 64-port compiler bound; then `compiled:false` and `term:null` are explicit.

`verifySchedule(model,events,schedule)` independently sums simultaneous input consumption and credits outputs at completion before starts at that time. Repeated transition occurrences are allowed; event IDs must follow `transitionId#1`, `#2`, etc. in the supplied event order and appear exactly once in the schedule. Every retained event must finish and the final count marking must cover the goal. It returns `{ok,errors,goalReached,finalMarking,checkpoints,scope}`.

**The certificate's earliest schedule is retrospective for one realised trace with its allocation fixed. It is not the online feedback policy timing.** A conditional choice cannot be justified by seeing a future outcome. The game's sequential worst-duration guarantee and a realised branch's earliest causal schedule are different quantities; no equality or online concurrency preservation is claimed.

Certificate defaults use 128 witnesses, 50,000 family search states, 65,536 allocation entries and 4,000,000 family witness characters. Corresponding overrides pass through the existing bounded family validator. Its alternative-language enumeration is deliberately not requested; unused language flags do not truncate ancestry. The additional `maxCertificateCharacters` defaults to 8,000,000 and has a hard limit of 16,000,000; it bounds the sum of enriched witness JSON lengths. A cap leaves `complete:false`, reports its reason, and never claims all histories were returned. Model/metadata and the result wrapper are outside that collection budget.

## Source/application boundary

Stimulus, response, value and evidence metadata are descriptive unless transitions/arcs encode their effect. Selective invalidation must consume the stale condition tokens explicitly; the engine discovers no evidence dependency and does not revise the model automatically. A rule-permitted revision transition is an option inside the supplied mechanism; editing an arc, initial supply, goal or duration changes assumptions. The finite AND/OR solver is this implementation's construction, not ND-FCP, a strong-cyclic planner, ASM2.0 or a theorem for arbitrary feedback networks.
