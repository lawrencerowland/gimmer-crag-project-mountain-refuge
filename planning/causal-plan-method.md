# When a complete plan will not fit a tree

The [Causal Plan Lab](../apps/causal-plan-lab/) starts with a small project process, generates complete legal firing traces, and turns a selected trace into a dependency-preserving plan. It then answers a narrower question: can this plan's order be expressed exactly by a tree made only from tasks, sequential blocks and parallel blocks?

Sometimes it can. Sometimes a four-task obstruction proves that this particular tree language must either invent a dependency or omit one. There is a second difficulty: when tokens are interchangeable, their chosen ancestry can change the answer even though the process model, firing trace and count snapshots stay the same.

This is a finite research experiment using a fictional cliffside refuge. It advances the Petri-net → execution → WBS/schedule route by making the transformation and its limits executable. It does not establish a total Petri-to-WBS functor, a new mathematical theorem, or an engineering method validated in practice.

## Three objects that must stay separate

| Object | What it records | What it does not establish |
|---|---|---|
| Count trace | Transition firings and the number of tokens at each place after each atomic firing | Which particular earlier output supplied an interchangeable token |
| Chosen token-flow witness | Distinct event occurrences, selected producer-to-consumer connections and an exact dependency order | Unique collective-token causality or every alternative execution |
| Elementary Seq/Par tree | Task leaves with the ordering semantics defined below | Every possible WBS convention or the full expressiveness of monoidal process diagrams |

“Elementary WBS” here means the lab's restricted event-block grammar. A conventional deliverable hierarchy need not assert scheduling precedence at all; the obstruction is not a claim that all WBS must fail.

## From a Petri model to a complete witness

A model declares places, initial token counts, transitions, input/output counts, positive durations, per-transition firing bounds and a goal marking. A transition may fire when the current marking contains all its inputs. An atomic firing consumes those inputs and adds its outputs. The goal is **covered** when every requested place has at least its required count; other remaining tokens are allowed.

Generation enumerates first-goal firing traces within the declared firing bounds. It stops extending a trace once the goal is covered. It does not use marking-state deduplication to discard different routes to the same state. A legal partial trace is not reported as a complete goal plan.

Every firing receives a distinct occurrence ID. Repeating one transition twice produces two events, rather than collapsing them under a shared task label. The replay also chooses which available tokens each occurrence consumes. FIFO takes the oldest available producer runs; LIFO takes the newest. These are explicit bookkeeping policies, not evidence about physical provenance.

An output consumed by a later event gives a producer → consumer edge. Initial tokens have no producing event. Multiple tokens and places can supply reasons for the same event relationship. Closing these edges transitively gives a finite strict partial order on event occurrences.

Places marked `resource` obey the same consume/produce rules as other places. Their label distinguishes allocated reuse from condition dependencies in the explanation. For a reusable lifting token, a task consumes the token and returns it as an output. A persistent prerequisite must likewise be modelled explicitly; its label does not silently make it reusable.

The atomic count snapshots shown by replay are not concurrent timed marking snapshots. Timing is constructed separately from the selected witness.

## Timing and lawful freedom

Under the lab's timed interpretation, an event consumes its inputs at its start and produces outputs at its finish. Its earliest start is the latest finish of its predecessors, or zero when it has none. The duration is then added to obtain its finish.

For a valid chosen token-flow witness, every required token has been produced before its consumer starts, and no token has two consumers. The resulting earliest schedule therefore respects the declared token rules. Independent tests check this with a timestamp sweep: finish outputs become available first, then the **combined** inputs of every event starting at that time must be available. Two events being individually enabled is not enough if both need the same single token.

Every linear extension of the witness order is a lawful atomic ordering of those occurrences with that allocation. These are the freedoms of one witness. They are not all schedules or all method choices allowed by the original model.

An earliest schedule minimizes completion time for that fixed precedence witness and those fixed positive durations. It does not optimize over token allocations or all possible project executions. LIFO can, for example, reuse one returned resource token while leaving another token idle, creating avoidable serialization.

## The exact tree question

The grammar is:

```text
Task(event)
Par(child1, ..., childN)
Seq(child1, ..., childN)
```

Each event appears once. `Par` adds no order between different children. `Seq` requires every event in an earlier child to precede every event in every later child. The empty tree represents no events.

The recognizer recursively examines the induced event order. Disconnected components of its comparability graph become parallel children. Otherwise, disconnected components of its incomparability graph become sequential children in their common cross-component order. If neither split exists for a non-singleton set, the exact tree fails.

A positive certificate expands the resulting tree back into order pairs and compares them with the original transitive order, with every event present exactly once. A negative certificate identifies four distinct events `a,b,c,d` whose **only** strict comparisons are `a<b`, `c<b` and `c<d`. The missing comparisons matter: an N-shaped drawing alone is insufficient.

