import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the same dependency-free functions that run in the shipped page.
// No browser stubs, copied scheduler, or generated schedule fixture is used.
const html = readFileSync(new URL('../apps/mountain-refuge-petri-wbs-demo/index.html', import.meta.url), 'utf8');
const core = html.match(/<script\s+id="petri-core"[^>]*>([\s\S]*?)<\/script>/)?.[1];
const netDeclaration = html.match(/const net = \{[\s\S]*?\n\};/)?.[0];
assert.ok(core, 'The page must expose its actual pure Petri core.');
assert.ok(netDeclaration, 'The page must retain its literal toy process definition.');

const context = vm.createContext({});
vm.runInContext(`${netDeclaration}
const durations = Object.fromEntries(net.transitions.map(t => [t.id, t.duration]));
${core}
globalThis.api = { net, durations, enabledTransitions, policyOrder, simulateTimed,
  createWitnessModels, projectWitnessPlan, compareProcessWitness };
`, context, { filename: 'mountain-refuge-petri-wbs-demo/petri-core', timeout: 1000 });
const api = context.api;
const plain = value => JSON.parse(JSON.stringify(value));
const clone = plain;
const baseline = () => ({ crewTokens: 1, toolsTokens: 1, liftTokens: 1, policy: 'wallsFirst', maxSteps: 100 });
const runWitness = (settings = baseline(), processNet = api.net) =>
  api.compareProcessWitness(processNet, settings, api.durations);
const task = (run, id) => {
  const row = run.schedule.find(item => item.id === id);
  assert.ok(row, `Execution must include ${id}.`);
  return plain(row);
};
const timing = (run, id) => {
  const row = task(run, id);
  return [row.start, row.end, row.duration];
};

test('the two processes differ by the declared prerequisite and neither mutates the source', () => {
  const sourceBefore = JSON.stringify(api.net);
  const { independent, sequenced } = api.createWitnessModels(api.net);
  assert.notStrictEqual(independent, sequenced);
  assert.notStrictEqual(independent, api.net);
  assert.notStrictEqual(sequenced, api.net);
  assert.deepEqual(plain(independent.places), plain(sequenced.places));
  const roofA = independent.transitions.find(t => t.id === 'roof');
  const roofB = sequenced.transitions.find(t => t.id === 'roof');
  assert.equal(roofA.pre.wallsDone, undefined);
  assert.equal(roofA.post.wallsDone, undefined);
  assert.equal(roofB.pre.wallsDone, 1);
  assert.equal(roofB.post.wallsDone, 1);
  const withoutAddedRule = clone(sequenced.transitions);
  const roof = withoutAddedRule.find(t => t.id === 'roof');
  delete roof.pre.wallsDone;
  delete roof.post.wallsDone;
  assert.deepEqual(withoutAddedRule, plain(independent.transitions));
  assert.equal(JSON.stringify(api.net), sourceBefore);
});

test('the full baseline execution is preserved and both 14-task projections match', () => {
  const witness = runWitness();
  for (const run of [witness.runA, witness.runB]) {
    assert.equal(run.ok, true);
    assert.equal(run.marking.complete, 1);
    assert.equal(run.makespan, 36);
    // Explicit timings also guard the pre-existing scheduler during extraction.
    assert.deepEqual(plain(run.schedule.map(({ id, start, end, duration }) => [id, start, end, duration])), [
      ['kickoff', 0, 0, 0],
      ['permits', 0, 10, 10],
      ['liftMaterials', 0, 4, 4],
      ['access', 0, 3, 3],
      ['siteprep', 3, 5, 2],
      ['foundation', 10, 14, 4],
      ['frame', 14, 19, 5],
      ['walls', 19, 23, 4],
      ['roof', 23, 26, 3],
      ['utilities', 26, 29, 3],
      ['interior', 29, 33, 4],
      ['safety', 33, 35, 2],
      ['inspect', 35, 36, 1],
      ['open', 36, 36, 0],
    ]);
  }
  assert.equal(witness.samePlan, true);
  assert.notEqual(witness.planA, null);
  assert.deepEqual(plain(witness.planA), plain(witness.planB));
  assert.notStrictEqual(witness.runA, witness.runB);
  assert.notStrictEqual(witness.runA.schedule, witness.runB.schedule);
  assert.notStrictEqual(witness.planA, witness.planB);
});

