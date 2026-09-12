import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse, validate, replayTrace, certifyTrace, verifySchedule} from '../apps/feedback-plan-lab/engine.mjs';
import {SCENARIOS} from '../apps/feedback-plan-lab/scenarios.mjs';

// Independent oracle: an explicit transition table, not the production Petri
// state builder. Enumerate complete observed-state policies first, then unfold
// every environment outcome under each policy. A single decision is shared by
// all histories at the same (observed state, remaining horizon).
const p = (id, initial=0, kind='condition') => ({id,label:id,initial,kind});
const t = (id,owner,inputs,outputs,duration=1) => ({id,label:id,owner,inputs,outputs,duration});
function encode(graph, {frame=0}={}) {
  return {
    id:'independent-feedback',title:'Independent explicit transition system',
    places:graph.states.map(id=>p(id,id===graph.initial?1:0)).concat(frame?[p('untouched',frame,'resource')]:[]),
    transitions:graph.edges.map(e=>t(e.id,graph.owners[e.from],{[e.from]:1},{[e.to]:1},e.duration??1)),
    goal:{[graph.goal]:1},
  };
}
const nodeKey = (state,remaining) => JSON.stringify([state,remaining]);
function policyEnumeration(graph,horizon) {
  const outgoing=s=>graph.edges.filter(e=>e.from===s);
  const nodes=new Map();
  function discover(s,r) {
    const k=nodeKey(s,r);
    if(nodes.has(k))return;
    nodes.set(k,{s,r});
    if(s===graph.goal||r===0)return;
    for(const e of outgoing(s))discover(e.to,r-1);
  }
  discover(graph.initial,horizon);
  const choices=[...nodes].filter(([,n])=>n.r>0&&n.s!==graph.goal&&graph.owners[n.s]==='planner'&&outgoing(n.s).length)
    .map(([k,n])=>({k,edges:outgoing(n.s)}));
  const policies=[];
  function enumerate(i,policy) {
    if(i===choices.length){policies.push(new Map(policy));return;}
    const {k,edges}=choices[i];
    for(const e of edges){policy.set(k,e.id);enumerate(i+1,policy);}
    policy.delete(k);
  }
  enumerate(0,new Map());
  assert(policies.length<=65536,'oracle fixture must stay exhaustively small');
  let possible=false;
  function anyPath(s,r) {
    if(s===graph.goal)return true;
    return r>0&&outgoing(s).some(e=>anyPath(e.to,r-1));
  }
  possible=anyPath(graph.initial,horizon);
  const winning=[],successfulPaths=[];
  for(const policy of policies) {
    const leaves=[];
    function unfold(s,r,duration,trace) {
      if(s===graph.goal){leaves.push({goal:true,duration,trace});return;}
      const available=outgoing(s);
      if(r===0||available.length===0){leaves.push({goal:false,duration,trace});return;}
      const selected=graph.owners[s]==='environment'?available:available.filter(e=>e.id===policy.get(nodeKey(s,r)));
      assert(selected.length>0,'complete policy at each nonterminal planner state');
      for(const e of selected)unfold(e.to,r-1,duration+(e.duration??1),trace.concat(e.id));
    }
    unfold(graph.initial,horizon,0,[]);
    if(leaves.every(l=>l.goal))winning.push({policy,worst:Math.max(...leaves.map(l=>l.duration)),leaves});
    successfulPaths.push(...leaves.filter(l=>l.goal).map(l=>l.trace));
  }
  return {
    possible,guaranteed:winning.length>0,
    worstDuration:winning.length?Math.min(...winning.map(w=>w.worst)):null,
    winningChoices:[...new Set(winning.map(w=>w.policy.get(nodeKey(graph.initial,horizon))).filter(Boolean))].sort(),
    policiesExamined:policies.length,winning,successfulPaths,nodes,
  };
}
function inspectReturnedPolicy(graph,horizon,actual) {
  const lookup=new Map(actual.states.map(s=>{
    const selected=graph.states.filter(id=>s.marking[id]===1);
    assert.equal(selected.length,1,'one-hot encoding retained');
    return [nodeKey(selected[0],s.remaining),s];
  }));
  const byId=new Map(actual.states.map(s=>[s.id,s]));
  const decisions=new Map();
  for(const d of actual.policy.decisions) {
    assert(!decisions.has(d.stateId),'one choice per observed state, not one per future');
    assert(byId.has(d.stateId));
    decisions.set(d.stateId,d.transitionId);
  }
  const outcomes=[];
  function walk(s,r,elapsed,trace) {
    if(s===graph.goal){outcomes.push({trace,duration:elapsed});return;}
    assert(r>0,'returned policy may not run out of horizon');
    const node=lookup.get(nodeKey(s,r));assert(node,'every reached policy state exists');
    const available=graph.edges.filter(e=>e.from===s);
    assert(available.length>0,'returned policy may not deadlock');
    const selected=graph.owners[s]==='environment'?available:available.filter(e=>e.id===decisions.get(node.id));
    assert(selected.length>0,'returned policy supplies an enabled action');
    for(const e of selected)walk(e.to,r-1,elapsed+(e.duration??1),trace.concat(e.id));
  }
  walk(graph.initial,horizon,0,[]);
  assert(outcomes.length>0);
  assert.equal(Math.max(...outcomes.map(o=>o.duration)),actual.summary.worstDuration);
  return outcomes;
}
function compare(graph,horizon,options={}) {
  const model=encode(graph,options),input=JSON.stringify(model);
  const expected=policyEnumeration(graph,horizon),actual=analyse(model,{horizon});
  assert.equal(JSON.stringify(model),input,'analysis must not mutate input');
  assert.equal(actual.ok,true,JSON.stringify(actual.errors));
  assert.equal(actual.complete,true,JSON.stringify(actual.stats));
  assert.equal(actual.summary.possible,expected.possible,'exists a successful outcome path');
  assert.equal(actual.summary.guaranteed,expected.guaranteed,'exists one shared policy for every environment outcome');
  assert.equal(actual.summary.worstDuration,expected.worstDuration,'min-policy maximum-outcome total duration');
  assert.deepEqual([...actual.summary.winningChoices].sort(),expected.winningChoices,'all winning actions, not just the fastest');
  assert.equal(actual.states.length,expected.nodes.size,'every reachable horizon-state retained');
  for(const state of actual.states) {
    const abstractState=graph.states.find(id=>state.marking[id]===1);
    assert(expected.nodes.has(nodeKey(abstractState,state.remaining)));
    const local=policyEnumeration({...graph,initial:abstractState},state.remaining);
    assert.equal(state.possible,local.possible);
    assert.equal(state.guaranteed,local.guaranteed);
    assert.equal(state.worstDuration,local.worstDuration);
    assert.deepEqual([...state.winningChoices].sort(),local.winningChoices);
  }
  if(expected.guaranteed)inspectReturnedPolicy(graph,horizon,actual);
  return {model,expected,actual};
}
const chance={states:['review','done','reject'],initial:'review',goal:'done',owners:{review:'environment'},edges:[
  {id:'pass',from:'review',to:'done',duration:2},
  {id:'fail',from:'review',to:'reject',duration:3},
]};
const retry={states:['review','done'],initial:'review',goal:'done',owners:{review:'environment'},edges:[
  {id:'pass',from:'review',to:'done'},
  {id:'again',from:'review',to:'review'},
]};

