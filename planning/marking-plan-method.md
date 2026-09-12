# One mechanism, a bounded family of ways to finish

The [Marking-to-Plan Lab](../apps/marking-plan-lab/) starts with a supplied Petri mechanism, initial marking and completion goal. It generates alternatives across work branches, serial orders and token-supply histories, then carries each retained witness into a typed execution diagram, work structure and representative schedule.

This is the forward direction: **review the mechanism, preserve what must hold, then generate what may vary**. A marking is a state, not a plan. One marking may permit several executions. Changing a resource marking and changing a task's prerequisite are different interventions.

## The model contract

The finite subset has at most eight once-only transition occurrences and 64 places. Every transition consumes a nonempty multiset of tokens and produces its declared outputs. Counts are nonnegative safe integers; durations are positive finite numbers. Repeated work requires separately named occurrences in this subset. The goal is coverage of an explicit token multiset, not equality with a complete final marking.

The refuge has one token committing delivery to either helicopter or winch. Both routes supply the same foundation and panel packages. Foundation and panel work borrow reusable lifting capacity; assembly needs both completed packages; commissioning produces the goal. These are reviewed toy assumptions, not approved construction engineering.

The browser exposes the complete signatures and initial counts. Different methods are generated from choices already encoded in this mechanism; missing real-world tasks are not discovered automatically.

## Whole states, joint starts and first-goal plans

A reachable state is identified by its marking and fired occurrence subset. With fixed once-only transitions the subset determines the resulting count vector, but it still matters: an already fired occurrence is unavailable even if its resource tokens have returned. The search retains all reachable states rather than assuming every arithmetically constructible marking is reachable.

The state/step contract includes possible work after a goal-covered state. At each idle decision point it tests nonempty sets of remaining transitions against their **summed input demand**. Outputs of one chosen start cannot supply another start in that same set. The target marking is the state after all selected work has completed; this untimed contract does not say different-duration tasks finish simultaneously.

Plan search has a separate policy: enumerate serial firing traces that stop when they **first** cover the goal. Reaching an already satisfied goal yields the empty identity trace. Alternative routes to the same state are retained as traces. A jointly enabled set can commit extra work which no first-goal serial trace retains; those sets remain in the state/step view without silently redefining the plan policy.

The work scope of a first-goal trace is preserved through its later representation. An earliest concurrent schedule can cover the goal before every retained task finishes; its certificate still requires completion of that selected scope and goal coverage at the final marking. First-goal selection of an atomic trace is not a promise of earliest timed goal termination across arbitrary concurrent policies.

## From all traces to distinct supply histories

For every retained first-goal trace, the existing ancestry analyser enumerates compatible producer-count allocations. Initial tokens at a place are indistinguishable; tokens supplied by a particular producer are aggregated by count. Different places, producers, consumer occurrences and consumed multiplicities remain distinct.

The new construction unions those histories across all generated traces and deduplicates identical supply allocations. It does not use a selected trace's alternative-order language as a substitute for generating all branches. Work scopes with different occurrence sets remain separate.

A commutation cache avoids repeating ancestry analysis when adjacent events have no shared consumed place and no producer/consumer interference. Shared output places alone do not forbid the swap. This is a defined optimisation checked against independent exhaustive enumeration; it does not identify different resource reuse orders.

Each witness retains physical/condition edges separately from chosen resource handoffs. A shared crane may require A before B in one witness and B before A in another. Neither order becomes a universal physical rule merely because one representative selected it.

## Typed execution and timing

Every consumed token bundle has a source; residual tokens appear at the output boundary. Initial tokens unused by every task pass through identity wires. The counted diagram records place types, multiplicities and exact event endpoints. No input supply is invented to make a plan fit.

Where individual wire expansion fits the existing 64-port compiler bound, the engine builds a concrete event/identity/permutation/tensor/sequence term. It checks the compiled term against the selected ancestry order. Larger counted interfaces retain their exact counted diagram and explicitly report that expanded-term construction is unavailable. This is a chosen token-flow witness, not a canonical collective-process equivalence or a universal free-SMC claim.

The elementary work-tree grammar permits task, sequence and parallel blocks. A tree is returned only when its strict order matches that witness's causal order. An induced N obstruction leaves the selective graph and lawful schedule available. Failure of that grammar does not rule out richer monoidal wiring or every conventional WBS.

