# Process contracts that preserve alternatives

The [Process Contract Lab](../apps/process-contract-lab/) develops two parts of the process-to-plan question. It enumerates the token ancestries compatible with a selected firing trace, and it constructs processes by connecting explicit typed fragments. Both produce inspectable plans, but they have different input contracts.

The central new distinction is that **an exact tree for every individual history does not imply that one dependency graph can preserve their alternatives**. A second result is constructive: typed wires can express selective dependencies that the earlier event-block tree grammar cannot. The lab generates and checks the resulting finite executions rather than presenting the wiring only as a diagram.

These are bounded method experiments using supplied process assumptions. They do not discover every task required for a real project, prove a total Petri-to-WBS functor, or establish engineering or human-user validity.

## From one ancestry to a family

The [earlier causal lab](../apps/causal-plan-lab/) selected FIFO or LIFO token ancestry for a count trace. This lab enumerates all compatible **producer-count allocations** within its explicit computation bounds.

At each event and input place, an allocation specifies how many tokens come from each available earlier producer. Initial tokens have producer `null`. Tokens from the same producer at the same place are aggregated; the algorithm does not count different serial-number permutations of those tokens as different histories. Different producers, consumer events, places or consumed multiplicities remain distinct, even when they induce the same causal order.

For example, two occurrences of `make` each produce two p tokens, and C and D consume two each. C can take two from the first producer, one from each, or two from the second: three producer-count allocations, rather than six choices of labelled token pairs. The repeated producer occurrences retain different IDs.

