import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseFamily} from '../apps/process-contract-lab/families.mjs';
import {compileTerm, canonicalize, renameOccurrences} from '../apps/process-contract-lab/composition.mjs';
import {getCompositionScenario} from '../apps/process-contract-lab/composition-scenarios.mjs';
import {checkStep} from '../apps/process-contract-lab/steps.mjs';
import {generate} from '../apps/causal-plan-lab/core.mjs';

const p=(id,initial=0,kind='condition')=>({id,label:id,initial,kind});
const t=(id,inputs,outputs,duration=1,maxFirings=1)=>({id,label:id,inputs,outputs,duration,maxFirings});
const model=(places,transitions,goal)=>({id:'oracle-model',title:'Oracle model',places,transitions,goal});
const pairKey=order=>order.map(([a,b])=>JSON.stringify([a,b])).sort().join('|');
const wordKey=word=>JSON.stringify(word);
const wordsKey=words=>words.map(wordKey).sort();
function permutations(xs) {
  if(!xs.length)return [[]];
  return xs.flatMap((x,i)=>permutations([...xs.slice(0,i),...xs.slice(i+1)]).map(rest=>[x,...rest]));
}
function close(ids,edges) {
  const rows=Array(ids.length).fill(0),position=new Map(ids.map((id,i)=>[id,i]));
  for(const [a,b] of edges)rows[position.get(a)]|=1<<position.get(b);
  for(let k=0;k<ids.length;k++)for(let i=0;i<ids.length;i++)if(rows[i]&(1<<k))rows[i]|=rows[k];
  return ids.flatMap((a,i)=>ids.flatMap((b,j)=>(rows[i]&(1<<j))?[[a,b]]:[]));
}
const respects=(word,order)=>{const at=new Map(word.map((x,i)=>[x,i]));return order.every(([a,b])=>at.get(a)<at.get(b));};
function allocationKey(entries) {
  const sums=new Map();
  for(const a of entries) {
    const k=JSON.stringify([a.eventId,a.place,a.producer]);
    sums.set(k,(sums.get(k)||0)+a.count);
  }
  return [...sums].sort(([a],[b])=>a.localeCompare(b)).map(([k,n])=>`${k}:${n}`).join('|');
}
function subsets(items,k) {
  if(k===0)return [[]];
  if(k>items.length)return [];
  return items.flatMap((x,i)=>subsets(items.slice(i+1),k-1).map(rest=>[x,...rest]));
}

