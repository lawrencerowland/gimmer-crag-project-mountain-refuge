import {validateModel, closure} from '../causal-plan-lab/core.mjs';
import {analyseFamily} from '../process-contract-lab/families.mjs';
import {compileTerm} from '../process-contract-lab/composition.mjs';

export const ENGINE_VERSION = '1.0.0';
export const LIMITS = Object.freeze({maxTransitions:8,maxPlaces:64,maxModelCharacters:250000,maxStates:256,maxSteps:6500,maxTraceNodes:250000,maxTraces:40320,maxTraceCharacters:16000000,maxContractCharacters:12000000,maxFamilies:10000,maxAncestryStates:2000000,maxPlans:8191,maxPlanCharacters:16000000,maxPlanTraceLinks:500000});
const DEFAULTS = {maxStates:256,maxSteps:6500,maxTraceNodes:150000,maxTraces:40320,maxTraceCharacters:12000000,maxContractCharacters:6000000,maxFamilies:4096,maxAncestryStates:500000,maxPlans:4096,maxPlanCharacters:12000000,maxPlanTraceLinks:200000};
const rec = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const jsonCount = n => n <= MAX ? Number(n) : n.toString();
const clone = x => JSON.parse(JSON.stringify(x));
const initial = model => Object.fromEntries(model.places.map(p => [p.id,p.initial]));
const goalMet = (model,m) => Object.entries(model.goal).every(([p,n])=>m[p]>=n);
const gaps = (model,m) => Object.entries(model.goal).filter(([p,n])=>m[p]<n).map(([place,needed])=>({place,needed,available:m[place],shortfall:needed-m[place]}));
const enabled = (m,t) => Object.entries(t.inputs).every(([p,n])=>m[p]>=n);
const scopeId = mask => `scope${mask}`;
const stateId = mask => `s${mask}`;

export function validate(model) {
  const errors = [...validateModel(model).errors];
  if (model?.places?.length > LIMITS.maxPlaces) errors.push(`At most ${LIMITS.maxPlaces} places are supported.`);
  if (model?.transitions?.length > LIMITS.maxTransitions) errors.push(`At most ${LIMITS.maxTransitions} once-only transitions are supported.`);
  for (const t of Array.isArray(model?.transitions)?model.transitions:[]) if(rec(t)&&t.maxFirings!==1) errors.push(`Transition ${t.id}: this forward subset requires maxFirings:1.`);
  for (const x of [...(Array.isArray(model?.places)?model.places:[]),...(Array.isArray(model?.transitions)?model.transitions:[])]) if(typeof x?.id==='string'&&x.id.length>100)errors.push('Place and transition ids must have at most 100 characters in this forward subset.');
  try { if(JSON.stringify(model)?.length>LIMITS.maxModelCharacters)errors.push(`Model exceeds ${LIMITS.maxModelCharacters} serialized characters.`); }
  catch { errors.push('Model must be JSON-serializable.'); }
  return {ok:errors.length===0,errors,admissible:errors.length===0,scope:'Admissible under the explicit finite model schema and once-only bounds; not an engineering approval.'};
}
function demand(model,marking,transitions) {
  const totals = new Map(model.places.map(p=>[p.id,0n]));
  for(const t of transitions)for(const[p,n]of Object.entries(t.inputs))totals.set(p,totals.get(p)+BigInt(n));
  const needed=Object.fromEntries([...totals].filter(([,n])=>n>0n).map(([p,n])=>[p,jsonCount(n)]));
  const shortfalls=[...totals].filter(([p,n])=>n>BigInt(marking[p])).map(([place,n])=>({place,needed:jsonCount(n),available:marking[place],shortfall:jsonCount(n-BigInt(marking[place]))}));
  return{needed,shortfalls,jointlyEnabled:shortfalls.length===0};
}
function advance(model,marking,transitions) {
  const next = Object.fromEntries(model.places.map(p=>[p.id,BigInt(marking[p.id])]));
  for(const t of transitions)for(const[p,n]of Object.entries(t.inputs))next[p]-=BigInt(n);
  for(const t of transitions)for(const[p,n]of Object.entries(t.outputs))next[p]+=BigInt(n);
  for(const[p,n]of Object.entries(next))if(n<0n||n>MAX)throw new RangeError(`Marking at ${p} leaves the supported nonnegative safe-integer range.`);
  return Object.fromEntries(Object.entries(next).map(([p,n])=>[p,Number(n)]));
}
function maskIds(model,mask){return model.transitions.filter((_,i)=>mask&(1<<i)).map(t=>t.id);}
function validateMarking(model,marking){
  const errors=[];
  if(!rec(marking))return['An explicit place/count marking is required.'];
  for(const p of model.places)if(!integer(marking[p.id]))errors.push(`Marking ${p.id} must be a nonnegative safe integer.`);
  for(const p of Object.keys(marking))if(!model.places.some(x=>x.id===p))errors.push(`Unknown marked place ${p}.`);
  return errors;
}
function reachableSubset(model,targetMask,marking){
  const seen=new Set();
  function visit(mask,m){
    if(mask===targetMask)return model.places.every(p=>m[p.id]===marking[p.id]);
    if(seen.has(mask))return false;seen.add(mask);
    for(let i=0;i<model.transitions.length;i++)if((targetMask&(1<<i))&&!(mask&(1<<i))&&enabled(m,model.transitions[i]))if(visit(mask|(1<<i),advance(model,m,[model.transitions[i]])))return true;
    return false;
  }
  return visit(0,initial(model));
}

