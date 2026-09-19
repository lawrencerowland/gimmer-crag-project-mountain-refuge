import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../apps/boundary-contract-lab/engine.mjs';
import { SCENARIOS } from '../apps/boundary-contract-lab/scenarios.mjs';

// Independent test route: no production gluing, search, mask, enabling, or
// comparison helpers are used below. Source place equivalence is found by graph
// traversal; legal serial prefixes establish markings; explicit labelled-token
// injections decide joint steps. A complete word must use the entire scope.
const place = (id, initial = 0, type = 'resource') => ({ id, type, initial });
const port = (id, p, direction, supply = 0) => ({ id, place: p, direction, supply });
const event = (id, consume = {}, produce = {}, extra = {}) => ({ id, duration: 1, consume, produce, ...extra });
const fragment = (id, places, events = [], ports = []) => ({ id, places, events, ports });
const order = xs => [...xs].sort();
const doneKey = xs => JSON.stringify(order(xs));
const stepKey = (from, events, to) => JSON.stringify([order(from), order(events), order(to)]);
const wordKey = xs => JSON.stringify(xs);
const clone = x => JSON.parse(JSON.stringify(x));

function sourceGlue(fragments, connections) {
  const nodes = fragments.flatMap(f => f.places.map(p => ({ ...p, id: f.id + '.' + p.id })));
  const adjacent = new Map(nodes.map(p => [p.id, new Set()]));
  const sockets = new Map(fragments.flatMap(f => f.ports.map(p => [f.id + '.' + p.id, { ...p, place: f.id + '.' + p.place }])));
  const discharged = new Set();
  for (const c of connections) {
    const a = sockets.get(c.from), b = sockets.get(c.to);
    assert(a && b, 'oracle fixture uses declared ports');
    assert.equal(a.direction, 'out'); assert.equal(b.direction, 'in');
    assert.equal(nodes.find(p => p.id === a.place).type, nodes.find(p => p.id === b.place).type);
    adjacent.get(a.place).add(b.place); adjacent.get(b.place).add(a.place);
    discharged.add(c.to);
  }
  const name = new Map(), places = [];
  for (const node of nodes) {
    if (name.has(node.id)) continue;
    const component = new Set([node.id]), pending = [node.id];
    while (pending.length) for (const next of adjacent.get(pending.pop())) {
      if (!component.has(next)) { component.add(next); pending.push(next); }
    }
    const id = order(component).join('=');
    for (const member of component) name.set(member, id);
    let initial = nodes.filter(p => component.has(p.id)).reduce((n, p) => n + p.initial, 0);
    for (const [socket, p] of sockets) if (p.direction === 'in' && component.has(p.place) && !discharged.has(socket)) initial += p.supply;
    places.push({ id, initial, type: node.type });
  }
  const events = fragments.flatMap(f => f.events.map(e => {
    const remap = vector => {
      const output = {};
      for (const [p, n] of Object.entries(vector)) {
        const mapped = name.get(f.id + '.' + p);
        output[mapped] = (output[mapped] || 0) + n;
      }
      return output;
    };
    return { ...e, consume: remap(e.consume), produce: remap(e.produce) };
  }));
  return { places, events };
}

function tokenAssignments(marking, events) {
  const tokens = Object.fromEntries(Object.entries(marking).map(([p, n]) => [p, Array.from({ length: n }, (_, k) => p + ':' + k)]));
  const slots = events.flatMap(e => Object.entries(e.consume).flatMap(([p, n]) => Array.from({ length: n }, () => p)));
  const used = new Set();
  let assignments = 0;
  function assign(i) {
    if (i === slots.length) { assignments++; return; }
    for (const token of tokens[slots[i]] || []) if (!used.has(token)) {
      used.add(token); assign(i + 1); used.delete(token);
    }
  }
  assign(0);
  return assignments;
}