test('the declared plan contains every task and the complete SMC and WBS views', () => {
  const { planA: plan, runA: run } = runWitness();
  assert.deepEqual(Object.keys(plan).sort(), [
    'schema', 'units', 'resources', 'policy', 'tasks', 'makespan', 'smcExpression', 'wbsText',
  ].sort());
  assert.equal(plan.schema, 'chosen-execution-plan-v1');
  assert.equal(plan.units, 'days');
  assert.deepEqual(plain(plan.resources), { crew: 1, tools: 1, lift: 1 });
  assert.equal(plan.policy, 'wallsFirst');
  assert.equal(plan.tasks.length, 14);
  for (const row of plan.tasks) {
    assert.deepEqual(Object.keys(row).sort(), ['id', 'label', 'start', 'end', 'duration'].sort());
    assert.deepEqual(plain(row), task(run, row.id));
  }
  assert.equal(plan.smcExpression,
    '(Establish Access/Pad ⊗ Kickoff ⊗ Lift Materials to Site ⊗ Permits & Env Review) ; ' +
    'Prep Site/Anchors ; Build Foundation ; Assemble Structural Frame ; Build Wall Shell ; ' +
    'Install Roof ; Install Utilities ; Interior Fit-Out ; Safety Systems ; ' +
    'Inspection/Commission ; Open Refuge');
  assert.equal(plan.wbsText, `Build Mountain Refuge
  Stage 1 (start t=0)
    - Establish Access/Pad
    - Kickoff
    - Lift Materials to Site
    - Permits & Env Review
  Stage 2 (start t=3)
    - Prep Site/Anchors
  Stage 3 (start t=10)
    - Build Foundation
  Stage 4 (start t=14)
    - Assemble Structural Frame
  Stage 5 (start t=19)
    - Build Wall Shell
  Stage 6 (start t=23)
    - Install Roof
  Stage 7 (start t=26)
    - Install Utilities
  Stage 8 (start t=29)
    - Interior Fit-Out
  Stage 9 (start t=33)
    - Safety Systems
  Stage 10 (start t=35)
    - Inspection/Commission
  Stage 11 (start t=36)
    - Open Refuge`);
});

test('all three resource pools doubled reveal the hidden prerequisite', () => {
  const witness = runWitness({ ...baseline(), crewTokens: 2, toolsTokens: 2, liftTokens: 2 });
  assert.equal(witness.runA.ok, true);
  assert.equal(witness.runB.ok, true);
  assert.equal(witness.runA.makespan, 31);
  assert.equal(witness.runB.makespan, 34);
  assert.deepEqual(timing(witness.runA, 'walls'), [19, 23, 4]);
  assert.deepEqual(timing(witness.runA, 'roof'), [19, 22, 3]);
  assert.deepEqual(timing(witness.runB, 'walls'), [19, 23, 4]);
  assert.deepEqual(timing(witness.runB, 'roof'), [23, 26, 3]);
  assert.deepEqual(timing(witness.runA, 'utilities'), [23, 26, 3]);
  assert.deepEqual(timing(witness.runB, 'utilities'), [26, 29, 3]);
  assert.equal(witness.samePlan, false);
  assert.notDeepEqual(plain(witness.planA), plain(witness.planB));
});

test('extra crew alone leaves the tools and lift bottleneck in both processes', () => {
  const witness = runWitness({ ...baseline(), crewTokens: 2 });
  assert.equal(witness.runA.ok, true);
  assert.equal(witness.runB.ok, true);
  assert.equal(witness.runA.makespan, 34);
  assert.equal(witness.runB.makespan, 34);
  assert.deepEqual(timing(witness.runA, 'roof'), [23, 26, 3]);
  assert.deepEqual(timing(witness.runB, 'roof'), [23, 26, 3]);
  assert.equal(witness.samePlan, true);
  assert.deepEqual(plain(witness.planA), plain(witness.planB));
});

test('roof-first distinguishes the full plans even when makespans still match', () => {
  const witness = runWitness({ ...baseline(), policy: 'roofFirst' });
  assert.equal(witness.runA.ok, true);
  assert.equal(witness.runB.ok, true);
  assert.equal(witness.runA.makespan, 36);
  assert.equal(witness.runB.makespan, 36);
  assert.deepEqual(timing(witness.runA, 'roof'), [19, 22, 3]);
  assert.deepEqual(timing(witness.runA, 'walls'), [22, 26, 4]);
  assert.deepEqual(timing(witness.runB, 'roof'), [23, 26, 3]);
  assert.deepEqual(timing(witness.runB, 'walls'), [19, 23, 4]);
  assert.deepEqual(plain(witness.runA.schedule.slice(0, 7)), plain(witness.runB.schedule.slice(0, 7)));
  assert.equal(witness.planA.wbsText.split('\n')[1], witness.planB.wbsText.split('\n')[1]);
  assert.equal(witness.samePlan, false);
  assert.notDeepEqual(plain(witness.planA), plain(witness.planB));
});

test('later task fields and execution settings are all part of the projection', () => {
  const settings = baseline();
  const witness = runWitness(settings);
  const original = plain(witness.planA);
  // These are adversarial projection inputs, not claims of valid new executions.
  for (const [field, value] of Object.entries({ id: 'different-result', label: 'Different result', start: 37, end: 38, duration: 2 })) {
    const changed = clone(witness.runA);
    changed.schedule.at(-1)[field] = value;
    assert.notDeepEqual(plain(api.projectWitnessPlan(changed, settings)), original, `The complete projection must retain task ${field}.`);
  }
  const changedMakespan = { ...clone(witness.runA), makespan: 99 };
  assert.notDeepEqual(plain(api.projectWitnessPlan(changedMakespan, settings)), original);
  for (const [field, value] of Object.entries({ crewTokens: 2, toolsTokens: 2, liftTokens: 2, policy: 'roofFirst' })) {
    assert.notDeepEqual(plain(api.projectWitnessPlan(witness.runA, { ...settings, [field]: value })), original, `The projection must retain ${field}.`);
  }
});