For finite posets, absence of this induced N is equivalent to construction by disjoint and linear sums. This is the established series-parallel characterization used here, not an original claim or a claim that the implementation is a linear-time recognition algorithm. See Imed Zaguia, [*The Aharoni–Korman conjecture for N-free posets with no infinite antichain*](https://arxiv.org/pdf/1811.07959), Theorem 5 and the preceding definitions, PDF pp.2–3.

Failure leaves the exact dependency DAG and legal schedule available. The lab does not force an obstructed plan into a falsely exact tree.

## Why start-time stages can be misleading

In the N example, A certifies anchors, B positions the scaffold, C attaches the deck after A and B, and D fits the weather screen after B alone. The physical contract requires exactly `A<C`, `B<C` and `B<D`.

With durations A=4, B=1, C=3 and D=4, A and B start at zero, D starts at one and C starts at four. Completion takes seven time units. Turning those start groups into `Seq(Par(A,B),D,C)` invents `A<D` and `D<C`. Its barriers make completion take eleven units and reduce the five lawful event orders to two. `B,D,A,C` is one lawful order that the staged tree removes.

This problem also occurs when an exact tree exists. Suppose independent a and b start together; a takes two units, b takes five, and c takes one unit after a. The exact tree is `Par(Seq(a,c),b)`, finishing at five. `Seq(Par(a,b),c)` incorrectly makes c wait for b and finishes at six. Similar start times do not establish block boundaries.

## A stronger limit: the ancestry switch

The provenance example uses the same trace `A,C,B,D` under both policies:

| Event | Inputs | Outputs |
|---|---|---|
| A | Its one-use permission | One p |
| C | Its one-use permission | One p and one q |
| B | One p and one q | B complete |
| D | One p | D complete |

FIFO gives B the p from A and D the p from C. The order is `A<B`, `C<B`, `C<D`: an induced N with five linear extensions.

LIFO gives B both p and q from C, and D the p from A. The order is `C<B` and `A<D`: two independent chains, expressible as `Par(Seq(C,B),Seq(A,D))`, with six linear extensions.

Both allocations have identical count snapshots. With the unit durations supplied, they also have identical earliest timings: A and C occupy the first unit; B and D occupy the second. **Tree representability changes although the collective count trace does not.** Neither allocation is the uniquely recovered causal history.

This boundary matters for the foray's interchangeable-token assumption. [Baez and Master, *Open Petri Nets*](https://math.ucr.edu/home/baez/petri.pdf), section 2, use the collective-token interpretation and free commutative monoidal categories. [Baez, Genovese, Master and Shulman, *Categories of Nets*](https://math.ucr.edu/home/baez/p-nets_lics.pdf), introduction, distinguishes collective-token and individual-token semantics. The lab adds a chosen ancestry witness for analysis; it does not prove that this choice descends to a unique invariant of collective process semantics.

## Why this is not a failure of SMCs

The untimed Petri model has the cited commutative monoidal execution interpretation. Markings are objects; transition firings in their untouched marking contexts generate morphisms. Identities leave a marking unchanged, composition connects executions, and tensor combines them.

Full typed process composition connects particular output wires to particular inputs. It does not impose every possible dependency between the events drawn in two consecutive layers. An N can therefore be represented by a typed monoidal diagram. A visually similar `Seq(Par(...),Par(...))` event-block tree adds all cross-block comparisons and can lose that distinction.

The implemented construction is a finite compiler from **model + trace + allocation choice** to an occurrence witness, its order and a partially defined exact tree. It does not establish a functor from arbitrary collective process morphisms to elementary WBS trees. Interfaces, identity wires and equivalence under token swapping require further work.

## Bounds and evidence

The browser engine accepts at most **32 event occurrences per trace**. Longer replay inputs are rejected. If generation encounters a viable continuation beyond the trace limit, it reports incomplete search; a goal reached exactly at the limit is accepted. Search-node and returned-execution budgets are separate limits. A reached budget is not proof that no completion exists. “Complete search” concerns first-goal traces within the declared firing bounds, not unbounded Petri behavior.

Counts use safe integers. Timing uses JavaScript floating-point arithmetic. Overflow, or a positive duration that rounds away at its computed start, produces an explicit analysis error, including when only the staged comparison exceeds the numeric limits. Decimal start groups use computed numerical equality. Linear-extension counts become unavailable when their enumeration budget is exceeded; an approximate count is not substituted.

The model does not include uncertain durations, weather calendars, continuous dynamics, pre-emption, read/inhibitor arcs, engineering calibration or an automatic guarantee that all required real work has been specified. Resource annotations do not prove a physical dependency, and hiding resource edges does not make a newly drawn schedule capacity-feasible.

Independent checks have exercised finite order certificates, generation, count replay and concurrent joint enabling. The [run record](autonomous-run-2026-09-07.md) describes the actual review loops and test scope. Agent verification is separate from human usefulness, engineering validation and publication state.

The next research step is to enumerate distinct ancestry classes for small count traces and determine whether exact-tree support holds for all, some or none of them. A later composition experiment should then retain typed boundaries and test how independently constructed witnesses compose. Neither extension is implemented by this increment.
