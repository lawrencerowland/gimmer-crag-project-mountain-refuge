import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,validate,checkJointStart,verifySchedule,compareModels,LIMITS} from '../apps/marking-plan-lab/engine.mjs';
import {SCENARIOS} from '../apps/marking-plan-lab/scenarios.mjs';
import {compileTerm} from '../apps/process-contract-lab/composition.mjs';
import {replay} from '../apps/causal-plan-lab/core.mjs';

const fixture=id=>structuredClone(SCENARIOS.find(s=>s.id===id));
const words=traces=>new Set(traces.map(t=>JSON.stringify(t.transitionIds)));
const p=(id,initial=0,kind='condition')=>({id,kind,initial});
const t=(id,inputs,outputs,duration=1)=>({id,inputs,outputs,duration,maxFirings:1});

test('every admissible supplied scenario generates only goal plans with replayed typed witnesses',()=>{
  for(const scenario of SCENARIOS.filter(s=>s.id!=='invalid-marking')){
    const before=JSON.stringify(scenario),r=analyse(scenario.model);
    assert.equal(r.ok,true,`${scenario.id}: ${r.errors}`);assert.equal(r.complete,true);
    assert.equal(JSON.stringify(scenario),before);
    for(const plan of r.plans){
      assert.equal(plan.goalReached,true);assert.equal(plan.timedReplay.ok,true);
      assert.equal(plan.timedReplay.goalReached,true);
      assert.deepEqual(plan.monoidal.boundaryOutputs,plan.timedReplay.finalMarking);
      assert.equal(plan.monoidal.verified.tokenBalance,true);
      assert.equal(plan.monoidal.verified.compiled,true);
      const compiled=compileTerm(plan.monoidal.term);assert.equal(compiled.ok,true);
      assert.equal(replay(compiled.model,plan.events.map(e=>e.id)).goalReached,true);
      const mappedEvents=plan.events.map(e=>({id:e.id+'#1',transitionId:e.id}));
      const mappedSchedule=plan.schedule.map(s=>({...s,id:s.id+'#1'}));
      assert.equal(verifySchedule(compiled.model,mappedEvents,mappedSchedule).ok,true);
      assert.ok(r.scopes.some(scope=>scope.id===plan.scopeId&&scope.planIds.includes(plan.id)));
    }
  }
});

test('one initial mechanism generates mutually exclusive delivery work scopes to the same explicit end',()=>{
  const {model}=fixture('refuge-options'),r=analyse(model);
  assert.deepEqual([r.states.length,r.steps.length,r.traces.length,r.scopes.length,r.plans.length],[14,15,4,2,4]);
  assert.equal(r.summary.fastestFinish,13);
  for(const scope of r.scopes){
    assert.equal(Number(scope.transitionIds.includes('helicopter'))+Number(scope.transitionIds.includes('winch')),1);
    assert.equal(scope.transitionIds.length,6);assert.equal(scope.traceIds.length,2);
    assert.equal(scope.complete,true);
  }
  const winch=r.plans.find(plan=>plan.transitionIds.includes('winch'));
  assert.equal(winch.timedReplay.finalMarking.flightWindow,1);
  assert.ok(winch.monoidal.wires.some(w=>w.place==='flightWindow'&&w.from.kind==='input'&&w.to.kind==='output'&&w.count===1));
  assert.deepEqual(winch.monoidal.goalProjection,{occupied:1});
});

test('two resource tokens preserve serial traces but add collective starts and earlier representatives',()=>{
  const one=fixture('refuge-options'),two=fixture('refuge-two-lifts');
  const a=analyse(one.model),b=analyse(two.model);
  assert.deepEqual(words(a.traces),words(b.traces));
  assert.equal(a.steps.length,15);assert.equal(b.steps.length,17);
  assert.equal(a.plans.length,4);assert.equal(b.plans.length,6);
  assert.equal(a.summary.fastestFinish,13);assert.equal(b.summary.fastestFinish,10);
  const stateA=a.states.find(s=>s.fired.length===2&&s.fired.includes('helicopter'));
  const stateB=b.states.find(s=>s.fired.length===2&&s.fired.includes('helicopter'));
  const first=checkJointStart(one.model,stateA.marking,stateA.fired,['foundations','panels']);
  const second=checkJointStart(two.model,stateB.marking,stateB.fired,['foundations','panels']);
  assert.ok(first.individual.every(x=>x.enabled));assert.equal(first.jointlyEnabled,false);
  assert.equal(first.shortfalls[0].place,'crane');assert.equal(first.shortfalls[0].needed,2);
  assert.equal(second.jointlyEnabled,true);
  assert.equal(compareModels(one.model,two.model).category,'marking');
});

test('changing a prerequisite is classified separately from resource marking and timing changes',()=>{
  const base=fixture('refuge-two-lifts').model,rule=fixture('refuge-foundation-rule').model;
  const comparison=compareModels(base,rule);
  assert.equal(comparison.category,'mechanism');assert.deepEqual(comparison.changes.marking,[]);
  assert.equal(analyse(rule).traces.length,2);assert.equal(analyse(rule).summary.fastestFinish,13);
  const changed=structuredClone(base);changed.transitions[0].duration+=1;
  assert.equal(compareModels(base,changed).category,'timing');
  changed.places.find(p=>p.id==='crane').initial=1;
  assert.equal(compareModels(base,changed).category,'mixed');
  assert.equal(compareModels(base,structuredClone(base)).category,'identical');
});

