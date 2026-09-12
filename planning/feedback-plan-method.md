# After the review, what next?

The [Feedback-to-Plan Lab](../apps/feedback-plan-lab/) extends forward generation into a small, explicit review–revise–retest mechanism. It asks two different questions: **can some execution succeed**, and **can a policy choose responses that reach the goal whatever modeled review outcome occurs?**

The mechanism supplies the permitted work and outcomes. A marking supplies the current state. A policy selects a next response from the information available at that state. Each realised successful history can then be expanded into distinct event occurrences, typed token-supply witnesses, a work structure and a checked representative schedule.

## Why this next step

The additional lifecycle and design-process sources sharpened the investigation. A model should identify the system boundary, stimulus, response agent and value to preserve. It should also explain which evidence a revision invalidates, which work can be retained and which tasks must be repeated. This makes feedback a substantive next question after the complete bounded families in [Experiment 04](../apps/marking-plan-lab/).

The sources also caution against assuming a reusable module library is automatically the best next investment. ASM2.0's account of contextual overrides in its abandoned subprocess library makes that an empirical question. Typed composition still matters here: it checks the supply structure of each execution. The previously proposed module-composition experiment remains a separate, unstarted research question.

## The finite model

The model is a count Petri net with an explicit positive goal multiset. Places hold nonnegative safe-integer counts. Transitions have nonempty input demand, declared outputs, positive finite duration and an owner: `planner` or `environment`. Up to 32 transition definitions and 64 places are supported. The selected horizon is one to eight **total event occurrences**, including uncontrolled review outcomes.

A transition can fire repeatedly. The search does not impose a separate per-transition firing cap: such a cap could remove the next rejection and falsely make acceptance inevitable. An explicit `maxFirings` field is rejected. The old replay adapter receives an internal cap equal to the whole horizon solely so it can check a finite history; that cap does not change the game's enabled outcomes.

The state is the count marking together with the remaining horizon. Revisiting the same marking with fewer events left is a different planning state. Goal coverage stops the history immediately. A non-goal state with no enabled transition is a deadlock. A non-goal state with zero remaining events is a horizon cutoff. The latter does not say a longer execution is impossible.

The model deliberately uses fully observed, atomic completed-event checkpoints. All enabled transitions at a nonterminal state must have the same owner. A mixture is rejected with a counterexample marking; the engine does not invent a priority between planned work and external events. At a planner state one enabled transition is selected. At an environment state every enabled outcome must be considered.

## Possibility and a non-anticipating policy

Possibility is existential: at least one legal future history reaches the goal within the horizon. A guaranteed response is stronger. At a planner state it needs at least one action leading to a guaranteed state; at an environment state **every** enabled outcome must lead to a guaranteed state. A goal is the successful base case. Deadlocks and exhausted non-goal horizons are unsuccessful within this question.

The engine builds the reachable finite graph and evaluates this AND/OR condition backward. It reports every winning planner choice. Its default policy minimises the worst **sequential sum of event durations**, taking a minimum over planner choices and a maximum over environment outcomes. Ties are resolved consistently. Positive durations and decreasing horizon keep this calculation finite.

The returned policy is separately unfolded from the initial state. That check follows its single chosen action at each planner state and every enabled environment branch, confirming that all policy terminals satisfy the goal. Decisions use only the observed marking and remaining horizon. They do not receive a later outcome as an input.

This is our small explicit bounded construction. It uses the distinction between weak and strong planning and the observed-state policy definition in the cited planning literature. It does not implement a symbolic BDD planner, ND-FCP, partial-observation belief states, a strong-cyclic fairness argument or an unbounded termination theorem.

## What the refuge model says

The initial refuge package already has current structural analysis and fabrication drawings. The site survey is an independent retained fact. The design team submits the package, and the review service may accept it, request a drawing correction, or require a major revision.

