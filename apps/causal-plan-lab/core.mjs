/** Finite token-flow witnesses. No dependency, network access, or model mutation. */
export const ENGINE_VERSION = '1.0.0';
export const MAX_EVENTS = 32;
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const pair = edge => Array.isArray(edge) ? edge : [edge.from, edge.to];
const key = (a, b) => JSON.stringify([a, b]);
const markingObject = marking => Object.fromEntries(marking);

export function validateModel(model) {
  const errors = [];
  if (!record(model)) return {ok: false, errors: ['Model must be an object.']};
  if (typeof model.id !== 'string' || !model.id.trim()) errors.push('Model id must be a nonempty string.');
  for (const field of ['title', 'description']) if (model[field] !== undefined && typeof model[field] !== 'string') errors.push(`Model ${field} must be a string when provided.`);
  if (!Array.isArray(model.places) || !model.places.length) errors.push('Model needs a nonempty places array.');
  if (!Array.isArray(model.transitions)) errors.push('Model transitions must be an array.');
  const places = new Set();
  for (const [i, p] of (Array.isArray(model.places) ? model.places : []).entries()) {
    if (!record(p)) { errors.push(`Place ${i} must be an object.`); continue; }
    if (typeof p.id !== 'string' || !p.id.trim()) errors.push(`Place ${i} needs a nonempty id.`);
    else if (places.has(p.id)) errors.push(`Duplicate place id: ${p.id}.`);
    else places.add(p.id);
    if (!['condition', 'resource'].includes(p.kind)) errors.push(`Place ${p.id ?? i}: kind must be condition or resource.`);
    if (p.label !== undefined && typeof p.label !== 'string') errors.push(`Place ${p.id ?? i}: label must be a string when provided.`);
    if (!integer(p.initial)) errors.push(`Place ${p.id ?? i}: initial must be a nonnegative safe integer.`);
  }
  function arcs(arcs, name, requireInput = false) {
    if (!record(arcs)) { errors.push(`${name} must be a place/count object.`); return; }
    let positive = false;
    for (const [place, count] of Object.entries(arcs)) {
      if (!places.has(place)) errors.push(`${name}: unknown place ${place}.`);
      if (!integer(count)) errors.push(`${name}.${place} must be a nonnegative safe integer.`);
      if (integer(count) && count > 0) positive = true;
    }
    if (requireInput && !positive) errors.push(`${name} needs at least one positive input count.`);
  }
  const transitions = new Set();
  for (const [i, t] of (Array.isArray(model.transitions) ? model.transitions : []).entries()) {
    if (!record(t)) { errors.push(`Transition ${i} must be an object.`); continue; }
    if (typeof t.id !== 'string' || !t.id.trim()) errors.push(`Transition ${i} needs a nonempty id.`);
    else if (transitions.has(t.id)) errors.push(`Duplicate transition id: ${t.id}.`);
    else transitions.add(t.id);
    if (typeof t.duration !== 'number' || !Number.isFinite(t.duration) || t.duration <= 0) errors.push(`Transition ${t.id ?? i}: duration must be finite and positive.`);
    if (t.label !== undefined && typeof t.label !== 'string') errors.push(`Transition ${t.id ?? i}: label must be a string when provided.`);
    if (!Number.isSafeInteger(t.maxFirings) || t.maxFirings < 1) errors.push(`Transition ${t.id ?? i}: maxFirings must be a positive safe integer.`);
    arcs(t.inputs, `Transition ${t.id ?? i} inputs`, true);
    arcs(t.outputs, `Transition ${t.id ?? i} outputs`);
  }
  arcs(model.goal, 'Goal');
  if (record(model.goal) && !Object.values(model.goal).some(n => integer(n) && n > 0)) errors.push('Goal must contain at least one positive place count.');
  return {ok: errors.length === 0, errors};
}

