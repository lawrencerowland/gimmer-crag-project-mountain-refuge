const place = (id, label, initial = 0, kind = 'condition') => ({id, label, kind, initial});
const task = (id, label, duration, inputs, outputs, maxFirings = 1) => ({id, label, duration, inputs, outputs, maxFirings});

const refuge = {
  id: 'refuge', title: 'Cliffside refuge: choice, fork and join',
  description: 'One access-choice token admits either helicopter delivery or winch delivery. Delivery releases separate foundation and panel work; assembly needs both completions.',
  places: [place('accessChoice', 'Uncommitted access option', 1), place('foundationReady', 'Foundation work available'), place('panelsReady', 'Panel work available'), place('foundationDone', 'Foundation complete'), place('panelsDone', 'Panels complete'), place('refugeDone', 'Refuge assembled')],
  transitions: [task('helicopter', 'Deliver by helicopter', 2, {accessChoice: 1}, {foundationReady: 1, panelsReady: 1}), task('winch', 'Deliver by winch', 4, {accessChoice: 1}, {foundationReady: 1, panelsReady: 1}), task('foundations', 'Prepare foundations', 4, {foundationReady: 1}, {foundationDone: 1}), task('panels', 'Prepare refuge panels', 3, {panelsReady: 1}, {panelsDone: 1}), task('assemble', 'Assemble refuge', 2, {foundationDone: 1, panelsDone: 1}, {refugeDone: 1})],
  goal: {refugeDone: 1}
};
const obstruction = {
  id: 'n-obstruction', title: 'The N that a Seq/Par tree cannot preserve',
  description: 'Anchors and scaffold can proceed independently. Deck attachment needs both; the weather screen needs only the scaffold. The exact three causal relations do not fit the restricted leaf/Seq/Par grammar.',
  places: [place('anchorPermit', 'Anchor certification available', 1), place('scaffoldPermit', 'Scaffold work available', 1), place('anchors', 'Certified anchors'), place('scaffoldDeck', 'Scaffold ready for deck'), place('scaffoldScreen', 'Scaffold ready for screen'), place('deckDone', 'Deck attached'), place('screenDone', 'Weather screen fitted')],
  transitions: [task('A', 'Certify anchors', 4, {anchorPermit: 1}, {anchors: 1}), task('B', 'Position scaffold', 1, {scaffoldPermit: 1}, {scaffoldDeck: 1, scaffoldScreen: 1}), task('C', 'Attach deck', 3, {anchors: 1, scaffoldDeck: 1}, {deckDone: 1}), task('D', 'Fit weather screen', 4, {scaffoldScreen: 1}, {screenDone: 1})],
  goal: {deckDone: 1, screenDone: 1}
};
const provenance = {
  id: 'token-provenance', title: 'Same count trace, different token ancestry',
  description: 'A and C each produce an interchangeable p token; C also produces q. For trace A,C,B,D, FIFO yields an N, while LIFO yields two parallel chains. Both choices have the same count snapshots and earliest schedule. This certifies a chosen witness, not unique collective-token causality.',
  places: [place('onceA', 'A available once', 1), place('onceC', 'C available once', 1), place('p', 'Interchangeable component p'), place('q', 'Component q'), place('bDone', 'B complete'), place('dDone', 'D complete')],
  transitions: [task('A', 'Produce first component', 1, {onceA: 1}, {p: 1}), task('C', 'Produce component and key', 1, {onceC: 1}, {p: 1, q: 1}), task('B', 'Use component and key', 1, {p: 1, q: 1}, {bDone: 1}), task('D', 'Use remaining component', 1, {p: 1}, {dDone: 1})],
  goal: {bDone: 1, dDone: 1}
};
const resource = {
  id: 'shared-resource', title: 'Independent work, reusable lifting capacity',
  description: 'Deck and screen work have independent prerequisites but each borrows and returns one lifting token. Change crane.initial from 1 to 2 to compare chosen resource order with physical prerequisite order.',
  places: [place('deckReady', 'Deck package ready', 1), place('screenReady', 'Screen package ready', 1), place('crane', 'Reusable lifting token', 1, 'resource'), place('deckDone', 'Deck package placed'), place('screenDone', 'Screen package placed')],
  transitions: [task('deck', 'Lift deck package', 4, {deckReady: 1, crane: 1}, {deckDone: 1, crane: 1}), task('screen', 'Lift screen package', 3, {screenReady: 1, crane: 1}, {screenDone: 1, crane: 1})],
  goal: {deckDone: 1, screenDone: 1}
};
const deadlock = {
  id: 'deadlock', title: 'A missing prerequisite prevents completion',
  description: 'Survey can finish, but construction also needs a permit which no task provides. A legal partial trace is not accepted as a complete goal plan.',
  places: [place('surveyReady', 'Survey available', 1), place('surveyDone', 'Survey complete'), place('permit', 'Construction permit missing'), place('done', 'Construction complete')],
  transitions: [task('survey', 'Survey the site', 1, {surveyReady: 1}, {surveyDone: 1}), task('build', 'Build with permit', 2, {surveyDone: 1, permit: 1}, {done: 1})],
  goal: {done: 1}
};
const repeated = {
  id: 'repeated-occurrence', title: 'Repeated task, distinct event occurrences',
  description: 'Two modules each require the same preparation transition and the same reusable tool. Occurrence ids preserve both events; a one-firing bound cannot meet the explicit two-module goal.',
  places: [place('raw', 'Raw modules', 2), place('tool', 'Reusable preparation tool', 1, 'resource'), place('prepared', 'Prepared modules')],
  transitions: [task('prepare', 'Prepare a module', 2, {raw: 1, tool: 1}, {prepared: 1, tool: 1}, 2)],
  goal: {prepared: 2}
};

export const SCENARIOS = [
  {id: refuge.id, title: refuge.title, description: refuge.description, model: refuge, focus: 'Exact Seq/Par plan', trace: ['helicopter', 'foundations', 'panels', 'assemble']},
  {id: obstruction.id, title: obstruction.title, description: obstruction.description, model: obstruction, focus: 'Induced N obstruction', trace: ['A', 'B', 'C', 'D']},
  {id: provenance.id, title: provenance.title, description: provenance.description, model: provenance, focus: 'FIFO / LIFO changes representability', trace: ['A', 'C', 'B', 'D']},
  {id: resource.id, title: resource.title, description: resource.description, model: resource, focus: 'One or two lifting tokens', trace: ['deck', 'screen']},
  {id: deadlock.id, title: deadlock.title, description: deadlock.description, model: deadlock, focus: 'No complete plan', trace: ['survey']},
  {id: repeated.id, title: repeated.title, description: repeated.description, model: repeated, focus: 'Occurrence identity', trace: ['prepare', 'prepare']}
];
