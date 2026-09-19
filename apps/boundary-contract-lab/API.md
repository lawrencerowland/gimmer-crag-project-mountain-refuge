# Boundary Contract Lab API and admitted model

This is a finite selected-work construction. It does not discover a task scope, unroll loops, or establish a general theorem about arbitrary open Petri nets. Every named event occurs exactly once in a complete execution. A physical output appearing early does not remove remaining selected work.

## JSON source format

```json
{
  "id": "example",
  "title": "One method",
  "fragments": [{
    "id": "method",
    "places": [{"id": "lift", "type": "lifting-resource", "initial": 0}],
    "ports": [{"id": "borrow", "place": "lift", "direction": "in", "supply": 1}],
    "events": [{
      "id": "Lift", "label": "Lift panel", "duration": 3,
      "consume": {"lift": 1}, "produce": {"lift": 1}
    }]
  }],
  "connections": []
}
```

Fragment, place, port and event identifiers start with a letter, followed by letters, digits, `_` or `-`. Fragment ids and event occurrence ids are globally distinct. Place and port ids are local to a fragment. Display labels may repeat. Boundary references use `fragment.port`; observable count places use `fragment.place`. Merged ownership keys join sorted qualified place ids with `=`.

The admitted class has at most eight events and 24 source places in the whole composition. Arcs and source initial counts are nonnegative safe integers at most 100000. A place has a nonempty exact type, an owned local initial count, and at most one input and one output port. A place with both ports is a genuine pass-through/resource-return boundary. Each input can declare separate external `supply`, default zero. Outputs have zero external supply. Durations are finite positive annotations at most 100000.

Only ordinary consume/produce arcs are interpreted. No inhibitor, reset, read, capacity predicate, ongoing-work state, repeated firing or priority semantics is included. Other descriptive fields are metadata, not additional constraints.

Each wire joins an output to a same-type input of a different fragment. Each output and input port is used at most once. A chain through distinct ports of the same boundary place is allowed; no implicit fanout or type-based pooling is allowed. Connections identify the exact places. Owned local initial tokens are added. External supply of a connected receiver input is removed once; the remaining exterior input supplies are added. Ownership, not a type name, authorizes sharing.

## Enriched contract

`compileContract(fragment, options)` returns a JSON-serializable `fragment-contract`. Its `states` and `steps` ignore boundary enabling only: they retain **every internally reachable completed subset and internally legal nonempty joint step**, including work that external supply currently blocks. Each state's marking contains internal places only. Every event also has a `symbolic` boundary `demand` and `output`; declarations retain local counts, ports, supplies and event annotations. `source` is an audit copy and is not used by contract composition.

`composeContracts(contracts, connections, options)` returns `{kind:'composite-contract', components, connections, status, behavior}`. It forms the product of local step tables, glues only declared boundary ownership, and checks the **sum** of every selected event's boundary inputs before producing any outputs. Internal marks come from the destination local state tables. It never reconstructs or explores the source ordinary net. Nested composites retain their connections and are flattened into the same product; an incomplete intermediate remains explicitly incomplete. Rerun from freshly complete leaf contracts to repair a cutoff.

`glueFragments(fragments, connections, options)` separately merges source count places and relabels source event arcs. `exploreNet(net, options)` generates its whole ordinary-count selected-work behavior from scratch. `analyze(scenario, options)` runs both routes, compares states, labelled joint steps **and counts**, executes the chosen deliberately defective comparator, and generates a conservative replayed schedule. `source` copies are useful for this separate route and export provenance, not necessary for `composeContracts`.

## Results, caps and comparisons

A behavior has:

```text
status: 'complete' | 'incomplete' | 'invalid'
eventIds: sorted occurrence ids
states: [{mask, completed:[ids], marking:{ownershipKey:count}, terminal}]
steps: [{from:mask, to:mask, events:[ids]}]
words: [complete serial event orders]
wordsComplete: boolean
errors: [schema errors]
reasons: [computation bounds]
```

Each mask uses the order in `eventIds`. Terminal means all selected events completed. The empty scope has one terminal state and the empty word. A complete contract with zero full words proves only that this fixed finite scope is uncompletable under its declared assumptions.

Options take `{caps:{maxStates,maxSteps,maxCount,maxWords}}`; defaults are `256, 6561, 64, 5000`. Allowed maxima are `256, 6561, 100000, 40320`, each an integer at least one. Limits are checked on every reached count marking, state insertion and retained joint edge. Any encountered state/step/count cutoff or incomplete input yields `incomplete`, never a negative proof. Aggregated source counts above the count bound yield incomplete enumeration, not a new model rule. Invalid numeric budgets are rejected.

`maxWords` controls serial-language enumeration separately. `wordsComplete:false` does **not** make a complete state/step contract incomplete. Every atomic joint step has at least one legal serial expansion in this ordinary-count model, but serial words alone do not recover joint-step capacity.

`compareBehaviors(left, right, options)` returns `status:'equivalent'|'different'|'unknown'`. Incomplete/invalid inputs always give unknown. It compares occurrence scope, reachable labelled subsets, joint steps and every state's full count marking. Differences prefer the smallest exposed step (fewest completed events, then smallest step, then lexical order) with a serial prefix, current marking and side. Counts differing without a step difference give a marking witness. This is minimal within the compared models, not an automatically minimized source model.

Declared marking correspondence is available as `{markingProjection:{left:{oldKey:newKey},right:{oldKey:newKey}}}`. Mapped counts are summed; explicit `null` hides a place. Unmapped places keep their names. This projection is the caller's mathematical claim, not an inferred identification. `{compareMarkings:false}` requests labelled state/step comparison only and an equivalent result says `markingsChecked:false`. The intentionally defective type-pooling comparator uses this narrower comparison; the main preservation comparison always includes every count.

`analyze` spreads the composed behavior at top level and adds `contracts`, `net`, `direct`, `comparison`, `naive`, `schedule`, and count `stats`. A `naive` result names its defect, explains it, and includes its behavior and comparison. Malformed JSON is handled by the UI before calling the engine; malformed source schemas produce invalid results, not exceptions.

## Structural laws and timing

`tensorContracts(contracts, options)` composes with no new wires. `identityFragment(id,type,supply=0)` makes a zero-event, zero-local-token wire with input and output ports on its one place. A left identity must inherit the exterior supply it replaces; a right identity introduces none. This is relocation of an already declared environment supply, not token creation. `renameFragment(fragment,{id,events,places,ports})` explicitly renames a primitive fragment; connected references must be updated by the caller. Unit and renaming comparisons require the corresponding explicit ownership projection. Associativity and interchange use admissible fresh names and the same exact wiring/supply declarations. Finite law tests supplement the construction argument, not a universal theorem.

`representativeSchedule(net, behavior)` finds a full route preferring larger immediate steps. Each step becomes a layer: reserve all inputs at its common start; each event releases outputs at its own finish; the next layer starts after every current finish. This is deliberately conservative and does not optimize makespan. `scheduleForWord(net, word)` creates one serial schedule. Both call `replaySchedule(net, intervals)`, which independently consumes all simultaneously starting inputs, adds finishing outputs before same-time starts, checks durations, and requires each selected occurrence exactly once. Intervals are `{event,start,finish}`. Toy timing is additional start/finish semantics; it is not inferred from atomic step equality.
