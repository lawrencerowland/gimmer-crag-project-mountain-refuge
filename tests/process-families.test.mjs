import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseFamily, FAMILY_LIMITS} from '../apps/process-contract-lab/families.mjs';
import {FAMILY_SCENARIOS} from '../apps/process-contract-lab/family-scenarios.mjs';
import {SCENARIOS} from '../apps/causal-plan-lab/scenarios.mjs';

const fixture = id => structuredClone(FAMILY_SCENARIOS.find(s => s.id === id));
const keys = values => new Set(values.map(value => JSON.stringify(value)));
const accepts = (word, pairs) => pairs.every(([a, b]) => word.indexOf(a) < word.indexOf(b));
function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]));
}
function independentTreeOrder(tree) {
  if (tree.type === 'task') return {ids: [tree.id], pairs: []};
  const groups = tree.children.map(independentTreeOrder), pairs = groups.flatMap(g => g.pairs);
  if (tree.type === 'sequence') for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) for (const a of groups[i].ids) for (const b of groups[j].ids) pairs.push([a, b]);
  return {ids: groups.flatMap(g => g.ids), pairs};
}
function assertAllocationConservation(model, trace, family) {
  for (const witness of family.witnesses) {
    const pools = Object.fromEntries(model.places.map(p => [p.id, new Map(p.initial ? [[null, p.initial]] : [])]));
    for (let i = 0; i < trace.length; i++) {
      const event = family.events[i], t = model.transitions.find(t => t.id === trace[i]);
      const allocations = witness.allocations.filter(a => a.eventId === event.id);
      for (const [p, n] of Object.entries(t.inputs)) {
        const fromPlace = allocations.filter(a => a.place === p);
        assert.equal(fromPlace.reduce((sum, a) => sum + a.count, 0), n);
        for (const a of fromPlace) {
          assert.ok(a.count > 0 && Number.isSafeInteger(a.count));
          assert.ok((pools[p].get(a.producer) ?? 0) >= a.count);
          pools[p].set(a.producer, pools[p].get(a.producer) - a.count);
        }
      }
      for (const [p, n] of Object.entries(t.outputs)) pools[p].set(event.id, (pools[p].get(event.id) ?? 0) + n);
    }
    for (const [p, n] of Object.entries(model.goal)) assert.ok([...pools[p].values()].reduce((a, b) => a + b, 0) >= n);
  }
}

test('fixture families conserve every producer count and return immutable serializable certificates', () => {
  for (const s of FAMILY_SCENARIOS) {
    const before = JSON.stringify(s), family = analyseFamily(s.model, s.trace);
    assert.equal(family.ok, true, `${s.id}: ${family.errors}`);
    assert.equal(family.complete, true);
    assert.equal(family.language.complete, true);
    assert.equal(JSON.stringify(s), before);
    assert.deepEqual(JSON.parse(JSON.stringify(family)), family);
    assertAllocationConservation(s.model, s.trace, family);
    const bruteLanguage = permutations(family.events.map(e => e.id)).filter(word => family.witnesses.some(w => accepts(word, w.order)));
    assert.deepEqual(keys(family.language.orders), keys(bruteLanguage));
    for (const w of family.witnesses) if (w.tree) assert.deepEqual(keys(w.order), keys(independentTreeOrder(w.tree).pairs));
  }
});

test('the original marking trace has exactly two producer-count ancestries and mixed tree certificates', () => {
  const {model, trace} = fixture('mixed-ancestry');
  const family = analyseFamily(model, trace);
  assert.equal(family.witnesses.length, 2);
  assert.equal(family.distinctOrders, 2);
  assert.equal(family.classification, 'some');
  assert.deepEqual(family.observed, {exactTreeWitnesses: 1, nonExactTreeWitnesses: 1, classification: 'some'});
  assert.equal(family.witnesses[0].exactTree, false);
  assert.equal(family.witnesses[0].obstruction.induced, true);
  assert.equal(family.witnesses[1].exactTree, true);
  assert.deepEqual(family.witnesses[0].schedule, family.witnesses[1].schedule);
  assert.equal(family.minFinish, 2);
  assert.equal(family.maxFinish, 2);
  assert.equal(family.language.count, 7);
  assert.equal(family.summary.dagExact, false);
});