// Intentionally labels individual tokens and chooses token subsets; production
// enumerates producer-count vectors. Only COMPLETE outcomes are quotiented.
function labelledTokenOracle(m,trace) {
  const initial=Object.fromEntries(m.places.map(place=>[place.id,
    Array.from({length:place.initial},(_,i)=>({id:`initial:${place.id}:${i}`,producer:null}))]));
  const counts={},events=trace.map(id=>{const task=m.transitions.find(x=>x.id===id);
    return {...task,id:`${id}#${counts[id]=(counts[id]||0)+1}`,transitionId:id};});
  const unique=new Map();let labelledOutcomes=0;
  function eventStep(index,pools,allocations) {
    if(index===events.length) {
      labelledOutcomes++;
      const key=allocationKey(allocations);
      if(!unique.has(key)) {
        const edges=allocations.filter(a=>a.producer!==null).map(a=>[a.producer,a.eventId]);
        unique.set(key,{allocations,order:close(events.map(e=>e.id),edges)});
      }
      return;
    }
    const event=events[index],requirements=Object.entries(event.inputs);
    function inputStep(at,current,selected) {
      if(at===requirements.length) {
        const next=Object.fromEntries(Object.entries(current).map(([id,tokens])=>[id,[...tokens]]));
        for(const [place,count] of Object.entries(event.outputs))for(let i=0;i<count;i++)
          next[place].push({id:`${event.id}:${place}:${i}`,producer:event.id});
        eventStep(index+1,next,[...allocations,...selected]);return;
      }
      const [place,needed]=requirements[at];
      for(const chosen of subsets(current[place],needed)) {
        const taken=new Set(chosen.map(token=>token.id));
        const next={...current,[place]:current[place].filter(token=>!taken.has(token.id))};
        inputStep(at+1,next,[...selected,...chosen.map(token=>({eventId:event.id,place,producer:token.producer,count:1}))]);
      }
    }
    inputStep(0,pools,[]);
  }
  eventStep(0,initial,[]);
  return {events,classes:unique,labelledOutcomes};
}
function independentFamily(m,trace) {
  const oracle=labelledTokenOracle(m,trace),ids=oracle.events.map(e=>e.id);
  const all=permutations(ids),language=all.filter(word=>[...oracle.classes.values()].some(c=>respects(word,c.order)));
  const must=ids.flatMap(a=>ids.flatMap(b=>a!==b&&language.every(w=>w.indexOf(a)<w.indexOf(b))?[[a,b]]:[]));
  const may=close(ids,[...oracle.classes.values()].flatMap(c=>c.order));
  const commonLanguage=all.filter(w=>respects(w,must));
  return {...oracle,ids,language,must,may,dagExact:wordsKey(language).join('|')===wordsKey(commonLanguage).join('|')};
}
function timedCountCheck(m,events,witness) {
  const marking=Object.fromEntries(m.places.map(place=>[place.id,place.initial]));
  const byId=new Map(events.map(e=>[e.id,m.transitions.find(t=>t.id===e.transitionId)]));
  const times=[...new Set(witness.schedule.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b);
  for(const now of times) {
    for(const s of witness.schedule.filter(s=>s.end===now))
      Object.entries(byId.get(s.id).outputs).forEach(([p,n])=>{marking[p]+=n;});
    const needed={};
    for(const s of witness.schedule.filter(s=>s.start===now)) {
      const task=byId.get(s.id);assert.ok(s.end>s.start);assert.equal(s.end-s.start,task.duration);
      Object.entries(task.inputs).forEach(([p,n])=>{needed[p]=(needed[p]||0)+n;});
    }
    for(const [p,n] of Object.entries(needed)){assert.ok(marking[p]>=n,`joint timing oversubscribes ${p}`);marking[p]-=n;}
  }
  assert.ok(Object.entries(m.goal).every(([p,n])=>marking[p]>=n));
  assert.equal(witness.makespan,Math.max(0,...witness.schedule.map(s=>s.end)));
}
function verifyFamily(m,trace) {
  const expected=independentFamily(m,trace),actual=analyseFamily(m,trace);
  assert.ok(actual.ok,actual.errors?.join('\n'));assert.ok(actual.complete);assert.ok(actual.language.complete);
  assert.deepEqual(actual.witnesses.map(w=>allocationKey(w.allocations)).sort(),[...expected.classes.keys()].sort());
  assert.deepEqual(wordsKey(actual.language.orders),wordsKey(expected.language));
  assert.equal(actual.language.count,expected.language.length);
  assert.equal(pairKey(actual.mustOrder),pairKey(expected.must));
  assert.equal(pairKey(close(expected.ids,actual.mayOrder)),pairKey(expected.may));
  assert.equal(actual.summary.dagExact,expected.dagExact);
  const pool=new Set(expected.language.map(wordKey));
  if(actual.summary.spuriousOrder) {
    assert.ok(respects(actual.summary.spuriousOrder,expected.must));
    assert.ok(!pool.has(wordKey(actual.summary.spuriousOrder)));
  }
  if(actual.summary.overconstraintOrder) {
    assert.ok(pool.has(wordKey(actual.summary.overconstraintOrder)));
    assert.ok(!respects(actual.summary.overconstraintOrder,expected.may));
  }
  for(const w of actual.witnesses) {
    assert.equal(pairKey(w.order),pairKey(expected.classes.get(allocationKey(w.allocations)).order));
    timedCountCheck(m,actual.events,w);
  }
  return {actual,expected};
}
function poolModel(initial,outA,outB,takeC,takeD) {
  return model([p('ra',1),p('rb',1),p('p',initial),p('ad'),p('bd'),p('cd'),p('dd')],
    [t('A',{ra:1},{p:outA,ad:1},2),t('B',{rb:1},{p:outB,bd:1},5),
     t('C',{p:takeC},{cd:1},1),t('D',{p:takeD},{dd:1},3)],{ad:1,bd:1,cd:1,dd:1});
}

test('exhaustive small pooled models: labelled tokens quotient to exactly the producer-count classes',()=>{
  let models=0,classes=0,labelled=0;
  for(let initial=0;initial<=2;initial++)for(let a=1;a<=2;a++)for(let b=1;b<=2;b++)
    for(let c=1;c<=2;c++)for(let d=1;d<=2;d++) {
      if(initial+a+b<c+d)continue;
      const {actual,expected}=verifyFamily(poolModel(initial,a,b,c,d),['A','B','C','D']);
      models++;classes+=actual.witnesses.length;labelled+=expected.labelledOutcomes;
    }
  assert.ok(models>=40);assert.ok(labelled>classes);
  console.log(JSON.stringify({oracle:'labelled-token subset quotient on small pooled models',models,classes,labelledOutcomes:labelled}));
});

test('all individual trees can be exact while no single DAG expresses the whole support language',()=>{
  const m=model([p('ra',1),p('rb',1),p('rc',1),p('p'),p('ad'),p('bd'),p('cd')],
    [t('A',{ra:1},{p:1,ad:1},2),t('B',{rb:1},{p:1,bd:1},5),t('C',{p:1,rc:1},{cd:1},1)],{ad:1,bd:1,cd:1});
  const {actual}=verifyFamily(m,['A','B','C']);
  assert.equal(actual.witnesses.length,2);assert.equal(actual.classification,'all');
  assert.equal(actual.language.count,4);assert.deepEqual(actual.mustOrder,[]);
  assert.equal(actual.summary.dagExact,false);assert.equal(actual.summary.treeExact,false);
  assert.equal(actual.minFinish,5);assert.equal(actual.maxFinish,6);
  assert.ok(actual.summary.spuriousOrder[0].startsWith('C#'));
  assert.ok(actual.summary.overconstraintOrder[1].startsWith('C#'));
});

test('mixed individual representability can still have an exact parallel summary language',()=>{
  const m=model([p('ra',1),p('rc',1),p('p',1),p('q',1),p('r',1),p('ad'),p('cd'),p('bd'),p('dd')],
    [t('A',{ra:1},{p:1,ad:1}),t('C',{rc:1},{q:1,r:1,cd:1}),
     t('B',{p:1,q:1},{bd:1}),t('D',{r:1},{dd:1})],{ad:1,cd:1,bd:1,dd:1});
  const {actual}=verifyFamily(m,['A','C','B','D']);
  assert.equal(actual.classification,'some');assert.equal(actual.language.count,24);
  assert.equal(actual.summary.dagExact,true);assert.equal(actual.summary.treeExact,true);
});

test('different producer multiplicities remain different classes even when they induce the same order',()=>{
  const m=model([p('ra',1),p('p',2),p('ad'),p('bd')],
    [t('A',{ra:1},{p:2,ad:1}),t('B',{p:2},{bd:1})],{ad:1,bd:1});
  const {actual,expected}=verifyFamily(m,['A','B']);
  assert.equal(expected.labelledOutcomes,6);assert.equal(actual.witnesses.length,3);
  assert.equal(actual.distinctOrders,2);
  const repeated=model([p('raw',2),p('p'),p('done')],
    [t('make',{raw:1},{p:1},1,2),t('use',{p:1},{done:1},1,2)],{done:2});
  const r=verifyFamily(repeated,['make','make','use','use']).actual;
  assert.equal(new Set(r.events.map(e=>e.id)).size,4);assert.equal(r.witnesses.length,2);
});

test('cross-place allocations, retained-scope reordering, identity and after-goal rejection',()=>{
  const multi=model([p('ra',1),p('rb',1),p('p'),p('q'),p('ad'),p('bd'),p('cd'),p('dd')],
    [t('A',{ra:1},{p:1,q:1,ad:1}),t('B',{rb:1},{p:1,q:1,bd:1}),
     t('C',{p:1,q:1},{cd:1}),t('D',{p:1,q:1},{dd:1})],{ad:1,bd:1,cd:1,dd:1});
  assert.equal(verifyFamily(multi,['A','B','C','D']).actual.witnesses.length,4);
  const early=model([p('ra',1),p('rb',1),p('goal'),p('unneeded')],
    [t('A',{ra:1},{goal:1}),t('B',{rb:1},{unneeded:1})],{goal:1});
  const r=verifyFamily(early,['B','A']).actual;
  assert.equal(r.language.count,2);assert.ok(r.language.orders.some(w=>w[0]==='A#1'));
  assert.equal(analyseFamily(early,['A','B']).ok,false);
  assert.equal(analyseFamily(early,['B']).ok,false);
  const identity=model([p('goal',1)],[],{goal:1});
  const id=verifyFamily(identity,[]).actual;
  assert.equal(id.witnesses.length,1);assert.deepEqual(id.language.orders,[[]]);assert.equal(id.minFinish,0);
});

test('ancestry and language truncation never masquerade as universal or exact contracts',()=>{
  const m=poolModel(1,2,2,2,1),trace=['A','B','C','D'];
  for(const options of [{maxWitnesses:1},{maxStates:1},{maxAllocationEntries:1}]) {
    const r=analyseFamily(m,trace,options);
    assert.ok(r.ok,r.errors?.join('\n'));assert.equal(r.complete,false);assert.equal(r.classification,'unknown');
    assert.equal(r.distinctOrders,null);assert.equal(r.mustOrder,null);assert.equal(r.mayOrder,null);
    assert.equal(r.language.complete,false);assert.equal(r.language.count,null);
    assert.equal(r.summary.dagExact,null);assert.equal(r.summary.treeExact,null);
    assert.equal(r.summary.spuriousOrder,null);assert.equal(r.summary.overconstraintOrder,null);
    assert.equal(r.minFinish,null);assert.equal(r.maxFinish,null);
  }
  for(const options of [{maxLanguageOrders:1},{maxLanguageChecks:1}]) {
    const r=analyseFamily(m,trace,options);
    assert.ok(r.complete);assert.equal(r.language.complete,false);assert.equal(r.language.count,null);
    assert.equal(r.summary.dagExact,null);assert.equal(r.summary.treeExact,null);
    assert.equal(r.summary.spuriousOrder,null);assert.equal(r.summary.overconstraintOrder,null);
  }
  const full=analyseFamily(m,trace);
  const exactCap=analyseFamily(m,trace,{maxWitnesses:full.witnesses.length});
  assert.equal(exactCap.complete,true);
});

test('independent producer reordering and time scaling preserve family language and allocation classes',()=>{
  const m=poolModel(1,2,2,2,1),before=JSON.stringify(m);
  const a=analyseFamily(m,['A','B','C','D']),b=analyseFamily(m,['B','A','C','D']);
  assert.deepEqual(a.witnesses.map(w=>allocationKey(w.allocations)).sort(),b.witnesses.map(w=>allocationKey(w.allocations)).sort());
  assert.deepEqual(wordsKey(a.language.orders),wordsKey(b.language.orders));
  const scaled=structuredClone(m);scaled.transitions.forEach(t=>{t.duration*=7;});
  const c=analyseFamily(scaled,['A','B','C','D']);
  assert.deepEqual(wordsKey(a.language.orders),wordsKey(c.language.orders));
  assert.equal(c.minFinish,7*a.minFinish);assert.equal(c.maxFinish,7*a.maxFinish);
  assert.equal(JSON.stringify(m),before);
});

test('one trace ancestry family is not all legal orders of the same resource-sharing task set',()=>{
  const m=model([p('resource',1,'resource'),p('ad'),p('bd')],
    [t('A',{resource:1},{resource:1,ad:1}),t('B',{resource:1},{resource:1,bd:1})],{ad:1,bd:1});
  const a=verifyFamily(m,['A','B']).actual,b=verifyFamily(m,['B','A']).actual;
  assert.deepEqual(a.language.orders,[['A#1','B#1']]);
  assert.deepEqual(b.language.orders,[['B#1','A#1']]);
  assert.equal(generate(m).executions.length,2);
});

// Treat capacity as individually labelled tokens, then try disjoint assignments
// to selected starts. This oracle does not use summed input inequalities.
function disjointStartAssignment(marking,tasks) {
  const tokens=Object.entries(marking).flatMap(([place,count])=>
    Array.from({length:count},(_,i)=>({place,id:`${place}:${i}`})));
  const requirements=tasks.flatMap(task=>Object.entries(task.inputs)
    .flatMap(([place,count])=>Array(count).fill(place)));
  function match(index,remaining) {
    if(index===requirements.length)return true;
    return remaining.some((token,i)=>token.place===requirements[index]&&
      match(index+1,[...remaining.slice(0,i),...remaining.slice(i+1)]));
  }
  return match(0,tokens);
}

test('exhaustive small step enabling agrees with disjoint labelled-token assignments at every prefix',()=>{
  let models=0,checks=0,conflicts=0;
  for(let x=0;x<=2;x++)for(let y=0;y<=2;y++) {
    const demands=[];
    for(let a=0;a<=x;a++)for(let b=0;b<=y;b++)if(a+b)
      demands.push(Object.fromEntries([['x',a],['y',b]].filter(([,n])=>n)));
    for(const a of demands)for(const b of demands)for(const c of demands) {
      const tasks=[a,b,c].map((inputs,i)=>t(`T${i}`,inputs,{...inputs,[`done${i}`]:1}));
      const m=model([p('x',x,'resource'),p('y',y,'resource'),...tasks.map((_,i)=>p(`done${i}`))],tasks,{done0:1,done1:1,done2:1});
      const trace=tasks.map(t=>t.id),snapshot=JSON.stringify(m);
      for(let prefix=0;prefix<=3;prefix++) {
        // Independent atomic replay: consume each token before supplying outputs.
        const marking=Object.fromEntries(m.places.map(p=>[p.id,p.initial]));
        for(const task of tasks.slice(0,prefix)) {
          for(const [place,n] of Object.entries(task.inputs))for(let i=0;i<n;i++)marking[place]--;
          for(const [place,n] of Object.entries(task.outputs))for(let i=0;i<n;i++)marking[place]++;
        }
        const remaining=tasks.slice(prefix);
        for(let mask=0;mask<(1<<remaining.length);mask++) {
          const selected=remaining.filter((_,i)=>mask&(1<<i)),ids=selected.map(t=>`${t.id}#1`);
          const actual=checkStep(m,trace,prefix,ids),expected=disjointStartAssignment(marking,selected);
          assert.ok(actual.ok,actual.errors.join('\n'));assert.deepEqual(actual.available,marking);
          assert.equal(actual.jointlyEnabled,expected);
          actual.individual.forEach((row,i)=>assert.equal(row.enabled,disjointStartAssignment(marking,[selected[i]])));
          assert.equal(actual.shortfalls.length===0,expected);
          for(const row of actual.shortfalls)assert.ok(row.needed>row.available);
          if(!expected&&actual.individual.every(x=>x.enabled))conflicts++;
          checks++;
        }
      }
      assert.equal(JSON.stringify(m),snapshot);models++;
    }
  }
  assert.ok(conflicts>0);
  console.log(JSON.stringify({oracle:'disjoint token assignment at every atomic prefix and selected subset',models,checks,individuallyEnabledConflicts:conflicts}));
});

test('step checks preserve occurrence identity, forbid same-start outputs, and reject misleading numeric or scope claims',()=>{
  const chain=model([p('raw',2),p('mid'),p('done')],
    [t('make',{raw:1},{mid:1},1,2),t('use',{mid:1},{done:1},1,2)],{done:2});
  const trace=['make','use','make','use'];
  assert.equal(checkStep(chain,trace,0,['make#1','make#2']).jointlyEnabled,true);
  assert.equal(checkStep(chain,trace,0,['make#1','use#1']).jointlyEnabled,false);
  assert.equal(checkStep(chain,trace,1,['use#1','make#2']).jointlyEnabled,true);
  assert.equal(checkStep(chain,trace,1,['make#1']).ok,false);
  assert.equal(checkStep(chain,trace,0,['make#1','make#1']).ok,false);
  assert.equal(checkStep(chain,trace,1,['use#1','use#2']).jointlyEnabled,false);
  const cap=Number.MAX_SAFE_INTEGER;
  const huge=model([p('r',cap),p('ad'),p('bd')],
    [t('A',{r:cap},{r:cap,ad:1}),t('B',{r:cap},{r:cap,bd:1})],{ad:1,bd:1});
  assert.equal(checkStep(huge,['A','B'],0,['A#1']).jointlyEnabled,true);
  const overflow=checkStep(huge,['A','B'],0,['A#1','B#1']);
  assert.equal(overflow.ok,false);assert.ok(overflow.errors.some(e=>e.includes('precision')));
  const early=model([p('a',1),p('b',1),p('goal'),p('extra')],
    [t('A',{a:1},{goal:1}),t('B',{b:1},{extra:1})],{goal:1});
  assert.equal(checkStep(early,['A','B'],0,[]).ok,false);
  assert.equal(checkStep(early,['B'],0,[]).ok,false);
  assert.equal(checkStep(model([p('goal',1)],[],{goal:1}),[],0,[]).jointlyEnabled,true);
});

const event=(id,inputs,outputs,duration=1)=>({op:'event',id,label:id,inputs,outputs,duration});
const id=types=>({op:'id',types});
const seq=(...children)=>({op:'seq',children});
const par=(...children)=>({op:'par',children});
const perm=(types,order)=>({op:'permute',types,order});
function signature(term) {
  if(term.op==='event')return [term.inputs,term.outputs];
  if(term.op==='id')return [term.types,term.types];
  if(term.op==='permute')return [term.types,term.order.map(i=>term.types[i])];
  const children=term.children.map(signature);
  return term.op==='seq'?[children[0][0],children.at(-1)[1]]:[children.flatMap(s=>s[0]),children.flatMap(s=>s[1])];
}

// Dual/backward oracle: thread CONSUMER demands from final output ports towards
// the inputs. Production threads producer wires forward. No production graph
// helper or canonicalizer participates in this independent denotation.
function backwardDenotation(term) {
  const [inputTypes,outputTypes]=signature(term),connections=[],events=[];
  function visit(node,consumers) {
    if(node.op==='id')return consumers;
    if(node.op==='permute') {
      const inputs=Array(consumers.length);node.order.forEach((source,j)=>{inputs[source]=consumers[j];});return inputs;
    }
    if(node.op==='seq')return node.children.reduceRight((current,child)=>visit(child,current),consumers);
    if(node.op==='par') {
      let at=0;return node.children.flatMap(child=>{
        const length=signature(child)[1].length,part=consumers.slice(at,at+length);at+=length;return visit(child,part);
      });
    }
    events.push({id:node.id,label:node.label??node.id,duration:node.duration,inputTypes:node.inputs,outputTypes:node.outputs});
    node.outputs.forEach((type,port)=>connections.push({type,from:{kind:'event',eventId:node.id,port},to:consumers[port]}));
    return node.inputs.map((_,port)=>({kind:'event',eventId:node.id,port}));
  }
  const demands=visit(term,outputTypes.map((_,index)=>({kind:'output',index})));
  inputTypes.forEach((type,index)=>connections.push({type,from:{kind:'input',index},to:demands[index]}));
  return {schema:'typed-linear-wire-denotation-v1',inputTypes,outputTypes,
    events:events.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),
    connections:connections.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0)};
}
function verifyTerm(term) {
  const before=JSON.stringify(term),compiled=compileTerm(term);
  assert.ok(compiled.ok,compiled.errors.join('\n'));
  const expected=backwardDenotation(term);
  assert.deepEqual(compiled.canonical,expected);assert.deepEqual(canonicalize(compiled),expected);
  assert.equal(JSON.stringify(term),before,'compiler changed its input term');
  assert.equal(new Set(compiled.inputs.map(x=>x.wire)).size,compiled.inputs.length);
  assert.equal(new Set(compiled.outputs.map(x=>x.wire)).size,compiled.outputs.length);
  const expectedOrder=close(compiled.events.map(e=>e.id),expected.connections
    .filter(w=>w.from.kind==='event'&&w.to.kind==='event').map(w=>[w.from.eventId,w.to.eventId]));
  const expectedTraces=permutations(compiled.events.map(e=>e.id)).filter(w=>respects(w,expectedOrder));
  const generated=generate(compiled.model,{maxExecutions:10000,maxNodes:50000});
  assert.ok(generated.complete);assert.deepEqual(wordsKey(generated.executions),wordsKey(expectedTraces));
  if(compiled.events.length<=8)for(const trace of generated.executions.slice(0,40)) {
    const family=analyseFamily(compiled.model,trace);
    assert.ok(family.ok&&family.complete);assert.equal(family.witnesses.length,1,'linear wires acquired pooled ancestry choices');
    assert.equal(pairKey(family.witnesses[0].order),pairKey(expectedOrder.map(([a,b])=>[`${a}#1`,`${b}#1`])));
  }
  return compiled;
}