function sourceOracle(net) {
  const initial = Object.fromEntries(net.places.map(p => [p.id, p.initial]));
  const states = new Map(), words = new Set(), steps = new Set();
  const apply = (marking, events) => {
    const next = { ...marking };
    for (const e of events) for (const [p, n] of Object.entries(e.consume)) next[p] -= n;
    for (const e of events) for (const [p, n] of Object.entries(e.produce)) next[p] += n;
    return next;
  };
  // This deliberately visits every legal permutation prefix, including repeated
  // visits to a completed subset; it does not reuse production state expansion.
  function serial(marking, word) {
    const key = doneKey(word), prior = states.get(key);
    if (prior) assert.deepEqual(marking, prior.marking, 'additive marking is path independent');
    else states.set(key, { completed: order(word), marking });
    if (word.length === net.events.length) { words.add(wordKey(word)); return; }
    for (const e of net.events) if (!word.includes(e.id) && Object.entries(e.consume).every(([p, n]) => marking[p] >= n)) {
      serial(apply(marking, [e]), word.concat(e.id));
    }
  }
  serial(initial, []);
  for (const state of states.values()) {
    const remaining = net.events.filter(e => !state.completed.includes(e.id));
    for (let bits = 1; bits < 2 ** remaining.length; bits++) {
      const chosen = remaining.filter((_, index) => bits & (2 ** index));
      if (!tokenAssignments(state.marking, chosen)) continue;
      const next = state.completed.concat(chosen.map(e => e.id));
      const target = states.get(doneKey(next));
      assert(target, 'a jointly enabled step can be serialized');
      assert.deepEqual(apply(state.marking, chosen), target.marking);
      steps.add(stepKey(state.completed, chosen.map(e => e.id), next));
    }
  }
  return { states, steps, words };
}

function check(fragments, connections = [], options = {}) {
  const before = JSON.stringify({ fragments, connections });
  const expected = sourceOracle(sourceGlue(fragments, connections));
  const compiled = fragments.map(f => engine.compileContract(f, options));
  const composed = engine.composeContracts(compiled, connections, options);
  const actual = composed.behavior;
  assert(actual, 'composition supplies a behavior');
  assert.equal(actual.status, 'complete', JSON.stringify(actual));
  assert.equal(JSON.stringify({ fragments, connections }), before, 'input models remain unchanged');
  assert.deepEqual(new Set(actual.states.map(s => doneKey(s.completed))), new Set(expected.states.keys()));
  for (const state of actual.states) {
    assert.deepEqual(state.marking, expected.states.get(doneKey(state.completed)).marking);
    assert.equal(state.terminal, state.completed.length === actual.eventIds.length, 'terminal means entire selected work completed');
  }
  const byMask = new Map(actual.states.map(s => [s.mask, s]));
  assert.deepEqual(new Set(actual.steps.map(s => stepKey(byMask.get(s.from).completed, s.events, byMask.get(s.to).completed))), expected.steps);
  if (actual.wordsComplete !== false) assert.deepEqual(new Set(actual.words.map(wordKey)), expected.words);
  return { actual, expected, composed };
}

test('exhaustive 729 tiny nets: every prefix, full word and labelled-token joint step', () => {
  const signatures = [null, 'p', 'q'].flatMap(input => [null, 'p', 'q'].map(output => ({ consume: input ? { [input]: 1 } : {}, produce: output ? { [output]: 1 } : {} })));
  let checked = 0;
  for (let p = 0; p <= 2; p++) for (let q = 0; q <= 2; q++) for (const a of signatures) for (const b of signatures) {
    check([fragment('Tiny', [place('p', p), place('q', q)], [event('A', a.consume, a.produce), event('B', b.consume, b.produce)])]);
    checked++;
  }
  assert.equal(checked, 729);
});

test('exhaustive 729 connected count cases: source gluing agrees with contract composition', () => {
  let checked = 0;
  for (let local = 0; local <= 2; local++) for (let supply = 0; supply <= 2; supply++)
    for (let consumed = 0; consumed <= 2; consumed++) for (let produced = 0; produced <= 2; produced++)
      for (let receiverInitial = 0; receiverInitial <= 2; receiverInitial++) for (let demand = 0; demand <= 2; demand++) {
        const a = fragment('Afrag', [place('p', local)], [event('A', { p: consumed }, { p: produced })], [port('input', 'p', 'in', supply), port('output', 'p', 'out')]);
        const b = fragment('Bfrag', [place('q', receiverInitial)], [event('B', { q: demand }, {})], [port('input', 'q', 'in', 2)]);
        check([a, b], [{ from: 'Afrag.output', to: 'Bfrag.input' }]); checked++;
      }
  assert.equal(checked, 729);
});