test('an exact parallel family-language contract need not preserve each individual ancestry', () => {
  const {model, trace} = fixture('mixed-exact-union'), family = analyseFamily(model, trace);
  assert.equal(family.witnesses.length, 8);
  assert.equal(family.distinctOrders, 8);
  assert.equal(family.classification, 'some');
  assert.equal(family.observed.exactTreeWitnesses, 7);
  assert.equal(family.observed.nonExactTreeWitnesses, 1);
  assert.equal(family.language.count, 24);
  assert.deepEqual(family.mustOrder, []);
  assert.equal(family.summary.dagExact, true);
  assert.equal(family.summary.treeExact, true);
  assert.equal(family.summary.tree.type, 'parallel');
  assert.deepEqual(independentTreeOrder(family.summary.tree).pairs, []);
  const nonTree = family.witnesses.find(w => !w.exactTree);
  assert.deepEqual(keys(nonTree.order), keys([['A#1', 'B#1'], ['C#1', 'B#1'], ['C#1', 'D#1']]));
  assert.ok(family.witnesses.some(w => w.order.length === 0));
  assert.equal(family.minFinish, 1);
  assert.equal(family.maxFinish, 2);
});

test('all-exact OR support still needs alternative contracts and has earliest finishes 5 or 6', () => {
  const {model, trace} = fixture('or-support'), family = analyseFamily(model, trace);
  assert.equal(family.classification, 'all');
  assert.equal(family.witnesses.length, 2);
  assert.equal(family.language.count, 4);
  assert.deepEqual(family.mustOrder, []);
  assert.deepEqual(keys(family.mayOrder), keys([['A#1', 'C#1'], ['B#1', 'C#1']]));
  assert.equal(family.summary.dagExact, false);
  assert.equal(family.summary.treeExact, false);
  assert.equal(family.summary.tree, null);
  assert.deepEqual(family.summary.spuriousOrder, ['C#1', 'A#1', 'B#1']);
  assert.equal(accepts(family.summary.spuriousOrder, family.mustOrder), true);
  assert.equal(keys(family.language.orders).has(JSON.stringify(family.summary.spuriousOrder)), false);
  assert.equal(keys(family.language.orders).has(JSON.stringify(family.summary.overconstraintOrder)), true);
  assert.equal(accepts(family.summary.overconstraintOrder, family.mayOrder), false);
  assert.equal(family.minFinish, 5);
  assert.equal(family.maxFinish, 6);
  assert.match(family.timingScope, /earliest/);
  // All 64 directed edge subsets on three events, independently interpreted
  // as precedence constraints, fail to produce this four-word language.
  const ids = family.events.map(e => e.id), allWords = permutations(ids);
  const possiblePairs = ids.flatMap(a => ids.filter(b => a !== b).map(b => [a, b]));
  let matchingDag = false;
  for (let mask = 0; mask < 2 ** possiblePairs.length; mask++) {
    const pairs = possiblePairs.filter((_, bit) => mask & (1 << bit));
    const language = allWords.filter(word => accepts(word, pairs));
    if (JSON.stringify(language) === JSON.stringify(family.language.orders)) matchingDag = true;
  }
  assert.equal(matchingDag, false);
});

test('unique N and refuge distinguish exact DAG contracts from exact tree contracts', () => {
  const n = fixture('robust-n'), fn = analyseFamily(n.model, n.trace);
  assert.equal(fn.witnesses.length, 1);
  assert.equal(fn.classification, 'none');
  assert.equal(fn.summary.dagExact, true);
  assert.equal(fn.summary.treeExact, false);
  assert.equal(fn.language.count, 5);
  assert.equal(fn.summary.spuriousOrder, null);
  assert.equal(fn.summary.overconstraintOrder, null);
  const r = fixture('exact-refuge'), fr = analyseFamily(r.model, r.trace);
  assert.equal(fr.classification, 'all');
  assert.equal(fr.summary.dagExact, true);
  assert.equal(fr.summary.treeExact, true);
  assert.equal(fr.language.count, 2);
  assert.deepEqual(keys(independentTreeOrder(fr.summary.tree).pairs), keys(fr.mustOrder));
});

