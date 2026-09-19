/** Finite once-only ordinary-count contracts. See API.md for the admitted class. */
export const DEFAULT_CAPS = Object.freeze({maxStates:256,maxSteps:6561,maxCount:64,maxWords:5000});
const ID=/^[A-Za-z][A-Za-z0-9_-]*$/;
const copy=x=>JSON.parse(JSON.stringify(x));
const sorted=x=>[...x].sort();
const pop=x=>x.toString(2).replaceAll('0','').length;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000;
const blank=(status,errors=[],reasons=[])=>({status,errors,reasons,eventIds:[],states:[],steps:[],words:[],wordsComplete:false});
function capsOf(options={}) {
  const caps={...DEFAULT_CAPS,...options.caps};
  const ceilings={maxStates:256,maxSteps:6561,maxCount:100000,maxWords:40320};
  const errors=[];
  for(const k of Object.keys(caps)) if(!own(ceilings,k)||!Number.isSafeInteger(caps[k])||caps[k]<1||caps[k]>ceilings[k]) errors.push(`Invalid cap ${k}.`);
  return {caps,errors};
}
export function validateFragment(f) {
  const errors=[];
  if(!f||typeof f!=='object') return {valid:false,errors:['A fragment must be an object.']};
  if(!ID.test(f.id||'')) errors.push('Fragment id must begin with a letter and contain letters, digits, _ or -.');
  if(!Array.isArray(f.places)||!Array.isArray(f.ports)||!Array.isArray(f.events)) return {valid:false,errors:[...errors,'places, ports and events must be arrays.']};
  if(f.places.length>24) errors.push('At most 24 places are admitted.');
  if(f.events.length>8) errors.push('At most eight once-only events are admitted.');
  const ps=new Set(),es=new Set(),ports=new Set(),directions=new Set();
  for(const p of f.places) {
    if(!p||!ID.test(p.id||'')||ps.has(p.id)) {errors.push('Place ids must be valid and unique.');continue;}
    ps.add(p.id);
    if(typeof p.type!=='string'||!p.type.trim()||p.type.length>100) errors.push(`Place ${p.id} needs an exact, nonempty type.`);
    if(!count(p.initial)) errors.push(`Place ${p.id} initial must be a nonnegative integer <=100000.`);
    if(p.capacity!==undefined) errors.push('Capacity predicates are outside this ordinary-count fragment.');
  }
  for(const p of f.ports) {
    if(!p||!ID.test(p.id||'')||ports.has(p.id)) {errors.push('Port ids must be valid and unique.');continue;}
    ports.add(p.id);
    if(!ps.has(p.place)) errors.push(`Port ${p.id} references an unknown place.`);
    if(!['in','out'].includes(p.direction)) errors.push(`Port ${p.id} must have direction in or out.`);
    const k=`${p.place}/${p.direction}`;
    if(directions.has(k)) errors.push('A place has at most one input and one output port.');
    directions.add(k);
    if(p.direction==='in'&&!count(p.supply??0)) errors.push(`Input ${p.id} supply must be a nonnegative integer <=100000.`);
    if(p.direction==='out'&&(p.supply??0)!==0) errors.push('Only an input port may declare external supply.');
  }
  for(const e of f.events) {
    if(!e||!ID.test(e.id||'')||es.has(e.id)) {errors.push('Event ids must be valid and unique.');continue;}
    es.add(e.id);
    if(!Number.isFinite(e.duration)||e.duration<=0||e.duration>100000) errors.push(`Event ${e.id} needs a positive finite toy duration <=100000.`);
    if(e.inhibit!==undefined||e.reset!==undefined||e.read!==undefined||e.capacity!==undefined) errors.push('Inhibitor, reset, read and capacity arcs are outside this fragment.');
    for(const kind of ['consume','produce']) {
      if(!e[kind]||typeof e[kind]!=='object'||Array.isArray(e[kind])) {errors.push(`Event ${e.id} needs a ${kind} count map.`);continue;}
      for(const [p,n] of Object.entries(e[kind])) if(!ps.has(p)||!count(n)) errors.push(`Invalid ${kind} arc ${e.id}/${p}.`);
    }
  }
  return {valid:!errors.length,errors};
}
function schema(fragments,connections) {
  const errors=[];
  if(!Array.isArray(fragments)||!Array.isArray(connections)) return {errors:['Fragments and connections must be arrays.']};
  const ids=new Set(),events=new Set(),ports=new Map(); let places=0;
  for(const f of fragments) {
    const v=validateFragment(f); errors.push(...v.errors.map(x=>`${f?.id||'?'}: ${x}`));
    if(!v.valid) continue;
    if(ids.has(f.id)) errors.push(`Duplicate fragment id ${f.id}.`); ids.add(f.id); places+=f.places.length;
    for(const e of f.events) {if(events.has(e.id)) errors.push(`Occurrence alias ${e.id}; use distinct event ids.`);events.add(e.id);}
    for(const p of f.ports) ports.set(`${f.id}.${p.id}`,{...p,key:`${f.id}.${p.place}`,type:f.places.find(q=>q.id===p.place).type,fragment:f.id});
  }
  if(events.size>8) errors.push('The composed scope exceeds eight unique once-only events.');
  if(places>24) errors.push('The composed scope exceeds 24 places.');
  const usedFrom=new Set(),usedTo=new Set();
  for(const c of connections) {
    if(!c||typeof c!=='object') {errors.push('A connection must name from and to ports.');continue;}
    const a=ports.get(c.from),b=ports.get(c.to);
    if(!a||!b) {errors.push(`Unknown connection port ${c.from} → ${c.to}.`);continue;}
    if(a.direction!=='out'||b.direction!=='in') errors.push('Connections run from an output port to an input port.');
    if(a.type!==b.type) errors.push(`Type mismatch ${a.type} / ${b.type}.`);
    if(a.fragment===b.fragment) errors.push('Connections join different fragments.');
    if(usedFrom.has(c.from)||usedTo.has(c.to)) errors.push('Each output and input port may participate in at most one connection.');
    usedFrom.add(c.from);usedTo.add(c.to);
  }
  return {errors,ports,usedTo};
}
function subsets(mask,n) {
  const remaining=((1<<n)-1)^mask, out=[];
  for(let t=remaining;t;t=(t-1)&remaining) out.push(t);
  return out.sort((a,b)=>pop(a)-pop(b)||a-b);
}
function wordInfo(behavior,maxWords) {
  const out=[],edges=new Map(); let complete=true;
  for(const e of behavior.steps) if(e.events.length===1) {if(!edges.has(e.from))edges.set(e.from,[]);edges.get(e.from).push(e);}
  const full=(1<<behavior.eventIds.length)-1;
  function walk(mask,path) {
    if(mask===full) {if(out.length>=maxWords){complete=false;return;}out.push(path);return;}
    for(const e of edges.get(mask)||[]) {if(!complete)return;walk(e.to,[...path,e.events[0]]);}
  }
  if(behavior.states.some(s=>s.mask===0)) walk(0,[]);
  return {words:out,wordsComplete:complete&&behavior.status==='complete'};
}
export function serialWords(behavior,options={}) {return wordInfo(behavior,capsOf(options).caps.maxWords);}
function explore(eventIds,places,initial,canStep,effect,options={},additionalReasons=[]) {
  const {caps,errors}=capsOf(options); if(errors.length)return blank('invalid',errors);
  const n=eventIds.length, full=(1<<n)-1, states=[],steps=[],seen=new Set(),queue=[]; const reasons=[...additionalReasons];
  const over=m=>Object.values(m).some(v=>v>caps.maxCount||!Number.isSafeInteger(v)||v<0);
  if(over(initial))return {...blank('incomplete',[],['Initial marking exceeds the count bound.']),eventIds};
  const add=(mask,m)=>{seen.add(mask);queue.push({mask,completed:eventIds.filter((_,i)=>mask&(1<<i)),marking:m,terminal:mask===full});};
  add(0,initial); let stop=false;
  while(queue.length&&!stop) {
    const s=queue.shift();states.push(s);
    for(const t of subsets(s.mask,n)) {
      const selected=eventIds.filter((_,i)=>t&(1<<i));
      if(!canStep(s,t,selected))continue;
      const m=effect(s.marking,selected,s),target=s.mask|t;
      if(over(m)) {reasons.push('A reachable next marking exceeds the count bound.');continue;}
      if(steps.length>=caps.maxSteps) {reasons.push('Step bound reached.');stop=true;break;}
      if(!seen.has(target)&&seen.size>=caps.maxStates) {reasons.push('State bound reached.');stop=true;break;}
      steps.push({from:s.mask,to:target,events:selected});
      if(!seen.has(target))add(target,m);
    }
  }
  // Queue states are reached by retained edges, so retain them even after a cutoff.
  states.push(...queue);
  states.sort((a,b)=>pop(a.mask)-pop(b.mask)||a.mask-b.mask);
  const result={status:reasons.length?'incomplete':'complete',errors:[],reasons:[...new Set(reasons)],eventIds,places:copy(places),states,steps};
  return {...result,...wordInfo(result,caps.maxWords)};
}
function demand(events,ids,kind) {
  const m=Object.create(null); for(const id of ids)for(const [p,n]of Object.entries(events.get(id)[kind]))m[p]=(m[p]||0)+n; return m;
}
function applyEffect(events,marking,ids) {
  const next={...marking};for(const id of ids) {const e=events.get(id);for(const [p,n]of Object.entries(e.consume))next[p]-=n;for(const [p,n]of Object.entries(e.produce))next[p]+=n;}return next;
}
/** Direct ordinary-net traversal, no compiled-fragment transitions used. */
export function exploreNet(net,options={}) {
  if(net?.status==='invalid')return blank('invalid',net.errors);
  if(!net||!Array.isArray(net.events)||!Array.isArray(net.places))return blank('invalid',['Malformed ordinary net.']);
  // Gluing can sum several individually valid source counts. Such a sum is a
  // computation-bound issue, not a malformed-source issue.
  const boundedForValidation=n=>Number.isSafeInteger(n)&&n>100000?100000:n;
  const fake={id:'Net',places:net.places.map((p,i)=>({...p,id:`p${i}`,initial:boundedForValidation(p.initial)})),ports:[],events:net.events.map(e=>({...e,consume:Object.fromEntries(Object.entries(e.consume||{}).map(([p,n])=>[`p${net.places.findIndex(q=>q.id===p)}`,boundedForValidation(n)])),produce:Object.fromEntries(Object.entries(e.produce||{}).map(([p,n])=>[`p${net.places.findIndex(q=>q.id===p)}`,boundedForValidation(n)]))}))};
  const v=validateFragment(fake); if(!v.valid)return blank('invalid',v.errors);
  if(new Set(net.places.map(p=>p.id)).size!==net.places.length)return blank('invalid',['Duplicate ordinary net places.']);
  const events=new Map(net.events.map(e=>[e.id,e])),ids=sorted(events.keys()),initial=Object.fromEntries(net.places.map(p=>[p.id,p.initial]));
  return explore(ids,net.places,initial,(s,t,selected)=>Object.entries(demand(events,selected,'consume')).every(([p,n])=>s.marking[p]>=n),(m,selected)=>applyEffect(events,m,selected),options);
}
export function compileContract(fragment,options={}) {
  const v=validateFragment(fragment),cap=capsOf(options);
  if(!v.valid||cap.errors.length)return {kind:'fragment-contract',status:'invalid',errors:[...v.errors,...cap.errors],source:fragment,states:[],steps:[]};
  const f=copy(fragment),boundary=new Set(f.ports.map(p=>p.place)),internal=f.places.filter(p=>!boundary.has(p.id));
  const events=new Map(f.events.map(e=>[e.id,e])),ids=sorted(events.keys()),initial=Object.fromEntries(internal.map(p=>[p.id,p.initial]));
  const relaxed=explore(ids,internal,initial,(s,t,selected)=>Object.entries(demand(events,selected,'consume')).filter(([p])=>!boundary.has(p)).every(([p,n])=>s.marking[p]>=n),(m,selected)=>{
    const next={...m};for(const id of selected){const e=events.get(id);for(const [p,n]of Object.entries(e.consume))if(!boundary.has(p))next[p]-=n;for(const [p,n]of Object.entries(e.produce))if(!boundary.has(p))next[p]+=n;}return next;
  },options);
  const symbolic=f.events.map(e=>({id:e.id,duration:e.duration,demand:Object.fromEntries(Object.entries(e.consume).filter(([p])=>boundary.has(p))),output:Object.fromEntries(Object.entries(e.produce).filter(([p])=>boundary.has(p)))}));
  return {kind:'fragment-contract',status:relaxed.status,errors:relaxed.errors,reasons:relaxed.reasons,source:f,id:f.id,title:f.title||f.id,places:copy(f.places),ports:copy(f.ports),eventAnnotations:f.events.map(e=>({id:e.id,label:e.label||e.id,duration:e.duration})),eventIds:ids,states:relaxed.states,steps:relaxed.steps,boundary:[...boundary],symbolic};
}
/** Source-level gluing: repeatedly merge source place classes, then relabel arcs. */
export function glueFragments(fragments,connections=[],options={}) {
  const s=schema(fragments,connections),cap=capsOf(options);if(s.errors.length||cap.errors.length)return {status:'invalid',errors:[...s.errors,...cap.errors],places:[],events:[]};
  let classes=fragments.flatMap(f=>f.places.map(p=>[`${f.id}.${p.id}`]));
  for(const c of connections){const a=s.ports.get(c.from).key,b=s.ports.get(c.to).key;const ai=classes.findIndex(g=>g.includes(a)),bi=classes.findIndex(g=>g.includes(b));if(ai!==bi){classes[ai].push(...classes[bi]);classes.splice(bi,1);}}
  const rename=new Map(); for(const g of classes){const key=sorted(g).join('=');for(const p of g)rename.set(p,key);}
  const places=classes.map(g=>({id:sorted(g).join('='),type:'',initial:0})),by=new Map(places.map(p=>[p.id,p]));
  for(const f of fragments){for(const p of f.places){const q=by.get(rename.get(`${f.id}.${p.id}`));q.type=p.type;q.initial+=p.initial;}for(const p of f.ports)if(p.direction==='in'&&(!s.usedTo.has(`${f.id}.${p.id}`)||options.retainConnectedSupply))by.get(rename.get(`${f.id}.${p.place}`)).initial+=p.supply??0;}
  const remap=(f,map)=>{const out={};for(const[p,n]of Object.entries(map)){const key=rename.get(`${f.id}.${p}`);out[key]=(out[key]||0)+n;}return out;};
  const events=fragments.flatMap(f=>f.events.map(e=>({...copy(e),consume:remap(f,e.consume),produce:remap(f,e.produce)})));
  return {status:'complete',errors:[],places:places.sort((a,b)=>a.id.localeCompare(b.id)),events,connections:copy(connections),ownership:classes.map(sorted)};
}
function flattenContracts(contracts,connections) {
  const components=[],wires=[...connections],inheritedReasons=[];
  for(const c of contracts){if(c?.kind==='composite-contract'){components.push(...c.components);wires.push(...c.connections);if(c.behavior.status!=='complete')inheritedReasons.push('An intermediate composite is incomplete or invalid.');}else components.push(c);}
  return {components,connections:wires,inheritedReasons};
}
/** Compose enriched local step machines. No source net is glued or explored here. */
export function composeContracts(contracts,connections=[],options={}) {
  if(!Array.isArray(contracts)||!Array.isArray(connections))return {kind:'composite-contract',components:[],connections:[],behavior:blank('invalid',['Contracts and connections must be arrays.'])};
  const flat=flattenContracts(contracts,connections),cs=flat.components,wires=flat.connections;
  if(cs.some(c=>!c||c.kind!=='fragment-contract'||c.status==='invalid'))return {kind:'composite-contract',...flat,behavior:blank('invalid',cs.flatMap(c=>c?.errors||['Malformed contract.']))};
  // Only contract declarations, internal state tables and symbolic boundary
  // demands are read below. `source` is retained solely for audit/direct replay.
  const fs=cs.map(c=>({id:c.id,places:c.places,ports:c.ports,events:c.eventAnnotations.map(e=>({...e,consume:{},produce:{}}))})),s=schema(fs,wires),cap=capsOf(options);
  if(s.errors.length||cap.errors.length)return {kind:'composite-contract',...flat,behavior:blank('invalid',[...s.errors,...cap.errors])};
  // A separate adjacency traversal computes boundary ownership classes.
  const adjacency=new Map(fs.flatMap(f=>f.places.map(p=>[`${f.id}.${p.id}`,new Set()])));
  for(const w of wires){const a=s.ports.get(w.from).key,b=s.ports.get(w.to).key;adjacency.get(a).add(b);adjacency.get(b).add(a);}
  const groups=[],visited=new Set(),rename=new Map();
  for(const p of adjacency.keys())if(!visited.has(p)){const group=[],queue=[p];visited.add(p);while(queue.length){const x=queue.pop();group.push(x);for(const y of adjacency.get(x))if(!visited.has(y)){visited.add(y);queue.push(y);}}const key=sorted(group).join('=');groups.push({key,members:group});for(const x of group)rename.set(x,key);}
  const initial=Object.fromEntries(groups.map(g=>[g.key,0])),types={};
  for(const f of fs){for(const p of f.places){const key=rename.get(`${f.id}.${p.id}`);initial[key]+=p.initial;types[key]=p.type;}for(const p of f.ports)if(p.direction==='in'&&!s.usedTo.has(`${f.id}.${p.id}`))initial[rename.get(`${f.id}.${p.place}`)]+=p.supply??0;}
  const ids=sorted(fs.flatMap(f=>f.events.map(e=>e.id))),index=new Map(ids.map((x,i)=>[x,i]));
  const local=cs.map(c=>({...c,edgeSet:new Set(c.steps.map(e=>`${e.from}:${e.to}`)),stateMap:new Map(c.states.map(s=>[s.mask,s])),globalBits:c.eventIds.map(id=>1<<index.get(id))}));
  const boundaryEvents=new Map();
  for(const c of cs)for(const symbolic of c.symbolic){const remap=map=>{const out={};for(const[p,n]of Object.entries(map)){const key=rename.get(`${c.id}.${p}`);out[key]=(out[key]||0)+n;}return out;};boundaryEvents.set(symbolic.id,{consume:remap(symbolic.demand),produce:remap(symbolic.output)});}
  const maskFor=(c,m)=>c.globalBits.reduce((sum,bit,i)=>sum+((m&bit)?1<<i:0),0);
  const places=groups.map(g=>({id:g.key,type:types[g.key],initial:initial[g.key]}));
  const behavior=explore(ids,places,initial,(state,t,selected)=>{
    for(const c of local){const before=maskFor(c,state.mask),after=maskFor(c,state.mask|t);if(!c.stateMap.has(before)||!c.stateMap.has(after)||(before!==after&&!c.edgeSet.has(`${before}:${after}`)))return false;}
    if(!Object.entries(demand(boundaryEvents,selected,'consume')).every(([p,n])=>state.marking[p]>=n))return false;
    if(options.stepGuard&&!options.stepGuard(state,selected))return false;
    return true;
  },(m,selected,state)=>{
    const next=applyEffect(boundaryEvents,m,selected),t=selected.reduce((mask,id)=>mask|(1<<index.get(id)),0);
    for(const c of local){const target=c.stateMap.get(maskFor(c,state.mask|t));for(const[p,n]of Object.entries(target.marking))next[rename.get(`${c.id}.${p}`)]=n;}
    return next;
  },options,[...flat.inheritedReasons,...(cs.some(c=>c.status!=='complete')?['An input contract is incomplete.']:[])]);
  return {kind:'composite-contract',...flat,status:behavior.status,behavior};
}
export function tensorContracts(contracts,options={}) {return composeContracts(contracts,[],options);}
export function identityFragment(id,type,supply=0) {return {id,title:'Identity wire',places:[{id:'wire',type,initial:0}],ports:[{id:'input',place:'wire',direction:'in',supply},{id:'output',place:'wire',direction:'out'}],events:[]};}
export function renameFragment(fragment,{id=fragment.id,events={},places={},ports={}}={}) {
  const rename=(map,key)=>own(map,key)?map[key]:key;
  const f=copy(fragment);f.id=id;f.places=f.places.map(p=>({...p,id:rename(places,p.id)}));f.ports=f.ports.map(p=>({...p,id:rename(ports,p.id),place:rename(places,p.place)}));f.events=f.events.map(e=>({...e,id:rename(events,e.id),consume:Object.fromEntries(Object.entries(e.consume).map(([p,n])=>[rename(places,p),n])),produce:Object.fromEntries(Object.entries(e.produce).map(([p,n])=>[rename(places,p),n]))}));return f;
}
const stateKey=s=>s.completed.join(',');
const edgeKey=(b,e)=>`${b.eventIds.filter((_,i)=>e.from&(1<<i)).join(',')}→${e.events.join(',')}`;
export function compareBehaviors(left,right,options={}) {
  if(left.status!=='complete'||right.status!=='complete')return {status:'unknown',counterexample:null,reason:'Both state/step enumerations must be complete.'};
  if(left.eventIds.join('|')!==right.eventIds.join('|'))return {status:'different',counterexample:{kind:'scope',left:left.eventIds,right:right.eventIds}};
  const ls=new Map(left.states.map(s=>[stateKey(s),s])),rs=new Map(right.states.map(s=>[stateKey(s),s]));
  const keys=sorted(new Set([...ls.keys(),...rs.keys()])).sort((a,b)=>a.split(',').filter(Boolean).length-b.split(',').filter(Boolean).length||a.localeCompare(b));
  const le=new Map(left.steps.map(e=>[edgeKey(left,e),e])),re=new Map(right.steps.map(e=>[edgeKey(right,e),e]));
  const candidates=[...new Set([...le.keys(),...re.keys()])].filter(k=>!le.has(k)||!re.has(k)).map(k=>({key:k,edge:le.get(k)||re.get(k),presentIn:le.has(k)?'left':'right'}));
  candidates.sort((a,b)=>pop(a.edge.from)-pop(b.edge.from)||a.edge.events.length-b.edge.events.length||a.key.localeCompare(b.key));
  if(candidates.length){const c=candidates[0],b=c.presentIn==='left'?left:right;const paths=new Map([[0,[]]]);for(const s of b.states)for(const edge of b.steps.filter(e=>e.from===s.mask&&e.events.length===1))if(paths.has(edge.from)&&!paths.has(edge.to))paths.set(edge.to,[...paths.get(edge.from),...edge.events]);return {status:'different',counterexample:{kind:'step',completed:b.eventIds.filter((_,i)=>c.edge.from&(1<<i)),events:c.edge.events,presentIn:c.presentIn,marking:b.states.find(s=>s.mask===c.edge.from)?.marking,trace:paths.get(c.edge.from)||[]}};}
  for(const key of keys)if(!ls.has(key)||!rs.has(key))return {status:'different',counterexample:{kind:'state',completed:key?key.split(','):[],presentIn:ls.has(key)?'left':'right',state:ls.get(key)||rs.get(key)}};
  const project=(marking,side)=>{const map=options.markingProjection?.[side]||{},out=Object.create(null);for(const[p,n]of Object.entries(marking)){const target=own(map,p)?map[p]:p;if(target===null)continue;out[target]=(out[target]||0)+n;}return Object.fromEntries(sorted(Object.keys(out)).map(p=>[p,out[p]]));};
  if(options.compareMarkings!==false)for(const key of keys){const l=project(ls.get(key).marking,'left'),r=project(rs.get(key).marking,'right');if(JSON.stringify(l)!==JSON.stringify(r))return {status:'different',counterexample:{kind:'marking',completed:key?key.split(','):[],left:l,right:r},markingsChecked:true};}
  return {status:'equivalent',counterexample:null,states:left.states.length,steps:left.steps.length,markingsChecked:options.compareMarkings!==false};
}
/** A conservative schedule: a joint step starts together; the next waits for every finish. */
export function representativeSchedule(net,behavior) {
  if(behavior.status!=='complete')return {status:'unknown',reason:'State/step exploration is incomplete.',layers:[],intervals:[]};
  const full=(1<<behavior.eventIds.length)-1,by=new Map();for(const e of behavior.steps){if(!by.has(e.from))by.set(e.from,[]);by.get(e.from).push(e);}
  const memo=new Map();function route(mask){if(mask===full)return [];if(memo.has(mask))return memo.get(mask);const choices=[...(by.get(mask)||[])].sort((a,b)=>b.events.length-a.events.length||a.to-b.to);for(const e of choices){const rest=route(e.to);if(rest){const found=[e,...rest];memo.set(mask,found);return found;}}memo.set(mask,null);return null;}
  const path=route(0);if(!path)return {status:'impossible',reason:'No full selected-work completion in this complete finite model.',layers:[],intervals:[]};
  const events=new Map(net.events.map(e=>[e.id,e])),layers=[],intervals=[];let time=0;
  for(const step of path){const start=time;for(const id of step.events)intervals.push({event:id,start,finish:start+events.get(id).duration});time+=Math.max(...step.events.map(id=>events.get(id).duration));layers.push({events:step.events,start,finish:time});}
  const checked=replaySchedule(net,intervals);return {status:checked.valid?'valid':'invalid',layers,intervals,makespan:time,replay:checked,assumption:'Consume at start, produce at finish; next layer waits for all finishes. Toy durations; no optimality claim.'};
}
export function scheduleForWord(net,word) {
  const by=new Map(net.events.map(e=>[e.id,e])),intervals=[];let time=0;
  for(const id of word){if(!by.has(id))return {status:'invalid',reason:`Unknown event ${id}.`,intervals:[]};const duration=by.get(id).duration;intervals.push({event:id,start:time,finish:time+duration});time+=duration;}
  const replay=replaySchedule(net,intervals);return {status:replay.valid?'valid':'invalid',intervals,makespan:time,replay};
}
export function replaySchedule(net,intervals) {
  const errors=[],events=new Map((net.events||[]).map(e=>[e.id,e])),seen=new Set(),marking=Object.fromEntries((net.places||[]).map(p=>[p.id,p.initial]));
  if(!Array.isArray(intervals))return {valid:false,errors:['Intervals must be an array.']};
  for(const x of intervals){const e=events.get(x.event);if(!e||seen.has(x.event)||!Number.isFinite(x.start)||x.start<0||!Number.isFinite(x.finish)||x.finish<=x.start||Math.abs(x.finish-x.start-e.duration)>1e-9)errors.push(`Invalid occurrence interval ${x.event}.`);seen.add(x.event);}
  if(seen.size!==events.size||[...events.keys()].some(id=>!seen.has(id)))errors.push('The schedule must complete every selected occurrence exactly once.');
  if(errors.length)return {valid:false,errors};
  const times=sorted(new Set(intervals.flatMap(x=>[x.start,x.finish]))).sort((a,b)=>a-b),trace=[];
  for(const time of times){for(const x of intervals.filter(x=>x.finish===time))for(const[p,n]of Object.entries(events.get(x.event).produce))marking[p]+=n;const starts=intervals.filter(x=>x.start===time).map(x=>x.event),needed=demand(events,starts,'consume');for(const[p,n]of Object.entries(needed))if(marking[p]<n)errors.push(`At time ${time}, ${p} has ${marking[p]} but jointly needs ${n}.`);if(errors.length)break;for(const[p,n]of Object.entries(needed))marking[p]-=n;trace.push({time,started:starts,finished:intervals.filter(x=>x.finish===time).map(x=>x.event),marking:{...marking}});}
  return {valid:!errors.length,errors,trace,finalMarking:marking};
}
function naiveBehavior(scenario,contracts,net,options) {
  const kind=scenario.naive;if(!kind)return null;
  let behavior,explanation;
  if(kind==='closed-summary') {
    const weakened=contracts.map(c=>{if(c.status==='invalid')return c;const closed=exploreNet(glueFragments([c.source],[],options),options);return {...c,steps:closed.steps,status:closed.status};});
    behavior=composeContracts(weakened,scenario.connections,options).behavior;
    explanation='Keeping only each fragment’s standalone reachable steps discards externally blocked events that a connected supplier can enable.';
  } else if(kind==='double-supply') {
    behavior=exploreNet(glueFragments(scenario.fragments,scenario.connections,{...options,retainConnectedSupply:true}),options);
    explanation='The defective connection keeps the receiver’s external supply after adding the supplier’s owned token, inventing extra capacity.';
  } else if(kind==='completion-barrier') {
    const s=schema(scenario.fragments,scenario.connections),requirements=new Map();
    for(const w of scenario.connections){const a=s.ports.get(w.from),b=s.ports.get(w.to),source=scenario.fragments.find(f=>f.id===a.fragment),receiver=scenario.fragments.find(f=>f.id===b.fragment);for(const e of receiver.events)if((e.consume[b.place]||0)>0)requirements.set(e.id,[...(requirements.get(e.id)||[]),...source.events.map(e=>e.id)]);}
    behavior=composeContracts(contracts,scenario.connections,{...options,stepGuard:(state,ids)=>ids.every(id=>(requirements.get(id)||[]).every(r=>state.completed.includes(r)))}).behavior;
    explanation='The defective summary waits for every source-fragment event, hiding outputs released before whole-fragment completion.';
  } else if(kind==='all-producers') {
    const requirements=new Map();for(const e of net.events){const producers=net.events.filter(a=>a.id!==e.id&&Object.keys(e.consume).some(p=>(a.produce[p]||0)>0)).map(a=>a.id);requirements.set(e.id,producers);}
    behavior=composeContracts(contracts,scenario.connections,{...options,stepGuard:(s,ids)=>ids.every(id=>requirements.get(id).every(p=>s.completed.includes(p)))}).behavior;
    explanation='The defective union of producer precedences requires every producer, replacing either-support by both-support.';
  } else if(kind==='type-pooling') {
    const types=sorted(new Set(net.places.map(p=>p.type))),name=new Map(net.places.map(p=>[p.id,`type${types.indexOf(p.type)}`]));
    const places=types.map((type,i)=>({id:`type${i}`,type,initial:net.places.filter(p=>p.type===type).reduce((n,p)=>n+p.initial,0)}));
    const remap=map=>{const out={};for(const[p,n]of Object.entries(map))out[name.get(p)]=(out[name.get(p)]||0)+n;return out;};
    behavior=exploreNet({places,events:net.events.map(e=>({...e,consume:remap(e.consume),produce:remap(e.produce)}))},options);
    explanation='The defective operation pools places because their type labels match, allowing one separately owned resource to cross an unconnected boundary.';
  } else return {kind,comparison:{status:'unknown',counterexample:null},explanation:'No defective comparator is defined for this example.'};
  return {kind,behavior,explanation};
}
export function analyze(scenario,options={}) {
  if(!scenario||!Array.isArray(scenario.fragments)||!Array.isArray(scenario.connections))return {...blank('invalid',['A scenario needs fragments and connections arrays.']),comparison:{status:'unknown'},schedule:{status:'unknown',layers:[],intervals:[]}};
  const contracts=scenario.fragments.map(f=>compileContract(f,options)),composite=composeContracts(contracts,scenario.connections,options),behavior=composite.behavior,net=glueFragments(scenario.fragments,scenario.connections,options),direct=exploreNet(net,options),comparison=compareBehaviors(behavior,direct);
  let naive=null;if(behavior.status!=='invalid'){naive=naiveBehavior(scenario,contracts,net,options);if(naive?.behavior)naive.comparison=compareBehaviors(behavior,naive.behavior,{compareMarkings:scenario.naive!=='type-pooling'});}
  return {...behavior,comparison,naive,contracts,net,direct,schedule:representativeSchedule(net,behavior),stats:{states:behavior.states.length,steps:behavior.steps.length,words:behavior.words.length,wordsComplete:behavior.wordsComplete,events:behavior.eventIds.length,contractStates:contracts.reduce((n,c)=>n+c.states.length,0),contractSteps:contracts.reduce((n,c)=>n+c.steps.length,0)}};
}
