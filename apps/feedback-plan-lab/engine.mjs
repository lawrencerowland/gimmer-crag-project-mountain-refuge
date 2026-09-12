import {validateModel, replay, closure} from '../causal-plan-lab/core.mjs';
import {analyseFamily} from '../process-contract-lab/families.mjs';
import {compileTerm} from '../process-contract-lab/composition.mjs';

export const ENGINE_VERSION = '1.0.0';
export const LIMITS = Object.freeze({maxHorizon:8,maxTransitions:32,maxPlaces:64,maxModelCharacters:250000,maxStates:20000,maxEdges:100000,maxPaths:10000,maxPathNodes:100000,maxCharacters:24000000});
const DEFAULTS={maxStates:6000,maxEdges:24000,maxPaths:2500,maxPathNodes:30000,maxCharacters:12000000};
const rec=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
const MAX=BigInt(Number.MAX_SAFE_INTEGER);
const initial=model=>Object.fromEntries(model.places.map(p=>[p.id,p.initial]));
const goalMet=(model,m)=>Object.entries(model.goal).every(([p,n])=>m[p]>=n);
const enabled=(m,t)=>Object.entries(t.inputs).every(([p,n])=>m[p]>=n);
const adapt=(model,horizon)=>({...model,transitions:model.transitions.map(t=>rec(t)?{...t,maxFirings:horizon}:t)});
const key=(model,m,remaining)=>JSON.stringify([remaining,model.places.map(p=>m[p.id])]);
const POLICY_SCOPE='Fully observed sequential atomic decisions, using only the current marking and remaining occurrence horizon. Every enabled environment transition is an adverse choice; no per-transition firing limit, probability or fairness assumption.';
const CERT_SCOPE='Producer-count ancestries of this realised first-goal trace. Earliest schedules are retrospective fixed-branch representatives, not the online feedback policy or its sequential worst-case duration.';

export function validate(model){
  if(!rec(model))return {ok:false,errors:['Model must be an object.']};
  const adapted={...model,transitions:Array.isArray(model.transitions)?model.transitions.map(t=>rec(t)?{...t,maxFirings:8}:t):model.transitions};
  const errors=[...validateModel(adapted).errors];
  if(model.places?.length>LIMITS.maxPlaces)errors.push('At most 64 places are supported.');
  if(model.transitions?.length>LIMITS.maxTransitions)errors.push('At most 32 transition definitions are supported.');
  for(const t of Array.isArray(model.transitions)?model.transitions:[])if(rec(t)){
    if(!['planner','environment'].includes(t.owner))errors.push(`Transition ${t.id}: owner must be planner or environment.`);
    if(Object.hasOwn(t,'maxFirings'))errors.push(`Transition ${t.id}: maxFirings is not allowed; a per-transition cap can censor adverse outcomes. Use the global occurrence horizon.`);
  }
  for(const x of [...(Array.isArray(model.places)?model.places:[]),...(Array.isArray(model.transitions)?model.transitions:[])])if(typeof x?.id==='string'&&x.id.length>100)errors.push('Place and transition ids must have at most 100 characters.');
  try{if(JSON.stringify(model).length>LIMITS.maxModelCharacters)errors.push('Model exceeds 250000 serialized characters.');}catch{errors.push('Model must be JSON-serializable.');}
  return {ok:errors.length===0,errors,scope:'Valid finite count-mechanism schema; ownership is additionally checked at every explored non-goal marking. Not engineering approval.'};
}
function horizonOption(options,defaultHorizon){const errors=[];if(!rec(options))return {errors:['Options must be an object.'],horizon:defaultHorizon};const horizon=options.horizon===undefined?defaultHorizon:options.horizon;if(!Number.isInteger(horizon)||horizon<1||horizon>8)errors.push('horizon must be an integer from 1 to 8.');return {errors,horizon};}
function choices(model,m){const ts=model.transitions.filter(t=>enabled(m,t));return {transitions:ts,owner:ts[0]?.owner??null,ambiguous:new Set(ts.map(t=>t.owner)).size>1};}
function advance(model,m,t){const out=Object.fromEntries(model.places.map(p=>[p.id,BigInt(m[p.id])]));for(const[p,n]of Object.entries(t.inputs))out[p]-=BigInt(n);for(const[p,n]of Object.entries(t.outputs))out[p]+=BigInt(n);for(const[p,n]of Object.entries(out))if(n<0n||n>MAX)throw new RangeError(`Marking at ${p} leaves the supported nonnegative safe-integer range; no transition may be omitted to avoid this error.`);return Object.fromEntries(Object.entries(out).map(([p,n])=>[p,Number(n)]));}
function addTime(a,b){const sum=a+b;if(!Number.isFinite(sum)||(a>0&&b>0&&(sum===a||sum===b)))throw new RangeError('Sequential duration exceeds finite precision or loses a positive duration.');return sum;}
function ambiguity(m,trace){return `Ambiguous ownership at non-goal marking ${JSON.stringify(m)} after ${JSON.stringify(trace)}: planner and environment transitions are both enabled; no priority is assumed.`;}