test('multiplicities are quotiented within producer classes and repeated events stay distinct', () => {
  const {model, trace} = fixture('repeated-multiplicity'), family = analyseFamily(model, trace);
  assert.deepEqual(family.events.map(e => e.id), ['make#1', 'make#2', 'C#1', 'D#1']);
  assert.equal(family.witnesses.length, 3);
  const divisions = family.witnesses.map(w => ['make#1', 'make#2'].map(producer => w.allocations.filter(a => a.eventId === 'C#1' && a.place === 'p' && a.producer === producer).reduce((n, a) => n + a.count, 0)));
  assert.deepEqual(divisions, [[2, 0], [1, 1], [0, 2]]);
  assert.equal(family.classification, 'all');
  assert.equal(family.language.count, 8);
});

test('a shared-resource family retains selected reuse order without claiming all count-legal orders', () => {
  const {model, trace} = fixture('shared-resource-order');
  const forward = analyseFamily(model, trace), reverse = analyseFamily(model, [...trace].reverse());
  assert.equal(forward.complete, true);
  assert.equal(reverse.complete, true);
  assert.equal(forward.witnesses.length, 1);
  assert.equal(reverse.witnesses.length, 1);
  assert.deepEqual(forward.language.orders, [['deck#1', 'screen#1']]);
  assert.deepEqual(reverse.language.orders, [['screen#1', 'deck#1']]);
  assert.deepEqual(forward.witnesses[0].edges, [{from: 'deck#1', to: 'screen#1', place: 'crane', kind: 'resource', count: 1}]);
  assert.equal(forward.minFinish, 7);
  assert.equal(reverse.minFinish, 7);
  assert.equal(forward.summary.treeExact, true);
  assert.match(forward.language.scope, /not every count-level reorder/);
});

test('different place assignments remain different witnesses when their event orders coincide', () => {
  const model = {id: 'same-order', places: ['a', 'b', 'p', 'q', 'doneA', 'doneB', 'doneC'].map(id => ({id, kind: 'condition', initial: ['a', 'b'].includes(id) ? 1 : 0})), transitions: [{id: 'A', duration: 1, maxFirings: 1, inputs: {a: 1}, outputs: {p: 1, q: 1, doneA: 1}}, {id: 'B', duration: 1, maxFirings: 1, inputs: {b: 1}, outputs: {p: 1, q: 1, doneB: 1}}, {id: 'C', duration: 1, maxFirings: 1, inputs: {p: 1, q: 1}, outputs: {doneC: 1}}], goal: {doneA: 1, doneB: 1, doneC: 1}};
  const family = analyseFamily(model, ['A', 'B', 'C']);
  assert.equal(family.witnesses.length, 4);
  assert.equal(family.distinctOrders, 3);
  assert.equal(new Set(family.witnesses.map(w => JSON.stringify(w.allocations))).size, 4);
  assert.equal(family.witnesses.filter(w => w.order.length === 2).length, 2);
});

test('input selection is first-goal but alternative words preserve all retained occurrences', () => {
  const model = {id: 'early-goal', places: [{id: 'a', kind: 'condition', initial: 1}, {id: 'b', kind: 'condition', initial: 1}, {id: 'done', kind: 'condition', initial: 0}], transitions: [{id: 'A', duration: 1, maxFirings: 1, inputs: {a: 1}, outputs: {done: 1}}, {id: 'B', duration: 1, maxFirings: 1, inputs: {b: 1}, outputs: {}}], goal: {done: 1}};
  assert.equal(analyseFamily(model, ['B']).ok, false);
  assert.equal(analyseFamily(model, ['A', 'B']).ok, false);
  const family = analyseFamily(model, ['B', 'A']);
  assert.equal(family.ok, true);
  assert.equal(family.language.count, 2);
  assert.ok(family.language.orders.some(word => word[0] === 'A#1'));
  assert.match(family.language.scope, /may reach the goal before/);
});