This is a deliberately defined finite quotient. It is not claimed to implement Best–Devillers process equivalence or solve collective-token causality. [Van Glabbeek, Goltz and Schicke, *On Causal Semantics of Petri Nets*](https://cgi.cse.unsw.edu.au/~rvg/pub/processes-ea.pdf), pp.2–4, explains why occurrence histories, token indistinguishability and process equivalence require separate treatment.

Each completed allocation supplies a dependency poset, an exact Seq/Par tree or an induced N certificate, and an earliest timed schedule. The family retains different allocation tables separately, while also counting how many different event orders they induce.

## What the selected trace does and does not fix

The input trace must be legal and cover its explicit goal for the first time at its final marking. The empty trace is accepted when the initial marking already covers the goal. Partial and after-goal input traces are rejected.

The analyzed **order language** then contains all linear orders allowed by the family’s witness posets, retaining every selected event occurrence. A reordering can cover the goal before its last retained event. For example, independent work B followed by goal-producing A is a first-goal input trace; the reordered A,B still performs the selected work but reaches the goal earlier. The lab does not silently remove B as unnecessary scope.

There is another boundary: allocations must be compatible with the selected input trace. This family need not contain every legal reordering of the same task set in the count model. With one reusable lifting token, choosing trace A,B supplies ancestry A→B. The alternative B,A is a legal model execution but belongs to a different input-trace family. A result outside the current family is therefore not automatically impossible in the model. The order checker distinguishes those cases.

“Complete family” always means complete under this trace-relative definition and the reported bounds. It does not mean all project methods, all scopes or unbounded Petri behavior.

## Why a single graph can fail

In the “Either completed package can support the next task” example, A and B each supply an interchangeable p token. C needs one p. The selected scope includes all three completed tasks.

| Ancestry | Required dependency | Lawful orders |
|---|---|---|
| A supplies C | A before C | A,B,C · A,C,B · B,A,C |
| B supplies C | B before C | A,B,C · B,A,C · B,C,A |

Each ancestry has an exact tree. Their combined language contains four orders. Keeping only dependencies common to both produces an empty graph, which also permits C first. Requiring every dependency that appears anywhere instead demands both A and B before C and removes the lawful middle-C alternatives.

This is a disjunction of support histories: **A before C or B before C**. A plain dependency DAG expresses a conjunction of required pairs. The lab returns actual extra and excluded orders, so the difference can be checked rather than merely described.

With durations A=2, B=5 and C=1, the two witnesses’ earliest completion times are five and six. This range concerns alternative allocations. It is not a probability distribution or a forecast interval. The maximum is the slowest **earliest** finish among the witnesses; delaying valid work can finish later without bound.

## The finite single-graph criterion

Let each witness have strict order `Pᵢ`, and let `L` be the union of their linear-extension languages on the same event IDs. Define:

- **Must:** the intersection of all witness order relations.
- **May:** the union of those relations, interpreted transitively when used as precedence constraints.

A finite poset is determined by the pairs ordered the same way in all its linear extensions. Consequently, if any single poset represents `L` exactly, it must be **Must**. The lab therefore checks whether every linear extension of Must belongs to `L`. Equality certifies an exact single-DAG representation; a missing family word admitted by Must is a certificate that no other DAG on those same event IDs can do better.

Imposing all May pairs has a different meaning. It requires all ancestry-specific dependencies simultaneously and yields the intersection of the witnesses’ languages. A lawful family word that violates May demonstrates overconstraint. In this fixed-trace construction every observed pair points forward in the original trace, so the union cannot create a cycle.

An exact elementary Seq/Par family summary additionally requires Must to be series-parallel. The [earlier method note](causal-plan-method.md) defines that restricted grammar and its induced-N obstruction. The relevant finite characterization is Zaguia’s [*The Aharoni–Korman conjecture for N-free posets with no infinite antichain*](https://arxiv.org/pdf/1811.07959), Theorem 5, PDF pp.2–3. Neither that theorem nor the finite language criterion is claimed as research-original here.

The individual-witness classification and the family-language verdict are different results. The OR-support case has only exact individual trees but no exact family DAG. Conversely, the “A parallel family language can contain an N ancestry” experiment supplies initial tokens as alternatives to produced tokens. Some witnesses contain N, but one has no dependencies; the union then contains all 24 four-event permutations and has an exact parallel summary. A non-tree witness does not by itself prove that the union needs a non-tree language.

These verdicts concern **linear event-order languages**. Equality of such languages alone does not establish identical concurrent steps, resource usage or timed behavior. In particular, two tasks sharing one token may be executed in either order while remaining unable to run together. Each timed plan must retain a valid allocation witness or be checked against the original resource model.

## Checking a possible concurrent start

The step checker makes one part of that distinction executable. Choose a prefix of the selected atomic trace and a set of remaining event occurrences. The checker replays the prefix to obtain its count marking, reports which selected events are individually enabled, and checks whether all selected input multisets can be supplied jointly. Outputs from those starts are unavailable until completion.

With one reusable lifting token, either job can start alone, but selecting both needs two tokens and returns a concrete shortfall. A second owned token removes that capacity conflict. Similarly, selecting a producer and its consumer together cannot use the producer’s future output to justify the consumer’s start.

This is a **snapshot after a completed atomic prefix**. It does not reconstruct ongoing work, predict a timed trajectory, enumerate all reachable markings or compare all step languages. Empty selection is enabled. Selected IDs must name distinct remaining occurrences; unsafe summed counts produce an error. The test provides a specific concurrency check without converting a sequential-language certificate into a timed-equivalence claim.

## Constructing the process from typed fragments

The second route starts with ordered input and output ports. Each port carries one typed wire and owns one token. Equal type names do not pool different wires.

```text
event: an explicit occurrence with typed inputs, outputs and duration
id:    pass the existing wires through without an event
permute: reorder wires bijectively
par:   place fragments alongside each other with distinct owned wires
seq:   connect corresponding outputs and inputs with matching types
```

Sequence connects particular ports; it does not add an all-to-all event barrier between syntactic children. Identity wires preserve untouched inputs while other work runs. A permutation changes port order without duplicating tokens. Production, consumption or splitting belongs in an explicit event signature, not in an implicit structural copy rule.

This follows the graphical interpretation of identity, composition, tensor and symmetry described in [Selinger, *A survey of graphical languages for monoidal categories*](https://arxiv.org/pdf/0908.3347), sections 2, 3.1 and 3.5. The implementation checks concrete denotations and law instances; those tests are not a proof of a universal free-category construction.

The compiler produces a separate Petri place for each wire and a once-only transition for each event occurrence. Boundary inputs receive one initial token each. Thus two parallel lifting input wires mean two owned lifting tokens. Threading one lifting wire through two jobs instead models one reusable resource and the specified handoff order. Parallel composition does not make a shared resource freely available twice.

Event IDs name occurrences, not reusable generator symbols. Reusing a fragment requires fresh occurrence names. The supplied renaming operation supports that explicitly; raw duplicate IDs are rejected.

## What the typed route constructs

The selective-N term connects A to C, and B to C and D, using typed outputs and a permutation. Its compiled causal order is exactly `A<C`, `B<C`, `B<D`. It admits five event orders and a seven-unit earliest schedule with the supplied durations. The construction is valid although the restricted event-block Seq/Par tree cannot express the order. Full typed monoidal wiring is richer than that tree grammar.

The larger refuge term has eight occurrences and three owned boundary inputs: a site request, a cargo request and a lifting token. Surveying overlaps delivery; anchors depend on survey; deck assembly consumes the explicit prerequisites; walls and roof can overlap before inspection and opening. The compiled process generates six complete event orders and an earliest completion of 15 toy time units. These are calculations from the supplied term, not engineering estimates.

Concrete identity, associativity, interchange, symmetry and permutation-inverse checks compare typed port/event connections while ignoring internal wire names. A separate backward evaluator threads consumer demands from the output boundary toward the inputs, independently checking the production compiler’s forward construction. Generated traces are also compared with independently enumerated orders of the resulting wire dependencies.

This route supplies identity and interface information rather than recovering it from a pooled-token family. Wire-specific compiled places have unique ancestry. Pooling same-type wires would be an additional abstraction and can introduce choices or resource conflicts; it is not performed silently. No functor from arbitrary pooled Petri processes to these typed terms has been established.

## Completion is explicit

The compiled goal includes the typed boundary outputs and a terminal completion marker for every selected event. Each marker is produced by its event and never consumed. This ensures that a sink event with no typed outputs still has to execute. The monitors add neither physical input ports nor event-order dependencies.

An empty identity has no typed wires or events. Because the reused Petri API requires a positive goal, this case has an explicitly declared, initially complete sentinel. Its only complete trace is empty. The sentinel is excluded from the typed interface and canonical wiring comparison.

Zero-input event generators are outside the chosen compiler subset and are rejected, rather than made executable using invented readiness tokens. Declaring all generator occurrences as required scope is part of the compiler contract; it is not a discovery that those tasks are necessary in the real world.

## Bounds and evidence

Ancestry analysis supports at most eight selected occurrences, 64 places and 32 model transitions. Default ancestry limits include 2,048 retained witnesses and 50,000 search states. Allocation data and language checks have separate budgets; at most `8!` event permutations exist. The interface also bounds model size, generation work and worker time. Effective limits travel with the result.

If ancestry enumeration stops early, universal all/some/none classification remains unknown; observed counts are labelled as a sample. Exact Must/May and timing extrema are withheld. If the language computation is incomplete, exact DAG/tree verdicts and purported extra/excluded-order certificates are withheld. A word absent from a partial enumeration is not a proved counterexample.

The typed compiler has separate limits: 32 generator occurrences, 64 ports per boundary, 512 syntax nodes and depth 40. Exhaustive ancestry-language analysis retains its eight-occurrence limit. Counts and timing inherit the causal engine’s safe-integer and finite floating-point checks; overflow or a positive duration lost to rounding is reported as an error. Timing is not exact-real arithmetic.

Independent tests compare labelled-token subset enumeration with producer-count classes, check full small permutation languages, replay simultaneous starts jointly, compare step enabling with disjoint assignments of individually labelled tokens, and test typed wiring against the backward denotation. The [run record](process-contract-run-2026-09-07.md) gives the current evidence checkpoint and distinguishes it from final browser and publication checks.

The next question follows from the exposed boundary: how can alternative histories and explicitly shared interfaces compose without pooling away resource ownership or replacing disjunctive support by conjunction? A bounded enumeration of trace families, count-level legal words and reachable steps would extend the present single-prefix check and distinguish missing reorderings from lost concurrency. Neither unrestricted family composition nor full project-model completeness is claimed by this increment.