const covers = (marking, goal) => Object.entries(goal).every(([p, n]) => marking.get(p) >= n);
const enabled = (marking, t) => Object.entries(t.inputs).every(([p, n]) => marking.get(p) >= n);
function firedMarking(marking, t) {
  const next = new Map(marking);
  for (const [p, n] of Object.entries(t.inputs)) next.set(p, next.get(p) - n);
  for (const [p, n] of Object.entries(t.outputs)) {
    const value = next.get(p) + n;
    if (!Number.isSafeInteger(value)) throw new RangeError(`Marking at ${p} exceeds safe integer precision.`);
    next.set(p, value);
  }
  return next;
}
function allocationErrors(options) {
  if (!record(options)) return ['Options must be an object.'];
  return options.allocation !== undefined && !['fifo', 'lifo'].includes(options.allocation) ? ['Allocation must be fifo or lifo.'] : [];
}

/** Enumerate first-goal sequential traces; do not deduplicate marking states. */
export function generate(model, options = {}) {
  const validation = validateModel(model);
  const errors = [...validation.errors, ...allocationErrors(options)];
  const maxExecutions = options?.maxExecutions ?? 1500;
  const maxNodes = options?.maxNodes ?? 50000;
  const maxTraceLength = options?.maxTraceLength ?? MAX_EVENTS;
  for (const [name, n] of Object.entries({maxExecutions, maxNodes})) if (!Number.isSafeInteger(n) || n < 1) errors.push(`${name} must be a positive safe integer.`);
  if (!Number.isSafeInteger(maxTraceLength) || maxTraceLength < 1 || maxTraceLength > MAX_EVENTS) errors.push(`maxTraceLength must be an integer from 1 to ${MAX_EVENTS}.`);
  const executions = [], deadlocks = [];
  const stats = {visitedNodes: 0, goalTraces: 0, deadlockCount: 0, boundExhaustedCount: 0, traceLimitBranches: 0, maxExecutions, maxNodes, maxTraceLength, searchSemantics: 'first-goal prefixes within per-transition maxFirings; computational budgets are reported separately', allocation: options?.allocation ?? 'fifo'};
  if (errors.length) return {executions, complete: false, stats, deadlocks, reason: 'invalid-input', errors};
  const stack = [{marking: new Map(model.places.map(p => [p.id, p.initial])), counts: new Map(), trace: []}];
  let reason = null;
  while (stack.length) {
    if (stats.visitedNodes >= maxNodes) { reason = 'maxNodes'; break; }
    const state = stack.pop();
    stats.visitedNodes++;
    if (covers(state.marking, model.goal)) {
      if (executions.length >= maxExecutions) { reason = 'maxExecutions'; break; }
      executions.push(state.trace);
      stats.goalTraces++;
      continue;
    }
    const countEnabled = model.transitions.filter(t => enabled(state.marking, t));
    const choices = countEnabled.filter(t => (state.counts.get(t.id) ?? 0) < t.maxFirings);
    if (!choices.length) {
      const boundExhausted = countEnabled.length > 0;
      if (boundExhausted) stats.boundExhaustedCount++;
      else stats.deadlockCount++;
      deadlocks.push({trace: state.trace, marking: markingObject(state.marking), reason: boundExhausted ? 'firing-bounds' : 'no-enabled-transition'});
      continue;
    }
    if (state.trace.length >= maxTraceLength) { stats.traceLimitBranches++; continue; }
    for (let i = choices.length - 1; i >= 0; i--) {
      const t = choices[i];
      let next;
      try { next = firedMarking(state.marking, t); }
      catch (error) { reason = 'numeric-limit'; errors.push(error.message); break; }
      const counts = new Map(state.counts);
      counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      stack.push({marking: next, counts, trace: [...state.trace, t.id]});
    }
    if (reason) break;
  }
  if (reason === null && stats.traceLimitBranches) reason = 'maxTraceLength';
  stats.pendingBranches = stack.length;
  return {executions, complete: reason === null, stats, deadlocks, reason, errors};
}