These outcomes have explicit ordinary token effects. A drawing correction consumes the current-drawing token and produces a stale-drawing token, while returning the current analysis. A major revision makes both results stale. Reanalysis and redrawing consume their respective revision requirements and produce fresh current-result tokens. Redrawing also requires and returns current structural analysis: after a major revision, analysis must be renewed before drawings can be renewed. A reusable design resource is consumed during work and returned afterward. The survey is untouched.

This is selective invalidation **encoded in the reviewed mechanism**, not an inferred dependency closure. There are no hidden reset arcs. Freshness is represented by the current/stale places and the identity of the occurrence that supplies a token; the system is not a general document-version database. Repeated `draw` or `submit` generators produce different occurrence IDs such as `draw#1` and `draw#2` in the execution evidence.

The positive goal includes acceptance, current analysis, current drawings and the site survey. An older approval in the stale-checkpoint example is retained as historical context; it cannot satisfy this goal. The initial checkpoint is explicitly an assumption and does not invent the preceding work history.

A reserved specialist package is an optional resource. The model assumes it can replace the invalidated package and supply acceptance in six time units. That is a declared fictional capability. With the reserve, the initial model has a policy with worst sequential duration eight: submit, observe the review, and use the appropriate fallback if required. Without the reserve, successful pass/rework histories remain, but repeated adverse reviews prevent a guarantee within the selected horizon.

The blanket-rework comparison changes the minor-feedback rule to invalidate the analysis as well. On the same minor-feedback-then-acceptance branch, selective rework takes six sequential time units; blanket rework takes nine and includes an additional analysis occurrence. This illustrates an avoidable constraint **under the example's assumption that a drawing-only correction leaves the analysis valid**. The solver does not establish that engineering assumption or estimate outcome probabilities.

## A counterexample about information

The permit example makes the quantifiers visible. Only one of two access permits will be granted. If the route commitment occurs first, each separately known permit case has a successful route, yet no one uninformed commitment succeeds against both possibilities.

Moving observation before commitment permits a policy to use the actual permit. Both branches then reach delivery. This is a changed information order in the mechanism. Fixing a permit before solving the two separate cases is a counterfactual calculation with advance knowledge, not evidence that the original policy can anticipate the answer.

The minimal retry example also retains rejection at every review. Raising the finite horizon reveals longer successful histories and a longer all-rejection prefix; it never silently deletes rejection or assumes eventual success.

## From a realised history to a typed work plan

For an inspected successful history of at most eight occurrences, the existing producer-count ancestry analyser enumerates compatible supply histories. Repeated generator names keep distinct occurrence identities. Initial and same-producer tokens are aggregated by count; different places, producers and consumers remain distinct.

Each witness records typed input/output supplies and unused context passing through identity wires. When the interface fits the existing 64-port expansion bound, the construction also produces and checks an explicit event/identity/permutation/tensor/sequence term. A larger counted interface can retain its counted witness while reporting the expanded term unavailable.

An exact elementary sequence/parallel work tree is returned only if it preserves the selected causal order. Otherwise the selective dependency evidence remains available. A back edge in the original mechanism becomes repeated occurrences in a finite acyclic execution history; it is not presented as a proof that the mechanism itself has traced-monoidal feedback semantics.

The representative schedule assigns earliest starts from the fixed supply witness. An independent aggregate-count replay credits outputs at completion, then checks simultaneous input demand, occurrence duration and final goal coverage. These schedules are **retrospective fixed-branch evidence**. They may overlap independent tasks. They do not certify an online concurrent feedback policy or replace the policy's sequential worst-case duration calculation.

The policy graph verifies all its outcome branches at the count level. Typed ancestry and scheduling are constructed for the successful history being inspected. These are related evidence levels, not interchangeable certificates.

## Boundaries, edits and honest unknowns

The displayed boundary can include just the responding team or the team and its external service. The same review can therefore be external or internal to the chosen boundary. This descriptive change does not alter ownership, task rules, tokens or guarantees. An internal event need not be controllable by the planner.

