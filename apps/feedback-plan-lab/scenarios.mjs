const copy = value => JSON.parse(JSON.stringify(value));
const place = (id, label, initial = 0, kind = 'condition', extra = {}) => ({id, label, initial, kind, ...extra});
const task = (id, label, owner, duration, inputs, outputs, extra = {}) => ({id, label, owner, duration, inputs, outputs, ...extra});

const refuge = {
  id: 'refuge-review', title: 'A refuge design under review',
  description: 'A fictional design package already has current analysis and drawings. Review can accept it, request a drawing correction, or require both results to be revised. A reserved specialist package offers a modeled assured recovery.',
  context: {
    boundary: 'Refuge design team', value: 'An accepted design with current analysis, current drawings and the retained site survey.',
    stimulus: 'The review service reports acceptance, a drawing correction, or a major revision.',
    response: 'The design team repeats only the invalidated work, or uses a reserved specialist package.',
    actors: ['design-team'], expandedActors: ['design-team', 'review-service'],
    assumptions: 'This is an invented finite method example. The specialist package is assumed to deliver a current accepted package in six time units; it is not evidence about a real supplier. All review outcomes remain possible at every review. The shared design resource is held during each task. No probabilities, service continuity or interrupted work are modeled.'
  },
  places: [
    place('work_ready', 'Ready to submit or recover', 1), place('under_review', 'Review pending'), place('accepted', 'Current package accepted'),
    place('analysis_current', 'Structural analysis · current', 1, 'condition', {artifact: 'analysis', status: 'current'}),
    place('analysis_stale', 'Structural analysis · needs revision', 0, 'condition', {artifact: 'analysis', status: 'stale'}),
    place('drawing_current', 'Fabrication drawings · current', 1, 'condition', {artifact: 'drawings', status: 'current'}),
    place('drawing_stale', 'Fabrication drawings · need revision', 0, 'condition', {artifact: 'drawings', status: 'stale'}),
    place('site_survey', 'Site survey · retained throughout', 1, 'condition', {artifact: 'site survey', status: 'current'}),
    place('design_team', 'Reusable design resource', 1, 'resource'), place('review_team', 'Reusable review resource', 1, 'resource'),
    place('reserve', 'Reserved specialist package', 1, 'resource'), place('reserve_used', 'Specialist package used')
  ],
  transitions: [
    task('submit', 'Submit the current package', 'planner', 1, {work_ready:1, analysis_current:1, drawing_current:1, review_team:1}, {under_review:1, analysis_current:1, drawing_current:1, review_team:1}, {actor:'design-team', note:'Both current results are required. Submission does not decide the review outcome.'}),
    task('accept', 'Review accepts the package', 'environment', 1, {under_review:1, analysis_current:1, drawing_current:1, review_team:1}, {accepted:1, analysis_current:1, drawing_current:1, review_team:1}, {actor:'review-service', note:'The outcome is observed after review; the planner cannot select acceptance.'}),
    task('minor', 'Review requires a drawing correction', 'environment', 1, {under_review:1, analysis_current:1, drawing_current:1, review_team:1}, {work_ready:1, analysis_current:1, drawing_stale:1, review_team:1}, {actor:'review-service', invalidates:['drawings'], note:'Drawings become stale. The analysis and site survey remain usable.'}),
    task('major', 'Review requires a major revision', 'environment', 1, {under_review:1, analysis_current:1, drawing_current:1, review_team:1}, {work_ready:1, analysis_stale:1, drawing_stale:1, review_team:1}, {actor:'review-service', invalidates:['analysis','drawings'], note:'Both dependent results become stale. The site survey and resources remain.'}),
    task('analyse', 'Revise and rerun the structural analysis', 'planner', 3, {analysis_stale:1, design_team:1}, {analysis_current:1, design_team:1}, {actor:'design-team', note:'A new occurrence supplies current analysis; earlier occurrences retain their own identities.'}),
    task('draw', 'Correct the fabrication drawings', 'planner', 2, {drawing_stale:1, analysis_current:1, design_team:1}, {drawing_current:1, analysis_current:1, design_team:1}, {actor:'design-team', note:'Fresh drawings require current structural analysis. The analysis is passed through; a major revision must reanalyse before redrawing.'}),
    task('specialist_drawing', 'Use the specialist package for the drawings', 'planner', 6, {work_ready:1, analysis_current:1, drawing_stale:1, reserve:1}, {accepted:1, analysis_current:1, drawing_current:1, reserve_used:1}, {actor:'design-team', note:'An explicit modeled fallback consumes the reserved package. Its assured result is a stated assumption.'}),
    task('specialist_full', 'Use the specialist package for both results', 'planner', 6, {work_ready:1, analysis_stale:1, drawing_stale:1, reserve:1}, {accepted:1, analysis_current:1, drawing_current:1, reserve_used:1}, {actor:'design-team', note:'The specialist package replaces both invalidated results and supplies acceptance under the toy assumption.'})
  ],
  goal: {accepted:1, analysis_current:1, drawing_current:1, site_survey:1}
};