/** Atomic count snapshots and one chosen occurrence/token allocation witness. */
export function replay(model, transitionIds, options = {}) {
  const errors = [...validateModel(model).errors, ...allocationErrors(options)];
  if (!Array.isArray(transitionIds) || transitionIds.some(x => typeof x !== 'string')) errors.push('Trace must be an array of transition id strings.');
  else if (transitionIds.length > MAX_EVENTS) errors.push(`Trace exceeds the supported ${MAX_EVENTS}-event analysis limit.`);
  const result = {ok: false, errors, events: [], edges: [], markings: [], finalMarking: {}, goalReached: false, allocation: options?.allocation ?? 'fifo'};
  if (errors.length) return result;
  const allocation = result.allocation;
  let marking = new Map(model.places.map(p => [p.id, p.initial]));
  const queues = new Map(model.places.map(p => [p.id, []]));
  const places = new Map(model.places.map(p => [p.id, p]));
  const transitions = new Map(model.transitions.map(t => [t.id, t]));
  const counts = new Map(), edgeMap = new Map();
  // Compact initial token runs avoid expanding a large legal initial marking.
  for (const p of model.places) if (p.initial) queues.get(p.id).push({producer: null, count: p.initial});
  result.markings.push(markingObject(marking));
  for (const transitionId of transitionIds) {
    const t = transitions.get(transitionId);
    if (!t) { errors.push(`Unknown transition: ${transitionId}.`); break; }
    const occurrence = (counts.get(t.id) ?? 0) + 1;
    if (occurrence > t.maxFirings) { errors.push(`Transition ${t.id} exceeds maxFirings ${t.maxFirings}.`); break; }
    if (!enabled(marking, t)) { errors.push(`Transition ${t.id} is not enabled at trace position ${result.events.length + 1}.`); break; }
    let next;
    try { next = firedMarking(marking, t); } catch (error) { errors.push(error.message); break; }
    const event = {id: `${t.id}#${occurrence}`, transitionId: t.id, label: t.label ?? t.id, duration: t.duration, index: result.events.length, consumed: [], produced: []};
    for (const [p, amount] of Object.entries(t.inputs)) {
      let remaining = amount;
      const queue = queues.get(p);
      while (remaining > 0) {
        const at = allocation === 'fifo' ? 0 : queue.length - 1;
        const run = queue[at];
        const consumed = Math.min(remaining, run.count);
        event.consumed.push({place: p, producer: run.producer, count: consumed});
        if (run.producer !== null) {
          const edgeKey = JSON.stringify([run.producer, event.id, p]);
          if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, {from: run.producer, to: event.id, place: p, kind: places.get(p).kind, count: 0});
          edgeMap.get(edgeKey).count += consumed;
        }
        remaining -= consumed;
        run.count -= consumed;
        if (run.count === 0) queue.splice(at, 1);
      }
    }
    for (const [p, count] of Object.entries(t.outputs)) if (count > 0) {
      queues.get(p).push({producer: event.id, count});
      event.produced.push({place: p, count});
    }
    counts.set(t.id, occurrence);
    marking = next;
    result.events.push(event);
    result.markings.push(markingObject(marking));
  }
  result.edges = [...edgeMap.values()];
  result.finalMarking = markingObject(marking);
  result.ok = errors.length === 0;
  result.goalReached = result.ok && covers(marking, model.goal);
  return result;
}

/** Strict transitive closure. Input IDs determine stable output order. */
export function closure(ids, edges) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw new TypeError('Event ids must be a unique array.');
  const adjacency = new Map(ids.map(id => [id, new Set()]));
  for (const edge of edges) {
    const [from, to] = pair(edge);
    if (!adjacency.has(from) || !adjacency.has(to)) throw new TypeError('Order edge references an unknown event.');
    adjacency.get(from).add(to);
  }
  const result = [];
  for (const from of ids) {
    const seen = new Set(), stack = [...adjacency.get(from)];
    while (stack.length) {
      const to = stack.pop();
      if (to === from) throw new RangeError('Event order must be acyclic.');
      if (seen.has(to)) continue;
      seen.add(to);
      for (const successor of adjacency.get(to)) stack.push(successor);
    }
    for (const to of ids) if (seen.has(to)) result.push([from, to]);
  }
  return result;
}
function components(ids, connected) {
  const remaining = new Set(ids), result = [];
  for (const seed of ids) {
    if (!remaining.delete(seed)) continue;
    const component = [], stack = [seed];
    while (stack.length) {
      const u = stack.pop();
      component.push(u);
      for (const v of remaining) if (connected(u, v)) { remaining.delete(v); stack.push(v); }
    }
    result.push(ids.filter(id => component.includes(id)));
  }
  return result;
}

