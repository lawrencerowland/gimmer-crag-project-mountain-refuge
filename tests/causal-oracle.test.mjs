import test from 'node:test';
import assert from 'node:assert/strict';
import {
  closure, decompose, treeOrder, linearOrders, replay, analyse, generate,
} from '../apps/causal-plan-lab/core.mjs';

// These tests were written independently of the engine implementation. The
// order oracle enumerates transitive relations and tests induced P4s, not the
// production comparability/incomparability decomposition algorithm.
const pairsKey = pairs => pairs.map(([a,b])=>`${a}>${b}`).sort().join('|');
const sortedWords = words => words.map(word=>word.join(',')).sort();
function independentClosure(ids, input) {
  const at = new Map(ids.map((id,i)=>[id,i]));
  const rows = Array(ids.length).fill(0);
  for (const edge of input) {
    const [a,b] = Array.isArray(edge) ? edge : [edge.from,edge.to];
    rows[at.get(a)] |= 1 << at.get(b);
  }
  for (let k=0;k<ids.length;k++) for(let i=0;i<ids.length;i++)
    if(rows[i] & (1<<k)) rows[i] |= rows[k];
  const result=[];
  rows.forEach((row,i)=>ids.forEach((id,j)=>{if(row&(1<<j))result.push([ids[i],id]);}));
  return result;
}
function* canonicalPosets(n) {
  const potential=[];
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)potential.push([i,j]);
  const seen=new Set();
  for(let selection=0;selection<2**potential.length;selection++) {
    const rows=Array(n).fill(0);
    potential.forEach(([i,j],k)=>{if(selection & (1<<k))rows[i]|=1<<j;});
    for(let k=0;k<n;k++)for(let i=0;i<n;i++)if(rows[i]&(1<<k))rows[i]|=rows[k];
    const key=rows.join(',');
    if(seen.has(key))continue;
    seen.add(key);
    const order=[];
    rows.forEach((r,i)=>{for(let j=0;j<n;j++)if(r&(1<<j))order.push([`e${i}`,`e${j}`]);});
    yield {rows,order};
  }
}
function hasInducedP4(rows) {
  const n=rows.length;
  for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++)for(let d=c+1;d<n;d++) {
    const vertices=[a,b,c,d], degree=[0,0,0,0];let edges=0;
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++) {
      if((rows[vertices[i]]&(1<<vertices[j]))||(rows[vertices[j]]&(1<<vertices[i]))) {
        degree[i]++;degree[j]++;edges++;
      }
    }
    // On four vertices this degree sequence with three edges is precisely P4.
    if(edges===3 && degree.sort().join(',')==='1,1,2,2') return true;
  }
  return false;
}
function certificateTree(tree) {
  if(!tree)return {ids:[],order:[]};
  if(tree.type==='task')return {ids:[tree.id],order:[]};
  const kids=(tree.children||[]).map(certificateTree);
  const ids=kids.flatMap(k=>k.ids), order=kids.flatMap(k=>k.order);
  assert.equal(new Set(ids).size,ids.length,'tree duplicates an event occurrence');
  if(tree.type==='sequence')for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++)
    for(const a of kids[i].ids)for(const b of kids[j].ids)order.push([a,b]);
  else assert.ok(tree.type==='parallel'||ids.length===0,`unexpected tree node ${tree.type}`);
  return {ids,order};
}
function extensionCount(ids,order) {
  const position=new Map(ids.map((id,i)=>[id,i]));
  const predecessors=Array(ids.length).fill(0);
  order.forEach(([a,b])=>{predecessors[position.get(b)]|=1<<position.get(a);});
  const dp=Array(1<<ids.length).fill(0);dp[0]=1;
  for(let done=0;done<dp.length;done++)for(let i=0;i<ids.length;i++)
    if(!(done&(1<<i)) && (predecessors[i]&done)===predecessors[i])dp[done|(1<<i)]+=dp[done];
  return dp.at(-1);
}
function bruteWords(ids,order) {
  const valid=[];
  function visit(prefix,remaining) {
    if(!remaining.length) {
      const at=new Map(prefix.map((id,i)=>[id,i]));
      if(order.every(([a,b])=>at.get(a)<at.get(b)))valid.push(prefix);
      return;
    }
    remaining.forEach((id,i)=>visit([...prefix,id],[...remaining.slice(0,i),...remaining.slice(i+1)]));
  }
  visit([],ids);return valid;
}