test('exhaustive 648 mixed internal/boundary cases retain the internal enabling constraint', () => {
  const signatures = [null, 'boundary', 'internal'].flatMap(input => [null, 'boundary', 'internal'].map(output => ({ consume: input ? { [input]: 1 } : {}, produce: output ? { [output]: 1 } : {} })));
  let checked = 0;
  for (let owned = 0; owned <= 1; owned++) for (let ai = 0; ai <= 1; ai++) for (let bi = 0; bi <= 1; bi++) for (const a of signatures) for (const b of signatures) {
    const first = fragment('First', [place('boundary'), place('internal', ai)], [event('A', a.consume, a.produce)], [port('in', 'boundary', 'in', owned), port('out', 'boundary', 'out')]);
    const second = fragment('Second', [place('boundary'), place('internal', bi)], [event('B', b.consume, b.produce)], [port('in', 'boundary', 'in', 2)]);
    check([first, second], [{ from: 'First.out', to: 'Second.in' }]); checked++;
  }
  assert.equal(checked, 648);
});

test('minimal closed-summary obstruction: context enables a locally dead receiver', () => {
  const maker = fragment('Maker', [place('p')], [event('A', {}, { p: 1 })], [port('out', 'p', 'out')]);
  const user = fragment('User', [place('q')], [event('B', { q: 1 }, {})], [port('in', 'q', 'in', 0)]);
  const closedUser = check([user]).actual;
  assert.equal(closedUser.steps.length, 0);
  assert.equal(closedUser.words.length, 0);
  const composed = check([maker, user], [{ from: 'Maker.out', to: 'User.in' }]).actual;
  assert.deepEqual(composed.words, [['A', 'B']]);
  assert(composed.steps.some(s => s.events.includes('B')));
  // Any composition that may only interleave existing standalone LTS edges has
  // no B-labelled edge to use. The symbolic open contract must add that edge.
  assert(!closedUser.steps.some(s => s.events.includes('B')));
});

test('connected external supply is discharged once while local initial ownership survives', () => {
  const a = fragment('Owned', [place('p', 1)], [], [port('out', 'p', 'out')]);
  const b = fragment('Borrower', [place('q')], [event('B', { q: 1 }, { q: 1 }), event('C', { q: 1 }, { q: 1 })], [port('in', 'q', 'in', 1)]);
  const connected = check([a, b], [{ from: 'Owned.out', to: 'Borrower.in' }]).actual;
  assert.equal(Object.values(connected.states.find(s => !s.completed.length).marking)[0], 1);
  assert(!connected.steps.some(s => s.events.length === 2));
  b.places[0].initial = 1;
  const localAlso = check([a, b], [{ from: 'Owned.out', to: 'Borrower.in' }]).actual;
  assert(localAlso.steps.some(s => s.events.length === 2));
});

test('same full serial language does not imply the same atomic steps', () => {
  const make = n => fragment('Lift', [place('p', n)], [event('A', { p: 1 }, { p: 1 }), event('B', { p: 1 }, { p: 1 })]);
  const one = check([make(1)]).actual, two = check([make(2)]).actual;
  assert.deepEqual(new Set(one.words.map(wordKey)), new Set(two.words.map(wordKey)));
  assert.equal(one.words.length, 2);
  assert(!one.steps.some(s => s.events.length === 2));
  assert(two.steps.some(s => s.events.length === 2));
});

test('either producer can supply C: four complete orders and no C-first step', () => {
  const f = fragment('Either', [place('p')], [event('A', {}, { p: 1 }), event('B', {}, { p: 1 }), event('C', { p: 1 }, {})]);
  const result = check([f]).actual;
  assert.deepEqual(new Set(result.words.map(wordKey)), new Set([['A', 'B', 'C'], ['A', 'C', 'B'], ['B', 'A', 'C'], ['B', 'C', 'A']].map(wordKey)));
  assert(!result.steps.filter(s => s.from === 0).some(s => s.events.includes('C')));
  assert(result.steps.some(s => s.events.length === 2 && s.events.includes('B') && s.events.includes('C')));
});