The value contract here is an accepted design with current evidence. It does not certify continuous refuge service, acceptable downtime, construction safety or stakeholder acceptance. A changed goal is a different model question. Editing task rules is also distinct from following a permitted feedback outcome.

Five computational limits bound graph states, edges, retained histories, history-search nodes and serialized output. If one is reached, the overall guarantee, selected policy and worst-case duration become unknown. A found successful branch can still establish observed possibility. Missing branches cannot establish impossibility. Ancestry and enriched-certificate limits are reported separately when inspecting a history.

Portable files save the model, horizon and observed transition list, not trusted certificates. Reopening recomputes the policy and replays the checkpoint. Invalid inputs, obsolete calculations and interrupted file reads must not replace a newer model or claim a save succeeded.

## Sources and concrete use

| Source | Use in this construction | Limit retained |
|---|---|---|
| Taysom and Crilly, *Diagrammatic Representation of System Lifecycle Properties* (2014), selected excerpts | Name the boundary, stimulus, response actor and delivered value separately. | The excerpts do not provide a policy algorithm. The five captures belong to one paper; the original public URL was not verified. A [later author-held paper](https://api.repository.cam.ac.uk/server/api/core/bitstreams/cf34cd7d-36a6-4b75-9696-b3a35035fc49/content) cites the original; it is a different paper. |
| Taylor, [Toward a Theory of Design as Computation](https://doriantaylor.com/toward-a-theory-of-design-as-computation) | Respond to evidence in the partially developed artefact and retain useful intermediate work. | A design stance, not a correctness theorem for our transformations. |
| Wynn and Clarkson, [Process models in design and development](https://link.springer.com/article/10.1007/s00163-017-0262-7) | Distinguish corrective/progressive iteration and analytical task-flow modeling from broader design cognition. | One notation and a toy mechanism cannot cover every design-process purpose. |
| Wynn and Clarkson, [Improving the engineering design process by simulating iteration impact with ASM2.0](https://link.springer.com/article/10.1007/s00163-020-00354-5) | Explicit current/stale evidence, selective repeated work, and the caution about context-heavy process libraries. | This is an ordinary-Petri adaptation; interruption, full ASM variable/update semantics, stochastic simulation and empirical calibration are excluded. |
| Mordecai, Fairbanks and Crawley, [Category-Theoretic Formulation of the Model-Based Systems Architecting Cognitive-Computational Cycle](https://www.mdpi.com/2076-3417/11/4/1945) | Use common identities across model, execution, graph and rendered views. | Their rigorous cognitive return remains future work; our model edits are explicit human/agent hypotheses. |
| Censi, Lorand and Zardini, *Categories and Compositionality with a view to Applications*, archived ACT4E draft (2024); [author publication listing](https://zardini.mit.edu/publications/) | Check typed composition and distinguish an occurrence history from a cyclic mechanism. | Selected archived sections were read. A drawn loop does not establish trace, fixed-point or co-design semantics. |
| Cimatti, Pistore, Roveri and Traverso, [Weak, strong, and strong cyclic planning via symbolic model checking](https://iris.unitn.it/handle/11572/74586) | Keep possible success and guaranteed completion distinct. | The lab uses bounded strong planning; it makes no strong-cyclic fairness claim. |
| Kuter and Nau, [Forward-Chaining Planning in Nondeterministic Domains](https://cdn.aaai.org/AAAI/2004/AAAI04-082.pdf) | An observed-state policy chooses one action and must account for its possible outcomes. | The solver is our explicit finite AND/OR calculation, not their ND-FCP implementation or complexity result. |

The original Petri, token-ancestry and typed-composition methods remain in the [preceding method record](marking-plan-method.html#source-methods). The additional records supplement that foundation. Exact private archive links and reading coverage remain in the foray's source register; no private archive content is published here.

[Open the experiment](../apps/feedback-plan-lab/) · [Build and challenge record](feedback-plan-run-2026-09-12.html) · [Higher-autonomy collection](../process-to-plan-lab/)