test('exhaustive distinct finite orders through six events: theorem, tree certificates and linear extensions',()=>{
  const counts=[], accepted=[];
  for(let n=1;n<=6;n++) {
    const ids=Array.from({length:n},(_,i)=>`e${i}`);let total=0,pass=0;
    for(const {rows,order} of canonicalPosets(n)) {
      total++;
      const tree=decompose(ids,order);
      assert.equal(!!tree,!hasInducedP4(rows),`recognition differs at n=${n}: ${pairsKey(order)}`);
      assert.equal(pairsKey(closure(ids,order)),pairsKey(order));
      const reported=linearOrders(ids,order,10000);
      assert.equal(reported.complete,true);
      assert.equal(reported.count,extensionCount(ids,order));
      if(n<=5)assert.deepEqual(sortedWords(reported.orders),sortedWords(bruteWords(ids,order)));
      if(tree) {
        pass++;
        const certificate=certificateTree(tree);
        assert.deepEqual([...certificate.ids].sort(),ids);
        assert.equal(pairsKey(certificate.order),pairsKey(order),'accepted tree changes a comparability');
        assert.equal(pairsKey(treeOrder(tree)),pairsKey(order));
        assert.equal(extensionCount(certificate.ids,certificate.order),reported.count);
      }
      if(total%61===0) {
        const renamed=id=>`task_${(n-1-Number(id.slice(1)))*17}`;
        const labels=ids.map(renamed).reverse();
        const edges=order.map(([a,b])=>[renamed(a),renamed(b)]).reverse();
        const equivalent=decompose(labels,[...edges,...edges]);
        assert.equal(!!equivalent,!!tree,'relabel/edge order alters representability');
        if(equivalent)assert.equal(pairsKey(certificateTree(equivalent).order),pairsKey(edges));
      }
    }
    counts.push(total);accepted.push(pass);
  }
  assert.deepEqual(counts,[1,2,7,40,357,4824]);
  console.log(JSON.stringify({oracle:'all distinct naturally labelled posets n=1..6',counts,accepted}));
});

test('transitive redundancy, order duals and exact extension truncation',()=>{
  const ids=['x','y','z','w'];
  const covers=[['x','y'],['y','z'],['z','w']];
  const expanded=independentClosure(ids,covers);
  assert.equal(pairsKey(closure(ids,covers)),pairsKey(expanded));
  assert.equal(pairsKey(certificateTree(decompose(ids,covers)).order),pairsKey(expanded));
  const reverse=expanded.map(([a,b])=>[b,a]);
  assert.ok(decompose(ids,reverse));
  assert.equal(extensionCount(ids,expanded),extensionCount(ids,reverse));
  const capped=linearOrders(ids,[],3);
  assert.equal(capped.complete,false);
  assert.equal(capped.count,null);
  assert.equal(capped.orders.length,3);
});