test('partial output crosses a boundary before the source fragment finishes', () => {
  const left = fragment('Left', [place('x'), place('y')], [event('A', {}, { x: 1, y: 1 }), event('B')], [port('xout', 'x', 'out'), port('yout', 'y', 'out')]);
  const right = fragment('Right', [place('x'), place('y')], [event('C', { x: 1 }, {}), event('D', { y: 1 }, {})], [port('xin', 'x', 'in'), port('yin', 'y', 'in')]);
  // B is internal source work: a correct open interface makes C and D available
  // after A even while B remains unfinished.
  const result = check([left, right], [{ from: 'Left.xout', to: 'Right.xin' }, { from: 'Left.yout', to: 'Right.yin' }]).actual;
  assert(result.words.some(w => wordKey(w) === wordKey(['A', 'C', 'D', 'B'])));
  assert(!result.words.some(w => w[0] === 'C' || w[0] === 'D'));
});

test('true typed N has only A<C, A<D, B<D and permits C before B', () => {
  const a = fragment('Afrag', [place('ac'), place('ad')], [event('A', {}, { ac: 1, ad: 1 })], [port('ac', 'ac', 'out'), port('ad', 'ad', 'out')]);
  const b = fragment('Bfrag', [place('bd')], [event('B', {}, { bd: 1 })], [port('bd', 'bd', 'out')]);
  const c = fragment('Cfrag', [place('ac')], [event('C', { ac: 1 })], [port('ac', 'ac', 'in')]);
  const d = fragment('Dfrag', [place('ad'), place('bd')], [event('D', { ad: 1, bd: 1 })], [port('ad', 'ad', 'in'), port('bd', 'bd', 'in')]);
  const result = check([a, b, c, d], [{ from: 'Afrag.ac', to: 'Cfrag.ac' }, { from: 'Afrag.ad', to: 'Dfrag.ad' }, { from: 'Bfrag.bd', to: 'Dfrag.bd' }]).actual;
  assert.deepEqual(new Set(result.words.map(wordKey)), new Set([['A', 'B', 'C', 'D'], ['A', 'B', 'D', 'C'], ['A', 'C', 'B', 'D'], ['B', 'A', 'C', 'D'], ['B', 'A', 'D', 'C']].map(wordKey)));
});

test('equal type spelling never pools tensor ownership', () => {
  const a = fragment('First', [place('p', 1)], [event('A', { p: 1 })]);
  const b = fragment('Second', [place('p', 0)], [event('B', { p: 1 })]);
  const result = check([a, b]).actual;
  assert.equal(result.states.length, 2);
  assert.equal(result.words.length, 0);
  assert(!result.steps.some(s => s.events.includes('B')));
});

test('sink events and later work remain in scope after an early physical goal', () => {
  const f = fragment('Scope', [place('goal'), place('cleanup', 1)], [event('Goal', {}, { goal: 1 }), event('Sink', { cleanup: 1 })]);
  f.goal = { goal: 1 };
  const result = check([f]).actual;
  assert.equal(result.words.length, 2);
  assert(result.words.every(w => w.length === 2 && w.includes('Sink')));
  assert(result.states.some(s => s.completed.length === 1 && s.completed[0] === 'Goal' && !s.terminal));
});

test('repeated display names preserve distinct occurrence IDs', () => {
  const f = fragment('Names', [place('p', 1)], [event('InstallFirst', { p: 1 }, { p: 1 }, { label: 'Install' }), event('InstallSecond', { p: 1 }, { p: 1 }, { label: 'Install' })]);
  assert.equal(check([f]).actual.words.length, 2);
});

test('joint consumption precedes all production even on a connected wire', () => {
  const producer = fragment('Producer', [place('p')], [event('A', {}, { p: 1 })], [port('out', 'p', 'out')]);
  const consumer = fragment('Consumer', [place('p')], [event('B', { p: 1 })], [port('in', 'p', 'in')]);
  const result = check([producer, consumer], [{ from: 'Producer.out', to: 'Consumer.in' }]).actual;
  assert(!result.steps.some(s => s.events.length === 2));
});