export function checkJointStart(model,marking,firedIds,selectedIds){
  const errors=[...validate(model).errors];
  if(errors.length)return{ok:false,errors};
  errors.push(...validateMarking(model,marking));
  for(const[name,ids]of [['Fired',firedIds],['Selected',selectedIds]])if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!model.transitions.some(t=>t.id===id)))errors.push(`${name} ids must be distinct known transition ids.`);
  if(errors.length)return{ok:false,errors};
  if(selectedIds.some(id=>firedIds.includes(id)))return{ok:false,errors:['A selected once-only transition has already fired.']};
  const mask=model.transitions.reduce((m,t,i)=>firedIds.includes(t.id)?m|(1<<i):m,0);
  try { if(!reachableSubset(model,mask,marking))return{ok:false,errors:['This marking and fired subset are not reachable together from the supplied initial marking.']}; }
  catch(error){return{ok:false,errors:[error.message]};}
  const selected=selectedIds.map(id=>model.transitions.find(t=>t.id===id));
  const individual=selected.map(t=>({id:t.id,enabled:enabled(marking,t),shortfalls:demand(model,marking,[t]).shortfalls}));
  return{ok:true,errors:[],marking:clone(marking),fired:[...firedIds],selected:[...selectedIds],individual,...demand(model,marking,selected),scope:'Joint consume-at-start check at a reachable idle count marking. Outputs of selected starts remain unavailable until completion; no ongoing-work state is inferred.'};
}