const place=(id,initial=0,kind='condition')=>({id,label:id,initial,kind});
const transition=(id,inputs,outputs,duration=1,maxFirings=1)=>({id,label:id,inputs,outputs,duration,maxFirings});
function model(id,places,transitions,goal){return {id,title:id,description:id,places,transitions,goal};}
function atomicReplay(m,trace) {
  const marking=Object.fromEntries(m.places.map(p=>[p.id,p.initial]));
  const snapshots=[{...marking}],used={};
  for(const id of trace) {
    const t=m.transitions.find(t=>t.id===id);
    assert.ok(t,'unknown transition in generated trace');
    used[id]=(used[id]||0)+1;assert.ok(used[id]<=t.maxFirings);
    for(const [p,n] of Object.entries(t.inputs))assert.ok(marking[p]>=n,`${id} is not enabled`);
    for(const [p,n] of Object.entries(t.inputs))marking[p]-=n;
    for(const [p,n] of Object.entries(t.outputs))marking[p]+=n;
    snapshots.push({...marking});
  }
  return {marking,snapshots,goal:Object.entries(m.goal).every(([p,n])=>marking[p]>=n)};
}
function timedReplay(m,result) {
  const markings=Object.fromEntries(m.places.map(p=>[p.id,p.initial]));
  assert.equal(new Set(result.events.map(e=>e.id)).size,result.events.length);
  const eventById=new Map(result.events.map(e=>[e.id,e]));
  const times=[...new Set(result.schedule.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
  const seen=new Set();
  for(const now of times) {
    for(const s of result.schedule.filter(s=>s.end===now)) {
      assert.ok(seen.has(s.id),'event finishes without having started');
      const t=m.transitions.find(t=>t.id===eventById.get(s.id).transitionId);
      Object.entries(t.outputs).forEach(([p,n])=>{markings[p]+=n;});
    }
    const starts=result.schedule.filter(s=>s.start===now),needed={};
    for(const s of starts) {
      assert.ok(!seen.has(s.id),'event starts twice');seen.add(s.id);
      const t=m.transitions.find(t=>t.id===eventById.get(s.id).transitionId);
      assert.ok(s.end>s.start);assert.equal(s.end-s.start,t.duration);
      Object.entries(t.inputs).forEach(([p,n])=>{needed[p]=(needed[p]||0)+n;});
    }
    for(const [p,n] of Object.entries(needed)) {
      assert.ok(markings[p]>=n,`joint enabling failure at ${now}: ${p} requires ${n}, has ${markings[p]}`);
      markings[p]-=n;
    }
  }
  assert.equal(seen.size,result.events.length);
  assert.deepEqual(markings,atomicReplay(m,result.events.map(e=>e.transitionId)).marking);
  assert.ok(Object.entries(m.goal).every(([p,n])=>markings[p]>=n));
  return markings;
}

const ambiguous=model('allocation-flip',
  [place('readyA',1),place('readyC',1),place('p'),place('q'),place('doneB'),place('doneD')],
  [transition('a',{readyA:1},{p:1}),transition('c',{readyC:1},{p:1,q:1}),
   transition('b',{p:1,q:1},{doneB:1}),transition('d',{p:1},{doneD:1})],
  {doneB:1,doneD:1});

test('same collective trace has N and exact-tree witnesses under different token allocations',()=>{
  const trace=['a','c','b','d'];
  const a=analyse(ambiguous,trace,{allocation:'fifo'});
  const b=analyse(ambiguous,trace,{allocation:'lifo'});
  assert.ok(a.ok&&b.ok);assert.ok(a.goalReached&&b.goalReached);
  assert.equal(a.exactTree,false);assert.equal(b.exactTree,true);
  assert.deepEqual(a.markings,b.markings,'allocation changed count markings');
  assert.deepEqual(a.schedule,b.schedule,'unit durations should retain the same timings');
  assert.equal(a.linearExtensions,5);assert.equal(b.linearExtensions,6);
  timedReplay(ambiguous,a);timedReplay(ambiguous,b);
  assert.ok(a.obstruction);
  const {a:x,b:y,c:z,d:w}=a.obstruction;
  const wanted=[[x,y],[z,y],[z,w]];
  const induced=a.order.filter(([u,v])=>[x,y,z,w].includes(u)&&[x,y,z,w].includes(v));
  assert.equal(new Set([x,y,z,w]).size,4);
  assert.equal(pairsKey(induced),pairsKey(wanted));
});

test('same-start stages invent a barrier even when an exact nested tree exists',()=>{
  const m=model('overlap',[place('ra',1),place('rb',1),place('aDone'),place('bDone'),place('cDone')],
    [transition('a',{ra:1},{aDone:1},2),transition('b',{rb:1},{bDone:1},5),transition('c',{aDone:1},{cDone:1},1)],
    {bDone:1,cDone:1});
  const r=analyse(m,['a','b','c']);
  assert.ok(r.exactTree);assert.equal(r.makespan,5);assert.equal(r.stagedMakespan,6);
  assert.equal(r.stagedAdded.length,1);assert.ok(r.lostOrder);
  timedReplay(m,r);
  const changed=structuredClone(m);changed.transitions[0].duration=11;
  const s=analyse(changed,['a','b','c']);
  assert.equal(pairsKey(r.order),pairsKey(s.order),'duration change invented causality');
});

test('resource serialization is a real allocation constraint and never copied capacity',()=>{
  const make=n=>model(`crew-${n}`,[place('ra',1),place('rb',1),place('crew',n,'resource'),place('ad'),place('bd')],
    [transition('a',{ra:1,crew:1},{ad:1,crew:1},3),transition('b',{rb:1,crew:1},{bd:1,crew:1},4)],{ad:1,bd:1});
  const one=analyse(make(1),['a','b']);const two=analyse(make(2),['a','b']);
  assert.equal(one.makespan,7);assert.equal(two.makespan,4);
  assert.equal(one.order.length,1);assert.equal(two.order.length,0);
  assert.ok(one.edges.every(edge=>edge.kind==='resource'));
  timedReplay(make(1),one);timedReplay(make(2),two);
  assert.equal(generate(make(0)).executions.length,0);
});

test('exclusive methods, repeated occurrences, deadlocks and honest truncation',()=>{
  const exclusive=model('choice',[place('choice',1),place('done')],
    [transition('helicopter',{choice:1},{done:1}),transition('winch',{choice:1},{done:1})],{done:1});
  const choice=generate(exclusive,{maxExecutions:100,maxNodes:1000});
  assert.equal(choice.complete,true);
  assert.deepEqual(sortedWords(choice.executions),['helicopter','winch']);
  for(const trace of choice.executions)timedReplay(exclusive,analyse(exclusive,trace));
  assert.equal(replay(exclusive,['helicopter','winch']).ok,false);
  const repeated=model('repeat',[place('ready',1),place('done')],
    [transition('work',{ready:1},{ready:1,done:1},2,2)],{done:2});
  const r=analyse(repeated,['work','work']);
  assert.equal(r.events.length,2);assert.equal(new Set(r.events.map(e=>e.id)).size,2);
  assert.equal(r.makespan,4);timedReplay(repeated,r);
  assert.equal(replay(repeated,['work','work','work']).ok,false);
  const dead=model('dead',[place('missing'),place('done')],[transition('work',{missing:1},{done:1})],{done:1});
  const d=generate(dead);assert.equal(d.complete,true);assert.equal(d.executions.length,0);
  assert.ok(d.deadlocks.length>0);
  const capped=generate(exclusive,{maxExecutions:1,maxNodes:1000});
  assert.equal(capped.complete,false,'cut-off must not claim exhaustive search');
});

test('every generated small-model trace and each of its order extensions independently replays',()=>{
  const before=JSON.stringify(ambiguous);
  const g=generate(ambiguous,{maxExecutions:1000,maxNodes:10000});
  assert.ok(g.complete);assert.ok(g.executions.length>1);
  for(const trace of g.executions)for(const allocation of ['fifo','lifo']) {
    assert.ok(atomicReplay(ambiguous,trace).goal);
    const r=analyse(ambiguous,trace,{allocation});timedReplay(ambiguous,r);
    const byId=new Map(r.events.map(e=>[e.id,e.transitionId]));
    for(const word of bruteWords(r.events.map(e=>e.id),r.order))
      assert.ok(atomicReplay(ambiguous,word.map(id=>byId.get(id))).goal);
  }
  assert.equal(JSON.stringify(ambiguous),before,'analysis mutated the source model');
});

test('numeric timing limits return a reviewable error instead of throwing or erasing duration',()=>{
  const overlap=model('huge-overlap',[place('ra',1),place('rb',1),place('ad'),place('bd'),place('cd')],
    [transition('a',{ra:1},{ad:1},1),transition('b',{rb:1},{bd:1},1e308),transition('c',{ad:1},{cd:1},1e308)],
    {bd:1,cd:1});
  let result;
  assert.doesNotThrow(()=>{result=analyse(overlap,['a','b','c']);},'staged overflow escapes structured analysis');
  if(result.ok) {
    assert.ok(Number.isFinite(result.makespan));
    assert.ok(result.stagedMakespan===null||Number.isFinite(result.stagedMakespan));
    assert.ok(result.schedule.every(s=>s.end>s.start));
  } else assert.ok(result.errors.length>0);
  const precision=model('lost-duration',[place('ready',1),place('ad'),place('done')],
    [transition('a',{ready:1},{ad:1},1e308),transition('b',{ad:1},{done:1},1)],{done:1});
  const p=analyse(precision,['a','b']);
  assert.ok(!p.ok||p.schedule.every(s=>s.end>s.start),'positive duration rounded to zero without rejection');
});

test('exhaustive two-place/two-transition bounded nets: generation and both timed allocation witnesses',()=>{
  const maskArcs=mask=>Object.fromEntries(['p','q'].flatMap((id,i)=>(mask&(1<<i))?[[id,1]]:[]));
  const allWords=[[]];
  for(let length=1;length<=4;length++)for(let bits=0;bits<2**length;bits++)
    allWords.push(Array.from({length},(_,i)=>(bits&(1<<i))?'y':'x'));
  let models=0,witnesses=0;
  for(let initial=0;initial<4;initial++)for(let goal=1;goal<4;goal++)
    for(let preX=1;preX<4;preX++)for(let postX=0;postX<4;postX++)
      for(let preY=1;preY<4;preY++)for(let postY=0;postY<4;postY++) {
        const m=model('finite-grid',[place('p',initial&1,'resource'),place('q',(initial>>1)&1)],
          [transition('x',maskArcs(preX),maskArcs(postX),2,2),transition('y',maskArcs(preY),maskArcs(postY),3,2)],
          maskArcs(goal));
        const expected=allWords.filter(trace=>{
          const state={p:initial&1,q:(initial>>1)&1},counts={x:0,y:0};
          const reached=()=>Object.entries(m.goal).every(([p,n])=>state[p]>=n);
          for(const id of trace) {
            if(reached())return false;
            const t=m.transitions[id==='x'?0:1];
            if(++counts[id]>2)return false;
            if(Object.entries(t.inputs).some(([p,n])=>state[p]<n))return false;
            Object.entries(t.inputs).forEach(([p,n])=>{state[p]-=n;});
            Object.entries(t.outputs).forEach(([p,n])=>{state[p]+=n;});
          }
          return reached();
        });
        const generated=generate(m,{maxExecutions:100,maxNodes:1000});
        assert.ok(generated.complete);assert.deepEqual(sortedWords(generated.executions),sortedWords(expected));
        for(const trace of expected)for(const allocation of ['fifo','lifo']) {
          const r=analyse(m,trace,{allocation});assert.ok(r.ok&&r.goalReached);
          timedReplay(m,r);witnesses++;
        }
        models++;
      }
  assert.equal(models,1728);
  console.log(JSON.stringify({oracle:'all binary arc/marking two-place two-transition nets, caps=2',models,witnesses}));
});