export function replayTrace(model,trace,options={}){
  const h=horizonOption(options,8),errors=[...validate(model).errors,...h.errors];
  const out={ok:false,errors,trace:Array.isArray(trace)?[...trace]:[],events:[],markings:[],marking:{},remaining:h.horizon,goalReached:false,owner:null,enabled:[],terminal:null};
  if(!Array.isArray(trace)||trace.some(x=>typeof x!=='string'))errors.push('Trace must be an array of transition id strings.');
  else if(trace.length>h.horizon)errors.push('Trace exceeds the global occurrence horizon.');
  if(errors.length)return out;
  let m=initial(model);out.markings.push(clone(m));const counts=new Map();
  try{for(const id of trace){
    if(goalMet(model,m))throw Error('Trace continues after first goal coverage.');
    const c=choices(model,m);if(c.ambiguous)throw Error(ambiguity(m,out.events.map(e=>e.transitionId)));
    const t=c.transitions.find(t=>t.id===id);if(!t)throw Error(`Transition ${id} is unknown or not enabled at trace position ${out.events.length+1}.`);
    const n=(counts.get(id)??0)+1;counts.set(id,n);m=advance(model,m,t);out.events.push({id:`${id}#${n}`,transitionId:id,label:t.label??id,duration:t.duration,owner:t.owner,index:out.events.length});out.markings.push(clone(m));
  }
  out.marking=m;out.remaining=h.horizon-trace.length;out.goalReached=goalMet(model,m);
  if(out.goalReached)out.terminal='goal';else{const c=choices(model,m);if(c.ambiguous)throw Error(ambiguity(m,trace));out.owner=c.owner;out.enabled=c.transitions.map(t=>t.id);out.terminal=out.remaining===0?'cutoff':!c.transitions.length?'deadlock':null;}
  const checked=replay(adapt(model,h.horizon),trace);if(!checked.ok)throw Error(checked.errors.join(' '));
  if(JSON.stringify(checked.finalMarking)!==JSON.stringify(m))throw Error('Independent legacy replay disagrees with count marking.');
  }catch(error){errors.push(error.message);}
  out.ok=errors.length===0;return out;
}

