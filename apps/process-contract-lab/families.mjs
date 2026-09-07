import {validateModel, replay, closure, decompose} from '../causal-plan-lab/core.mjs';

export const FAMILY_VERSION = '1.0.0';
export const FAMILY_LIMITS = Object.freeze({maxEvents: 8, maxPlaces: 64, maxTransitions: 32, maxWitnesses: 8192, maxStates: 250000, maxAllocationEntries: 131072, maxWitnessCharacters: 8000000, maxLanguageOrders: 40320, maxLanguageChecks: 5000000, maxLanguageCharacters: 8000000});
const DEFAULTS = Object.freeze({maxWitnesses: 2048, maxStates: 50000, maxAllocationEntries: 65536, maxWitnessCharacters: 4000000, maxLanguageOrders: 40320, maxLanguageChecks: 2000000, maxLanguageCharacters: 4000000});
const LANGUAGE_SCOPE = 'Union of linear orders of all retained occurrences over ancestries compatible with the selected input trace; not every count-level reorder of its transition multiset. Alternative orders may reach the goal before their final occurrence. First-goal validation selects the input trace only.';
const TIMING_SCOPE = 'Minimum and maximum of each ancestry witness\'s earliest finish for all retained occurrences; not bounds on delayed schedules, probabilities, or an uncertainty model.';
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const pairKey = (a, b) => JSON.stringify([a, b]);

function labelledTree(tree, byId) {
  if (tree === null) return null;
  if (tree.type === 'task') return {...tree, label: byId.get(tree.id).label};
  return {...tree, children: tree.children.map(child => labelledTree(child, byId))};
}
function nCertificate(ids, order) {
  const relations = new Set(order.map(([a, b]) => pairKey(a, b)));
  const before = (a, b) => relations.has(pairKey(a, b));
  const separate = (a, b) => a !== b && !before(a, b) && !before(b, a);
  for (const a of ids) for (const b of ids) if (before(a, b))
    for (const c of ids) if (before(c, b) && separate(a, c))
      for (const d of ids) if (before(c, d) && separate(a, d) && separate(b, d))
        return {a, b, c, d, relations: [[a, b], [c, b], [c, d]], absentRelations: [[a, c], [a, d], [b, d]], induced: true};
  return null;
}
function makeWitness(id, allocations, events, placeKinds) {
  const ids = events.map(e => e.id), byId = new Map(events.map(e => [e.id, e]));
  const edges = allocations.filter(a => a.producer !== null).map(a => ({from: a.producer, to: a.eventId, place: a.place, kind: placeKinds.get(a.place), count: a.count}));
  const order = closure(ids, edges), relations = new Set(order.map(([a, b]) => pairKey(a, b)));
  const reducedEdges = order.filter(([a, b]) => !ids.some(c => relations.has(pairKey(a, c)) && relations.has(pairKey(c, b)))).map(([from, to]) => ({from, to}));
  const tree = labelledTree(decompose(ids, order), byId), schedule = [], finishes = new Map();
  // Every producer precedes its consumer in the selected input trace.
  for (const event of events) {
    const start = Math.max(0, ...edges.filter(edge => edge.to === event.id).map(edge => finishes.get(edge.from)));
    const end = start + event.duration;
    if (!Number.isFinite(end)) throw new RangeError('An ancestry schedule exceeds finite numeric precision.');
    if (end <= start) throw new RangeError('An ancestry schedule cannot represent a positive duration at its computed start time.');
    finishes.set(event.id, end); schedule.push({id: event.id, start, end});
  }
  return {id, allocations, edges, order, reducedEdges, tree, exactTree: tree !== null, obstruction: tree ? null : nCertificate(ids, order), schedule, makespan: Math.max(0, ...finishes.values())};
}
function* permutations(ids, prefix = [], used = new Set()) {
  if (prefix.length === ids.length) { yield [...prefix]; return; }
  for (const id of ids) if (!used.has(id)) {
    used.add(id); prefix.push(id);
    yield* permutations(ids, prefix, used);
    prefix.pop(); used.delete(id);
  }
}
function maskForPairs(order, index, size) {
  let mask = 0n;
  for (const [a, b] of order) mask |= 1n << BigInt(index.get(a) * size + index.get(b));
  return mask;
}
function pairsForMask(ids, mask) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++)
    if (mask & (1n << BigInt(i * ids.length + j))) pairs.push([ids[i], ids[j]]);
  return pairs;
}
function permutationMask(order, index, size) {
  let mask = 0n;
  for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) mask |= 1n << BigInt(index.get(order[i]) * size + index.get(order[j]));
  return mask;
}

