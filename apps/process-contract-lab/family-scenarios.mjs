import {SCENARIOS} from '../causal-plan-lab/scenarios.mjs';
const clone = value => JSON.parse(JSON.stringify(value));
const place = (id, initial = 0, kind = 'condition') => ({id, label: id, kind, initial});
const event = (id, label, duration, inputs, outputs, maxFirings = 1) => ({id, label, duration, inputs, outputs, maxFirings});
function inherited(sourceId, id, title, description, focus) {
  const source = SCENARIOS.find(s => s.id === sourceId);
  return {id, title, description, model: clone(source.model), trace: [...source.trace], focus};
}
const orSupport = {
  id: 'or-support', title: 'Either completed package can support the next task',
  description: 'A and B each supply an interchangeable support token; C needs one. Every ancestry has an exact tree, but the complete alternative language is not the extension language of any one DAG. The two earliest witness finishes are 5 and 6.',
  places: [place('readyA', 1), place('readyB', 1), place('readyC', 1), place('p'), place('doneA'), place('doneB'), place('doneC')],
  transitions: [event('A', 'Prepare package A', 2, {readyA: 1}, {p: 1, doneA: 1}), event('B', 'Prepare package B', 5, {readyB: 1}, {p: 1, doneB: 1}), event('C', 'Use either support package', 1, {readyC: 1, p: 1}, {doneC: 1})],
  goal: {doneA: 1, doneB: 1, doneC: 1}
};
const multiplicity = {
  id: 'repeated-multiplicity', title: 'Repeated producers and indistinguishable token counts',
  description: 'Two occurrences of make each produce two p tokens. C and D consume two each. There are three producer-count allocations, rather than the six ways to select labelled tokens for C. Occurrence identities and mixed allocations are retained.',
  places: [place('ready', 2), place('p'), place('made'), place('doneC'), place('doneD')],
  transitions: [event('make', 'Make a pair of components', 2, {ready: 1}, {p: 2, made: 1}, 2), event('C', 'Build package C', 1, {p: 2}, {doneC: 1}), event('D', 'Build package D', 2, {p: 2}, {doneD: 1})],
  goal: {made: 2, doneC: 1, doneD: 1}
};
const mixedExactUnion = {
  id: 'mixed-exact-union', title: 'A parallel family language can contain an N ancestry',
  description: 'Initial p, q and r tokens can support B and D independently, while A and C also produce those types. Eight allocations include one N ancestry and one fully independent ancestry. The whole family admits all 24 event orders, so its language has an exact parallel tree even though one individual ancestry does not.',
  places: [place('readyA', 1), place('readyC', 1), place('p', 1), place('q', 1), place('r', 1), place('doneA'), place('doneC'), place('doneB'), place('doneD')],
  transitions: [event('A', 'Produce optional support p', 1, {readyA: 1}, {p: 1, doneA: 1}), event('C', 'Produce optional supports q and r', 1, {readyC: 1}, {q: 1, r: 1, doneC: 1}), event('B', 'Use p and q supports', 1, {p: 1, q: 1}, {doneB: 1}), event('D', 'Use an r support', 1, {r: 1}, {doneD: 1})],
  goal: {doneA: 1, doneC: 1, doneB: 1, doneD: 1}
};

export const FAMILY_SCENARIOS = [
  inherited('token-provenance', 'mixed-ancestry', 'A tree for some ancestries, but not all', 'Enumerate every producer-count ancestry of the original A,C,B,D trace. FIFO yields an induced N; LIFO yields two independent chains. Equal markings and equal earliest timing leave different tree certificates.', 'Some exact trees; ancestry is a chosen witness'),
  {id: orSupport.id, title: orSupport.title, description: orSupport.description, model: orSupport, trace: ['A', 'B', 'C'], focus: 'Every witness is a tree; the whole alternative language is not a DAG'},
  inherited('n-obstruction', 'robust-n', 'The N remains under every available ancestry', 'Typed prerequisites leave one producer allocation. Its selective N order cannot be represented exactly by the restricted event-block tree grammar; its DAG remains exact.', 'No exact tree; one exact DAG'),
  inherited('refuge', 'exact-refuge', 'One chosen refuge method, exact throughout', 'This family fixes the helicopter execution and its event occurrences. The other delivery method belongs to a different generated trace. Within this selected trace, fork and join have one exact ancestry tree.', 'All exact; selected method and occurrences retained'),
  {id: multiplicity.id, title: multiplicity.title, description: multiplicity.description, model: multiplicity, trace: ['make', 'make', 'C', 'D'], focus: 'Three allocations, not token permutations'},
  {id: mixedExactUnion.id, title: mixedExactUnion.title, description: mixedExactUnion.description, model: mixedExactUnion, trace: ['A', 'C', 'B', 'D'], focus: 'Mixed individual tree certificates; one exact parallel family language'},
  inherited('shared-resource', 'shared-resource-order', 'Two legal lift orders still share one lifting token', 'Deck and screen are each initially enabled, but they cannot consume the same single lifting token together. This selected deck-then-screen trace fixes one resource ancestry. Screen-then-deck is a different legal input trace with its own family, not an extra order in this family.', 'Individual enabling is not joint enabling; selected resource order retained')
];