export function analyse(model,options={}){
  const h=horizonOption(options,6),errors=[...validate(model).errors,...h.errors],limits={...DEFAULTS},stats={reachedLimits:[],characters:0,pathNodes:0};
  if(rec(options))for(const name of Object.keys(DEFAULTS)){const n=options[name]===undefined?DEFAULTS[name]:options[name];if(!Number.isSafeInteger(n)||n<1||n>LIMITS[name])errors.push(`${name} must be an integer from 1 to ${LIMITS[name]}.`);else limits[name]=n;}
  const completeness={graph:true,paths:true,policy:true};
  const out={ok:false,errors,version:ENGINE_VERSION,modelId:model?.id??null,horizon:h.horizon,limits,stats,complete:false,completeness,initialStateId:null,states:[],edges:[],paths:[],summary:{possible:null,guaranteed:null,worstDuration:null,winningChoices:null,bestChoice:null,stateCount:0,edgeCount:0,pathCount:0},policy:{complete:false,scope:POLICY_SCOPE,decisions:[],proof:null},scope:POLICY_SCOPE};
  const hit=(name,part)=>{if(!stats.reachedLimits.includes(name))stats.reachedLimits.push(name);completeness[part]=false;};
  const retain=(value,part)=>{const n=JSON.stringify(value).length;if(stats.characters+n>limits.maxCharacters){hit('maxCharacters',part);return false;}stats.characters+=n;return true;};
  if(errors.length){for(const k of Object.keys(completeness))completeness[k]=false;return out;}
  const nodes=new Map(),adjacency=new Map();
  function node(m,remaining,trace){
    const k=key(model,m,remaining);if(nodes.has(k))return nodes.get(k);
    if(out.states.length>=limits.maxStates){hit('maxStates','graph');return null;}
    const done=goalMet(model,m),c=done?{transitions:[],owner:null,ambiguous:false}:choices(model,m);
    if(c.ambiguous)throw Error(ambiguity(m,trace));
    const terminal=done?'goal':remaining===0?'cutoff':!c.transitions.length?'deadlock':null;
    const s={id:`s${out.states.length}`,key:k,marking:m,remaining,owner:c.owner,terminal,enabled:c.transitions.map(t=>t.id),possible:null,guaranteed:null,winningChoices:null,bestChoice:null,worstDuration:null,exampleTrace:trace};
    if(!retain(s,'graph'))return null;nodes.set(k,s);out.states.push(s);adjacency.set(s.id,[]);return s;
  }
  try{
    out.initialStateId=node(initial(model),h.horizon,[])?.id??null;
    graph:for(const s of out.states){if(s.terminal)continue;for(const id of s.enabled){
      if(out.edges.length>=limits.maxEdges){hit('maxEdges','graph');break graph;}
      const t=model.transitions.find(t=>t.id===id),m=advance(model,s.marking,t),next=node(m,s.remaining-1,[...s.exampleTrace,id]);if(!next)continue;
      const e={id:`e${out.edges.length}`,from:s.id,to:next.id,transitionId:id,owner:t.owner,duration:t.duration};if(!retain(e,'graph'))break graph;out.edges.push(e);adjacency.get(s.id).push(e);
    }}
  }catch(error){errors.push(error.message);completeness.graph=false;}
  const byId=new Map(out.states.map(s=>[s.id,s]));
  let stopped=false;
  function paths(s,trace,duration){
    if(stopped)return;
    if(stats.pathNodes>=limits.maxPathNodes){hit('maxPathNodes','paths');stopped=true;return;}stats.pathNodes++;
    if(s.terminal){
      const path={id:`path${out.paths.length}`,trace,terminal:s.terminal,stateId:s.id,duration};
      if(out.paths.length>=limits.maxPaths){hit('maxPaths','paths');stopped=true;return;}
      if(!retain(path,'paths')){stopped=true;return;}out.paths.push(path);return;
    }
    for(const e of adjacency.get(s.id))paths(byId.get(e.to),[...trace,e.transitionId],addTime(duration,e.duration));
  }
  try{if(out.initialStateId)paths(byId.get(out.initialStateId),[],0);}catch(error){errors.push(error.message);completeness.paths=false;}
  if(!completeness.graph)completeness.paths=false;
  if(completeness.graph&&completeness.paths&&!errors.length){
    try{for(const s of [...out.states].sort((a,b)=>a.remaining-b.remaining)){
      if(s.terminal){s.possible=s.terminal==='goal';s.guaranteed=s.possible;s.winningChoices=[];s.worstDuration=s.possible?0:null;continue;}
      const es=adjacency.get(s.id);s.possible=es.some(e=>byId.get(e.to).possible);
      const winning=es.filter(e=>byId.get(e.to).guaranteed);s.winningChoices=s.owner==='planner'?winning.map(e=>e.transitionId):[];
      s.guaranteed=s.owner==='planner'?winning.length>0:winning.length===es.length;
      if(s.guaranteed){const candidates=(s.owner==='planner'?winning:es).map(e=>({id:e.transitionId,cost:addTime(e.duration,byId.get(e.to).worstDuration)}));const best=s.owner==='planner'?Math.min(...candidates.map(c=>c.cost)):Math.max(...candidates.map(c=>c.cost));s.worstDuration=best;if(s.owner==='planner')s.bestChoice=candidates.find(c=>c.cost===best).id;}
    }}catch(error){errors.push(error.message);completeness.policy=false;}
  }else completeness.policy=false;
  out.ok=errors.length===0;out.complete=out.ok&&Object.values(completeness).every(Boolean);
  if(!out.complete){for(const s of out.states){s.possible=s.terminal==='goal'?true:null;s.guaranteed=null;s.winningChoices=null;s.bestChoice=null;s.worstDuration=null;}}
  const start=byId.get(out.initialStateId),observedGoal=out.states.some(s=>s.terminal==='goal');
  out.summary={possible:out.complete?start.possible:observedGoal?true:null,guaranteed:out.complete?start.guaranteed:null,worstDuration:out.complete?start.worstDuration:null,winningChoices:out.complete?start.winningChoices:null,bestChoice:out.complete?start.bestChoice:null,stateCount:out.states.length,edgeCount:out.edges.length,pathCount:out.paths.length,goalPathCount:out.paths.filter(p=>p.terminal==='goal').length,cutoffPathCount:out.paths.filter(p=>p.terminal==='cutoff').length,deadlockPathCount:out.paths.filter(p=>p.terminal==='deadlock').length};
  if(out.complete){out.policy.complete=true;out.policy.decisions=out.states.filter(s=>s.owner==='planner'&&s.guaranteed&&!s.terminal).map(s=>({stateId:s.id,stateKey:s.key,transitionId:s.bestChoice}));if(start.guaranteed){const visited=new Set(),queue=[start.id];let environmentBranches=0;while(queue.length){const id=queue.pop();if(visited.has(id))continue;visited.add(id);const s=byId.get(id);if(s.terminal){if(s.terminal!=='goal')throw Error('Internal winning-policy certificate reaches a non-goal terminal.');continue;}const es=adjacency.get(id).filter(e=>s.owner==='environment'||e.transitionId===s.bestChoice);if(s.owner==='environment')environmentBranches+=es.length;for(const e of es)queue.push(e.to);}out.policy.proof={ok:true,stateIds:[...visited],checkedStates:visited.size,environmentBranches,allTerminalsGoal:true,horizon:h.horizon,worstDuration:start.worstDuration};}}
  return out;
}