function behaviorSignature(behavior, project = p => p) {
  const states = behavior.states.map(s => ({
    completed: order(s.completed),
    marking: Object.fromEntries(Object.entries(s.marking).map(([p, n]) => [project(p), n]).sort(([a], [b]) => a.localeCompare(b))),
    terminal: s.terminal,
  }));
  const byMask = new Map(behavior.states.map(s => [s.mask, s]));
  return {
    status: behavior.status,
    states: states.sort((a, b) => doneKey(a.completed).localeCompare(doneKey(b.completed))),
    steps: order(behavior.steps.map(s => stepKey(byMask.get(s.from).completed, s.events, byMask.get(s.to).completed))),
    words: order(behavior.words.map(wordKey)),
  };
}

test('a connected pass-through identity adds neither events nor supply', () => {
  const a = fragment('Origin', [place('p')], [event('A', { p: 1 }, { p: 1 })], [port('in', 'p', 'in', 1), port('out', 'p', 'out')]);
  const b = fragment('Receiver', [place('p')], [event('B', { p: 1 }, { p: 1 })], [port('in', 'p', 'in', 2)]);
  const identity = fragment('Identity', [place('wire')], [], [port('in', 'wire', 'in', 7), port('out', 'wire', 'out')]);
  const direct = check([a, b], [{ from: 'Origin.out', to: 'Receiver.in' }]).actual;
  const viaIdentity = check([a, identity, b], [{ from: 'Origin.out', to: 'Identity.in' }, { from: 'Identity.out', to: 'Receiver.in' }]).actual;
  const eraseIdentity = p => p.split('=').filter(part => !part.startsWith('Identity.')).join('=');
  assert.deepEqual(behaviorSignature(viaIdentity, eraseIdentity), behaviorSignature(direct));
});

test('a left identity must explicitly inherit the input supply it replaces', () => {
  const user = fragment('User', [place('p')], [event('Use', { p: 1 }, { p: 1 })], [port('in', 'p', 'in', 2)]);
  const identity = fragment('Identity', [place('wire')], [], [port('in', 'wire', 'in', 2), port('out', 'wire', 'out')]);
  const alone = check([user]).actual;
  const afterIdentity = check([identity, user], [{ from: 'Identity.out', to: 'User.in' }]).actual;
  const eraseIdentity = p => p.split('=').filter(part => !part.startsWith('Identity.')).join('=');
  assert.deepEqual(behaviorSignature(afterIdentity, eraseIdentity), behaviorSignature(alone));
  identity.ports[0].supply = 0;
  const undersupplied = check([identity, user], [{ from: 'Identity.out', to: 'User.in' }]).actual;
  assert.equal(undersupplied.words.length, 0, 'zero-supply identity cannot magically reconstruct discharged ownership');
});

test('returning a borrowed token across the boundary enables the waiting local work', () => {
  const owner = fragment('Owner', [place('lift', 1), place('returned')], [event('Release', { lift: 1 }, { returned: 1 }), event('Finish', { lift: 1 })], [port('send', 'returned', 'out'), port('receive', 'lift', 'in')]);
  const borrower = fragment('Borrower', [place('in'), place('out')], [event('Borrow', { in: 1 }, { out: 1 })], [port('receive', 'in', 'in'), port('send', 'out', 'out')]);
  const result = check([owner, borrower], [{ from: 'Owner.send', to: 'Borrower.receive' }, { from: 'Borrower.send', to: 'Owner.receive' }]).actual;
  assert.deepEqual(result.words, [['Release', 'Borrow', 'Finish']]);
});

test('transitive wiring aliases local boundary places and sums both input demands', () => {
  const owner = fragment('Owner', [place('p', 1), place('q')], [event('A', { p: 1, q: 1 }, { p: 1, q: 1 })], [port('out', 'p', 'out'), port('in', 'q', 'in', 3)]);
  const identity = fragment('Identity', [place('wire')], [], [port('in', 'wire', 'in', 2), port('out', 'wire', 'out')]);
  const connections = [{ from: 'Owner.out', to: 'Identity.in' }, { from: 'Identity.out', to: 'Owner.in' }];
  const blocked = check([owner, identity], connections).actual;
  assert.equal(blocked.words.length, 0, 'one token cannot fill two demands after place identification');
  assert.deepEqual(Object.values(blocked.states[0].marking), [1]);
  owner.places[0].initial = 2;
  const supplied = check([owner, identity], connections).actual;
  assert.deepEqual(supplied.words, [['A']]);
  assert.deepEqual(Object.values(supplied.states.find(s => s.terminal).marking), [2]);
});