test('independent policy enumeration: a possible pass does not guarantee success',()=>{
  const {expected}=compare(chance,3);
  assert.equal(expected.possible,true);
  assert.equal(expected.guaranteed,false);
});

test('independent policy enumeration never censors repeated unfavourable outcomes',()=>{
  for(let h=1;h<=8;h++) {
    const {expected}=compare(retry,h);
    assert.equal(expected.possible,true);
    assert.equal(expected.guaranteed,false,'no finite guarantee from fairness or possible eventual pass');
  }
});

test('independent exhaustive 2-state games compare all 81 edge topologies at four horizons',()=>{
  // Four independently chosen targets, including cycles, dead ends and direct
  // goals. This generates both OR-before-AND and AND-before-OR reachable shapes.
  const states=['a','b','goal'];
  let systems=0,policyCount=0;
  for(let code=0;code<81;code++) {
    let x=code;const targets=[];
    for(let i=0;i<4;i++){targets.push(states[x%3]);x=Math.floor(x/3);}
    const graph={states,initial:code%2?'a':'b',goal:'goal',owners:{a:'planner',b:'environment'},edges:
      targets.map((to,i)=>({id:'e'+i,from:i<2?'a':'b',to,duration:i+1}))};
    for(let h=1;h<=4;h++)policyCount+=compare(graph,h).expected.policiesExamined;
    systems++;
  }
  assert.equal(systems,81);
  assert(policyCount>systems*4,'multiple whole policies were actually enumerated');
});