// Adapted from R-023 marking-plan-lab/engine.mjs at 84f8cb1: counted diagrams
// are unchanged; timed validation now allows native repeated transition occurrences.
const jsonCount=n=>n<=MAX?Number(n):n.toString();
function demand(model,marking,transitions){const totals=new Map(model.places.map(p=>[p.id,0n]));for(const t of transitions)for(const[p,n]of Object.entries(t.inputs))totals.set(p,totals.get(p)+BigInt(n));const needed=Object.fromEntries([...totals].filter(([,n])=>n>0n).map(([p,n])=>[p,jsonCount(n)]));const shortfalls=[...totals].filter(([p,n])=>n>BigInt(marking[p])).map(([place,n])=>({place,needed:jsonCount(n),available:marking[place],shortfall:jsonCount(n-BigInt(marking[place]))}));return{needed,shortfalls,jointlyEnabled:shortfalls.length===0};}
export function verifySchedule(model,events,schedule){
  const errors=[...validate(model).errors],checkpoints=[];
  const out={ok:false,errors,goalReached:false,finalMarking:{},checkpoints,scope:'Outputs credited at event completion, before starts at the same timestamp; simultaneous starts consume their aggregate inputs. Every retained occurrence must finish.'};
  if(!Array.isArray(events)||!Array.isArray(schedule)){errors.push('Events and schedule arrays are required.');return out;}
  if(events.some(e=>!rec(e)||typeof e.id!=='string'||!e.id||typeof e.transitionId!=='string'||!e.transitionId))errors.push('Every event must be an object with nonempty id and transitionId strings.');
  if(schedule.some(s=>!rec(s)||typeof s.id!=='string'||!s.id))errors.push('Every schedule entry must be an object with a nonempty event id.');
  if(events.length>LIMITS.maxHorizon||schedule.length>LIMITS.maxHorizon)errors.push('Timed replay supports at most eight event occurrences.');
  if(errors.length)return out;
  if(new Set(events.map(e=>e.id)).size!==events.length)errors.push('Every scheduled event occurrence id must be distinct.');
  const occurrenceCounts=new Map();for(const e of events){const n=(occurrenceCounts.get(e.transitionId)??0)+1;occurrenceCounts.set(e.transitionId,n);if(e.id!==e.transitionId+'#'+n)errors.push('Event occurrence IDs must follow transitionId#1, #2, ... in trace order.');}
  if(schedule.length!==events.length||new Set(schedule.map(s=>s.id)).size!==schedule.length||schedule.some(s=>!events.some(e=>e.id===s.id)))errors.push('Schedule must contain each retained occurrence exactly once.');
  const byId=new Map();
  for(const e of events){const t=model.transitions.find(t=>t.id===e.transitionId);if(!t)errors.push(`Unknown scheduled transition ${e.transitionId}.`);else byId.set(e.id,t);}
  for(const s of schedule){const t=byId.get(s.id);if(!Number.isFinite(s.start)||s.start<0||!Number.isFinite(s.end)||s.end<=s.start||t&&s.end!==s.start+t.duration)errors.push(`Invalid start/finish/duration for ${s.id}.`);}
  if(errors.length)return out;
  let marking=initial(model);
  for(const time of [...new Set(schedule.flatMap(s=>[s.start,s.end]))].sort((a,b)=>a-b)){
    const completed=schedule.filter(s=>s.end===time),started=schedule.filter(s=>s.start===time);
    try{
      for(const s of completed)for(const[p,n]of Object.entries(byId.get(s.id).outputs)){const value=BigInt(marking[p])+BigInt(n);if(value>MAX)throw Error(`Timed marking at ${p} exceeds safe integer precision.`);marking[p]=Number(value);}
      const availableAfterCompletion=clone(marking),d=demand(model,marking,started.map(s=>byId.get(s.id)));
      if(!d.jointlyEnabled){errors.push(`Simultaneous starts at time ${time} oversubscribe ${d.shortfalls.map(x=>x.place).join(', ')}.`);break;}
      for(const s of started)for(const[p,n]of Object.entries(byId.get(s.id).inputs))marking[p]-=n;
      checkpoints.push({time,completed:completed.map(s=>s.id),started:started.map(s=>s.id),availableAfterCompletion,consumed:d.needed,markingAfterStarts:clone(marking)});
    }catch(error){errors.push(error.message);break;}
  }
  out.finalMarking=marking;out.goalReached=errors.length===0&&goalMet(model,marking);
  if(!out.goalReached&&!errors.length)errors.push('The finished schedule does not cover its explicit goal.');
  out.ok=errors.length===0;return out;
}