test('eight independent selected occurrences retain all 256 states and 6305 joint edges', () => {
  const f = fragment('Eight', [place('p')], Array.from({ length: 8 }, (_, i) => event('E' + i)));
  const result = check([f], [], { caps: { maxWords: 40320 } });
  assert.equal(result.actual.states.length, 256);
  assert.equal(result.actual.steps.length, 6305);
  assert.equal(result.actual.words.length, 40320);
  assert.notEqual(result.actual.wordsComplete, false);
});

test('word display truncation is explicit and does not truncate the step contract', () => {
  const f = fragment('Words', [place('p')], [event('A'), event('B'), event('C')]);
  const result = check([f], [], { caps: { maxWords: 1 } }).actual;
  assert.equal(result.status, 'complete');
  assert.equal(result.words.length, 1);
  assert.equal(result.wordsComplete, false);
  assert.equal(result.states.length, 8);
  assert.equal(result.steps.length, 19);
});

test('state, step and count cutoffs remain incomplete through composition', () => {
  const f = fragment('Budget', [place('p')], [event('A', {}, { p: 2 }), event('B')]);
  for (const caps of [{ maxStates: 1 }, { maxSteps: 1 }, { maxCount: 1 }]) {
    const result = engine.composeContracts([engine.compileContract(f, { caps })], [], { caps }).behavior;
    assert.equal(result.status, 'incomplete', JSON.stringify({ caps, result }));
    assert(result.reasons.length > 0);
  }
});

test('gluing individually admitted counts above the global numeric budget remains incomplete', () => {
  const a = fragment('Afrag', [place('p', 100000)], [], [port('out', 'p', 'out')]);
  const b = fragment('Bfrag', [place('p', 100000)], [], [port('in', 'p', 'in')]);
  const wires = [{ from: 'Afrag.out', to: 'Bfrag.in' }], options = { caps: { maxCount: 100000 } };
  const compiled = [a, b].map(f => engine.compileContract(f, options));
  assert(compiled.every(c => c.status === 'complete'));
  const composite = engine.composeContracts(compiled, wires, options).behavior;
  // Use our independent gluing for the direct production traversal too; this
  // regression is about classifying a numeric cutoff, not proving gluing.
  const direct = engine.exploreNet(sourceGlue([a, b], wires), options);
  assert.equal(composite.status, 'incomplete');
  assert.equal(direct.status, 'incomplete');
  assert.equal(engine.compareBehaviors(composite, direct).status, 'unknown');
});

test('invalid occurrence aliases, type maps, fanout and exceeded scope are rejected', () => {
  const a = fragment('Afrag', [place('p', 1)], [event('A', { p: 1 })], [port('out', 'p', 'out')]);
  const b = fragment('Bfrag', [place('q')], [event('B', { q: 1 })], [port('in', 'q', 'in')]);
  const c = fragment('Cfrag', [place('q')], [event('C', { q: 1 })], [port('in', 'q', 'in')]);
  const cases = [
    { fragments: [a, { ...b, events: [event('A')] }], connections: [] },
    { fragments: [a, { ...b, places: [place('q', 0, 'different')] }], connections: [{ from: 'Afrag.out', to: 'Bfrag.in' }] },
    { fragments: [a, b, c], connections: [{ from: 'Afrag.out', to: 'Bfrag.in' }, { from: 'Afrag.out', to: 'Cfrag.in' }] },
    { fragments: [fragment('Nine', [place('p')], Array.from({ length: 9 }, (_, i) => event('E' + i)))], connections: [] },
  ];
  for (const example of cases) {
    const result = engine.composeContracts(example.fragments.map(f => engine.compileContract(f)), example.connections).behavior;
    assert.equal(result.status, 'invalid', JSON.stringify(result));
    assert(result.errors.length > 0);
  }
});

test('invalid numeric budgets cannot silently remove the search bound', () => {
  const f = fragment('Budget', [place('p')], [event('A')]);
  for (const caps of [{ maxStates: 0 }, { maxStates: NaN }, { maxSteps: Infinity }, { maxCount: -1 }, { maxWords: 1.5 }]) {
    const result = engine.composeContracts([engine.compileContract(f, { caps })], [], { caps }).behavior;
    assert.equal(result.status, 'invalid');
  }
});