/** Full bounded producer-count ancestry family for one selected first-goal trace. */
export function analyseFamily(model, trace, options = {}) {
  const errors = [...validateModel(model).errors];
  const bounds = {...DEFAULTS, maxEvents: FAMILY_LIMITS.maxEvents, maxPlaces: FAMILY_LIMITS.maxPlaces, maxTransitions: FAMILY_LIMITS.maxTransitions};
  if (!record(options)) errors.push('Family options must be an object.');
  else for (const name of Object.keys(DEFAULTS)) {
    const value = options[name] ?? DEFAULTS[name];
    if (!Number.isSafeInteger(value) || value < 1 || value > FAMILY_LIMITS[name]) errors.push(`${name} must be an integer from 1 to ${FAMILY_LIMITS[name]}.`);
    else bounds[name] = value;
  }
  if (!Array.isArray(trace) || trace.some(id => typeof id !== 'string')) errors.push('Selected trace must be an array of transition id strings.');
  else if (trace.length > bounds.maxEvents) errors.push(`Family analysis supports at most ${bounds.maxEvents} event occurrences.`);
  if (model?.places?.length > bounds.maxPlaces) errors.push(`Family analysis supports at most ${bounds.maxPlaces} places.`);
  if (model?.transitions?.length > bounds.maxTransitions) errors.push(`Family analysis supports at most ${bounds.maxTransitions} transitions.`);
  const stats = {statesVisited: 0, witnessesRetained: 0, retainedAllocationEntries: 0, witnessCharacters: 0, distinctOrders: 0, permutationsVisited: 0, languageChecks: 0, languageCharacters: 0, reachedLimits: []};
  const result = {ok: false, errors, modelId: model?.id ?? null, version: FAMILY_VERSION, events: [], witnesses: [], complete: false, reason: null, stats, bounds, classification: 'unknown', observed: {exactTreeWitnesses: 0, nonExactTreeWitnesses: 0, classification: 'empty'}, distinctOrders: null, observedDistinctOrders: 0, mustOrder: null, mayOrder: null, observedMustOrder: [], observedMayOrder: [], language: {orders: [], count: null, observedCount: 0, complete: false, observedComplete: false, reason: null, scope: LANGUAGE_SCOPE}, summary: {dagExact: null, treeExact: null, tree: null, spuriousOrder: null, overconstraintOrder: null, unionCyclic: null}, minFinish: null, maxFinish: null, observedMinFinish: null, observedMaxFinish: null, timingScope: TIMING_SCOPE, provenanceScope: 'All retained producer-count allocations for this selected trace; identical initial and same-producer tokens are aggregated. This is not BD-process equivalence or canonical collective-token causality.'};
  if (errors.length) { result.reason = 'invalid-input'; return result; }
  const checked = replay(model, trace);
  if (!checked.ok) errors.push(...checked.errors);
  else if (!checked.goalReached) errors.push('The selected trace is partial: its final marking does not cover the explicit goal.');
  else if (checked.markings.slice(0, -1).some(marking => Object.entries(model.goal).every(([place, count]) => marking[place] >= count))) errors.push('The selected trace continues after first reaching its goal.');
  if (errors.length) { result.reason = 'invalid-input'; return result; }
  const events = checked.events.map(({id, transitionId, label, duration, index}) => ({id, transitionId, label, duration, index}));
  result.events = events;
  const transitions = new Map(model.transitions.map(t => [t.id, t]));
  const placeKinds = new Map(model.places.map(p => [p.id, p.kind]));
  const initialPools = new Map(model.places.map(p => [p.id, p.initial ? [{producer: null, count: p.initial}] : []]));
  let stopped = false;
  function stop(reason) {
    if (!result.reason) result.reason = reason;
    if (!stats.reachedLimits.includes(reason)) stats.reachedLimits.push(reason);
    stopped = true;
    return false;
  }
  function tick() {
    if (stopped) return false;
    if (stats.statesVisited >= bounds.maxStates) return stop('maxStates');
    stats.statesVisited++;
    return true;
  }
  function visitEvent(eventIndex, pools, allocations) {
    if (!tick()) return false;
    if (eventIndex === events.length) {
      if (result.witnesses.length >= bounds.maxWitnesses) return stop('maxWitnesses');
      if (stats.retainedAllocationEntries + allocations.length > bounds.maxAllocationEntries) return stop('maxAllocationEntries');
      let witness;
      try { witness = makeWitness(`w${result.witnesses.length + 1}`, allocations, events, placeKinds); }
      catch (error) { errors.push(error.message); return stop('numeric-limit'); }
      const witnessCharacters = JSON.stringify(witness).length;
      if (stats.witnessCharacters + witnessCharacters > bounds.maxWitnessCharacters) return stop('maxWitnessCharacters');
      result.witnesses.push(witness);
      stats.witnessesRetained++;
      stats.retainedAllocationEntries += allocations.length;
      stats.witnessCharacters += witnessCharacters;
      return true;
    }
    const event = events[eventIndex], transition = transitions.get(event.transitionId);
    const inputs = Object.entries(transition.inputs).filter(([, n]) => n > 0);
    function visitPlace(inputIndex, currentPools, currentAllocations) {
      if (!tick()) return false;
      if (inputIndex === inputs.length) {
        const producedPools = new Map(currentPools);
        for (const [place, count] of Object.entries(transition.outputs)) if (count > 0) producedPools.set(place, [...producedPools.get(place), {producer: event.id, count}]);
        return visitEvent(eventIndex + 1, producedPools, currentAllocations);
      }
      const [place, amount] = inputs[inputIndex], runs = currentPools.get(place);
      const suffix = Array(runs.length + 1).fill(0);
      for (let i = runs.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + runs[i].count;
      function distribute(runIndex, remaining, picks) {
        if (!tick()) return false;
        if (runIndex === runs.length) {
          if (remaining !== 0) return true;
          const nextPools = new Map(currentPools), nextRuns = [], added = [];
          runs.forEach((run, i) => {
            if (picks[i] > 0) added.push({eventId: event.id, place, producer: run.producer, count: picks[i]});
            if (run.count > picks[i]) nextRuns.push({producer: run.producer, count: run.count - picks[i]});
          });
          nextPools.set(place, nextRuns);
          return visitPlace(inputIndex + 1, nextPools, [...currentAllocations, ...added]);
        }
        const lower = Math.max(0, remaining - suffix[runIndex + 1]), upper = Math.min(remaining, runs[runIndex].count);
        // Larger oldest-producer allocations first: deterministic FIFO-first
        // enumeration, without permuting tokens inside a producer class.
        for (let count = upper; count >= lower; count--) if (!distribute(runIndex + 1, remaining - count, [...picks, count])) return false;
        return true;
      }
      return distribute(0, amount, []);
    }
    return visitPlace(0, pools, allocations);
  }
  visitEvent(0, initialPools, []);
  result.complete = !stopped && errors.length === 0;
  result.ok = errors.length === 0;
  const exactCount = result.witnesses.filter(w => w.exactTree).length, nonExactCount = result.witnesses.length - exactCount;
  const observedClassification = !result.witnesses.length ? 'empty' : exactCount === result.witnesses.length ? 'all' : exactCount === 0 ? 'none' : 'some';
  result.observed = {exactTreeWitnesses: exactCount, nonExactTreeWitnesses: nonExactCount, classification: observedClassification};
  if (result.complete) result.classification = observedClassification;
  if (result.witnesses.length) {
    result.observedMinFinish = Math.min(...result.witnesses.map(w => w.makespan));
    result.observedMaxFinish = Math.max(...result.witnesses.map(w => w.makespan));
    if (result.complete) { result.minFinish = result.observedMinFinish; result.maxFinish = result.observedMaxFinish; }
  }
  const ids = events.map(e => e.id), idIndex = new Map(ids.map((id, i) => [id, i]));
  const distinctMasks = new Set(result.witnesses.map(w => maskForPairs(w.order, idIndex, ids.length)));
  const masks = [...distinctMasks];
  const mustMask = masks.length ? masks.reduce((a, b) => a & b) : 0n;
  const mayMask = masks.reduce((a, b) => a | b, 0n);
  result.observedDistinctOrders = stats.distinctOrders = masks.length;
  result.observedMustOrder = pairsForMask(ids, mustMask);
  result.observedMayOrder = pairsForMask(ids, mayMask);
  if (result.complete) {
    result.distinctOrders = masks.length;
    result.mustOrder = result.observedMustOrder;
    result.mayOrder = result.observedMayOrder;
  }
  if (!result.ok) return result;
  let languageStopped = false, spuriousOrder = null, overconstraintOrder = null;
  function languageStop(reason) {
    languageStopped = true;
    result.language.reason = reason;
    if (!stats.reachedLimits.includes(reason)) stats.reachedLimits.push(reason);
  }
  if (masks.length) {
    for (const word of permutations(ids)) {
      if (stats.permutationsVisited >= bounds.maxLanguageOrders) { languageStop('maxLanguageOrders'); break; }
      const wordMask = permutationMask(word, idIndex, ids.length);
      let member = false;
      for (const mask of masks) {
        if (stats.languageChecks >= bounds.maxLanguageChecks) { languageStop('maxLanguageChecks'); break; }
        stats.languageChecks++;
        if ((wordMask & mask) === mask) { member = true; break; }
      }
      if (languageStopped) break;
      stats.permutationsVisited++;
      if (member) {
        const wordCharacters = JSON.stringify(word).length;
        if (stats.languageCharacters + wordCharacters > bounds.maxLanguageCharacters) { languageStop('maxLanguageCharacters'); break; }
        result.language.orders.push(word);
        stats.languageCharacters += wordCharacters;
        if (overconstraintOrder === null && (wordMask & mayMask) !== mayMask) overconstraintOrder = word;
      } else if (spuriousOrder === null && (wordMask & mustMask) === mustMask) spuriousOrder = word;
    }
  }
  result.language.observedCount = result.language.orders.length;
  result.language.observedComplete = !languageStopped;
  result.language.complete = result.complete && !languageStopped;
  if (result.language.complete) {
    result.language.count = result.language.orders.length;
    const dagExact = spuriousOrder === null;
    const tree = dagExact ? labelledTree(decompose(ids, result.mustOrder), new Map(events.map(e => [e.id, e]))) : null;
    let unionCyclic = false;
    try { closure(ids, result.mayOrder); } catch { unionCyclic = true; }
    result.summary = {dagExact, treeExact: dagExact && tree !== null, tree, spuriousOrder, overconstraintOrder, unionCyclic};
  }
  return result;
}