function tokenDiagram(model,events,allocations,order,trace){
  const kinds=new Map(model.places.map(p=>[p.id,p.kind])),type=p=>`${kinds.get(p)}:${p}`;
  const pools=new Map(model.places.map(p=>[p.id,new Map([[null,p.initial]])]));
  for(const e of events){const t=model.transitions.find(t=>t.id===e.transitionId);for(const[p,n]of Object.entries(t.outputs))pools.get(p).set(e.id,n);}
  const wires=[];
  for(const a of allocations){const pool=pools.get(a.place),available=pool.get(a.producer)??0;if(available<a.count)throw Error('Token diagram consumes a producer bundle more than once.');pool.set(a.producer,available-a.count);wires.push({id:`wire${wires.length}`,place:a.place,type:type(a.place),kind:kinds.get(a.place),count:a.count,from:a.producer===null?{kind:'input',place:a.place}:{kind:'event',eventId:a.producer},to:{kind:'event',eventId:a.eventId}});}
  for(const[p,pool]of pools)for(const[producer,count]of pool)if(count>0)wires.push({id:`wire${wires.length}`,place:p,type:type(p),kind:kinds.get(p),count,from:producer===null?{kind:'input',place:p}:{kind:'event',eventId:producer},to:{kind:'output',place:p}});
  const boundaryOutputs=Object.fromEntries([...pools].map(([p,pool])=>[p,[...pool.values()].reduce((a,b)=>a+b,0)]));
  const diagram={mode:'counted-typed-token-flow',wires,events:events.map(e=>({...e,inputs:clone(model.transitions.find(t=>t.id===e.transitionId).inputs),outputs:clone(model.transitions.find(t=>t.id===e.transitionId).outputs)})),boundaryInputs:initial(model),boundaryOutputs,goalProjection:clone(model.goal),term:null,verified:{tokenBalance:true,framePreserved:true,orderPreserved:true,compiled:false},reason:null};
  const edgeOrder=closure(events.map(e=>e.id),wires.filter(w=>w.from.kind==='event'&&w.to.kind==='event').map(w=>[w.from.eventId,w.to.eventId]));
  if(JSON.stringify(edgeOrder)!==JSON.stringify(order))throw Error('Typed token-flow order disagrees with ancestry.');
  let count=Object.values(initial(model)).reduce((a,b)=>a+BigInt(b),0n);
  for(const id of trace){if(count>64n){diagram.reason='Individual expansion exceeds the existing compiler\'s 64-port boundary; counted wires remain exact.';return diagram;}const t=model.transitions.find(t=>t.id===id);count-=Object.values(t.inputs).reduce((a,b)=>a+BigInt(b),0n);count+=Object.values(t.outputs).reduce((a,b)=>a+BigInt(b),0n);}
  if(count>64n){diagram.reason='Individual expansion exceeds the existing compiler\'s 64-port boundary; counted wires remain exact.';return diagram;}
  let frontier=[];for(const p of model.places)for(let i=0;i<p.initial;i++)frontier.push({place:p.id,producer:null});
  const children=[];
  for(const e of events){
    const chosen=[];
    for(const a of allocations.filter(a=>a.eventId===e.id)){let remaining=a.count;for(let i=0;i<frontier.length&&remaining;i++)if(!chosen.includes(i)&&frontier[i].place===a.place&&frontier[i].producer===a.producer){chosen.push(i);remaining--;}if(remaining)throw Error('Expanded token allocation is inconsistent.');}
    const rest=frontier.map((_,i)=>i).filter(i=>!chosen.includes(i)),permutation=[...chosen,...rest],t=model.transitions.find(t=>t.id===e.transitionId),produced=[];
    for(const[p,n]of Object.entries(t.outputs))for(let i=0;i<n;i++)produced.push({place:p,producer:e.id});
    children.push({op:'permute',types:frontier.map(x=>type(x.place)),order:permutation});
    children.push({op:'par',children:[{op:'event',id:e.id,label:e.label,duration:e.duration,inputs:chosen.map(i=>type(frontier[i].place)),outputs:produced.map(x=>type(x.place))},{op:'id',types:rest.map(i=>type(frontier[i].place))}]});
    frontier=[...produced,...rest.map(i=>frontier[i])];
  }
  const term=children.length?{op:'seq',children}:{op:'id',types:frontier.map(x=>type(x.place))},compiled=compileTerm(term);
  if(!compiled.ok)throw Error('Typed witness compilation failed: '+compiled.errors.join(' '));
  const compiledOrder=closure(events.map(e=>e.id),compiled.wires.filter(w=>w.from.kind==='event'&&w.to.kind==='event').map(w=>[w.from.eventId,w.to.eventId]));
  if(JSON.stringify(compiledOrder)!==JSON.stringify(order))throw Error('Compiled typed term introduces or loses ancestry order.');
  diagram.mode='expanded-typed-term';diagram.term=term;diagram.verified.compiled=true;return diagram;
}