test('same step graph with different available boundary counts is not the same contract', () => {
  const make = n => fragment('Spare', [place('p')], [], [port('in', 'p', 'in', n)]);
  const one = check([make(1)]).actual, two = check([make(2)]).actual;
  assert.deepEqual(one.steps, two.steps);
  const compared = engine.compareBehaviors(one, two);
  assert.equal(compared.status, 'different');
  assert(compared.counterexample, 'available marking discrepancy has a replayable witness');
});

test('24 supply/local-initial cases satisfy sequential associativity as fresh product composition', () => {
  let checked = 0;
  for (let supply = 0; supply <= 2; supply++) for (let ai = 0; ai <= 1; ai++) for (let bi = 0; bi <= 1; bi++) for (let ci = 0; ci <= 1; ci++) {
    const fs = ['A', 'B', 'C'].map((x, i) => fragment(x + 'frag', [place('p', [ai, bi, ci][i])], [event(x, { p: 1 }, { p: 1 })], [port('in', 'p', 'in', i === 0 ? supply : 2), port('out', 'p', 'out')]));
    const [a, b, c] = fs.map(f => engine.compileContract(f));
    const ab = { from: 'Afrag.out', to: 'Bfrag.in' }, bc = { from: 'Bfrag.out', to: 'Cfrag.in' };
    const direct = check(fs, [ab, bc]).actual;
    const left = engine.composeContracts([engine.composeContracts([a, b], [ab]), c], [bc]).behavior;
    const right = engine.composeContracts([a, engine.composeContracts([b, c], [bc])], [ab]).behavior;
    assert.deepEqual(behaviorSignature(left), behaviorSignature(direct));
    assert.deepEqual(behaviorSignature(right), behaviorSignature(direct));
    checked++;
  }
  assert.equal(checked, 24);
});

test('nine independent supply pairs satisfy tensor associativity and interchange', () => {
  let checked = 0;
  for (let first = 0; first <= 2; first++) for (let second = 0; second <= 2; second++) {
    const maker = (f, e, supply) => fragment(f, [place('p')], [event(e, {}, { p: 1 })], [port('in', 'p', 'in', supply), port('out', 'p', 'out')]);
    const user = (f, e) => fragment(f, [place('p')], [event(e, { p: 1 })], [port('in', 'p', 'in', 2)]);
    const fs = [maker('Afrag', 'A', first), user('Bfrag', 'B'), maker('Cfrag', 'C', second), user('Dfrag', 'D')];
    const [a, b, c, d] = fs.map(f => engine.compileContract(f));
    const ab = { from: 'Afrag.out', to: 'Bfrag.in' }, cd = { from: 'Cfrag.out', to: 'Dfrag.in' };
    const direct = check(fs, [ab, cd]).actual;
    const verticalFirst = engine.tensorContracts([engine.composeContracts([a, b], [ab]), engine.composeContracts([c, d], [cd])]).behavior;
    const horizontalFirst = engine.composeContracts([engine.tensorContracts([a, c]), engine.tensorContracts([b, d])], [ab, cd]).behavior;
    assert.deepEqual(behaviorSignature(verticalFirst), behaviorSignature(direct));
    assert.deepEqual(behaviorSignature(horizontalFirst), behaviorSignature(direct));
    const tensorLeft = engine.tensorContracts([engine.tensorContracts([a, b]), c]).behavior;
    const tensorRight = engine.tensorContracts([a, engine.tensorContracts([b, c])]).behavior;
    assert.deepEqual(behaviorSignature(tensorLeft), behaviorSignature(tensorRight));
    checked++;
  }
  assert.equal(checked, 9);
});