test('a planner can trade a lucky fast route for a slower guaranteed route',()=>{
  const graph={states:['choose','review','done','reject'],initial:'choose',goal:'done',owners:{choose:'planner',review:'environment'},edges:[
    {id:'fast',from:'choose',to:'review',duration:1},
    {id:'safe',from:'choose',to:'done',duration:9},
    {id:'pass',from:'review',to:'done',duration:1},
    {id:'fail',from:'review',to:'reject',duration:1},
  ]};
  const {expected}=compare(graph,3);
  assert.deepEqual(expected.winningChoices,['safe']);
  assert.equal(expected.worstDuration,9);
});

test('a single policy reacts to observed outcomes and takes the worst branch duration',()=>{
  const graph={states:['review','minor','major','done'],initial:'review',goal:'done',owners:{review:'environment',minor:'planner',major:'planner'},edges:[
    {id:'minor-outcome',from:'review',to:'minor',duration:1},
    {id:'major-outcome',from:'review',to:'major',duration:1},
    {id:'repair-minor',from:'minor',to:'done',duration:2},
    {id:'repair-major',from:'major',to:'done',duration:5},
  ]};
  const short=compare(graph,1).expected,long=compare(graph,2).expected;
  assert.equal(short.guaranteed,false);
  assert.equal(long.guaranteed,true);
  assert.equal(long.worstDuration,6);
});

test('untouched identity resource does not change any policy quantifier or duration',()=>{
  const graph={states:['choose','done'],initial:'choose',goal:'done',owners:{choose:'planner'},edges:[{id:'finish',from:'choose',to:'done',duration:4}]};
  const bare=compare(graph,1),framed=compare(graph,1,{frame:7});
  assert.deepEqual(framed.actual.summary,bare.actual.summary);
});

test('positive goal and ownership validation reject ambiguous or vacuous mechanisms',()=>{
  const mixed=encode(chance);mixed.transitions[0].owner='planner';
  assert.equal(analyse(mixed,{horizon:2}).ok,false,'mixed ownership at reachable marking');
  for(const goal of [{},{done:0},{done:-1}]) {
    const model=encode(chance);model.goal=goal;
    assert.equal(validate(model).ok,false,'goal must require positive coverage');
  }
  const badOwner=encode(chance);badOwner.transitions[0].owner='reviewer';
  assert.equal(validate(badOwner).ok,false);
});

test('mathematical horizon cutoff is distinct from an incomplete computational budget',()=>{
  const graph={states:['a','b','goal'],initial:'a',goal:'goal',owners:{a:'planner',b:'environment'},edges:[
    {id:'submit',from:'a',to:'b'}, {id:'pass',from:'b',to:'goal'},
  ]};
  const model=encode(graph),short=analyse(model,{horizon:1});
  assert.equal(short.ok,true);assert.equal(short.complete,true);
  assert.equal(short.summary.guaranteed,false);assert.equal(short.summary.possible,false);
  const bounded=analyse(model,{horizon:3,maxStates:1});
  assert.equal(bounded.ok,true);assert.equal(bounded.complete,false);
  assert.equal(bounded.summary.guaranteed,null,'budget exhaustion is not mathematical failure');
  assert.equal(bounded.summary.possible,null,'unexplored completion is unknown');
});