test('typed identity, empty boundary and sink event preserve interfaces with explicit completion monitoring',()=>{
  for(const term of [id([]),id(['x']),id(['x','x']),event('sink',['x'],[])])verifyTerm(term);
  const empty=compileTerm(id([]));assert.equal(empty.events.length,0);assert.ok(empty.instrumentation.unitSentinel);
  const sink=compileTerm(event('sink',['x'],[]));assert.deepEqual(sink.outputs,[]);
  assert.equal(sink.instrumentation.completionPlaces.length,1);
  const model=sink.model,goalPlaces=Object.keys(model.goal);
  assert.ok(goalPlaces.includes(sink.events[0].completionPlace));
});

test('all small wire permutations, including identical types, preserve port identities and inverses',()=>{
  let cases=0;
  for(let n=0;n<=5;n++)for(const order of permutations(Array.from({length:n},(_,i)=>i))) {
    const types=Array(n).fill('same-type');
    verifyTerm(perm(types,order));
    const inverse=Array(n);order.forEach((source,output)=>{inverse[source]=output;});
    const identity=verifyTerm(seq(perm(types,order),perm(types,inverse)));
    assert.deepEqual(identity.canonical,compileTerm(id(types)).canonical);cases++;
  }
  console.log(JSON.stringify({oracle:'all permutation/inverse pairs on zero through five equal-type wires',cases}));
});