test('uncompletable and invalid markings remain distinct from a missing method opportunity',()=>{
  const noLift=analyse(fixture('refuge-no-lift').model);
  assert.equal(noLift.ok,true);assert.equal(noLift.complete,true);assert.equal(noLift.summary.goalReachable,false);
  assert.equal(noLift.plans.length,0);assert.equal(noLift.goalGaps.deadEnds.length,2);
  assert.ok(noLift.states.every(s=>s.canReachGoal===false));
  const noFlight=analyse(fixture('refuge-no-flight').model);
  assert.equal(noFlight.summary.goalReachable,true);assert.equal(noFlight.scopes.length,1);
  assert.ok(noFlight.plans.every(plan=>plan.transitionIds.includes('winch')&&!plan.transitionIds.includes('helicopter')));
  const bad=analyse(fixture('invalid-marking').model);
  assert.equal(bad.ok,false);assert.equal(bad.complete,false);assert.equal(bad.plans.length,0);
});

test('the fired subset prevents identical count markings from erasing once-only history',()=>{
  const model={id:'resource-loop',places:[p('tool',1,'resource'),p('done')],transitions:[t('A',{tool:1},{tool:1}),t('B',{tool:1},{tool:1})],goal:{done:1}};
  const r=analyse(model);
  assert.equal(r.complete,true);assert.equal(r.states.length,4);
  assert.equal(new Set(r.states.map(s=>JSON.stringify(s.marking))).size,1);
  assert.equal(new Set(r.states.map(s=>JSON.stringify(s.fired))).size,4);
  assert.equal(r.summary.goalReachable,false);
  assert.ok(r.steps.every(s=>s.transitionIds.length===1));
});

test('whole reachability retains post-goal states and joint commitments absent from first-goal plans',()=>{
  const model={id:'two-goal-producers',places:[p('a',1),p('b',1),p('done')],transitions:[t('A',{a:1},{done:1}),t('B',{b:1},{done:1})],goal:{done:1}};
  const r=analyse(model);
  assert.equal(r.states.length,4);assert.equal(r.traces.length,2);assert.equal(r.scopes.length,2);
  assert.ok(r.traces.every(trace=>trace.transitionIds.length===1));
  const both=r.states.find(s=>s.fired.length===2);
  assert.equal(both.goalReached,true);assert.equal(both.marking.done,2);
  assert.ok(r.steps.some(step=>step.from==='s0'&&step.to===both.id&&step.transitionIds.length===2));
  assert.ok(r.steps.some(step=>r.states.find(s=>s.id===step.from).goalReached));
  assert.ok(!r.scopes.some(scope=>scope.transitionIds.length===2));
});

test('first-goal atomic selection still finishes all retained work in its earliest timed representative',()=>{
  const model={id:'goal-before-all-finish',places:[p('a',1),p('b',1),p('goal')],transitions:[t('A',{a:1},{goal:1},1),t('B',{b:1},{},5)],goal:{goal:1}};
  const r=analyse(model),plan=r.plans.find(x=>x.transitionIds.length===2);
  assert.deepEqual(plan.transitionIds,['B','A']);assert.equal(plan.makespan,5);
  assert.ok(plan.schedule.every(s=>s.start===0));
  const early=plan.timedReplay.checkpoints.find(c=>c.time===1);
  assert.equal(early.markingAfterStarts.goal,1);
  assert.equal(plan.timedReplay.checkpoints.at(-1).time,5);
  assert.equal(plan.timedReplay.goalReached,true);
});

test('all-trace ancestry union preserves OR support and selective N diagrams',()=>{
  const or=analyse(fixture('or-support').model);
  assert.equal(or.traces.length,4);assert.equal(or.plans.length,2);
  assert.deepEqual(or.plans.map(p=>p.makespan).sort(),[5,6]);
  assert.ok(or.plans.every(p=>p.traceIds.length===3));
  const n=analyse(fixture('selective-n').model);
  assert.equal(n.traces.length,5);assert.equal(n.plans.length,1);
  assert.equal(n.plans[0].exactTree,false);assert.equal(n.plans[0].obstruction.induced,true);
  assert.equal(n.plans[0].monoidal.verified.compiled,true);
  assert.equal(n.plans[0].traceIds.length,5);
});

test('large counted frame resources stay exact without claiming individual-port compilation',()=>{
  const model={id:'large-frame',places:[p('done',1),p('frame',80,'resource')],transitions:[],goal:{done:1}};
  const r=analyse(model),plan=r.plans[0];
  assert.equal(r.complete,true);assert.deepEqual(plan.transitionIds,[]);assert.equal(plan.makespan,0);
  assert.equal(plan.monoidal.mode,'counted-typed-token-flow');assert.equal(plan.monoidal.term,null);
  assert.equal(plan.monoidal.verified.compiled,false);assert.equal(r.completeness.representations,true);
  assert.ok(plan.monoidal.wires.some(w=>w.place==='frame'&&w.count===80&&w.from.kind==='input'&&w.to.kind==='output'));
});

