import { validateModel } from '../causal-plan-lab/core.mjs';

export const COMPOSITION_VERSION = '1.0.0';
export const COMPOSITION_LIMITS = Object.freeze({maxNodes:512,maxDepth:40,maxEvents:32,maxPorts:64});
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const equalTypes = (a,b) => a.length === b.length && a.every((type,i) => type === b[i]);
const lexical = (a,b) => a < b ? -1 : a > b ? 1 : 0;

/** Check a finite typed syntax without evaluating code or changing the supplied term. */
function inspect(term) {
  const errors=[], names=new Set(), active=new Set();
  let nodes=0, eventCount=0;
  const fail=(path,message)=>errors.push(`${path}: ${message}`);
  function types(value,path) {
    if(!Array.isArray(value)){fail(path,'expected an ordered array of type strings.');return null;}
    if(value.length>COMPOSITION_LIMITS.maxPorts){fail(path,`at most ${COMPOSITION_LIMITS.maxPorts} ports are supported.`);return null;}
    if(value.some(x=>typeof x!=='string'||!x.trim()||x.length>160)){fail(path,'types must be nonempty strings of at most 160 characters.');return null;}
    return value.slice();
  }
  function visit(node,path,depth) {
    if(++nodes>COMPOSITION_LIMITS.maxNodes){fail(path,`syntax exceeds ${COMPOSITION_LIMITS.maxNodes} nodes.`);return null;}
    if(depth>COMPOSITION_LIMITS.maxDepth){fail(path,`nesting exceeds ${COMPOSITION_LIMITS.maxDepth} levels.`);return null;}
    if(!record(node)){fail(path,'expected a term object.');return null;}
    if(active.has(node)){fail(path,'cyclic syntax is not supported.');return null;}
    active.add(node);
    let out=null;
    if(node.op==='event') {
      const inputs=types(node.inputs,`${path}.inputs`), outputs=types(node.outputs,`${path}.outputs`);
      if(typeof node.id!=='string'||!node.id.trim()||node.id.length>120)fail(path,'event id must be a nonempty occurrence name of at most 120 characters.');
      else if(names.has(node.id))fail(path,`duplicate event occurrence id ${JSON.stringify(node.id)}; rename occurrences before composing them.`);
      else names.add(node.id);
      if(node.label!==undefined&&typeof node.label!=='string')fail(path,'event label must be a string when supplied.');
      if(typeof node.duration!=='number'||!Number.isFinite(node.duration)||node.duration<=0)fail(path,'event duration must be finite and positive.');
      if(inputs?.length===0)fail(path,'zero-input event generators are outside this compiler subset; identity on an empty boundary is supported.');
      if(++eventCount>COMPOSITION_LIMITS.maxEvents)fail(path,`at most ${COMPOSITION_LIMITS.maxEvents} event occurrences are supported.`);
      if(inputs&&outputs)out={op:'event',id:node.id,label:node.label??node.id,duration:node.duration,inputs,outputs};
    } else if(node.op==='id'||node.op==='permute') {
      const inputs=types(node.types,`${path}.types`);
      if(inputs) {
        if(node.op==='id')out={op:'id',inputs,outputs:inputs.slice()};
        else {
          const order=node.order;
          if(!Array.isArray(order)||order.length!==inputs.length||order.some(i=>!Number.isInteger(i)||i<0||i>=inputs.length)||new Set(order).size!==inputs.length)
            fail(path,'permutation order must contain every input index exactly once.');
          else out={op:'permute',inputs,outputs:order.map(i=>inputs[i]),order:order.slice()};
        }
      }
    } else if(node.op==='seq'||node.op==='par') {
      if(!Array.isArray(node.children)||!node.children.length)fail(path,'composition requires a nonempty children array; use id with types [] for the empty identity.');
      else if(node.children.length>COMPOSITION_LIMITS.maxNodes)fail(path,'too many composition children.');
      else {
        const children=node.children.map((child,i)=>visit(child,`${path}.children[${i}]`,depth+1));
        if(children.every(Boolean)) {
          if(node.op==='seq') {
            for(let i=1;i<children.length;i++)if(!equalTypes(children[i-1].outputs,children[i].inputs))
              fail(path,`sequential boundary ${i-1} -> ${i} does not match: ${JSON.stringify(children[i-1].outputs)} versus ${JSON.stringify(children[i].inputs)}.`);
            out={op:'seq',children,inputs:children[0].inputs.slice(),outputs:children.at(-1).outputs.slice()};
          } else out={op:'par',children,inputs:children.flatMap(c=>c.inputs),outputs:children.flatMap(c=>c.outputs)};
          if(out.inputs.length>COMPOSITION_LIMITS.maxPorts||out.outputs.length>COMPOSITION_LIMITS.maxPorts)
            fail(path,`composed boundary exceeds ${COMPOSITION_LIMITS.maxPorts} ports.`);
        }
      }
    } else fail(path,'op must be event, id, permute, seq or par.');
    active.delete(node);
    return out;
  }
  const typed=visit(term,'term',0);
  return {typed,errors,stats:{syntaxNodes:nodes,eventCount}};
}

export function validateTerm(term) {
  const {typed,errors,stats}=inspect(term);
  return {ok:errors.length===0,errors,inputs:typed?.inputs??[],outputs:typed?.outputs??[],stats};
}