test('typed sequential/tensor associativity, units and interchange preserve selective wiring denotation',()=>{
  const f=event('f',['a'],['b']),g=event('g',['b'],['c']),h=event('h',['c'],['d']);
  assert.deepEqual(verifyTerm(seq(seq(f,g),h)).canonical,verifyTerm(seq(f,seq(g,h))).canonical);
  assert.deepEqual(verifyTerm(seq(id(['a']),f,id(['b']))).canonical,verifyTerm(f).canonical);
  const x=event('x',['x0'],['x1']),y=event('y',['y0'],['y1']);
  assert.deepEqual(verifyTerm(par(par(f,x),y)).canonical,verifyTerm(par(f,par(x,y))).canonical);
  assert.deepEqual(verifyTerm(par(id([]),f,id([]))).canonical,verifyTerm(f).canonical);
  const x2=event('x2',['x1'],['x2']);
  assert.deepEqual(verifyTerm(seq(par(f,x),par(g,x2))).canonical,verifyTerm(par(seq(f,g),seq(x,x2))).canonical);
  const twice=seq(renameOccurrences(event('work',['x'],['x']),'first:'),renameOccurrences(event('work',['x'],['x']),'second:'));
  assert.equal(verifyTerm(twice).events.length,2);
});

test('symmetry naturality and identity pass-through preserve selective connections, without a seq barrier',()=>{
  const f=event('f',['x'],['a','b']),g=event('g',['y'],['c']);
  const left=seq(par(f,g),perm(['a','b','c'],[2,0,1]));
  const right=seq(perm(['x','y'],[1,0]),par(g,f));
  assert.deepEqual(verifyTerm(left).canonical,verifyTerm(right).canonical);
  const unary=event('f',['x'],['a']);
  const stepped=seq(par(unary,id(['y'])),par(id(['a']),g));
  const direct=par(unary,g);
  const a=verifyTerm(stepped),b=verifyTerm(direct);
  assert.deepEqual(a.canonical,b.canonical);
  assert.equal(analyseFamily(a.model,['f','g']).language.count,2);
});