test('the eight-transition boundary fully enumerates states, joint steps and all trace orders using one commuting family',()=>{
  const model={id:'eight-independent',places:[],transitions:[],goal:{}};
  for(let i=0;i<8;i++){model.places.push(p('ready'+i,1),p('done'+i));model.transitions.push(t('E'+i,{['ready'+i]:1},{['done'+i]:1},i+1));model.goal['done'+i]=1;}
  const r=analyse(model);
  assert.equal(r.ok,true,r.errors.join(' '));assert.equal(r.complete,true,JSON.stringify(r.stats));
  assert.equal(r.states.length,256);assert.equal(r.steps.length,6305);assert.equal(r.traces.length,40320);
  assert.equal(r.scopes.length,1);assert.equal(r.plans.length,1);assert.equal(r.stats.familiesAnalysed,1);
  assert.equal(r.plans[0].traceIds.length,40320);assert.equal(r.summary.fastestFinish,8);
});

test('bounded searches never promote missing retained results to impossibility or universal completion',()=>{
  const {model}=fixture('refuge-two-lifts');
  for(const limits of [{maxStates:1},{maxSteps:1},{maxTraceNodes:1},{maxTraces:1},{maxTraceCharacters:1},{maxContractCharacters:1},{maxFamilies:1},{maxAncestryStates:1},{maxPlans:1},{maxPlanCharacters:1},{maxPlanTraceLinks:1}]){
    const r=analyse(model,limits);assert.equal(r.ok,true,JSON.stringify(limits)+r.errors.join(' '));
    assert.equal(r.complete,false,JSON.stringify(limits));assert.ok(r.stats.reachedLimits.length>0);
    assert.equal(r.summary.fastestFinish,null);
    assert.ok(r.plans.every(p=>p.goalReached&&p.timedReplay.ok));
    assert.notEqual(r.summary.goalReachable,false);
  }
  const full=analyse(model);
  const exact=analyse(model,{maxStates:full.states.length,maxSteps:full.steps.length,maxTraces:full.traces.length,maxFamilies:full.stats.familiesAnalysed,maxAncestryStates:full.stats.ancestryStates,maxPlans:full.plans.length,maxPlanTraceLinks:full.stats.planTraceLinks,maxPlanCharacters:full.stats.planCharacters});
  assert.equal(exact.complete,true,JSON.stringify(exact.stats));
});

test('joint start rejects unreachable or reused state and preserves oversized exact demand as text',()=>{
  const {model}=fixture('refuge-options'),initial=Object.fromEntries(model.places.map(p=>[p.id,p.initial]));
  assert.equal(checkJointStart(model,initial,[],['missing']).ok,false);
  assert.equal(checkJointStart(model,initial,['survey'],['survey']).ok,false);
  assert.equal(checkJointStart(model,{...initial,occupied:1},[],[]).ok,false);
  assert.equal(checkJointStart(model,{...initial,crane:-1},[],[]).ok,false);
  const huge={id:'large-joint-demand',places:[p('r',Number.MAX_SAFE_INTEGER),p('a'),p('b')],transitions:[t('A',{r:Number.MAX_SAFE_INTEGER},{a:1}),t('B',{r:Number.MAX_SAFE_INTEGER},{b:1})],goal:{a:1}};
  const r=checkJointStart(huge,{r:Number.MAX_SAFE_INTEGER,a:0,b:0},[],['A','B']);
  assert.equal(r.ok,true);assert.equal(r.jointlyEnabled,false);
  assert.equal(r.needed.r,(2n*BigInt(Number.MAX_SAFE_INTEGER)).toString());
});

test('malformed models and timed entries return reviewable failures without usable certificates',()=>{
  const {model}=fixture('refuge-options');
  const bad=structuredClone(model);bad.transitions[0].maxFirings=2;
  assert.equal(validate(bad).ok,false);assert.equal(analyse(bad).ok,false);
  for(const value of [null,[],3,'x'])assert.equal(analyse(value).ok,false);
  assert.equal(analyse(model,{maxPlans:0}).ok,false);
  assert.equal(analyse(model,{maxStates:LIMITS.maxStates+1}).ok,false);
  for(const [events,schedule]of [[[null],[]],[[],[null]],[[{id:'x'}],[]],[[],[{id:3}]]])assert.equal(verifySchedule(model,events,schedule).ok,false);
  const r=analyse(model),plan=r.plans[0];
  const tampered=plan.schedule.map(s=>({...s,start:0,end:model.transitions.find(t=>t.id===plan.events.find(e=>e.id===s.id).transitionId).duration}));
  assert.equal(verifySchedule(model,plan.events,tampered).ok,false);
  assert.equal(verifySchedule(model,plan.events,plan.schedule.slice(1)).ok,false);
});