test('explicit symmetry and occurrence/boundary renaming preserve the stated correspondence', () => {
  const left = fragment('Left', [place('p')], [event('A', {}, { p: 1 })], [port('out', 'p', 'out')]);
  const right = fragment('Right', [place('q')], [event('B', { q: 1 })], [port('in', 'q', 'in')]);
  const original = check([left, right], [{ from: 'Left.out', to: 'Right.in' }]).actual;
  const symmetry = check([right, left], [{ from: 'Left.out', to: 'Right.in' }]).actual;
  assert.deepEqual(behaviorSignature(symmetry), behaviorSignature(original));
  const renamedLeft = fragment('Supplier', [place('wire')], [event('Make', {}, { wire: 1 })], [port('provide', 'wire', 'out')]);
  const renamedRight = fragment('Consumer', [place('take')], [event('Use', { take: 1 })], [port('receive', 'take', 'in')]);
  const renamed = check([renamedRight, renamedLeft], [{ from: 'Supplier.provide', to: 'Consumer.receive' }]).actual;
  const undoEvent = id => ({ Make: 'A', Use: 'B' })[id];
  const undoPlace = id => order(id.split('=').map(p => ({ 'Supplier.wire': 'Left.p', 'Consumer.take': 'Right.q' })[p])).join('=');
  const restored = clone(renamed);
  restored.eventIds = renamed.eventIds.map(undoEvent);
  restored.states.forEach(s => { s.completed = s.completed.map(undoEvent); });
  restored.steps.forEach(s => { s.events = s.events.map(undoEvent); });
  restored.words = renamed.words.map(w => w.map(undoEvent));
  assert.deepEqual(behaviorSignature(restored, undoPlace), behaviorSignature(original));
});

test('nested cutoffs stay explicit; a fresh product from complete leaves can repair its own cutoff', () => {
  const f = fragment('Budget', [place('p')], [event('A'), event('B')]);
  const completeLeaf = engine.compileContract(f);
  const lowProduct = engine.composeContracts([completeLeaf], [], { caps: { maxStates: 1 } });
  assert.equal(lowProduct.behavior.status, 'incomplete');
  assert.equal(engine.composeContracts([lowProduct]).behavior.status, 'incomplete');
  const recomputed = engine.composeContracts([completeLeaf]).behavior;
  assert.equal(recomputed.status, 'complete');
  assert.deepEqual(behaviorSignature(recomputed), behaviorSignature(check([f]).actual));
  const incompleteLeaf = engine.compileContract(f, { caps: { maxStates: 1 } });
  assert.equal(incompleteLeaf.status, 'incomplete');
  const stillIncomplete = engine.composeContracts([engine.composeContracts([incompleteLeaf])]).behavior;
  assert.equal(stillIncomplete.status, 'incomplete');
  assert.equal(engine.compareBehaviors(stillIncomplete, recomputed).status, 'unknown');
});

for (const scenario of SCENARIOS) test('published scenario agrees with the independent source oracle: ' + scenario.id, () => {
  const { actual, expected } = check(scenario.fragments, scenario.connections);
  const source = sourceGlue(scenario.fragments, scenario.connections);
  const schedule = engine.representativeSchedule(source, actual);
  if (!expected.words.size) {
    assert.equal(schedule.status, 'impossible');
    return;
  }
  assert.equal(schedule.status, 'valid');
  assert.deepEqual(new Set(schedule.intervals.map(x => x.event)), new Set(source.events.map(e => e.id)));
  assert.equal(schedule.intervals.length, source.events.length);
  const marking = Object.fromEntries(source.places.map(p => [p.id, p.initial]));
  const byEvent = new Map(source.events.map(e => [e.id, e]));
  const times = [...new Set(schedule.intervals.flatMap(x => [x.start, x.finish]))].sort((a, b) => a - b);
  for (const interval of schedule.intervals) {
    assert(interval.start >= 0);
    assert.equal(interval.finish - interval.start, byEvent.get(interval.event).duration);
  }
  for (const time of times) {
    for (const interval of schedule.intervals.filter(x => x.finish === time)) {
      for (const [p, n] of Object.entries(byEvent.get(interval.event).produce)) marking[p] += n;
    }
    const starting = schedule.intervals.filter(x => x.start === time).map(x => byEvent.get(x.event));
    assert(tokenAssignments(marking, starting) > 0, 'all simultaneous starts have disjoint available token assignments');
    for (const event of starting) for (const [p, n] of Object.entries(event.consume)) marking[p] -= n;
  }
  assert.deepEqual(marking, actual.states.find(s => s.terminal).marking);
});
