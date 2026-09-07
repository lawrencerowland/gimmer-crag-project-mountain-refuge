# Autonomous research run — 7 September 2026

This run develops the existing process-to-plan lab as a finite research experiment. The selected end was to make the Petri → execution → elementary WBS/schedule transformation constructively testable, beyond the earlier demonstration that different process models can produce the same selected plan.

The new result is the [Causal Plan Lab](../apps/causal-plan-lab/). It generates complete bounded traces, records a chosen token-flow witness, constructs an exact dependency order and schedule, and checks whether the restricted task/Seq/Par tree grammar preserves that order. An obstructed tree leaves the dependency DAG usable. The [method note](causal-plan-method.md) defines the construction, source support and limits.

## What changed through the review loops

1. **Construct the finite engine.** One agent built the Petri replay/generation and order-analysis core while another developed the interface. The scenarios include a genuine exclusive access choice, parallel work with a completion join, an N obstruction, reusable lifting capacity, missing prerequisites and repeated event occurrences. Firing bounds and first-goal stopping are explicit. A partial trace never becomes a successful plan merely because it has a graph.

2. **Challenge the proposed causal interpretation.** An independent formal reviewer checked the series-parallel characterization against Zaguia's paper and the collective-token framing against Baez and collaborators. This exposed a decisive counterexample: for trace A,C,B,D, FIFO yields an N while LIFO yields two parallel chains, despite identical count snapshots and the supplied timings. The implementation and explanation were qualified to certify a chosen ancestry witness, not uniquely inferred collective-token causality. Full monoidal diagrams remain capable of expressing N; the failed representation is the restricted event-block tree grammar.

3. **Use independent exhaustive oracles.** A separately written test suite enumerated distinct finite transitive orders rather than calling the production recognizer as its oracle. Induced P4 detection checked the N-free characterization; accepted trees were independently expanded and compared with the original orders. Separate permutation enumeration and subset dynamic programming checked linear extensions. Small Petri models were also checked against brute first-goal word enumeration and a timed marking sweep that checks simultaneous starts jointly.

4. **Repair numeric and size failures.** Adversarial input found that a forced-stage duration could overflow outside the original error handler; a positive small duration could also disappear when added to a huge start time. A regression first failed, then passed after the engine returned explicit numeric errors and rejected vanished durations. A further review identified that a finite but enormous firing bound could still exhaust the browser. The engine now limits traces to 32 event occurrences and reports a computational cutoff separately from model firing bounds and proved completion.

5. **Make results reviewable through the interface.** The reader route exposes the process, chosen trace, order/tree result, lost event ordering, resource/provenance switches and exported evidence. Local ordinary-interface checks now cover export, reopen, reload, correction, invalid input, ancestry rollback, identity execution, keyboard use and 390-pixel layout. A second independent review found and repaired mismatched allocation/certificate state after a failed setting change, name-sensitive marking display, colliding edge keys and tiny durations displayed as zero. The browser suite contains regressions for the material recovery and display failures.

These are actual construction and review steps, including a failure and repair. They do not represent human-user validation or research-original algorithms.

## Test checkpoint

At the independent review checkpoint, **nine oracle tests passed**:

| Scope | Result |
|---|---|
| Distinct transitive orders compatible with natural labelling, one through six events | 5,231 examined; 1,977 admit exact Seq/Par trees |
| Accepted tree certificates | Leaf identity and all strict order pairs preserved |
| Linear extensions | Full sets independently compared through five events; exact subset-DP counts through six |
| Binary arc/marking two-place, two-transition Petri models with two firings per transition | 1,728 models compared with independent first-goal enumeration |
| Complete FIFO/LIFO witnesses from that small-model grid | 1,784 independently replayed, including joint enabling at shared timestamps |
| Focused counterexamples | Provenance flip, false stage barrier, resource serialization, exclusive choices, repeated occurrences, deadlocks, truncation and numeric limits |

The naturally labelled order enumeration covers every isomorphism type through six events; it does not claim every differently labelled presentation. The Petri grid is the explicitly stated binary, two-place/two-transition domain, not all small Petri nets. The witness count includes empty traces where the initial marking already covers the goal.

Final local integration passed **35 Node tests**: nine independent oracle tests, fourteen focused engine tests and twelve tests against the retained earlier simulator. The ordinary browser suite passed **29 checks** with no uncaught browser errors, including export/open/recompute/correct/reload and material failures. Desktop and 390-pixel screenshots were inspected. These were agent-operated checks, not human-user validation.

The repository runs its executable model tests on pull requests and before Pages deployment. Publication and served-source verification are recorded in the final private receipt; this source commit records the completed local checks without pre-claiming a successful deployment.

## What the attempt now establishes

For the declared finite models and selected token allocations, the lab can construct and replay a legal plan and certify whether the elementary Seq/Par grammar preserves its dependency freedom. It also exhibits two limits of an unconditional translation: some chosen orders contain an induced N, and token ancestry can change representability without changing the collective count trace.

The timestamp comparison supplies a practical illustration. In the supplied anchors/scaffold example, the exact dependencies allow completion in seven time units. Turning earliest-start groups into barriers adds two dependencies, takes eleven units and reduces five lawful event orders to two. These are computed toy-model results, not construction estimates.

## Continuation frontier

The first next experiment should enumerate alternative token ancestries for a small count trace, quotient out mere bookkeeping renamings, and classify exact-tree support as **all, some or none** of the distinct witness classes. FIFO and LIFO demonstrate a difference; they do not enumerate those classes or establish an invariant.

After that, a separate experiment should compose independently specified process fragments through typed boundary conditions. Its tests should distinguish real wire connections from the all-to-all precedence introduced by event-block Seq, retain identity wires, and state which equivalences its projection respects. A proof or counterexample about that defined construction would advance the original functor question; another unqualified Proc → Plan label would not.

Unbounded reachability, globally optimal resource allocation, a total Petri-to-WBS functor, human usefulness and engineering validity remain outside the result. The current scope is a bounded, inspectable attempt with preserved counterexamples and reproducible evidence.