test('every computational cap suppresses a universal guarantee and any policy cost',()=>{
  const model=encode(chance);
  for(const limits of [{maxStates:1},{maxEdges:1},{maxPaths:1},{maxPathNodes:1},{maxCharacters:1}]) {
    const actual=analyse(model,{horizon:3,...limits});
    assert.equal(actual.ok,true,JSON.stringify(actual.errors));
    assert.equal(actual.complete,false,JSON.stringify(limits));
    assert.equal(actual.summary.guaranteed,null);
    assert.equal(actual.summary.worstDuration,null);
    assert.equal(actual.summary.winningChoices,null);
  }
});

test('independent policy replay rejects a tempting action that abandons a world branch',()=>{
  const graph={states:['choose','review','done','reject'],initial:'choose',goal:'done',owners:{choose:'planner',review:'environment'},edges:[
    {id:'lucky',from:'choose',to:'review'},
    {id:'safe',from:'choose',to:'done',duration:6},
    {id:'pass',from:'review',to:'done'},
    {id:'fail',from:'review',to:'reject'},
  ]};
  const {actual}=compare(graph,3),broken=structuredClone(actual);
  broken.policy.decisions.find(d=>d.stateId===broken.initialStateId).transitionId='lucky';
  assert.throws(()=>inspectReturnedPolicy(graph,3,broken),/deadlock/);
});