/** Independent aggregate count replay of a complete timed occurrence schedule. */
export function verifySchedule(model,events,schedule){
  const errors=[...validate(model).errors],checkpoints=[];
  const out={ok:false,errors,goalReached:false,finalMarking:{},checkpoints,scope:'Outputs credited at event completion, before starts at the same timestamp; simultaneous starts consume their aggregate inputs. Every retained occurrence must finish.'};
  if(!Array.isArray(events)||!Array.isArray(schedule)){errors.push('Events and schedule arrays are required.');return out;}
  if(events.some(e=>!rec(e)||typeof e.id!=='string'||!e.id||typeof e.transitionId!=='string'||!e.transitionId))errors.push('Every event must be an object with nonempty id and transitionId strings.');
  if(schedule.some(s=>!rec(s)||typeof s.id!=='string'||!s.id))errors.push('Every schedule entry must be an object with a nonempty event id.');
  if(events.length>LIMITS.maxTransitions||schedule.length>LIMITS.maxTransitions)errors.push('Timed replay supports at most eight once-only event occurrences.');
  if(errors.length)return out;
  if(new Set(events.map(e=>e.id)).size!==events.length||new Set(events.map(e=>e.transitionId)).size!==events.length)errors.push('Every scheduled event and once-only transition must be distinct.');
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

function familyKey(model,trace,index){
  const pairs=[];
  for(let i=0;i<trace.length;i++)for(let j=i+1;j<trace.length;j++){
    const a=model.transitions[index.get(trace[i])],b=model.transitions[index.get(trace[j])];
    const conflict=Object.entries(a.inputs).some(([p,n])=>n>0&&((b.inputs[p]??0)>0||(b.outputs[p]??0)>0))||Object.entries(b.inputs).some(([p,n])=>n>0&&(a.outputs[p]??0)>0);
    if(conflict)pairs.push(index.get(a.id)*8+index.get(b.id));
  }
  return trace.reduce((m,id)=>m|(1<<index.get(id)),0)+':'+pairs.sort((a,b)=>a-b).join(',');
}
function allocationKey(scope,allocations){return scope+':'+JSON.stringify(allocations.map(a=>[a.eventId,a.place,a.producer,a.count]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}

export function analyse(model,requested={}){
  const errors=[...validate(model).errors],limits={...DEFAULTS};
  if(!rec(requested))errors.push('Analysis limits must be an object.');
  else for(const name of Object.keys(DEFAULTS)){const n=requested[name]??DEFAULTS[name];if(!Number.isSafeInteger(n)||n<1||n>LIMITS[name])errors.push(`${name} must be an integer from 1 to ${LIMITS[name]}.`);else limits[name]=n;}
  const stats={reachedLimits:[],traceNodes:0,traceCharacters:0,contractCharacters:0,familiesAnalysed:0,ancestryStates:0,planCharacters:0,planTraceLinks:0};
  const completeness={states:true,steps:true,traces:true,ancestries:true,representations:true};
  const result={ok:false,errors,version:ENGINE_VERSION,modelId:model?.id??null,limits,stats,complete:false,completeness,summary:{},states:[],steps:[],traces:[],scopes:[],plans:[],goalGaps:{initial:[],deadEnds:[],unreachableStateIds:[]},policy:{reachability:'All once-only reachable idle count markings, including continuations after goal coverage.',plans:'All first-goal atomic traces and their producer-count ancestries within bounds; all retained work must finish in timed replay.',timing:'Earliest representative per fixed ancestry, with consume-at-start/produce-at-completion; not all delayed schedules or a global real-world optimum.',equivalence:'Producer-count allocations deduplicated across commuting traces; no free-SMC quotient or canonical collective-token causality claim.'}};
  const hit=(name,component)=>{if(!stats.reachedLimits.includes(name))stats.reachedLimits.push(name);if(component)completeness[component]=false;};
  if(errors.length){for(const k of Object.keys(completeness))completeness[k]=false;return result;}
  const index=new Map(model.transitions.map((t,i)=>[t.id,i])),states=new Map(),atomic=new Map(),stateKeys=new Map();
  function addState(mask,marking){
    const key=mask+'|'+model.places.map(p=>marking[p.id]).join(',');
    if(states.has(mask)){if(stateKeys.get(mask)!==key)throw Error('Fired subset and count marking disagree.');return states.get(mask);}
    const state={id:stateId(mask),marking,fired:maskIds(model,mask),goalReached:goalMet(model,marking),enabled:model.transitions.filter((t,i)=>!(mask&(1<<i))&&enabled(marking,t)).map(t=>t.id),canReachGoal:null,goalGaps:gaps(model,marking)};
    const chars=JSON.stringify(state).length;
    if(states.size>=limits.maxStates){hit('maxStates','states');return null;}
    if(stats.contractCharacters+chars>limits.maxContractCharacters){hit('maxContractCharacters','states');return null;}
    stats.contractCharacters+=chars;states.set(mask,state);stateKeys.set(mask,key);result.states.push(state);return state;
  }
  try{
    addState(0,initial(model));
    for(const[mask,state]of states){const successors=[];for(const id of state.enabled){const bit=1<<index.get(id),next=addState(mask|bit,advance(model,state.marking,[model.transitions[index.get(id)]]));if(next)successors.push(mask|bit);}atomic.set(mask,successors);}
    const reaches=new Set([...states].filter(([,s])=>s.goalReached).map(([mask])=>mask));
    let changed=true;while(changed){changed=false;for(const[mask,next]of atomic)if(!reaches.has(mask)&&next.some(x=>reaches.has(x))){reaches.add(mask);changed=true;}}
    for(const[mask,state]of states){state.canReachGoal=reaches.has(mask)?true:completeness.states?false:null;if(state.canReachGoal===false)result.goalGaps.unreachableStateIds.push(state.id);if(!state.goalReached&&!state.enabled.length)result.goalGaps.deadEnds.push({stateId:state.id,marking:state.marking,fired:state.fired,missing:state.goalGaps,reason:'No unfired transition is enabled.'});}
    result.goalGaps.initial=gaps(model,initial(model));
    stepLoop:for(const[mask,state]of states){const available=state.enabled.map(id=>model.transitions[index.get(id)]);for(let sub=1;sub<1<<available.length;sub++){
      const selected=available.filter((_,i)=>sub&(1<<i)),d=demand(model,state.marking,selected);if(!d.jointlyEnabled)continue;
      const target=selected.reduce((m,t)=>m|(1<<index.get(t.id)),mask);if(!states.has(target)){completeness.steps=false;continue;}
      const step={id:`step${result.steps.length}`,from:state.id,to:stateId(target),transitionIds:selected.map(t=>t.id),needed:d.needed,jointlyEnabled:true};
      const chars=JSON.stringify(step).length;
      if(result.steps.length>=limits.maxSteps){hit('maxSteps','steps');break stepLoop;}
      if(stats.contractCharacters+chars>limits.maxContractCharacters){hit('maxContractCharacters','steps');break stepLoop;}
      stats.contractCharacters+=chars;result.steps.push(step);
    }}
  }catch(error){errors.push(error.message);completeness.states=false;completeness.steps=false;}
  if(!completeness.states)completeness.steps=false;
  if(errors.length){completeness.traces=false;completeness.ancestries=false;completeness.representations=false;return result;}
  const classes=new Map(),scopeMap=new Map();
  let traceStopped=false;
  function visitTrace(mask,marking,path){
    if(traceStopped)return;
    if(stats.traceNodes>=limits.maxTraceNodes){hit('maxTraceNodes','traces');traceStopped=true;return;}stats.traceNodes++;
    if(goalMet(model,marking)){
      const trace={id:`trace${result.traces.length}`,transitionIds:path,scopeId:scopeId(mask),finalStateId:states.has(mask)?stateId(mask):null},chars=JSON.stringify(trace).length;
      if(result.traces.length>=limits.maxTraces){hit('maxTraces','traces');traceStopped=true;return;}
      if(stats.traceCharacters+chars>limits.maxTraceCharacters){hit('maxTraceCharacters','traces');traceStopped=true;return;}
      stats.traceCharacters+=chars;result.traces.push(trace);
      if(!scopeMap.has(mask))scopeMap.set(mask,{id:scopeId(mask),transitionIds:maskIds(model,mask),traceIds:[],planIds:[],complete:false,minFinish:null,maxFinish:null});scopeMap.get(mask).traceIds.push(trace.id);
      const key=familyKey(model,path,index);if(!classes.has(key))classes.set(key,{representative:path,scope:mask,traceIds:[]});classes.get(key).traceIds.push(trace.id);return;
    }
    for(let i=0;i<model.transitions.length;i++)if(!(mask&(1<<i))&&enabled(marking,model.transitions[i]))visitTrace(mask|(1<<i),advance(model,marking,[model.transitions[i]]),[...path,model.transitions[i].id]);
  }
  visitTrace(0,initial(model),[]);
  const plans=new Map();let planStopped=false;
  for(const group of classes.values()){
    if(planStopped)break;
    if(stats.familiesAnalysed>=limits.maxFamilies){hit('maxFamilies','ancestries');break;}
    const remaining=limits.maxAncestryStates-stats.ancestryStates;if(remaining<1){hit('maxAncestryStates','ancestries');break;}
    const family=analyseFamily(model,group.representative,{maxWitnesses:Math.min(8192,limits.maxPlans+1),maxStates:Math.min(250000,remaining),maxAllocationEntries:131072,maxWitnessCharacters:8000000,maxLanguageOrders:1,maxLanguageChecks:1,maxLanguageCharacters:1});
    stats.familiesAnalysed++;stats.ancestryStates+=family.stats.statesVisited;
    if(!family.ok){errors.push(...family.errors);completeness.ancestries=false;completeness.representations=false;break;}
    if(!family.complete)hit(family.reason==='maxStates'?'maxAncestryStates':`family:${family.reason}`,'ancestries');
    for(const w of family.witnesses){
      const key=allocationKey(group.scope,w.allocations);
      if(plans.has(key)){
        const p=plans.get(key),known=new Set(p.traceIds),added=group.traceIds.filter(id=>!known.has(id));
        if(stats.planTraceLinks+added.length>limits.maxPlanTraceLinks){hit('maxPlanTraceLinks','ancestries');planStopped=true;break;}
        const addedCharacters=added.reduce((n,id)=>n+JSON.stringify(id).length+1,0);
        if(stats.planCharacters+addedCharacters>limits.maxPlanCharacters){hit('maxPlanCharacters','ancestries');planStopped=true;break;}
        p.traceIds.push(...added);stats.planTraceLinks+=added.length;stats.planCharacters+=addedCharacters;continue;
      }
      if(result.plans.length>=limits.maxPlans){hit('maxPlans','ancestries');planStopped=true;break;}
      if(stats.planTraceLinks+group.traceIds.length>limits.maxPlanTraceLinks){hit('maxPlanTraceLinks','ancestries');planStopped=true;break;}
      try{
        const timedReplay=verifySchedule(model,family.events,w.schedule);if(!timedReplay.ok)throw Error('Independent timed replay failed: '+timedReplay.errors.join(' '));
        const monoidal=tokenDiagram(model,family.events,w.allocations,w.order,group.representative);
        const p={id:`plan${result.plans.length}`,scopeId:scopeId(group.scope),transitionIds:group.representative,traceIds:[...group.traceIds],events:family.events,allocations:w.allocations,edges:w.edges,order:w.order,tree:w.tree,exactTree:w.exactTree,obstruction:w.obstruction,schedule:w.schedule,makespan:w.makespan,timedReplay,monoidal,goalReached:true};
        const chars=JSON.stringify(p).length;if(stats.planCharacters+chars>limits.maxPlanCharacters){hit('maxPlanCharacters','ancestries');planStopped=true;break;}
        stats.planCharacters+=chars;stats.planTraceLinks+=group.traceIds.length;plans.set(key,p);result.plans.push(p);scopeMap.get(group.scope).planIds.push(p.id);
      }catch(error){errors.push(error.message);completeness.representations=false;completeness.ancestries=false;planStopped=true;break;}
    }
  }
  if(!completeness.traces)completeness.ancestries=false;
  result.scopes=[...scopeMap.values()];
  for(const scope of result.scopes){scope.complete=completeness.traces&&completeness.ancestries&&completeness.representations;const finishes=result.plans.filter(p=>p.scopeId===scope.id).map(p=>p.makespan);if(scope.complete&&finishes.length){scope.minFinish=Math.min(...finishes);scope.maxFinish=Math.max(...finishes);}}
  result.ok=errors.length===0;result.complete=result.ok&&Object.values(completeness).every(Boolean);
  const best=result.plans.length?Math.min(...result.plans.map(p=>p.makespan)):null;
  result.summary={stateCount:result.states.length,stepCount:result.steps.length,traceCount:result.traces.length,scopeCount:result.scopes.length,planCount:result.plans.length,goalReachable:result.traces.length?true:states.get(0)?.canReachGoal??null,initialGoalReached:goalMet(model,initial(model)),fastestFinish:result.complete?best:null,observedFastestFinish:best,firstGoalPolicy:true};
  return result;
}

function stable(value){if(Array.isArray(value))return value.map(stable);if(rec(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
export function compareModels(base,changed){
  const errors=[...validate(base).errors,...validate(changed).errors],changes={marking:[],goal:[],mechanism:[],timing:[],metadata:[]};
  if(errors.length)return{ok:false,errors,category:'invalid',changes};
  const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  for(const id of new Set([...base.places,...changed.places].map(p=>p.id))){const a=base.places.find(p=>p.id===id),b=changed.places.find(p=>p.id===id);if(a&&b&&a.initial!==b.initial)changes.marking.push({place:id,before:a.initial,after:b.initial});if(!a||!b||a.kind!==b.kind)changes.mechanism.push({place:id,field:'kind-or-existence',before:a?{kind:a.kind,initial:a.initial}:null,after:b?{kind:b.kind,initial:b.initial}:null});if(a?.label!==b?.label)changes.metadata.push({place:id,field:'label',before:a?.label??null,after:b?.label??null});}
  if(!same(base.goal,changed.goal))changes.goal.push({before:base.goal,after:changed.goal});
  for(const id of new Set([...base.transitions,...changed.transitions].map(t=>t.id))){const a=base.transitions.find(t=>t.id===id),b=changed.transitions.find(t=>t.id===id),mechanism=t=>t?{inputs:t.inputs,outputs:t.outputs,maxFirings:t.maxFirings}:null;if(!same(mechanism(a),mechanism(b)))changes.mechanism.push({transitionId:id,before:mechanism(a),after:mechanism(b)});if(a&&b&&a.duration!==b.duration)changes.timing.push({transitionId:id,before:a.duration,after:b.duration});if(a?.label!==b?.label)changes.metadata.push({transitionId:id,field:'label',before:a?.label??null,after:b?.label??null});}
  for(const field of ['id','title','description'])if(base[field]!==changed[field])changes.metadata.push({field,before:base[field]??null,after:changed[field]??null});
  const substantive=Object.entries(changes).filter(([k,v])=>k!=='metadata'&&v.length).map(([k])=>k),category=substantive.length>1?'mixed':substantive[0]??(changes.metadata.length?'metadata':'identical');
  return{ok:true,errors:[],category,changes,scope:'Definition differences only: marking, goal, mechanism and timing remain separate. This comparison does not infer which change is physically justified.'};
}
