# Process-To-Plan Contract

Status: branch contract for `codex/process-to-plan-lab`
Created: 2026-07-02

This contract names the minimal shape a Gimmer Crag process-to-plan slice should expose. It is not a
full schema yet; it is a reviewable agreement about what the app must make visible.

## Route Boundary

This contract applies to the Gimmer Petri/process -> schedule -> SMC/WBS route.

- Primary foray: `FORAY-WBS-PATHS`
- Parent context: `FORAY-PROCESSES-TO-PLANS`
- Adjacent/deferred foray: `FORAY-DYNAMIC-PROJECT-STATES`

The broader process-to-plan foray may use richer private scenarios, including hill/travel planning,
but this public mirror should only claim the subset route made visible here. Dynamic-state labels are
deferred until a state grammar has been tested outside this slice.

## Contract Fields

### `processFragment`

The source process structure being interpreted.

Minimum contents:

- project or case name;
- count of places/states/resources;
- count of transitions/work items;
- selected transition IDs, where a specific execution has been chosen;
- statement of the invariant process rule.

For the current mountain-refuge slice, this is the Petri/process net embedded in
`apps/mountain-refuge-petri-wbs-demo/index.html`.

### `executionWitness`

The concrete run through the process fragment.

Minimum contents:

- resource-token settings;
- priority or selection policy;
- schedule step count;
- makespan, where timed execution is available;
- statement that the schedule is a witness under those settings, not the only possible plan.

### `projection`

The visible planning view derived from the execution witness.

Minimum contents:

- SMC or parallel/sequential expression;
- schedule-derived WBS or stage list;
- explanation of the projection rule.

For the current slice, same-start tasks become parallel blocks, ordered blocks become stages, and the
WBS is generated from the selected schedule.

### `preservedStructure`

The structure retained by the projection.

Minimum contents:

- selected transition or task identity;
- execution order or dependency shape;
- parallel blocks that survive into the plan view;
- resource settings relevant to the witness;
- makespan or duration summary where timed execution is available.

This is the useful part of the `process -> plan` map: the plan is thinner than the process but still
retains enough structure for coordination.

### `forgottenStructure`

The structure intentionally dropped by the projection.

Minimum contents:

- unchosen enabled alternatives;
- guard rationale and token/resource provenance;
- process detail not visible in WBS grouping;
- risk, uncertainty, cost, procurement, access, or weather where those are not modeled.

This is not an error. The point of the plan view is to forget detail it no longer needs.

### `nonInvertibilityWitness`

The reason `plan -> process` is not an inverse.

Minimum contents:

- one visible plan or WBS fragment;
- statement that multiple process interpretations could have produced that visible fragment;
- statement that reverse reconstruction needs additional assumptions.

### `candidateLiftRequires`

The extra structure required to lift a plan back into a process hypothesis.

Minimum contents:

- process vocabulary for states, resources, and transitions;
- guard/enabling rules;
- resource semantics;
- policy for alternatives, rework, risk, and uncertainty;
- provenance for those added assumptions.

### `caveats`

The limits of the transformation.

Minimum contents:

- duration/calibration limits;
- non-uniqueness of WBS grouping;
- gap between useful formal view and formal proof;
- material risks or states not yet modeled.

### `localReceiptRequired`

The private provenance rule.

Minimum contents:

- public repo artifacts name only cluster-level Portfolio Wave anchors;
- record-level DEVONthink provenance remains in the local Portfolio Wave working directory;
- any source-backed increment needs a matching local receipt before being treated as absorbed.

## First Implementation Target

Add a `Translation contract` panel to `mountain-refuge-petri-wbs-demo` using these fields.

The panel should be generated from the selected schedule candidate. It should clear when no valid
candidate is selected and update when the user selects another candidate.

## Directionality Rule

`process -> plan` is a projection or forgetful-functor candidate: it preserves the plan-useful
structure and deliberately loses detail.

`plan -> process` is not an inverse. It can be a lift, enrichment, or reconstruction hypothesis, but
only after new assumptions are supplied.