Earliest task starts are calculated from the fixed witness's dependency paths and positive durations. A separate aggregate-count replay credits outputs at completion, before starts at the same timestamp, then subtracts all simultaneous start demands jointly. It verifies each retained occurrence, its duration, token availability and final goal coverage. This avoids inferring concurrent resource feasibility from serial-order equality.

Finish ranges compare **earliest representatives** across generated allocations. They are not probability intervals, forecasts, or bounds on arbitrary inserted waiting. No unrestricted optimisation claim is made.

## Concrete consequences in the supplied examples

| Supplied case | First-goal orders | Work branches | Distinct plan witnesses | Fastest representative finish |
|---|---:|---:|---:|---:|
| Refuge, one lifting token |4|2|4|13|
| Same mechanism, two lifting tokens |4|2|6|10|
| Two tokens, added foundation-before-panel rule |2|2|4|13|
| No lifting token |0|0|0|No completing plan|
| No flight window |2|1|2|15|

These numbers are calculations in toy time units. Added capacity preserves the four serial orders while enabling a joint start and new allocation witnesses. Adding a real prerequisite removes that freedom despite spare capacity. The no-lift marking is valid but cannot finish; a negative token count is rejected as invalid. The workbench also retains either/or support and selective-N examples.

## Source methods

The investigation's highlighted source collection supplies the methods below. The private foray retains the precise source-register and curated-record provenance; these are public bibliographic links and explicit uses.

| Source | Method used here | Boundary |
|---|---|---|
| [Open Petri Nets](https://arxiv.org/abs/1808.05415) | Transition signatures, markings, execution semantics and goal reachability; untouched context | The open-net composition theorem is not newly proved or implemented in full here |
| [Categories of Nets](https://arxiv.org/abs/2101.04238) | Explicit choice of token semantics and which histories remain distinguishable | A counted provenance witness does not certify that every coarser categorical quotient preserves causality |
| [Using categorical logic for AI planning](https://topos.institute/blog/2022-09-20-ai-planning-csets/) | Forward search with backtracking, explicit applicability, goals and use bounds | Count-Petri enabling replaces general C-set matches; this is not a DPO rewriting implementation |
| [Encoding Compositionality in Classical Planning Solutions](https://arxiv.org/abs/2107.05850) | Trace conditions through action signatures, identity context and braids | STRIPS literal/negation assumptions are not copied into linear token accounting |
| [Project Scheduling and Copresheaves](https://golem.ph.utexas.edu/category/2013/03/project_planning_parallel_proc.html) | Schedule assignments satisfying weighted precedence constraints; earliest path calculation | Resource allocations are fixed first; latest times/float and unrestricted resource optimisation are not implemented here |
| [Operads for complex system design](https://doi.org/10.1098/rspa.2021.0099) | Separate composition syntax from the interpretation used for analysis | The elementary tree is a declared restricted target, not all WBS structures or a new general operadic result |
| [Infrastructure pathways](https://link.springer.com/article/10.1186/s40551-015-0005-8) | Distinguish prerequisite-constrained alternative pathways and their comparative consequences | The toy timing comparison is not an engineering appraisal |

The existing [causal method](causal-plan-method.md) and [process contract method](process-contract-method.md) supply the retained finite hierarchy and ancestry constructions. Source results, this implementation's adaptations and independent verification are distinct evidence.

## Bounds, recovery and evidence

The result reports separate completeness for states, joint steps, first-goal traces, ancestry and representation. Effective state, step, trace, ancestry, plan and serialized-data caps travel with the result. A reached cap yields a partial result; absence from a sample never proves impossibility. Numeric overflow is rejected. A worker cancellation or timeout produces no completed result claim.

Saving stores the model and view choices in this browser only. Portable downloads contain inputs and bounded metadata. Reopening or importing recomputes the result; imported result claims are ignored. A failed import preserves the currently displayed model. Editing hides stale results until a new calculation succeeds. This does not update a remote engineering model or approve any plan.

The independent oracle checks small count nets using a separate state/step/trace search and individually labelled-token allocations before quotienting to producer counts. It compares fixed-witness timing, all boundary/frame balances, supplied scenarios and computational cutoffs. Ordinary browser checks cover the complete change/generate/inspect/save/reopen/correct/recover journey. See the [dated build and review record](marking-plan-run-2026-09-12.html) for actual verification state.

The next question is compositional refinement with explicit interfaces and resource ownership, using this whole-family contract as an oracle. That subsequent goal is not started automatically by publishing this experiment.
