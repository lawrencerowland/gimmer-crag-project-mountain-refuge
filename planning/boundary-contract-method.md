# What must a reusable process fragment remember?

Connecting two pieces of work can release a useful output before either piece is finished. It can also make two tasks compete for one resource. A reusable process description needs to preserve both facts. A list of completed plans cannot do this by itself.

The [Boundary Contract Lab](../apps/boundary-contract-lab/) investigates a precise alternative: retain each fragment's partial internal states, joint steps and outstanding boundary demands, then compose those descriptions through explicit resource connections. Compare the result with gluing the original count Petri nets and calculating their behavior afresh. The claim concerns a small, declared class of selected work. It is not a general process-library or scheduling theorem.

<h2 id="ends-ways-means">The end this essay serves</h2>

**End — generate compliant ways to complete the refuge.** The direction adopted on 12 September 2026 starts with the reviewed physical and operational logic of the mountain-refuge project, represented as a Petri net with essential conditions, admissible starting markings and completion goals. An explicit Petri-to-SMC interpretation should support alternative executions, WBS/work-plan structures and schedules, preserving necessary constraints and the freedoms the mechanism allows. A marking is a project state; several plans may start from it.

**Ways — let the sources shape the construction.** This higher-autonomy investigation follows the original highlighted source methods and the forward route from mechanism to execution to work plan. Here, the open-net paper supplies a way to connect fragments; the nets paper makes the token interpretation precise; the ASM2.0 paper challenges whether reusable fragments will be useful in practice. The [source-use map](#source-use-map) ties each choice to its limits. These are methodological inputs to the end, not an optional bibliography.

**Means — make the claim inspectable.** The [interactive experiment](../apps/boundary-contract-lab/) lets a reader change resource supply and connections, follow enabled steps, inspect the Petri mechanism and its monoidal execution interpretation, and compare the resulting behavior and representative schedule. The explanation, counterexamples and checks belong to the same investigation.

**This essay's contribution is at the join between mechanisms.** It tests how selected process fragments can be assembled without inventing a resource or hiding an early usable output. Preserving those possibilities is a prerequisite for generating trustworthy work plans from reusable parts. The wider end still requires reviewed engineering content, alternative work scopes and a justified passage into useful work structures and schedules; this finite composition result advances one part of that route.

<figure class="method-route" aria-labelledby="route-caption">
<ol>
<li><strong>Petri mechanism</strong><span>What consumes, produces or returns each resource?</span></li>
<li><strong>Monoidal execution</strong><span>What can follow, combine or pass through unchanged?</span></li>
<li><strong>Work structure</strong><span>Which dependencies and alternatives must the plan retain?</span></li>
<li><strong>Schedule</strong><span>What timing follows under declared assumptions?</span></li>
</ol>
<figcaption id="route-caption">The wider forward route. This essay checks the composition of selected mechanisms and their state/step behavior; work grouping and timing require further interpretation.</figcaption>
</figure>

<h2 id="petri-open-net-smc">Petri nets, open nets and symmetric monoidal structure</h2>

In a **Petri net**, places hold tokens representing available resources or conditions, and transitions consume and produce them. A marking records the current counts. In the lifting example, an event takes a lifting token and returns it with an installed-part token. The lab's once-only event selection is an extra execution restriction; the bare Petri graph does not impose it.

An **open Petri net** also identifies places at which another fragment can connect. Gluing those places assembles a larger mechanism. This is the boundary-composition level developed by [Baez and Master](https://arxiv.org/html/1808.05415v6). Our explicit ownership and external-supply rules specialise that idea for the finite experiment.

The **symmetric monoidal category (SMC) of executions** is a different level: markings are objects, and processes taking one marking to another are arrows. Following one process with another is arrow composition; combining them is tensor; carrying unused resources through is identity. The count-token choice here is a commutative monoidal category, a particular SMC whose symmetry is identity, as explained by [Baez, Genovese, Master and Shulman](https://arxiv.org/html/2101.04238v2). This is why exchanging the display order of tokens adds no new event.

Keep these two compositions distinct: **glue nets to assemble the mechanism; compose execution arrows to describe a way it can run.** The lab also keeps occurrence-labelled joint steps to check resource availability, which the chosen categorical quotient alone cannot certify. Its work grouping and timing are further planning interpretations. The detailed [monoidal account](#monoidal-interpretation) below states that boundary explicitly.

## The obstruction comes first

Suppose a receiver has one event, C, which consumes an input token x. Its standalone supply is zero. Its closed reachable behavior contains no C step. Now connect a supplier whose event A produces x. The assembled mechanism admits A then C, but composing the receiver's previously closed behavior cannot recover the discarded C.

This two-event example defeats the proposed use of closed standalone behavior as a composable summary. It does not defeat modular analysis. The repair is to leave the demand for x explicit until the surrounding process supplies it.

There is a second loss. Two tasks that each borrow and return a lifting token admit both serial orders with either one token or two. Only the two-token model admits their joint step. Equal serial languages therefore do not establish equal resource behavior.

## The finite object

Each fragment declares ordinary count places, nonnegative integer input/output multiplicities, local initial tokens, typed input/output boundary ports, and a separate external-supply assumption on input ports. Events have unique occurrence IDs and fire at most once. The total selected scope has at most eight events. Durations are positive annotations and do not decide atomic enabling.

A state is the set S of completed events. With initial marking m₀, its count marking is:

```text
m(S) = m₀ + sum of (outputs(e) − inputs(e)) for e in S.
```

Only states reached by legal steps belong to the final closed contract. At such a state, a nonempty set T of unfinished events is one atomic step when the current marking supplies the sum of all their inputs. Every input is consumed before any output is credited. One member's output cannot enable another member of that same step.

Completion means every selected event has occurred, including an event with no output. Reaching a physical goal earlier does not silently remove the remaining work. This experiment checks a selected scope; the [marking-to-plan generator](../apps/marking-plan-lab/) remains the place to discover different work scopes.

There are at most 256 completed subsets and 6,305 nonempty disjoint state/step candidates at eight events. The implementation admits at most 24 places across the supplied fragments, with declared counts up to 100,000. Its default exploration count bound is 64. State, step or count cutoffs make behavior incomplete and the preservation comparison unknown. The separate 5,000-word display bound can truncate the serial-word list while the state/step graph remains complete. Missing behavior in an incomplete search is not evidence of impossibility.

## Leave boundary demands open

Split each fragment's places into internal places and boundary places. During local compilation, test internal availability and temporarily leave boundary availability unconstrained. Record each retained step's exact boundary consumption and production. A boundary-blocked event is retained if its internal requirements can be met.

These local descriptions are deliberately more permissive than standalone executions. A boundary demand is an obligation for composition to check, never permission to create a token. Local states retain the occurrence set, so internal markings remain reconstructible. The description also retains local initial tokens, external-supply assumptions and boundary ownership.

Composition has two stages. First, explicitly connect a supplier output port to a receiver input port of the same type. Place ownership is identified only through those connections; equal type names alone do not pool resources. The receiving input's standalone external supply is discharged when that connection is made. Genuine local tokens remain owned tokens and must be declared as such.

Second, explore the product of the local descriptions. A global candidate step selects a local step or no event from each fragment. Check the sum of its boundary demands against the current connected boundary marking, then update every local state and boundary effect together. This preserves early outputs without allowing same-step borrowing from an output that has not yet appeared.

Unconnected fragments compose by disjoint union. This operation retains separate resource ownership even where port types coincide. The admitted connection scheme is an explicit one-to-one output-to-input map between different fragments. A place has at most one input and one output port; both can name the same place for pass-through or borrowing. Port direction specifies wiring, not a ban on returning a token to that place. Arbitrary many-to-one cospans, implicit pooling and hidden resource duplication are outside this interface.

## Why the two routes agree

The following is an argument for this construction, not a theorem imported from a paper. Assume ordinary additive count effects; disjoint event identities; internal places never connected; the declared admissible boundary wiring and supply convention; and a complete calculation without a computational cutoff.

Compare (1) the product of boundary-relaxed contracts with (2) the directly glued ordinary count net. Identify states by their completed event set and places by the declared ownership quotient.

1. **Initial state.** Both routes retain the same local tokens and the same undischarged external supplies. Their internal and quotient-boundary markings agree.
2. **Forward step.** A step accepted by route 1 meets each fragment's internal demand and the sum of all boundary demand. These are exactly the input inequalities of route 2. Both routes consume the same inputs, produce the same outputs and add the same occurrence IDs.
3. **Reverse step.** A legal route-2 step projects to each fragment's internal-feasible step, or to no event there. Projecting a preceding global history gives an internally legal local history, so the required relaxed local state and step have not been pruned. Global boundary availability supplies the remaining product guard.
4. **Induction.** Starting at the common initial state, these two directions preserve every reachable state and labelled step. They preserve all-selected-work completion and the observable boundary counts as well.

The important part is the reverse direction: it fails if local compilation has already rejected a step merely because standalone boundary supply was absent. Keeping symbolic demand is what repairs that failure.

Identity, rebracketing, disjoint tensor and explicit renaming are tested as operations on admissible wiring presentations. Their accounting reason is that the same final ownership classes, events and supplied tokens must survive. An identity has no event or owned token. When placed before an input, its outer input carries the original external supply while the connected receiver assumption is discharged; it must not silently delete that supply. Rebracketing retains supply origin and discharges the same receiver assumptions exactly once. Reusing a closed intermediate result would violate the premises. No universal functoriality claim follows from the finite tests.

## A refuge decision made inspectable

Imagine connecting a refuge lifting method to a task package. A borrowed lifting resource must be supplied by that connection. Keeping the receiver's former standalone supply as well would fabricate extra lifting capacity. A separately owned resource is a changed assumption, with its own token and ownership; it is not obtained by changing a label to the same type.

The effect can be inspected before choosing a schedule: one shared token excludes a joint lifting step; two genuinely available tokens may allow it. Separately, partial output release permits a downstream task to begin after its actual supplier, while unrelated work in the supplier fragment remains unfinished. Making a whole fragment an indivisible block would add a false completion barrier.

This is useful as a check on a proposed method change: which resource is actually supplied, and which work must really wait? It does not establish that the fictional refuge mechanism is safe, that a second lifting resource exists, or that adopting reusable modules will save engineering effort.

<h2 id="monoidal-interpretation">Where the monoidal interpretation sits</h2>

For ordinary count nets, the chosen source interpretation is the free **commutative monoidal category**, a particular symmetric monoidal category with identity symmetry. Places generate marking objects and events generate arrows from their input to output markings. Identity carries unused context, tensor combines arrows, and composition joins matching intermediate markings. [Baez, Genovese, Master and Shulman, *Categories of Nets*, §3](https://arxiv.org/html/2101.04238v2).

In our finite construction, a legal step at marking m gives the arrow formed by tensoring its event arrows with the identity on the leftover marking. A step path composes these arrows. The selected occurrence IDs and the atomic joint-enabling guard remain separate retained evidence. The source's commutative quotient can forget distinctions in token reuse; equal category arrows do not by themselves certify the same concurrency. Once-only selection restricts the execution histories, and the eight-event cap makes software composition partial. These bounded contracts are not themselves claimed to form a symmetric monoidal category.

This interpretation gives execution structure, not elapsed time. The lab adds a separate, conservative schedule construction: choose a full path of joint steps, start each step's events together and wait for every event in that layer to finish before starting the next. Replay consumes resources at each start, returns outputs at each finish, and checks aggregate simultaneous demand. This verifies one representative schedule under the stated toy durations; its layer barriers are planning choices, not newly inferred physical dependencies. It claims neither an optimal schedule nor every legal timed overlap. Calendars, interruption and uncertainty remain outside the model. Nor is every lawful dependency structure an elementary sequence/parallel WBS tree.

<h2 id="source-use-map">Sources that changed the construction</h2>

Each row answers a practical question, then shows the construction and limitation it leads to. Together they explain why the essay preserves more than a list of completed plans.

| Source | Construction it informs | Limit it imposes |
|---|---|---|
| Baez and Master, [*Open Petri Nets*](https://arxiv.org/html/1808.05415v6), §§3–6 | **How can process pieces connect?** Explicit boundary gluing; distinguish operational structure from an input/output summary. | General reachability-relation composition is lax and may omit behavior of the glued net. Our finite enriched-contract correspondence needs its own argument. |
| Baez, Genovese, Master and Shulman, [*Categories of Nets*](https://arxiv.org/html/2101.04238v2), §3 | **What does the Petri-to-SMC passage remember?** Declare the count-token monoidal interpretation and retain occurrence-labelled step evidence. | The commutative quotient is too coarse to recover every token-reuse distinction. We do not infer concurrency from that quotient. |
| Wynn and Clarkson, [*Improving the engineering design process by simulating iteration impact with ASM2.0*](https://link.springer.com/article/10.1007/s00163-020-00354-5), §6.2.3 and §7; [author manuscript](https://api.repository.cam.ac.uk/server/api/core/bitstreams/ae55a464-d41c-46fe-b8cf-1d3e615b91af/content) | **Will reusable methods help the planner?** Treat contextual supply and retained partial behavior as explicit module obligations; inspect the consequences of a method change. | Their earlier process library was abandoned after contextual overrides proved too costly for its observed benefit. Model-trace checks do not validate real numerical predictions. Formal reuse must still earn practical value. |

The boundary-relaxed contract, finite product algorithm and correspondence argument above are our construction. The papers supply methods and objections, not certification of this implementation.

<h2 id="remaining-distance">What the result leaves open</h2>

The contract preserves selected-work state and step behavior on the stated fragment class. It does not discover the correct engineering mechanism, infer missing resources, support unbounded repetition, implement stochastic simulation, or establish a complete general open-Petri semantics. A compact behavioral summary that forgets more internal information without losing composability remains a further question. So does whether these explicit interfaces are easier to maintain than copied and adjusted task groups.

Measured against the adopted end, this is a preservation step toward generative planning. The [marking-to-plan method](marking-plan-method.html) addresses alternative goal-reaching work scopes; the [feedback-to-plan method](feedback-plan-method.html) addresses responses to observed review outcomes. Combining those capabilities with reusable boundaries while retaining their assumptions, checking richer work structures when an elementary WBS tree is inadequate, and establishing practical engineering value remain further work.

[Open the experiment](../apps/boundary-contract-lab/) · [Build and challenge record](boundary-contract-run-2026-09-19.md) · [Higher-autonomy collection](../process-to-plan-lab/)
