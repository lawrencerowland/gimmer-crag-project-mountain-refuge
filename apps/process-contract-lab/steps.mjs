import {replay} from '../causal-plan-lab/core.mjs';
/** Joint consume-at-start enabling at an atomic-prefix marking, not a timed simulation. */
export function checkStep(model,trace,prefixLength,selectedIds){
 const errors=[];
 if(!Array.isArray(trace)||trace.length>8)return {ok:false,errors:['A selected trace of at most eight events is required.']};
 if(!Number.isInteger(prefixLength)||prefixLength<0||prefixLength>trace.length)return {ok:false,errors:['Prefix length must name a marking in the selected trace.']};
 if(!Array.isArray(selectedIds)||selectedIds.some(x=>typeof x!=='string')||new Set(selectedIds).size!==selectedIds.length)return {ok:false,errors:['Select distinct event occurrence IDs.']};
 const r=replay(model,trace);if(!r.ok||!r.goalReached)return{ok:false,errors:r.errors.length?r.errors:['The selected trace must cover its goal.']};
 if(r.markings.slice(0,-1).some(m=>Object.entries(model.goal).every(([p,n])=>m[p]>=n)))return{ok:false,errors:['The selected input trace must stop at first goal coverage.']};
 const available={...r.markings[prefixLength]},remaining=r.events.filter(e=>e.index>=prefixLength),needed=Object.fromEntries(model.places.map(p=>[p.id,0]));
 const chosen=selectedIds.map(id=>{const e=remaining.find(x=>x.id===id);if(!e)errors.push('Event '+id+' is missing or already completed in this prefix.');return e;});
 if(errors.length)return{ok:false,errors};
 const individual=chosen.map(e=>{const t=model.transitions.find(t=>t.id===e.transitionId),shortfalls=[];for(const[p,n]of Object.entries(t.inputs)){if(available[p]<n)shortfalls.push({place:p,needed:n,available:available[p]});const sum=needed[p]+n;if(!Number.isSafeInteger(sum))errors.push('Joint input count exceeds safe integer precision at '+p+'.');else needed[p]=sum;}return{id:e.id,enabled:shortfalls.length===0,shortfalls};});
 if(errors.length)return{ok:false,errors};
 const shortfalls=Object.entries(needed).filter(([p,n])=>n>available[p]).map(([place,n])=>({place,needed:n,available:available[place]}));
 return{ok:true,errors:[],prefixLength,prefixTrace:trace.slice(0,prefixLength),available,needed,remaining:remaining.map(e=>({id:e.id,transitionId:e.transitionId,label:e.label})),selected:[...selectedIds],individual,jointlyEnabled:shortfalls.length===0,shortfalls,scope:'Consume-at-start enabling at the count marking after the selected atomic prefix. Outputs of chosen starts are unavailable until completion. No ongoing work or timed history is inferred.'};
}