const noReserve = copy(refuge); noReserve.id = 'refuge-no-reserve'; noReserve.title = 'Rework without an assured fallback';
noReserve.places.find(p => p.id === 'reserve').initial = 0;
noReserve.description = 'The same review and rework rules apply, but no specialist package is reserved. Successful histories remain possible; repeated adverse reviews prevent a guarantee within the selected horizon.';
const stale = copy(refuge); stale.id = 'refuge-stale'; stale.title = 'Start after a major revision';
for (const p of stale.places) if (p.artifact === 'analysis' || p.artifact === 'drawings') p.initial = p.status === 'stale' ? 1 : 0;
stale.places.push(place('archived_approval', 'An older approval · historical only', 1, 'condition', {artifact:'older approval',status:'historical'}));
stale.description = 'A completed review has already invalidated the analysis and drawings. An older approval is retained as history. It cannot satisfy the current goal. This initial checkpoint is an assumption; it does not fabricate a preceding execution.';
const passOnly = copy(refuge); passOnly.id = 'refuge-pass-only'; passOnly.title = 'A different mechanism: acceptance assumed';
passOnly.transitions = passOnly.transitions.filter(t => t.id !== 'minor' && t.id !== 'major');
passOnly.description = 'This comparison removes adverse review outcomes from the mechanism. It is a stronger assumption, not an improvement discovered by the planner.';
const blanket = copy(refuge); blanket.id = 'refuge-blanket'; blanket.title = 'Invalidate everything after a drawing correction';
blanket.description = 'A changed rule invalidates the analysis even after a drawing-only correction. Compare the same minor-feedback and acceptance history: the selective model keeps the analysis, while this model requires an extra analysis occurrence. The relevance judgment is a stated assumption, not something the solver discovers.';
blanket.transitions.find(t=>t.id==='minor').outputs = {work_ready:1,analysis_stale:1,drawing_stale:1,review_team:1};
blanket.transitions.find(t=>t.id==='minor').invalidates = ['analysis','drawings'];
blanket.transitions.find(t=>t.id==='minor').note = 'This blanket-reset rule discards both results even though the example classifies the feedback as drawing-only. The additional rework comes from the changed mechanism.';

