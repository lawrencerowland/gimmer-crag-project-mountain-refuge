import {generate,validateModel} from '../causal-plan-lab/core.mjs';
import {analyseFamily} from './families.mjs';
import {compileTerm} from './composition.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
self.onmessage=({data})=>{
 const {id,input,preferredTrace,strictTrace=false,budget=2048}=data;
 try{
  if(!input||!['model','term'].includes(input.kind))throw Error('Choose a model or typed term.');
  const compiled=input.kind==='term'?compileTerm(input.definition):null;
  if(compiled&&!compiled.ok)throw Error(compiled.errors.join('\n'));
  const model=compiled?compiled.model:input.definition,v=validateModel(model);
  if(!v.ok)throw Error(v.errors.join('\n'));
  if(model.places.length>64||model.transitions.length>32)throw Error('This workbench supports at most 64 places and 32 transitions.');
  const search=generate(model,{maxExecutions:200,maxNodes:20000,maxTraceLength:8});
  if(search.errors?.length)throw Error(search.errors.join('\n'));
  let trace=null;
  if(strictTrace){if(!Array.isArray(preferredTrace))throw Error('The saved result needs its selected trace.');trace=preferredTrace;}
  else if(Array.isArray(preferredTrace)&&search.executions.some(t=>equal(t,preferredTrace)))trace=preferredTrace;
  else if(search.executions.length)trace=search.executions[0];
  const family=trace!==null?analyseFamily(model,trace,{maxWitnesses:budget}):null;
  if(family&&!family.ok)throw Error(family.errors.join('\n'));
  if(trace!==null&&!search.executions.some(t=>equal(t,trace)))search.executions.unshift(trace);
  self.postMessage({id,ok:true,input,model,compiled,search,trace,family});
 }catch(e){self.postMessage({id,ok:false,errors:[e.message||String(e)]});}
};