export function certifyTrace(model,trace,options={}){
  const checked=replayTrace(model,trace,options),errors=[...checked.errors];
  const out={ok:false,errors,trace:checked.trace,events:checked.events,markings:checked.markings,witnesses:[],complete:false,reason:null,stats:{},bounds:{},scope:CERT_SCOPE};
  if(checked.ok&&!checked.goalReached)errors.push('A complete first-goal trace is required for a typed certificate. Legal prefixes can be inspected with replayTrace.');
  if(errors.length){out.reason='invalid-input';return out;}
  const h=options.horizon??8,maxCertificateCharacters=options.maxCertificateCharacters===undefined?8000000:options.maxCertificateCharacters;
  if(!Number.isSafeInteger(maxCertificateCharacters)||maxCertificateCharacters<1||maxCertificateCharacters>16000000){errors.push('maxCertificateCharacters must be an integer from 1 to 16000000.');out.reason='invalid-input';return out;}
  const familyOptions={maxWitnesses:options.maxWitnesses??128,maxStates:options.maxStates??50000,maxAllocationEntries:options.maxAllocationEntries??65536,maxWitnessCharacters:options.maxWitnessCharacters??4000000,maxLanguageOrders:1,maxLanguageChecks:1,maxLanguageCharacters:1};
  const family=analyseFamily(adapt(model,h),trace,familyOptions);
  out.errors.push(...family.errors);out.reason=family.reason;out.stats=family.stats;out.bounds={...family.bounds,horizon:h,maxCertificateCharacters};out.stats.certificateCharacters=0;
  if(!family.ok)return out;
  try{for(const w of family.witnesses){const timedReplay=verifySchedule(model,checked.events,w.schedule);if(!timedReplay.ok)throw Error(timedReplay.errors.join(' '));const monoidal=tokenDiagram(model,checked.events,w.allocations,w.order,trace);const witnessed={...w,timedReplay,monoidal},characters=JSON.stringify(witnessed).length;if(out.stats.certificateCharacters+characters>maxCertificateCharacters){out.reason='maxCertificateCharacters';if(!out.stats.reachedLimits.includes(out.reason))out.stats.reachedLimits.push(out.reason);break;}out.stats.certificateCharacters+=characters;out.witnesses.push(witnessed);}}
  catch(error){errors.push(error.message);out.reason='certificate-error';}
  out.ok=errors.length===0;out.complete=out.ok&&family.complete&&out.reason===null;return out;
}