const permits = {
  id:'commit-before-permit', title:'Commit before the access permit is known',
  description:'Only one of two access permits will be granted. A route commitment must be made first. Each known permit has a successful plan, but a single uninformed commitment cannot cover both.',
  context:{boundary:'Refuge logistics team',value:'Deliver through the route that actually receives permission.',stimulus:'The authority grants the north or south permit after commitment.',response:'Commit to a route, then use it if permitted.',actors:['logistics-team'],expandedActors:['logistics-team','permit-authority'],assumptions:'An artificial information-order counterexample: the permits are mutually exclusive and the commitment cannot be undone. This is not a weather forecast or a claim about real access rules.'},
  places:[place('choice','Choose a route',1),place('north_wait','North route committed'),place('south_wait','South route committed'),place('north_ok','North access permitted'),place('south_ok','South access permitted'),place('blocked','Committed route unavailable'),place('delivered','Delivery completed')],
  transitions:[
    task('commit_north','Commit to north access','planner',1,{choice:1},{north_wait:1},{actor:'logistics-team'}),
    task('commit_south','Commit to south access','planner',1,{choice:1},{south_wait:1},{actor:'logistics-team'}),
    task('north_granted','North permit granted','environment',1,{north_wait:1},{north_ok:1},{actor:'permit-authority',outcomeCase:'north'}),
    task('north_refused','South permit granted; north unavailable','environment',1,{north_wait:1},{blocked:1},{actor:'permit-authority',outcomeCase:'south'}),
    task('south_refused','North permit granted; south unavailable','environment',1,{south_wait:1},{blocked:1},{actor:'permit-authority',outcomeCase:'north'}),
    task('south_granted','South permit granted','environment',1,{south_wait:1},{south_ok:1},{actor:'permit-authority',outcomeCase:'south'}),
    task('use_north','Deliver through north access','planner',3,{north_ok:1},{delivered:1},{actor:'logistics-team'}),
    task('use_south','Deliver through south access','planner',4,{south_ok:1},{delivered:1},{actor:'logistics-team'})
  ],goal:{delivered:1}
};
const early = copy(permits); early.id='observe-before-commit'; early.title='Learn the permit before committing';
early.description='The observation comes first, so the decision can depend on the permit actually granted. This changes the information order in the mechanism.';
early.context.stimulus='The authority grants the north or south permit before commitment.';
early.places=[place('await_permit','Waiting for the permit',1),place('north_known','North permit observed'),place('south_known','South permit observed'),place('north_ok','North route committed and permitted'),place('south_ok','South route committed and permitted'),place('delivered','Delivery completed')];
early.transitions=[task('observe_north','Observe the north permit','environment',1,{await_permit:1},{north_known:1},{actor:'permit-authority',outcomeCase:'north'}),task('observe_south','Observe the south permit','environment',1,{await_permit:1},{south_known:1},{actor:'permit-authority',outcomeCase:'south'}),task('commit_north','Commit to the observed north route','planner',1,{north_known:1},{north_ok:1},{actor:'logistics-team'}),task('commit_south','Commit to the observed south route','planner',1,{south_known:1},{south_ok:1},{actor:'logistics-team'}),...permits.transitions.filter(t=>t.id.startsWith('use_')).map(copy)];

const retry = {id:'repeated-outcome',title:'Retry is possible; acceptance is not promised',description:'The same review transition can repeat. Reaching the horizon never deletes rejection from the mechanism or makes acceptance inevitable.',context:{boundary:'Review process',value:'Acceptance within the selected horizon.',stimulus:'Every review may reject again.',response:'There is no controlled fallback in this minimal example.',actors:[],expandedActors:['review-service'],assumptions:'A finite exploration of repeatable outcomes, with no fairness or eventual-success assumption.'},places:[place('review','Review pending',1),place('accepted','Accepted')],transitions:[task('accept','Review accepts','environment',1,{review:1},{accepted:1},{actor:'review-service'}),task('reject','Review rejects again','environment',1,{review:1},{review:1},{actor:'review-service'})],goal:{accepted:1}};
const invalid=copy(refuge);invalid.id='invalid-resource';invalid.title='Invalid negative resource count';invalid.places.find(p=>p.id==='reserve').initial=-1;

export const SCENARIOS = [
  {id:'refuge-review',title:'Review, revise and retest the refuge design',description:refuge.description,model:refuge,horizon:8,comparison:'refuge-no-reserve'},
  {id:'refuge-no-reserve',title:'Remove the reserved fallback',description:noReserve.description,model:noReserve,horizon:8,comparison:'refuge-review'},
  {id:'refuge-stale',title:'Start with two stale results and an old approval',description:stale.description,model:stale,horizon:8,comparison:'refuge-review'},
  {id:'refuge-pass-only',title:'Change the rules: assume every review accepts',description:passOnly.description,model:passOnly,horizon:8,comparison:'refuge-review'},
  {id:'refuge-blanket',title:'Compare selective with blanket rework',description:blanket.description,model:blanket,horizon:8,comparison:'refuge-review'},
  {id:'commit-before-permit',title:'Commit before learning the permit',description:permits.description,model:permits,horizon:4,comparison:'observe-before-commit',knownCases:['north','south']},
  {id:'observe-before-commit',title:'Learn the permit before committing',description:early.description,model:early,horizon:4,comparison:'commit-before-permit',knownCases:['north','south']},
  {id:'repeated-outcome',title:'A repeatable review with no promised success',description:retry.description,model:retry,horizon:6},
  {id:'invalid-resource',title:'See why an invalid marking is rejected',description:'A negative resource count is invalid input, not evidence of an impossible project.',model:invalid,horizon:8}
];
export function getScenario(id) { return copy(SCENARIOS.find(s=>s.id===id) || SCENARIOS[0]); }