test('already-satisfied goals admit the one identity execution and one empty ancestry', () => {
  const model = {id: 'identity', places: [{id: 'done', kind: 'condition', initial: 1}], transitions: [], goal: {done: 1}};
  const family = analyseFamily(model, []);
  assert.equal(family.ok, true);
  assert.equal(family.witnesses.length, 1);
  assert.deepEqual(family.witnesses[0].allocations, []);
  assert.equal(family.classification, 'all');
  assert.equal(family.language.count, 1);
  assert.deepEqual(family.language.orders, [[]]);
  assert.equal(family.summary.dagExact, true);
  assert.equal(family.summary.treeExact, true);
  assert.equal(family.minFinish, 0);
});

test('ancestry truncation never promotes observed all or none to a universal classification', () => {
  const {model, trace} = fixture('mixed-ancestry');
  const limited = analyseFamily(model, trace, {maxWitnesses: 1});
  assert.equal(limited.ok, true);
  assert.equal(limited.complete, false);
  assert.equal(limited.reason, 'maxWitnesses');
  assert.equal(limited.classification, 'unknown');
  assert.equal(limited.observed.classification, 'none');
  assert.equal(limited.mustOrder, null);
  assert.equal(limited.mayOrder, null);
  assert.equal(limited.distinctOrders, null);
  assert.equal(limited.language.complete, false);
  assert.equal(limited.language.count, null);
  assert.equal(limited.language.observedComplete, true);
  assert.equal(limited.summary.dagExact, null);
  assert.equal(limited.minFinish, null);
  assert.equal(limited.observedMinFinish, 2);
  assert.equal(analyseFamily(model, trace, {maxWitnesses: 2}).complete, true);
  const stateLimit = analyseFamily(model, trace, {maxStates: 1});
  assert.equal(stateLimit.complete, false);
  assert.equal(stateLimit.reason, 'maxStates');
  assert.equal(stateLimit.stats.statesVisited, 1);
  assert.equal(stateLimit.witnesses.length, 0);
});

test('exact-at-budget exhaustive searches are complete and language bounds remain separate', () => {
  const {model, trace} = fixture('or-support'), full = analyseFamily(model, trace);
  assert.equal(analyseFamily(model, trace, {maxStates: full.stats.statesVisited}).complete, true);
  assert.equal(analyseFamily(model, trace, {maxStates: full.stats.statesVisited - 1}).complete, false);
  assert.equal(analyseFamily(model, trace, {maxAllocationEntries: full.stats.retainedAllocationEntries}).complete, true);
  const memoryLimited = analyseFamily(model, trace, {maxAllocationEntries: full.stats.retainedAllocationEntries - 1});
  assert.equal(memoryLimited.reason, 'maxAllocationEntries');
  assert.equal(memoryLimited.classification, 'unknown');
  assert.equal(analyseFamily(model, trace, {maxLanguageOrders: 6}).language.complete, true);
  for (const options of [{maxLanguageOrders: 5}, {maxLanguageChecks: full.stats.languageChecks - 1}]) {
    const limited = analyseFamily(model, trace, options);
    assert.equal(limited.complete, true);
    assert.equal(limited.classification, 'all');
    assert.equal(limited.language.complete, false);
    assert.equal(limited.language.count, null);
    assert.equal(limited.summary.dagExact, null);
    assert.equal(limited.summary.treeExact, null);
    assert.equal(limited.summary.spuriousOrder, null);
  }
  assert.equal(analyseFamily(model, trace, {maxLanguageChecks: full.stats.languageChecks}).language.complete, true);
  assert.equal(analyseFamily(model, trace, {maxWitnessCharacters: full.stats.witnessCharacters}).complete, true);
  const witnessText = analyseFamily(model, trace, {maxWitnessCharacters: full.stats.witnessCharacters - 1});
  assert.equal(witnessText.reason, 'maxWitnessCharacters');
  assert.equal(witnessText.complete, false);
  assert.equal(witnessText.classification, 'unknown');
  assert.equal(analyseFamily(model, trace, {maxLanguageCharacters: full.stats.languageCharacters}).language.complete, true);
  const languageText = analyseFamily(model, trace, {maxLanguageCharacters: full.stats.languageCharacters - 1});
  assert.equal(languageText.complete, true);
  assert.equal(languageText.language.complete, false);
  assert.equal(languageText.language.reason, 'maxLanguageCharacters');
  assert.equal(languageText.summary.dagExact, null);
});