/** A canonical typed port/event denotation, ignoring only internal wire names and monitors. */
export function canonicalize(compiled) {
  if(!compiled?.ok)throw new TypeError('Canonicalization needs a successfully compiled term.');
  const clone=x=>JSON.parse(JSON.stringify(x));
  return {
    schema:'typed-linear-wire-denotation-v1',
    inputTypes:compiled.inputs.map(p=>p.type),outputTypes:compiled.outputs.map(p=>p.type),
    events:compiled.events.map(e=>({id:e.id,label:e.label,duration:e.duration,inputTypes:e.inputTypes.slice(),outputTypes:e.outputTypes.slice()})).sort((a,b)=>lexical(a.id,b.id)),
    connections:compiled.wires.map(w=>({type:w.type,from:clone(w.from),to:clone(w.to)})).sort((a,b)=>lexical(JSON.stringify(a),JSON.stringify(b)))
  };
}

/** Compile selective linear wiring, not all-to-all barriers between syntactic children. */
export function compileTerm(term) {
  const {typed,errors,stats}=inspect(term);
  const result={ok:false,errors,version:COMPOSITION_VERSION,model:null,inputs:[],outputs:[],wires:[],events:[],instrumentation:null,canonical:null,stats};
  if(errors.length)return result;
  const wires=new Map(), events=[];
  function wire(id,type,from){const w={id,type,from,to:null};wires.set(id,w);return id;}
  const incoming=typed.inputs.map((type,index)=>wire(`wire:input:${index}`,type,{kind:'input',index}));
  result.inputs=incoming.map((id,index)=>({index,type:typed.inputs[index],wire:id}));
  function run(node,inputWires) {
    if(node.op==='id')return inputWires.slice();
    if(node.op==='permute')return node.order.map(i=>inputWires[i]);
    if(node.op==='seq')return node.children.reduce((current,child)=>run(child,current),inputWires);
    if(node.op==='par'){
      let at=0;
      return node.children.flatMap(child=>{const childInputs=inputWires.slice(at,at+child.inputs.length);at+=child.inputs.length;return run(child,childInputs);});
    }
    inputWires.forEach((id,port)=>{wires.get(id).to={kind:'event',eventId:node.id,port};});
    const outputWires=node.outputs.map((type,port)=>wire(`wire:event:${JSON.stringify(node.id)}:${port}`,type,{kind:'event',eventId:node.id,port}));
    events.push({id:node.id,label:node.label,duration:node.duration,inputTypes:node.inputs.slice(),outputTypes:node.outputs.slice(),inputWires:inputWires.slice(),outputWires,completionPlace:`completion:${JSON.stringify(node.id)}`});
    return outputWires;
  }
  const outgoing=run(typed,incoming);
  outgoing.forEach((id,index)=>{wires.get(id).to={kind:'output',index};});
  result.outputs=outgoing.map((id,index)=>({index,type:typed.outputs[index],wire:id}));
  result.wires=[...wires.values()].sort((a,b)=>lexical(a.id,b.id));
  result.events=events.sort((a,b)=>lexical(a.id,b.id));
  const completionPlaces=result.events.map(e=>e.completionPlace);
  const unitSentinel=result.wires.length===0&&result.events.length===0?'monitor:empty-identity-complete':null;
  result.instrumentation={strategy:'boundary-and-event-completion',completionPlaces,unitSentinel,explanation:'Goal includes every typed output token and one terminal completion marker per generator occurrence. Markers are monitors, not physical ports or enabling prerequisites. A wire-free identity uses one initially complete sentinel and has no events.'};
  const places=result.wires.map(w=>({id:w.id,label:w.type,kind:w.type.startsWith('resource:')?'resource':'condition',initial:w.from.kind==='input'?1:0}));
  for(const e of result.events)places.push({id:e.completionPlace,label:`Completed occurrence ${e.id} (monitor)`,kind:'condition',initial:0});
  if(unitSentinel)places.push({id:unitSentinel,label:'Empty identity already complete (monitor)',kind:'condition',initial:1});
  const transitions=result.events.map(e=>({id:e.id,label:e.label,duration:e.duration,maxFirings:1,inputs:Object.fromEntries(e.inputWires.map(id=>[id,1])),outputs:Object.fromEntries([...e.outputWires.map(id=>[id,1]),[e.completionPlace,1]])}));
  const goal=Object.fromEntries([...outgoing.map(id=>[id,1]),...completionPlaces.map(id=>[id,1]),...(unitSentinel?[[unitSentinel,1]]:[])]);
  result.model={id:'typed-process',title:'Compiled typed process',description:'Finite open linear-wire process. Typed boundary inputs own distinct initial tokens. Goal additionally requires explicit generator-completion monitors; syntactic sequence glues matching wires without adding an event barrier.',places,transitions,goal,composition:{version:COMPOSITION_VERSION,inputTypes:typed.inputs.slice(),outputTypes:typed.outputs.slice(),instrumentation:JSON.parse(JSON.stringify(result.instrumentation))}};
  const checked=validateModel(result.model);
  if(!checked.ok){result.errors.push(...checked.errors);return result;}
  result.ok=true;
  result.canonical=canonicalize(result);
  return result;
}

/** Prefix occurrence names when using the same generator template more than once. */
export function renameOccurrences(term,prefix) {
  if(typeof prefix!=='string')throw new TypeError('Occurrence prefix must be a string.');
  const checked=inspect(term);
  if(checked.errors.length)throw new TypeError(checked.errors.join('\n'));
  function copy(node){
    if(node.op==='event')return {...node,id:prefix+node.id,inputs:node.inputs.slice(),outputs:node.outputs.slice()};
    if(node.op==='id')return {op:'id',types:node.inputs.slice()};
    if(node.op==='permute')return {op:'permute',types:node.inputs.slice(),order:node.order.slice()};
    return {op:node.op,children:node.children.map(copy)};
  }
  return copy(checked.typed);
}