test('selective N wiring remains expressible while pooled equal-type ports are never identified',()=>{
  const term=seq(par(event('A',['ra'],['a']),event('B',['rb'],['bd','bs'])),
    par(event('C',['a','bd'],['cd']),event('D',['bs'],['dd'])));
  const compiled=verifyTerm(term),trace=['A','B','C','D'];
  const r=analyseFamily(compiled.model,trace);
  assert.equal(r.classification,'none');assert.equal(r.summary.dagExact,true);assert.equal(r.summary.treeExact,false);
  assert.equal(r.language.count,5);
  const shared=verifyTerm(seq(event('lift1',['resource:crane'],['resource:crane'],4),event('lift2',['resource:crane'],['resource:crane'],3)));
  const independent=verifyTerm(par(event('lift1',['resource:crane'],['resource:crane'],4),event('lift2',['resource:crane'],['resource:crane'],3)));
  assert.equal(shared.inputs.length,1);assert.equal(independent.inputs.length,2);
  assert.equal(analyseFamily(shared.model,['lift1','lift2']).minFinish,7);
  assert.equal(analyseFamily(independent.model,['lift1','lift2']).minFinish,4);
});

test('bad arity/types/permutations/names/source generators fail without fabricating resources',()=>{
  const invalid=[
    seq(event('a',['x'],['y']),event('b',['z'],['q'])),
    seq(event('a',['x'],['y','z']),event('b',['y'],['q'])),
    perm(['x','x'],[0,0]),perm(['x','x'],[0,2]),perm(['x','x'],[0]),
    par(event('same',['x'],['x']),event('same',['x'],['x'])),
    event('source',[],['x']),{op:'seq',children:[]},
  ];
  for(const term of invalid){const result=compileTerm(term);assert.equal(result.ok,false);assert.ok(result.errors.length);}
});

test('the eight-event refuge agrees with backward wiring and exhaustive retained-scope permutations',()=>{
  const compiled=verifyTerm(getCompositionScenario('typed-refuge').term);
  assert.equal(compiled.events.length,8);assert.equal(compiled.inputs.length,3);
  const traces=generate(compiled.model).executions;
  assert.equal(traces.length,6);
  for(const trace of traces)assert.equal(analyseFamily(compiled.model,trace).minFinish,15);
});