test('huge indistinguishable counts are bounded by search states without token expansion', () => {
  const {model, trace} = fixture('repeated-multiplicity');
  model.transitions[0].outputs.p = 1_000_000;
  model.transitions[1].inputs.p = 1_000_000;
  model.transitions[2].inputs.p = 1_000_000;
  const family = analyseFamily(model, trace, {maxStates: 100});
  assert.equal(family.ok, true);
  assert.equal(family.complete, false);
  assert.equal(family.reason, 'maxStates');
  assert.equal(family.stats.statesVisited, 100);
  assert.ok(family.witnesses.length < 100);
  assert.ok(family.witnesses.every(w => w.allocations.length < 20));
});

test('the eight-event boundary enumerates all 40320 words and long ids meet a separate text budget', () => {
  const model = {id: 'eight-independent', places: [], transitions: [], goal: {}};
  for (let i = 0; i < 8; i++) {
    model.places.push({id: `ready${i}`, kind: 'condition', initial: 1}, {id: `done${i}`, kind: 'condition', initial: 0});
    model.transitions.push({id: `E${i}`, duration: i + 1, maxFirings: 1, inputs: {[`ready${i}`]: 1}, outputs: {[`done${i}`]: 1}});
    model.goal[`done${i}`] = 1;
  }
  const full = analyseFamily(model, model.transitions.map(t => t.id));
  assert.equal(full.complete, true);
  assert.equal(full.language.complete, true);
  assert.equal(full.language.count, 40320);
  assert.equal(full.stats.permutationsVisited, 40320);
  assert.equal(full.summary.treeExact, true);
  assert.equal(full.minFinish, 8);
  for (const transition of model.transitions) transition.id += 'x'.repeat(1000);
  const limited = analyseFamily(model, model.transitions.map(t => t.id), {maxLanguageCharacters: 10000});
  assert.equal(limited.complete, true);
  assert.equal(limited.language.complete, false);
  assert.equal(limited.language.reason, 'maxLanguageCharacters');
  assert.ok(limited.stats.languageCharacters <= 10000);
  assert.equal(limited.language.count, null);
  assert.equal(limited.summary.dagExact, null);
});

test('malformed inputs, unsupported size and numerical timing limits are reviewable errors', () => {
  const {model, trace} = fixture('or-support');
  for (const bad of [null, {}, [], {maxStates: 0}, {maxWitnesses: Infinity}, {maxLanguageChecks: FAMILY_LIMITS.maxLanguageChecks + 1}]) {
    if (bad && !Array.isArray(bad) && Object.keys(bad).length === 0) continue;
    assert.equal(analyseFamily(model, trace, bad).ok, false);
  }
  assert.equal(analyseFamily(null, trace).ok, false);
  assert.equal(analyseFamily(model, 'A').ok, false);
  assert.equal(analyseFamily(model, ['missing']).ok, false);
  assert.equal(analyseFamily(model, Array(9).fill('A')).ok, false);
  const tooMany = structuredClone(model);
  while (tooMany.places.length <= FAMILY_LIMITS.maxPlaces) tooMany.places.push({id: `unused${tooMany.places.length}`, kind: 'condition', initial: 0});
  assert.equal(analyseFamily(tooMany, trace).ok, false);
  const numerical = structuredClone(SCENARIOS.find(s => s.id === 'shared-resource'));
  numerical.model.places.find(p => p.id === 'crane').initial = 2;
  numerical.model.transitions[0].duration = 1e308;
  numerical.model.transitions[1].duration = 1;
  const result = analyseFamily(numerical.model, numerical.trace);
  assert.equal(result.ok, false);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'numeric-limit');
  assert.equal(result.classification, 'unknown');
  assert.equal(result.summary.dagExact, null);
  assert.match(result.errors.join(' '), /positive duration/);
});