test('matching unfinished prefixes never become a same-plan witness', () => {
  const settings = { ...baseline(), maxSteps: 1 };
  const witness = runWitness(settings);
  assert.equal(witness.runA.ok, false);
  assert.equal(witness.runB.ok, false);
  assert.deepEqual(plain(witness.runA.schedule), plain(witness.runB.schedule));
  assert.equal(api.projectWitnessPlan(witness.runA, settings), null);
  assert.equal(witness.planA, null);
  assert.equal(witness.planB, null);
  assert.equal(witness.samePlan, false);
  const falselyMarkedComplete = { ...clone(witness.runA), ok: true };
  falselyMarkedComplete.schedule[0].end = null;
  assert.equal(api.projectWitnessPlan(falselyMarkedComplete, settings), null);
});

test('equal deadlocked executions cannot count as an equal completed plan', () => {
  const witness = runWitness({ ...baseline(), crewTokens: 0 });
  assert.equal(witness.runA.ok, false);
  assert.equal(witness.runB.ok, false);
  assert.match(witness.runA.reason, /deadlock/i);
  assert.match(witness.runB.reason, /deadlock/i);
  assert.equal(witness.planA, null);
  assert.equal(witness.planB, null);
  assert.equal(witness.samePlan, false);
});

test('the sequenced process returns its wall token before utilities can run', () => {
  const { sequenced } = api.createWitnessModels(api.net);
  const good = api.simulateTimed(baseline(), sequenced, api.durations);
  assert.equal(good.ok, true);
  assert.equal(task(good, 'utilities').start, task(good, 'roof').end);
  assert.equal(good.marking.complete, 1);
  const broken = clone(sequenced);
  delete broken.transitions.find(t => t.id === 'roof').post.wallsDone;
  const deadlock = api.simulateTimed(baseline(), broken, api.durations);
  assert.equal(deadlock.ok, false);
  assert.match(deadlock.reason, /deadlock/i);
  assert.equal(deadlock.schedule.some(t => t.id === 'utilities'), false);
  assert.equal(api.projectWitnessPlan(deadlock, baseline()), null);
});

test('model-specific enabling and completion are independent of the global net', () => {
  const { independent, sequenced } = api.createWitnessModels(api.net);
  const ready = { roofReady: 1, mRoof: 1, crew: 1, tools: 1, lift: 1 };
  assert.equal(api.enabledTransitions(ready, independent).some(t => t.id === 'roof'), true);
  assert.equal(api.enabledTransitions(ready, sequenced).some(t => t.id === 'roof'), false);
  ready.wallsDone = 1;
  assert.equal(api.enabledTransitions(ready, sequenced).some(t => t.id === 'roof'), true);
  const renamed = clone(independent);
  renamed.transitions.find(t => t.id === 'walls').id = 'customWalls';
  const customDurations = { ...plain(api.durations), customWalls: 4 };
  assert.ok(api.policyOrder('custom', renamed).includes('customWalls'));
  const run = api.simulateTimed({ ...baseline(), policy: 'custom' }, renamed, customDurations);
  assert.equal(run.ok, true);
  assert.equal(run.marking.complete, 1);
  assert.equal(task(run, 'customWalls').end, 23);
  const unauthorised = clone(independent);
  unauthorised.places.find(p => p.id === 'authorized').initial = 0;
  const blocked = api.simulateTimed(baseline(), unauthorised, api.durations);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.schedule.length, 0);
});

test('model, execution and projection mutations cannot leak between runs', () => {
  const sourceBefore = JSON.stringify(api.net);
  const durationBefore = JSON.stringify(api.durations);
  const settings = baseline();
  const first = runWitness(settings);
  const baselinePlan = JSON.stringify(first.planB);
  const modelB = JSON.stringify(first.models.sequenced);
  first.models.independent.transitions.find(t => t.id === 'roof').pre.crew = 99;
  first.models.independent.places[0].initial = 99;
  first.runA.schedule.at(-1).label = 'Changed after generation';
  settings.crewTokens = 99;
  assert.equal(JSON.stringify(first.models.sequenced), modelB);
  assert.equal(JSON.stringify(first.planB), baselinePlan);
  assert.equal(JSON.stringify(api.net), sourceBefore);
  assert.equal(JSON.stringify(api.durations), durationBefore);
  const second = runWitness();
  assert.equal(second.samePlan, true);
  assert.equal(JSON.stringify(second.planA), baselinePlan);
  assert.equal(task(second.runA, 'open').label, 'Open Refuge');
});