function independentTrace(model,trace) {
  let marking=Object.fromEntries(model.places.map(p=>[p.id,p.initial]));
  const markings=[{...marking}],events=[],counts=new Map();
  for(const id of trace) {
    assert(!Object.entries(model.goal).every(([p,n])=>marking[p]>=n),'first goal stops execution');
    const transition=model.transitions.find(t=>t.id===id);assert(transition,'known transition');
    assert(Object.entries(transition.inputs).every(([p,n])=>marking[p]>=n),'enabling');
    for(const [p,n] of Object.entries(transition.inputs))marking[p]-=n;
    for(const [p,n] of Object.entries(transition.outputs))marking[p]+=n;
    counts.set(id,(counts.get(id)||0)+1);
    events.push({id:id+'#'+counts.get(id),transitionId:id,duration:transition.duration});
    markings.push({...marking});
  }
  return {marking,markings,events,goalReached:Object.entries(model.goal).every(([p,n])=>marking[p]>=n)};
}
function inspectCertificate(model,trace,certificate) {
  const direct=independentTrace(model,trace);
  assert(direct.goalReached);
  assert.equal(certificate.ok,true,JSON.stringify(certificate.errors));
  assert.equal(certificate.complete,true);
  assert.deepEqual(certificate.markings,direct.markings);
  assert.deepEqual(certificate.events.map(e=>[e.id,e.transitionId]),direct.events.map(e=>[e.id,e.transitionId]));
  assert(certificate.witnesses.length>0);
  for(const witness of certificate.witnesses) {
    const scheduled=new Map(witness.schedule.map(s=>[s.id,s]));
    assert.equal(scheduled.size,direct.events.length);
    let available=Object.fromEntries(model.places.map(p=>[p.id,p.initial]));
    for(const event of direct.events) {
      const s=scheduled.get(event.id);assert(s);
      assert(s.start>=0);assert.equal(s.end-s.start,event.duration);
    }
    const times=[...new Set(witness.schedule.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
    for(const time of times) {
      const ends=direct.events.filter(e=>scheduled.get(e.id).end===time);
      for(const e of ends)for(const [p,n] of Object.entries(model.transitions.find(t=>t.id===e.transitionId).outputs))available[p]+=n;
      const need={};
      for(const e of direct.events.filter(e=>scheduled.get(e.id).start===time))
        for(const [p,n] of Object.entries(model.transitions.find(t=>t.id===e.transitionId).inputs))need[p]=(need[p]||0)+n;
      for(const [p,n] of Object.entries(need)){assert(available[p]>=n,'aggregate timed demand');available[p]-=n;}
    }
    assert.deepEqual(available,direct.marking);
    const wires=witness.monoidal.wires;
    for(const wire of wires)assert(Number.isSafeInteger(wire.count)&&wire.count>0);
    const count=predicate=>wires.filter(predicate).reduce((n,w)=>n+w.count,0);
    for(const place of model.places) {
      assert.equal(count(w=>w.place===place.id&&w.from.kind==='input'),place.initial);
      assert.equal(count(w=>w.place===place.id&&w.to.kind==='output'),direct.marking[place.id]);
      for(const event of direct.events) {
        const tr=model.transitions.find(t=>t.id===event.transitionId);
        assert.equal(count(w=>w.place===place.id&&w.to.kind==='event'&&w.to.eventId===event.id),tr.inputs[place.id]||0);
        assert.equal(count(w=>w.place===place.id&&w.from.kind==='event'&&w.from.eventId===event.id),tr.outputs[place.id]||0);
      }
    }
    assert.equal(witness.monoidal.verified.compiled,true);
    assert(witness.monoidal.term,'finite typed term emitted');
    assert.equal(verifySchedule(model,certificate.events,witness.schedule).ok,true);
  }
}

test('a repeated review history has fresh occurrences, exact supply counts and a replayable typed schedule',()=>{
  const model=encode(retry,{frame:3});
  model.places.push(p('reviewer',1,'resource'));
  for(const tr of model.transitions){tr.inputs.reviewer=1;tr.outputs.reviewer=1;}
  const trace=['again','again','pass'];
  const replay=replayTrace(model,trace,{horizon:3});
  assert.equal(replay.ok,true);
  assert.deepEqual(replay.events.map(e=>e.id),['again#1','again#2','pass#1']);
  inspectCertificate(model,trace,certifyTrace(model,trace,{horizon:3}));
  assert.equal(replayTrace(model,['again','pass','again'],{horizon:3}).ok,false,'no work after first goal');
  assert.equal(replayTrace(model,trace,{horizon:2}).ok,false,'trace cannot exceed occurrence horizon');
  assert.equal(certifyTrace(model,['again'],{horizon:3}).ok,false,'a prefix is not a completed plan');
});

test('tampered schedule cannot reuse one reviewer token for two simultaneous occurrences',()=>{
  const model=encode(retry);
  model.places.push(p('reviewer',1,'resource'));
  for(const tr of model.transitions){tr.inputs.reviewer=1;tr.outputs.reviewer=1;}
  const certificate=certifyTrace(model,['again','pass'],{horizon:2});
  const forged=certificate.events.map(e=>({id:e.id,start:0,end:e.duration}));
  assert.equal(verifySchedule(model,certificate.events,forged).ok,false);
});

const scenario=id=>structuredClone(SCENARIOS.find(s=>s.id===id).model);
test('refuge minor versus major feedback invalidates exactly the named evidence and retains the survey',()=>{
  const model=scenario('refuge-review');
  const minor=independentTrace(model,['submit','minor']),major=independentTrace(model,['submit','major']);
  assert.equal(minor.marking.analysis_current,1);assert.equal(minor.marking.analysis_stale,0);
  assert.equal(minor.marking.drawing_current,0);assert.equal(minor.marking.drawing_stale,1);
  assert.equal(major.marking.analysis_current,0);assert.equal(major.marking.analysis_stale,1);
  assert.equal(major.marking.drawing_current,0);assert.equal(major.marking.drawing_stale,1);
  for(const outcome of [minor,major]) {
    assert.equal(outcome.marking.site_survey,1);
    assert.equal(outcome.marking.reserve,1);
    assert.equal(outcome.marking.design_team,1);assert.equal(outcome.marking.review_team,1);
    assert.equal(outcome.goalReached,false);
  }
  assert.deepEqual(replayTrace(model,['submit','minor']).marking,minor.marking);
  assert.deepEqual(replayTrace(model,['submit','major']).marking,major.marking);
  assert.equal(replayTrace(model,['submit','major','submit']).ok,false,'stale package cannot be submitted');
  assert.equal(replayTrace(model,['submit','major','accept']).ok,false,'acceptance cannot be fabricated after failure');
  assert.equal(replayTrace(model,['submit','major','draw']).ok,false,'revised drawings require current analysis after major feedback');
  const corrected=['submit','major','analyse','draw','submit','accept'];
  assert.equal(independentTrace(model,corrected).goalReached,true);
  assert.equal(replayTrace(model,corrected).ok,true);
});

test('old approval is historical context and cannot satisfy the current-evidence goal',()=>{
  const model=scenario('refuge-stale'),empty=independentTrace(model,[]);
  assert.equal(empty.marking.archived_approval,1);assert.equal(empty.goalReached,false);
  assert.equal(replayTrace(model,[]).goalReached,false);
  assert.equal(certifyTrace(model,[]).ok,false);
  const recovered=independentTrace(model,['specialist_full']);
  assert.equal(recovered.goalReached,true);assert.equal(recovered.marking.archived_approval,1);
  assert.equal(recovered.marking.reserve,0);assert.equal(recovered.marking.reserve_used,1);
  inspectCertificate(model,['specialist_full'],certifyTrace(model,['specialist_full']));
});

test('two drawing corrections remain distinct in a completed eight-occurrence evidence witness',()=>{
  const model=scenario('refuge-review'),trace=['submit','minor','draw','submit','minor','draw','submit','accept'];
  const certificate=certifyTrace(model,trace,{horizon:8});
  inspectCertificate(model,trace,certificate);
  assert.deepEqual(certificate.events.filter(e=>e.transitionId==='draw').map(e=>e.id),['draw#1','draw#2']);
  for(const marking of certificate.markings)assert.equal(marking.site_survey,1);
  for(const witness of certificate.witnesses) {
    const source=witness.allocations.find(a=>a.eventId==='submit#3'&&a.place==='drawing_current');
    assert.equal(source.producer,'draw#2','latest submission uses the revised drawing, not the earlier one');
  }
});

test('reserved fallback and review timing assumptions change guarantees for the stated reasons',()=>{
  const withReserve=analyse(scenario('refuge-review'),{horizon:8});
  const without=analyse(scenario('refuge-no-reserve'),{horizon:8});
  assert.equal(withReserve.complete,true);assert.equal(withReserve.summary.guaranteed,true);
  assert.equal(withReserve.summary.worstDuration,8);
  assert.equal(without.complete,true);assert.equal(without.summary.possible,true);assert.equal(without.summary.guaranteed,false);
  const before=analyse(scenario('commit-before-permit'),{horizon:4});
  const after=analyse(scenario('observe-before-commit'),{horizon:4});
  assert.equal(before.summary.possible,true);assert.equal(before.summary.guaranteed,false);
  assert.equal(after.summary.guaranteed,true);assert.equal(after.summary.worstDuration,6);
});

test('the same minor-review outcome requires extra work only under the declared blanket-reset rule',()=>{
  const selective=scenario('refuge-review'),blanket=scenario('refuge-blanket');
  const selectiveTrace=['submit','minor','draw','submit','accept'];
  const blanketTrace=['submit','minor','analyse','draw','submit','accept'];
  const a=independentTrace(selective,selectiveTrace),b=independentTrace(blanket,blanketTrace);
  assert(a.goalReached&&b.goalReached);
  assert.equal(a.events.reduce((sum,e)=>sum+e.duration,0),6);
  assert.equal(b.events.reduce((sum,e)=>sum+e.duration,0),9);
  assert.equal(a.markings[2].analysis_current,1);
  assert.equal(b.markings[2].analysis_current,0);
  assert.equal(b.events.filter(e=>e.transitionId==='analyse').length,1);
  assert.equal(replayTrace(blanket,selectiveTrace,{horizon:8}).ok,false,'blanket reset really prevents reuse of old analysis');
  const ca=certifyTrace(selective,selectiveTrace,{horizon:8}),cb=certifyTrace(blanket,blanketTrace,{horizon:8});
  inspectCertificate(selective,selectiveTrace,ca);inspectCertificate(blanket,blanketTrace,cb);
  assert(ca.witnesses.every(w=>w.makespan===6));
  assert(cb.witnesses.every(w=>w.makespan===9));
});