/** Exact elementary leaf/sequence/parallel decomposition of a finite poset. */
export function decompose(ids, order) {
  const relations = new Set(closure(ids, order).map(([a, b]) => key(a, b)));
  const before = (a, b) => relations.has(key(a, b));
  function visit(group) {
    if (!group.length) return {type: 'parallel', children: []};
    if (group.length === 1) return {type: 'task', id: group[0], label: group[0]};
    let parts = components(group, (a, b) => before(a, b) || before(b, a));
    let type = 'parallel';
    if (parts.length === 1) {
      parts = components(group, (a, b) => !before(a, b) && !before(b, a));
      type = 'sequence';
      if (parts.length === 1) return null;
      parts.sort((a, b) => before(a[0], b[0]) ? -1 : 1);
    }
    const children = parts.map(visit);
    if (children.some(child => child === null)) return null;
    return {type, children};
  }
  return visit(ids);
}

export function treeOrder(tree) {
  const relations = [];
  function visit(node) {
    if (!record(node)) throw new TypeError('A Seq/Par tree node is required.');
    if (node.type === 'task') return [node.id];
    if (!['parallel', 'sequence'].includes(node.type) || !Array.isArray(node.children)) throw new TypeError('Unknown Seq/Par tree node.');
    const groups = node.children.map(visit);
    if (node.type === 'sequence') for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) for (const a of groups[i]) for (const b of groups[j]) relations.push([a, b]);
    return groups.flat();
  }
  const ids = visit(tree);
  if (new Set(ids).size !== ids.length) throw new TypeError('Tree task ids must be unique.');
  return closure(ids, relations);
}

/** Enumerate up to limit orders. count is known only when enumeration finishes. */
export function linearOrders(ids, order, limit = 10000) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('Linear-order limit must be a positive safe integer.');
  const relation = closure(ids, order);
  const predecessors = new Map(ids.map(id => [id, new Set()]));
  for (const [a, b] of relation) predecessors.get(b).add(a);
  const orders = [], chosen = new Set(), path = [];
  let complete = true;
  function visit() {
    if (path.length === ids.length) {
      if (orders.length === limit) { complete = false; return false; }
      orders.push([...path]);
      return true;
    }
    for (const id of ids) if (!chosen.has(id) && [...predecessors.get(id)].every(p => chosen.has(p))) {
      chosen.add(id); path.push(id);
      const proceed = visit();
      path.pop(); chosen.delete(id);
      if (!proceed) return false;
    }
    return true;
  }
  visit();
  return {orders, complete, count: complete ? orders.length : null, limit};
}

/** Returns an induced N: a<b, c<b, c<d, with no other relations on these four. */
function findN(ids, order) {
  const relations = new Set(order.map(([a, b]) => key(a, b)));
  const before = (a, b) => relations.has(key(a, b));
  const incomparable = (a, b) => a !== b && !before(a, b) && !before(b, a);
  for (const a of ids) for (const b of ids) if (before(a, b))
    for (const c of ids) if (before(c, b) && incomparable(a, c))
      for (const d of ids) if (before(c, d) && incomparable(a, d) && incomparable(b, d))
        return {a, b, c, d, relations: [[a, b], [c, b], [c, d]], absentRelations: [[a, c], [a, d], [b, d]], induced: true};
  return null;
}
function topologicalOrder(ids, order) {
  const predecessors = new Map(ids.map(id => [id, new Set()]));
  for (const [a, b] of order) predecessors.get(b).add(a);
  const remaining = new Set(ids), result = [];
  while (remaining.size) {
    const next = ids.find(id => remaining.has(id) && [...predecessors.get(id)].every(p => !remaining.has(p)));
    if (next === undefined) throw new RangeError('Event order must be acyclic.');
    remaining.delete(next); result.push(next);
  }
  return result;
}
function timed(events, order) {
  const ids = events.map(e => e.id), byId = new Map(events.map(e => [e.id, e]));
  const starts = new Map(ids.map(id => [id, 0])), ends = new Map();
  for (const id of topologicalOrder(ids, order)) {
    for (const [from, to] of order) if (to === id) starts.set(id, Math.max(starts.get(id), ends.get(from)));
    const end = starts.get(id) + byId.get(id).duration;
    if (!Number.isFinite(end)) throw new RangeError('Schedule duration exceeds finite numeric precision.');
    if (end <= starts.get(id)) throw new RangeError('Schedule precision cannot represent a positive task duration at this start time.');
    ends.set(id, end);
  }
  return {schedule: ids.map(id => ({id, start: starts.get(id), end: ends.get(id)})), makespan: Math.max(0, ...ends.values())};
}
function labelTree(tree, events) {
  if (tree === null) return null;
  if (tree.type === 'task') return {...tree, label: events.get(tree.id).label};
  return {...tree, children: tree.children.map(child => labelTree(child, events))};
}

