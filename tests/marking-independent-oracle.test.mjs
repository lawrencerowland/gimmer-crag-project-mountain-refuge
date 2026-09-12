import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse, checkJointStart, verifySchedule, validate} from '../apps/marking-plan-lab/engine.mjs';
import {SCENARIOS} from '../apps/marking-plan-lab/scenarios.mjs';

const p = (id, initial=0, kind='condition') => ({id,label:id,initial,kind});
const t = (id, inputs, outputs, duration=1) => ({id,label:id,inputs,outputs,duration,maxFirings:1});
const model = (places,transitions,goal) => ({id:'independent-oracle',title:'Independent oracle',places,transitions,goal});
const sum = xs => xs.reduce((a,b)=>a+b,0);
const key = xs => [...xs].sort().join('|');
const goal = (m,s) => Object.entries(m.goal).every(([p,n])=>(s[p]||0)>=n);
const enabled = (t,s) => Object.entries(t.inputs).every(([p,n])=>(s[p]||0)>=n);
const initial = m => Object.fromEntries(m.places.map(p=>[p.id,p.initial]));
function fire(ts,s) {
  const next={...s};
  for(const t of ts) for(const [p,n] of Object.entries(t.inputs)) next[p]-=n;
  for(const t of ts) for(const [p,n] of Object.entries(t.outputs)) next[p]+=n;
  return next;
}
function demand(ts) {
  const d={};
  for(const t of ts) for(const [p,n] of Object.entries(t.inputs)) d[p]=(d[p]||0)+n;
  return d;
}
function subsets(xs) {
  return Array.from({length:2**xs.length-1},(_,i)=>xs.filter((_,j)=>(i+1)&(1<<j)));
}
// Deliberately independent of production marking keys, closure, search and step code.
function countOracle(m) {
  const states=new Map(),steps=new Set(),traces=[];
  function visit(s,done) {
    const k=key(done);
    if(states.has(k)) {assert.deepEqual(states.get(k).s,s);return;}
    const remaining=m.transitions.filter(t=>!done.includes(t.id));
    states.set(k,{s,done:[...done],enabled:remaining.filter(t=>enabled(t,s)).map(t=>t.id)});
    for(const ts of subsets(remaining)) {
      if(!Object.entries(demand(ts)).every(([p,n])=>(s[p]||0)>=n)) continue;
      const nextDone=done.concat(ts.map(t=>t.id));
      steps.add(k+'>'+key(ts.map(t=>t.id))+'>'+key(nextDone));
      visit(fire(ts,s),nextDone);
    }
  }
  function trace(s,done) {
    if(goal(m,s)) {traces.push(done);return;}
    for(const t of m.transitions) if(!done.includes(t.id)&&enabled(t,s))
      trace(fire([t],s),done.concat(t.id));
  }
  visit(initial(m),[]); trace(initial(m),[]);
  return {states,steps,traces};
}
function choose(xs,n) {
  if(n===0) return [[]];
  if(n>xs.length) return [];
  return xs.flatMap((x,i)=>choose(xs.slice(i+1),n-1).map(ys=>[x,...ys]));
}
function allocationKey(xs) {
  return xs.map(a=>JSON.stringify([a.eventId,a.place,a.producer,a.count])).sort().join(';');
}
// Explicit token labels are enumerated first; only then is the production-class
// quotient applied. This is structurally different from producer-count search.
function ancestryOracle(m,traces) {
  const result=new Map();
  for(const ids of traces) {
    const tokens=Object.fromEntries(m.places.map(p=>[p.id,Array.from({length:p.initial},(_,i)=>({label:'i/'+p.id+'/'+i,producer:null}))]));
    function visit(index,available,allocations) {
      if(index===ids.length) {result.set(allocationKey(allocations),allocations);return;}
      const tr=m.transitions.find(t=>t.id===ids[index]),eventId=tr.id+'#1';
      const places=Object.keys(tr.inputs).filter(p=>tr.inputs[p]>0);
      function consume(j,pool,added) {
        if(j===places.length) {
          const next=Object.fromEntries(Object.entries(pool).map(([p,xs])=>[p,[...xs]]));
          for(const [place,n] of Object.entries(tr.outputs)) for(let i=0;i<n;i++)
            next[place].push({label:eventId+'/'+place+'/'+i,producer:eventId});
          visit(index+1,next,allocations.concat(added)); return;
        }
        const place=places[j],n=tr.inputs[place];
        for(const selection of choose(pool[place],n)) {
          const labels=new Set(selection.map(x=>x.label));
          const groups=new Map();
          for(const token of selection) groups.set(token.producer,(groups.get(token.producer)||0)+1);
          consume(j+1,{...pool,[place]:pool[place].filter(x=>!labels.has(x.label))},
            added.concat([...groups].map(([producer,count])=>({eventId,place,producer,count}))));
        }
      }
      consume(0,available,[]);
    }
    visit(0,tokens,[]);
  }
  return result;
}
function expectedTiming(m,plan) {
  const durations=new Map(m.transitions.map(t=>[t.id+'#1',t.duration])),ends=new Map();
  const predecessors=id=>plan.allocations.filter(a=>a.eventId===id&&a.producer!==null&&a.count>0).map(a=>a.producer);
  function end(id) {
    if(ends.has(id)) return ends.get(id);
    const value=Math.max(0,...predecessors(id).map(end))+durations.get(id);
    ends.set(id,value);return value;
  }
  return plan.events.map(e=>({id:e.id,start:end(e.id)-durations.get(e.id),end:end(e.id)}));
}
function replayIndependent(m,plan) {
  let marking=initial(m);
  const ids=new Set(),times=[...new Set(plan.schedule.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
  for(const s of plan.schedule) {
    assert(!ids.has(s.id));ids.add(s.id);
    const e=plan.events.find(e=>e.id===s.id),tr=m.transitions.find(t=>t.id===e.transitionId);
    assert.equal(s.end,s.start+tr.duration); assert(s.start>=0);
  }
  assert.equal(ids.size,plan.events.length);
  for(const time of times) {
    const ends=plan.schedule.filter(s=>s.end===time).map(s=>m.transitions.find(t=>t.id===plan.events.find(e=>e.id===s.id).transitionId));
    for(const tr of ends) for(const [p,n] of Object.entries(tr.outputs)) marking[p]+=n;
    const starts=plan.schedule.filter(s=>s.start===time).map(s=>m.transitions.find(t=>t.id===plan.events.find(e=>e.id===s.id).transitionId));
    for(const [p,n] of Object.entries(demand(starts))) {assert(marking[p]>=n,'aggregate start demand');marking[p]-=n;}
  }
  assert(goal(m,marking));
  return marking;
}
function checkDiagram(m,plan) {
  const wires=plan.monoidal.wires;
  assert.equal(plan.monoidal.verified.tokenBalance,true);
  assert.equal(plan.monoidal.verified.framePreserved,true);
  assert.equal(plan.monoidal.verified.orderPreserved,true);
  for(const wire of wires) {
    assert(Number.isSafeInteger(wire.count)&&wire.count>0);
    assert(m.places.some(p=>p.id===wire.place));
    assert(['input','event'].includes(wire.from.kind));
    assert(['output','event'].includes(wire.to.kind));
  }
  for(const place of m.places) {
    assert.equal(sum(wires.filter(w=>w.place===place.id&&w.from.kind==='input').map(w=>w.count)),place.initial);
  }
  for(const event of plan.events) {
    const tr=m.transitions.find(t=>t.id===event.transitionId);
    for(const place of m.places) {
      assert.equal(sum(wires.filter(w=>w.place===place.id&&w.to.kind==='event'&&w.to.eventId===event.id).map(w=>w.count)),tr.inputs[place.id]||0);
      assert.equal(sum(wires.filter(w=>w.place===place.id&&w.from.kind==='event'&&w.from.eventId===event.id).map(w=>w.count)),tr.outputs[place.id]||0);
    }
  }
  const final=replayIndependent(m,plan);
  for(const place of m.places)
    assert.equal(sum(wires.filter(w=>w.place===place.id&&w.to.kind==='output').map(w=>w.count)),final[place.id]);
}
function compareSmall(m,{ancestry=true,diagram=true}={}) {
  const copy=JSON.stringify(m),expected=countOracle(m),actual=analyse(m);
  assert.equal(JSON.stringify(m),copy,'pure input');
  assert.equal(actual.ok,true,JSON.stringify(actual.errors));
  assert.equal(actual.complete,true,JSON.stringify(actual.stats));
  const stateById=new Map(actual.states.map(s=>[s.id,s]));
  assert.deepEqual(new Set(actual.states.map(s=>key(s.fired))),new Set(expected.states.keys()));
  for(const state of actual.states) {
    const o=expected.states.get(key(state.fired));
    assert.deepEqual(state.marking,o.s);
    assert.deepEqual(new Set(state.enabled),new Set(o.enabled));
    assert.equal(state.goalReached,goal(m,o.s));
    const queue=[key(state.fired)],seen=new Set(queue);
    while(queue.length) {
      const from=queue.shift();
      for(const edge of expected.steps) {
        const [a,,b]=edge.split('>');
        if(a===from&&!seen.has(b)){seen.add(b);queue.push(b);}
      }
    }
    assert.equal(state.canReachGoal,[...seen].some(k=>goal(m,expected.states.get(k).s)));
  }
  assert.deepEqual(new Set(actual.steps.map(s=>key(stateById.get(s.from).fired)+'>'+key(s.transitionIds)+'>'+key(stateById.get(s.to).fired))),expected.steps);
  assert.deepEqual(new Set(actual.traces.map(t=>t.transitionIds.join(','))),new Set(expected.traces.map(t=>t.join(','))));
  assert.deepEqual(new Set(actual.scopes.map(s=>key(s.transitionIds))),new Set(expected.traces.map(key)));
  if(ancestry) assert.deepEqual(new Set(actual.plans.map(p=>allocationKey(p.allocations))),new Set(ancestryOracle(m,expected.traces).keys()));
  for(const plan of actual.plans) {
    assert.deepEqual([...plan.schedule].sort((a,b)=>a.id.localeCompare(b.id)),expectedTiming(m,plan).sort((a,b)=>a.id.localeCompare(b.id)));
    assert.equal(plan.makespan,Math.max(0,...plan.schedule.map(s=>s.end)));
    if(diagram) checkDiagram(m,plan);
  }
  assert.equal(actual.summary.goalReachable,expected.traces.length>0);
  return actual;
}

test('exhaustive 648 tiny count nets: states, joint steps, first-goal traces and labelled-token quotient',()=>{
  const signatures=['p','q'].flatMap(input=>[null,'p','q'].map(output=>({inputs:{[input]:1},outputs:output?{[output]:1}:{}})));
  let count=0;
  for(let a=0;a<3;a++) for(let b=0;b<3;b++) for(const one of signatures) for(const two of signatures) for(const g of ['p','q']) {
    compareSmall(model([p('p',a),p('q',b)],[t('A',one.inputs,one.outputs,2),t('B',two.inputs,two.outputs,3)],{[g]:1}));
    count++;
  }
  assert.equal(count,648);
});

test('three jobs sharing one or two reusable units keep all resource ancestries',()=>{
  for(const capacity of [1,2]) {
    const m=model([p('r',capacity,'resource'),p('a',1),p('b',1),p('c',1),p('done')],
      [t('A',{a:1,r:1},{done:1,r:1},2),t('B',{b:1,r:1},{done:1,r:1},3),t('C',{c:1,r:1},{done:1,r:1},5)],{done:3});
    const result=compareSmall(m);
    assert.equal(result.traces.length,6);
    const start=checkJointStart(m,initial(m),[],['A','B']);
    assert.equal(start.jointlyEnabled,capacity===2);
    assert.equal(result.summary.fastestFinish,capacity===1?10:5);
  }
});

test('same-producer multiplicity is quotiented but different producer counts survive',()=>{
  const m=model([p('x',1),p('y',1),p('parts'),p('done')],
    [t('A',{x:1},{parts:2}),t('B',{y:1},{parts:2}),t('C',{parts:2},{done:1})],{done:1});
  const r=compareSmall(m);
  const full=r.plans.filter(p=>p.events.length===3);
  assert.equal(full.length,3);
  assert(new Set(full.map(p=>allocationKey(p.allocations))).size===3);
});

test('first-goal stopping does not erase post-goal states or jointly committed work',()=>{
  const m=model([p('permit',1),p('other',1),p('goal'),p('residue')],
    [t('A',{permit:1},{goal:1},1),t('B',{other:1},{residue:1},5)],{goal:1});
  const r=compareSmall(m);
  assert.deepEqual(new Set(r.traces.map(t=>t.transitionIds.join(','))),new Set(['A','B,A']));
  assert(r.steps.some(s=>key(s.transitionIds)==='A|B'));
  assert(r.states.some(s=>key(s.fired)==='A|B'));
});

test('identity plan carries untouched frame resources and a covered goal',()=>{
  const m=model([p('goal',1),p('frame',3,'resource')],[t('A',{frame:1},{frame:1},2)],{goal:1});
  const r=compareSmall(m);
  assert.equal(r.plans.length,1);assert.equal(r.plans[0].events.length,0);
  assert.equal(r.plans[0].makespan,0);
  assert.equal(r.states.length,2);
});

test('timed certificate rejects individually enabled shared starts and missing events',()=>{
  const m=model([p('r',1,'resource'),p('a',1),p('b',1),p('done')],
    [t('A',{a:1,r:1},{r:1,done:1},2),t('B',{b:1,r:1},{r:1,done:1},3)],{done:2});
  const r=compareSmall(m),plan=r.plans[0];
  const bad=plan.schedule.map(s=>({...s,start:0,end:m.transitions.find(t=>t.id===plan.events.find(e=>e.id===s.id).transitionId).duration}));
  assert.equal(verifySchedule(m,plan.events,bad).ok,false);
  assert.equal(verifySchedule(m,plan.events,plan.schedule.slice(1)).ok,false);
});

test('once-only contract rejects maxFirings 2 rather than silently claiming repeated-work support',()=>{
  const m=model([p('raw',2),p('done')],[{...t('A',{raw:1},{done:1}),maxFirings:2}],{done:2});
  assert.equal(validate(m).ok,false);
});

test('exhaustive 1728 three-transition systems with noninitial two-token goals',()=>{
  const signatures=['p','q'].flatMap(input=>[null,'p','q'].map(output=>({inputs:{[input]:1},outputs:output?{[output]:1}:{}})));
  let count=0;
  for(let a=0;a<2;a++) for(let b=0;b<2;b++) for(const one of signatures) for(const two of signatures) for(const three of signatures) for(const g of ['p','q']) {
    compareSmall(model([p('p',a),p('q',b)],[t('A',one.inputs,one.outputs,2),t('B',two.inputs,two.outputs,3),t('C',three.inputs,three.outputs,4)],{[g]:2}));
    count++;
  }
  assert.equal(count,1728);
});

test('all supplied admissible scenarios agree with independent complete count and ancestry search',()=>{
  for(const scenario of SCENARIOS) {
    if(scenario.id==='invalid-marking') {assert.equal(analyse(scenario.model).ok,false);continue;}
    const result=compareSmall(scenario.model);
    if(scenario.id==='selective-n') {
      assert(result.plans.every(p=>!p.exactTree&&p.obstruction));
      assert(result.plans.every(p=>p.monoidal.verified.compiled));
    }
  }
});

test('large counted frame remains exact while individual term expansion is unavailable',()=>{
  const m=model([p('r',80,'resource'),p('done')],[t('A',{r:1},{r:1,done:1})],{done:1});
  const r=compareSmall(m,{ancestry:false});
  assert.equal(r.plans.length,1);
  assert.equal(r.plans[0].monoidal.term,null);
  assert.equal(r.plans[0].monoidal.verified.compiled,false);
  assert(r.plans[0].monoidal.reason.includes('64'));
});

test('caps preserve witnessed reachability but withhold complete extrema and universal scope claims',()=>{
  const m=model([p('choice',1),p('done')],[t('A',{choice:1},{done:1},2),t('B',{choice:1},{done:1},3)],{done:1});
  const complete=analyse(m);
  assert.equal(complete.complete,true);
  const two=analyse(m,{maxTraces:2,maxPlans:2,maxFamilies:2,maxStates:3,maxSteps:2,maxTraceNodes:3});
  assert.equal(two.complete,true,'exactly at each finite total is complete');
  for(const name of ['maxTraces','maxPlans','maxFamilies','maxStates','maxSteps','maxTraceNodes','maxAncestryStates','maxTraceCharacters','maxContractCharacters','maxPlanCharacters','maxPlanTraceLinks']) {
    const r=analyse(m,{[name]:1});
    assert.equal(r.ok,true,name+': '+JSON.stringify(r.errors));
    assert.equal(r.complete,false,name);
    assert.equal(r.summary.fastestFinish,null,name);
    assert(r.stats.reachedLimits.length>0,name);
    if(r.traces.length) assert.equal(r.summary.goalReachable,true,name);
    for(const plan of r.plans) replayIndependent(m,plan);
  }
});

test('same timestamp permits returned tokens only after completion, with all chosen work finished',()=>{
  const m=model([p('r',1,'resource'),p('a',1),p('b',1),p('done')],
    [t('A',{a:1,r:1},{r:1,done:1},2),t('B',{b:1,r:1},{r:1,done:1},3)],{done:2});
  const r=analyse(m),plan=r.plans.find(p=>p.schedule.find(s=>s.id==='A#1').start===0);
  assert.equal(verifySchedule(m,plan.events,[{id:'A#1',start:0,end:2},{id:'B#1',start:2,end:5}]).ok,true);
  assert.equal(verifySchedule(m,plan.events,[{id:'A#1',start:0,end:2},{id:'B#1',start:1.5,end:4.5}]).ok,false);
});

test('malformed timed event and schedule entries return errors rather than throwing',()=>{
  const m=SCENARIOS[0].model;
  for(const [events,schedule] of [[[null],[]],[[],[null]],[[{id:'A',transitionId:'survey'}],[null]],[[3],[]],[[],[3]]]) {
    let result;assert.doesNotThrow(()=>{result=verifySchedule(m,events,schedule);});
    assert.equal(result.ok,false);assert(result.errors.length>0);
  }
});
