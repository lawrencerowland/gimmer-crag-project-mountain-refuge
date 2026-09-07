import test from 'node:test';
import assert from 'node:assert/strict';
import {validateModel, generate, replay, analyse, closure, decompose, treeOrder, linearOrders, MAX_EVENTS} from '../apps/causal-plan-lab/core.mjs';
import {SCENARIOS} from '../apps/causal-plan-lab/scenarios.mjs';

const scenario = id => structuredClone(SCENARIOS.find(s => s.id === id));
const relationSet = pairs => new Set(pairs.map(pair => JSON.stringify(pair)));
const complies = (trace, pairs) => pairs.every(([a, b]) => trace.indexOf(a) < trace.indexOf(b));
function permutations(values) {
  if (!values.length) return [[]];
  return values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(tail => [value, ...tail]));
}
// Independent count-only firing oracle: no engine helper used.
function countReplay(model, trace) {
  const marking = Object.fromEntries(model.places.map(p => [p.id, p.initial]));
  const counts = Object.create(null);
  for (const id of trace) {
    const t = model.transitions.find(t => t.id === id);
    if (!t || (counts[id] ?? 0) >= t.maxFirings || Object.entries(t.inputs).some(([p, n]) => marking[p] < n)) return null;
    for (const [p, n] of Object.entries(t.inputs)) marking[p] -= n;
    for (const [p, n] of Object.entries(t.outputs)) marking[p] += n;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return marking;
}

test('every supplied model validates; analysis leaves models and traces unchanged', () => {
  for (const s of SCENARIOS) {
    assert.deepEqual(validateModel(s.model), {ok: true, errors: []});
    const snapshot = JSON.stringify(s);
    const a = analyse(s.model, s.trace);
    assert.equal(a.ok, true, `${s.id}: ${a.errors}`);
    assert.equal(JSON.stringify(s), snapshot);
  }
});

test('refuge generates both actual alternatives and every independent interleaving', () => {
  const {model} = scenario('refuge');
  const g = generate(model);
  assert.equal(g.complete, true);
  assert.equal(g.reason, null);
  assert.equal(g.executions.length, 4);
  const oracle = permutations(model.transitions.map(t => t.id)).flatMap(trace => [trace.slice(0, 4)]).filter(trace => {
    const marking = countReplay(model, trace);
    return marking && marking.refugeDone >= 1;
  });
  assert.deepEqual(relationSet(g.executions), relationSet(oracle));
  for (const trace of g.executions) {
    assert.equal(Number(trace.includes('helicopter')) + Number(trace.includes('winch')), 1);
    const a = analyse(model, trace);
    assert.equal(a.goalReached, true);
    assert.equal(a.exactTree, true);
    assert.deepEqual(relationSet(a.order), relationSet(treeOrder(a.tree)));
    assert.equal(a.makespan, trace[0] === 'helicopter' ? 8 : 10);
  }
  assert.equal(replay(model, ['helicopter', 'winch']).ok, false);
});

test('N witness has exactly three relations, no exact tree, and an induced certificate', () => {
  const {model, trace} = scenario('n-obstruction');
  const a = analyse(model, trace);
  assert.deepEqual(relationSet(a.order), relationSet([['A#1', 'C#1'], ['B#1', 'C#1'], ['B#1', 'D#1']]));
  assert.equal(a.tree, null);
  assert.equal(a.exactTree, false);
  assert.equal(a.obstruction.induced, true);
  const involved = Object.values(a.obstruction).slice(0, 4);
  const restricted = a.order.filter(([x, y]) => involved.includes(x) && involved.includes(y));
  assert.deepEqual(relationSet(restricted), relationSet(a.obstruction.relations));
  assert.equal(a.makespan, 7);
  assert.equal(a.stagedMakespan, 11);
  assert.deepEqual(a.stagedRemoved, []);
  assert.deepEqual(relationSet(a.stagedAdded), relationSet([['A#1', 'D#1'], ['D#1', 'C#1']]));
  assert.equal(a.linearExtensions, 5);
  assert.equal(a.treeExtensions, 2);
  assert.equal(complies(a.lostOrder, a.order), true);
  assert.equal(complies(a.lostOrder, treeOrder(a.stagedTree)), false);
  assert.equal(complies(['B#1', 'D#1', 'A#1', 'C#1'], a.order), true);
  const oracle = permutations(['A', 'B', 'C', 'D']).filter(t => countReplay(model, t) !== null);
  assert.equal(oracle.length, 5);
  assert.deepEqual(relationSet(generate(model).executions), relationSet(oracle));
});

test('identical markings and timing can yield N or exact parallel chains under chosen token allocation', () => {
  const {model, trace} = scenario('token-provenance');
  const fifo = analyse(model, trace, {allocation: 'fifo'});
  const lifo = analyse(model, trace, {allocation: 'lifo'});
  assert.equal(fifo.goalReached, true);
  assert.equal(lifo.goalReached, true);
  assert.deepEqual(fifo.markings, lifo.markings);
  assert.deepEqual(fifo.schedule, lifo.schedule);
  assert.equal(fifo.makespan, 2);
  assert.equal(fifo.exactTree, false);
  assert.equal(lifo.exactTree, true);
  assert.deepEqual(relationSet(fifo.order), relationSet([['A#1', 'B#1'], ['C#1', 'B#1'], ['C#1', 'D#1']]));
  assert.deepEqual(relationSet(lifo.order), relationSet([['C#1', 'B#1'], ['A#1', 'D#1']]));
  assert.equal(fifo.linearExtensions, 5);
  assert.equal(lifo.linearExtensions, 6);
  assert.match(fifo.boundedness.provenance, /not canonical/);
});

test('resource allocation precedence remains separate from physical prerequisite order', () => {
  const {model, trace} = scenario('shared-resource');
  const one = analyse(model, trace);
  assert.equal(one.makespan, 7);
  assert.deepEqual(one.physicalOrder, []);
  assert.equal(one.resourceEdges.length, 1);
  assert.equal(one.resourceEdges[0].place, 'crane');
  model.places.find(p => p.id === 'crane').initial = 2;
  const two = analyse(model, trace);
  assert.equal(two.makespan, 4);
  assert.deepEqual(two.order, []);
  // A spare token does not force a particular provenance assignment.
  const reused = analyse(model, trace, {allocation: 'lifo'});
  assert.equal(reused.makespan, 7);
  assert.deepEqual(reused.finalMarking, two.finalMarking);
});

test('deadlock is separate from a legal partial trace and an explicit complete goal', () => {
  const {model, trace} = scenario('deadlock');
  const a = analyse(model, trace);
  assert.equal(a.ok, true);
  assert.equal(a.goalReached, false);
  assert.equal(a.boundedness.completeGoalPlan, false);
  const g = generate(model);
  assert.equal(g.complete, true);
  assert.deepEqual(g.executions, []);
  assert.equal(g.deadlocks.length, 1);
  assert.equal(g.deadlocks[0].reason, 'no-enabled-transition');
  assert.deepEqual(g.deadlocks[0].trace, ['survey']);
  const invalid = replay(model, ['survey', 'build']);
  assert.equal(invalid.ok, false);
  assert.equal(invalid.goalReached, false);
  assert.equal(invalid.events.length, 1);
});

test('repeated occurrences have separate identity, token edges, and respected firing bounds', () => {
  const {model, trace} = scenario('repeated-occurrence');
  const a = analyse(model, trace);
  assert.deepEqual(a.events.map(e => e.id), ['prepare#1', 'prepare#2']);
  assert.deepEqual(a.order, [['prepare#1', 'prepare#2']]);
  assert.equal(a.goalReached, true);
  assert.equal(a.makespan, 4);
  assert.deepEqual(generate(model).executions, [['prepare', 'prepare']]);
  model.transitions[0].maxFirings = 1;
  assert.equal(replay(model, trace).ok, false);
  const bounded = generate(model);
  assert.equal(bounded.complete, true);
  assert.deepEqual(bounded.executions, []);
  assert.equal(bounded.deadlocks[0].reason, 'firing-bounds');
});

test('generation budgets report truncation and retain only goal-reaching executions', () => {
  const {model} = scenario('refuge');
  const limited = generate(model, {maxExecutions: 1});
  assert.equal(limited.complete, false);
  assert.equal(limited.reason, 'maxExecutions');
  assert.equal(limited.executions.length, 1);
  assert.equal(replay(model, limited.executions[0]).goalReached, true);
  const nodes = generate(model, {maxNodes: 2});
  assert.equal(nodes.complete, false);
  assert.equal(nodes.reason, 'maxNodes');
  assert.deepEqual(nodes.executions, []);
  assert.equal(nodes.stats.visitedNodes, 2);
  const exactLimit = generate(model, {maxExecutions: 4});
  assert.equal(exactLimit.complete, true);
  assert.equal(exactLimit.executions.length, 4);
  const alreadyMet = structuredClone(model);
  alreadyMet.places.find(p => p.id === 'refugeDone').initial = 1;
  assert.deepEqual(generate(alreadyMet).executions, [[]]);
});

test('linear extension counts distinguish a truncated lower bound from an exact total', () => {
  assert.deepEqual(linearOrders([], [], 1), {orders: [[]], complete: true, count: 1, limit: 1});
  assert.equal(linearOrders(['a', 'b'], [], 1).complete, false);
  assert.equal(linearOrders(['a', 'b'], [], 1).count, null);
  assert.equal(linearOrders(['a', 'b'], [], 2).count, 2);
  const {model, trace} = scenario('n-obstruction');
  const a = analyse(model, trace, {linearOrderLimit: 1});
  assert.equal(a.linearExtensions, null);
  assert.equal(a.linearExtensionsComplete, false);
  assert.equal(a.treeExtensions, null);
  assert.equal(complies(a.lostOrder, a.order), true);
  assert.equal(complies(a.lostOrder, treeOrder(a.stagedTree)), false);
});

test('the event safety cap reports incomplete exploration and rejects oversized imported traces', () => {
  const {model} = scenario('repeated-occurrence');
  const short = generate(model, {maxTraceLength: 1});
  assert.equal(short.complete, false);
  assert.equal(short.reason, 'maxTraceLength');
  assert.equal(short.stats.traceLimitBranches, 1);
  assert.deepEqual(short.executions, []);
  assert.equal(generate(model, {maxTraceLength: 2}).complete, true);
  model.places.find(p => p.id === 'raw').initial = MAX_EVENTS + 1;
  model.transitions[0].maxFirings = MAX_EVENTS + 1;
  model.goal.prepared = MAX_EVENTS + 1;
  assert.equal(generate(model).reason, 'maxTraceLength');
  const oversized = analyse(model, Array(MAX_EVENTS + 1).fill('prepare'));
  assert.equal(oversized.ok, false);
  assert.match(oversized.errors.join(' '), /event analysis limit/);
});

test('arbitrary legal tree orders are recovered; malformed graphs fail explicitly', () => {
  const tree = {type: 'parallel', children: [{type: 'sequence', children: [{type: 'task', id: 'a'}, {type: 'task', id: 'c'}]}, {type: 'task', id: 'b'}]};
  const order = treeOrder(tree);
  assert.deepEqual(order, [['a', 'c']]);
  assert.deepEqual(relationSet(treeOrder(decompose(['a', 'b', 'c'], order))), relationSet(order));
  assert.throws(() => closure(['a'], [['a', 'a']]), /acyclic/);
  assert.throws(() => closure(['a'], [['a', 'b']]), /unknown/);
  assert.throws(() => closure(['a', 'a'], []), /unique/);
  assert.throws(() => treeOrder({type: 'parallel', children: [{type: 'task', id: 'a'}, {type: 'task', id: 'a'}]}), /unique/);
});

test('validation rejects malformed places, arcs, goals, durations, and bounds', () => {
  const base = scenario('refuge').model;
  const mutations = [
    m => { m.title = 5; },
    m => { m.transitions[0].label = 5; },
    m => { m.places[0].label = {}; },
    m => { m.places.push({...m.places[0]}); },
    m => { m.transitions.push({...m.transitions[0]}); },
    m => { m.places[0].initial = -1; },
    m => { m.places[0].initial = 1.5; },
    m => { m.places[0].kind = 'magic'; },
    m => { m.transitions[0].inputs = {}; },
    m => { m.transitions[0].inputs = {accessChoice: 0}; },
    m => { m.transitions[0].inputs = {absent: 1}; },
    m => { m.transitions[0].outputs = {absent: 1}; },
    m => { m.transitions[0].outputs = {foundationReady: -1}; },
    m => { m.transitions[0].outputs = {foundationReady: 0.5}; },
    m => { m.transitions[0].duration = 0; },
    m => { m.transitions[0].duration = Infinity; },
    m => { m.transitions[0].duration = '2'; },
    m => { m.transitions[0].maxFirings = 0; },
    m => { m.transitions[0].maxFirings = 1.5; },
    m => { m.goal = {absent: 1}; },
    m => { m.goal = {}; },
    m => { m.goal = {refugeDone: -1}; }
  ];
  for (const mutate of mutations) {
    const model = structuredClone(base); mutate(model);
    assert.equal(validateModel(model).ok, false);
    assert.equal(replay(model, []).ok, false);
    assert.equal(generate(model).reason, 'invalid-input');
  }
  for (const bad of [null, [], 'x', 1]) assert.equal(validateModel(bad).ok, false);
  assert.equal(replay(base, ['unknown']).ok, false);
  assert.equal(replay(base, 'helicopter').ok, false);
  assert.equal(replay(base, [], {allocation: 'random'}).ok, false);
  assert.equal(generate(base, {maxNodes: 0}).complete, false);
  assert.equal(generate(base, null).reason, 'invalid-input');
  assert.equal(analyse(base, [], {linearOrderLimit: 0}).ok, false);
});

test('split and merge token runs conserve producer counts without creating duplicate event relations', () => {
  const model = {id: 'multi', places: [{id: 'seed', kind: 'condition', initial: 1}, {id: 'p', kind: 'condition', initial: 0}, {id: 'done', kind: 'condition', initial: 0}], transitions: [{id: 'split', duration: 1, maxFirings: 1, inputs: {seed: 1}, outputs: {p: 3}}, {id: 'merge', duration: 1, maxFirings: 1, inputs: {p: 3}, outputs: {done: 1}}], goal: {done: 1}};
  const a = analyse(model, ['split', 'merge']);
  assert.equal(a.ok, true);
  assert.equal(a.edges.length, 1);
  assert.equal(a.edges[0].count, 3);
  assert.equal(a.events[1].consumed[0].count, 3);
  assert.deepEqual(a.order, [['split#1', 'merge#1']]);
});

test('large initial markings use compact token runs and numeric overflow is explicit', () => {
  const model = {id: 'large', places: [{id: 'p', kind: 'condition', initial: Number.MAX_SAFE_INTEGER}, {id: 'once', kind: 'condition', initial: 1}, {id: 'done', kind: 'condition', initial: 0}], transitions: [{id: 'use', duration: 1, maxFirings: 1, inputs: {p: Number.MAX_SAFE_INTEGER}, outputs: {done: 1}}], goal: {done: 1}};
  assert.equal(analyse(model, ['use']).goalReached, true);
  model.transitions[0].inputs = {once: 1};
  model.transitions[0].outputs = {p: 1, done: 1};
  assert.equal(replay(model, ['use']).ok, false);
  assert.equal(generate(model).reason, 'numeric-limit');
});