export function analyse(model, transitionIds, options = {}) {
  const witness = replay(model, transitionIds, options);
  const result = {...witness, engineVersion: ENGINE_VERSION, order: [], reducedEdges: [], tree: null, exactTree: false, obstruction: null, schedule: [], makespan: null, stagedTree: null, stagedMakespan: null, stagedAdded: [], stagedRemoved: [], lostOrder: null, linearExtensions: null, treeExtensions: null, linearExtensionsComplete: false, treeExtensionsComplete: false, boundedness: {maxFirings: Object.fromEntries((Array.isArray(model?.transitions) ? model.transitions : []).filter(record).map(t => [t.id, t.maxFirings])), maxEvents: MAX_EVENTS, completeGoalPlan: witness.ok && witness.goalReached, provenance: 'chosen token-flow witness; not canonical collective-token causality'}};
  if (!witness.ok) return result;
  const limit = options.linearOrderLimit ?? 10000;
  if (!Number.isSafeInteger(limit) || limit < 1) { result.ok = false; result.errors.push('linearOrderLimit must be a positive safe integer.'); return result; }
  const ids = witness.events.map(e => e.id), byId = new Map(witness.events.map(e => [e.id, e]));
  const order = closure(ids, witness.edges), relations = new Set(order.map(([a, b]) => key(a, b)));
  result.order = order;
  result.reducedEdges = order.filter(([a, b]) => !ids.some(c => relations.has(key(a, c)) && relations.has(key(c, b)))).map(([from, to]) => ({from, to}));
  result.tree = labelTree(decompose(ids, order), byId);
  result.exactTree = result.tree !== null;
  result.obstruction = result.exactTree ? null : findN(ids, order);
  try { Object.assign(result, timed(witness.events, order)); }
  catch (error) { result.ok = false; result.errors.push(error.message); return result; }
  const groups = new Map();
  for (const item of result.schedule) {
    if (!groups.has(item.start)) groups.set(item.start, []);
    groups.get(item.start).push({type: 'task', id: item.id, label: byId.get(item.id).label});
  }
  result.stagedTree = {type: 'sequence', children: [...groups.entries()].sort(([a], [b]) => a - b).map(([, children]) => children.length === 1 ? children[0] : {type: 'parallel', children})};
  const stagedOrder = treeOrder(result.stagedTree), stagedRelations = new Set(stagedOrder.map(([a, b]) => key(a, b)));
  result.stagedAdded = stagedOrder.filter(([a, b]) => !relations.has(key(a, b)));
  result.stagedRemoved = order.filter(([a, b]) => !stagedRelations.has(key(a, b)));
  try { result.stagedMakespan = timed(witness.events, stagedOrder).makespan; }
  catch (error) { result.ok = false; result.errors.push(`Staged schedule: ${error.message}`); return result; }
  if (result.stagedAdded.length) {
    // Adding the reverse of an invented relation constructs a lawful lost order,
    // even if ordinary linear-extension enumeration reaches its display budget.
    const [a, b] = result.stagedAdded[0];
    result.lostOrder = topologicalOrder(ids, [...order, [b, a]]);
  }
  const exact = linearOrders(ids, order, limit), staged = linearOrders(ids, stagedOrder, limit);
  result.linearExtensions = exact.count;
  result.treeExtensions = staged.count;
  result.linearExtensionsComplete = exact.complete;
  result.treeExtensionsComplete = staged.complete;
  result.linearOrderLimit = limit;
  // These counts compare the causal DAG with the staged proposal. Exact-tree
  // equivalence, when available, is certified by pairwise order equality.
  result.exactTreeExtensions = result.exactTree ? exact.count : null;
  result.physicalOrder = closure(ids, witness.edges.filter(e => e.kind === 'condition'));
  result.resourceEdges = witness.edges.filter(e => e.kind === 'resource');
  return result;
}
