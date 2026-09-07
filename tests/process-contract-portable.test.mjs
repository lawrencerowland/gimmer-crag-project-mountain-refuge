import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {compileTerm} from '../apps/process-contract-lab/composition.mjs';
import {getCompositionScenario} from '../apps/process-contract-lab/composition-scenarios.mjs';
import {generate,replay,validateModel} from '../apps/causal-plan-lab/core.mjs';

// Exercise the exact serialization and decoding functions used by the shipped UI.
const source=readFileSync(new URL('../apps/process-contract-lab/app.mjs',import.meta.url),'utf8');
const code=source.match(/\/\/ BEGIN PORTABLE RESULT HELPERS([\s\S]*?)\/\/ END PORTABLE RESULT HELPERS/)?.[1];
assert.ok(code,'The portable UI helpers must remain directly testable.');
const context=vm.createContext({TextEncoder});
vm.runInContext(code+'\nglobalThis.api={makePortableResult,decodePortableTrace,portableByteLength};',context);
const {makePortableResult,decodePortableTrace,portableByteLength}=context.api;
const plain=x=>JSON.parse(JSON.stringify(x));
const ids=model=>model.transitions.map(t=>t.id);
const roundtrip=(input,model,trace,extra={})=>{
  const bundle=makePortableResult({input,transitionIds:ids(model),trace,...extra});
  const json=JSON.stringify(bundle),parsed=JSON.parse(json);
  assert.ok(new TextEncoder().encode(json).length<=1000000);
  assert.deepEqual(parsed.input.definition,plain(input.definition));
  assert.deepEqual(plain(decodePortableTrace(parsed,ids(model))),trace);
  return parsed;
};
function fillProperty(object,key,unit){
  object[key]='';
  const room=250000-JSON.stringify(object).length,unitCost=JSON.stringify(unit).length-2;
  object[key]=unit.repeat(Math.floor(room/unitCost))+'x'.repeat(room%unitCost);
  assert.equal(JSON.stringify(object).length,250000);
  return object;
}

test('maximal Unicode definitions reopen exactly while metadata and derived evidence stay bounded',()=>{
  for(const unit of ['\u0800','😀','"','\n']){
    const definition=fillProperty({op:'id',types:[]},'note',unit);
    const c=compileTerm(definition);assert.equal(c.ok,true);
    const long=definition.note;
    const input={kind:'term',scenario:long,title:long,definition,budget:2048,unboundedExtra:[long,long,long]};
    const bundle=roundtrip(input,c.model,[],{computedAt:long,view:{tab:'rules',witnessIndex:1,graphMode:'must'},certificate:{ancestryComplete:true,classification:'all',witnesses:1,distinctOrders:1,languageComplete:true,languageCount:1,summary:{dagExact:true,treeExact:true,tree:[long,long],spuriousOrder:[long]},earliestFinishRange:[0,0],selectedWitness:{exactTree:true,makespan:0,schedule:[],allocations:[long,long]}}});
    assert.ok(portableByteLength(bundle)<770000);
    assert.ok(bundle.input.title.length<=160);assert.ok(bundle.input.scenario.length<=64);
    assert.equal(bundle.input.unboundedExtra,undefined);assert.equal(bundle.certificate.summary.tree,undefined);assert.equal(bundle.certificate.selectedWitness.allocations,undefined);
    assert.equal(bundle.certificate.completeArtifact,false);assert.match(bundle.certificate.scope,/recomputation.*authoritative/);
    assert.deepEqual(bundle.traceTransitionIndices,[]);assert.deepEqual(bundle.trace,[]);
    assert.equal(replay(c.model,decodePortableTrace(bundle,ids(c.model))).goalReached,true);
  }
});

test('a maximal three-byte Unicode transition ID repeated eight times exports once and decodes exactly',()=>{
  const definition={id:'long-id',places:[{id:'ready',kind:'condition',initial:8},{id:'done',kind:'condition',initial:0}],transitions:[{id:'',duration:1,maxFirings:8,inputs:{ready:1},outputs:{done:1}}],goal:{done:8}};
  const baseLength=JSON.stringify(definition).length;
  definition.transitions[0].id='\u0800'.repeat(250000-baseLength);
  assert.equal(JSON.stringify(definition).length,250000);assert.equal(validateModel(definition).ok,true);
  const trace=Array(8).fill(definition.transitions[0].id);
  const input={kind:'model',scenario:'custom',title:'Repeated large identifier',definition,budget:2048};
  const bundle=roundtrip(input,definition,trace,{certificate:{ancestryComplete:true,classification:'all',witnesses:1,summary:{dagExact:true,treeExact:true},selectedWitness:{exactTree:true,makespan:1,schedule:Array(8).fill({id:trace[0]})}}});
  assert.equal(bundle.trace,undefined);assert.deepEqual(bundle.traceTransitionIndices,Array(8).fill(0));
  assert.ok(portableByteLength(bundle)<770000);
  const replayed=replay(definition,decodePortableTrace(bundle,ids(definition)));
  assert.equal(replayed.ok,true);assert.equal(replayed.goalReached,true);assert.equal(replayed.events.length,8);
});

test('typed model indices map through the same compiled transition order and preserve complete work',()=>{
  const definition=getCompositionScenario('typed-refuge').term,c=compileTerm(definition);
  const trace=generate(c.model).executions[0],input={kind:'term',scenario:'typed-refuge',title:'Refuge',definition,budget:2048};
  const bundle=roundtrip(input,c.model,trace,{view:{tab:'wires',witnessIndex:0,graphMode:'witness'}});
  const reopened=compileTerm(bundle.input.definition);
  assert.equal(reopened.ok,true);assert.equal(replay(reopened.model,decodePortableTrace(bundle,ids(reopened.model))).goalReached,true);
  assert.deepEqual(bundle.trace,trace);assert.equal(bundle.traceEncoding,'transition-indices-v1');
});

test('legacy traces remain readable and malformed or inconsistent indexed traces reject',()=>{
  assert.deepEqual(plain(decodePortableTrace({trace:['A','B','A']},['A','B'])),['A','B','A']);
  assert.deepEqual(plain(decodePortableTrace({traceTransitionIndices:[1,0,1]},['A','B'])),['B','A','B']);
  for(const value of [[-1],[.5],[2],['0'],Array(9).fill(0),null,{}])assert.throws(()=>decodePortableTrace({traceTransitionIndices:value},['A','B']),/invalid transition indices/);
  assert.throws(()=>decodePortableTrace({traceTransitionIndices:[0],trace:['B']},['A','B']),/disagree/);
  assert.throws(()=>decodePortableTrace({traceTransitionIndices:[0],traceEncoding:'future'},['A']),/Unsupported trace encoding/);
  assert.throws(()=>decodePortableTrace({},['A']),/selected trace/);
  assert.throws(()=>decodePortableTrace({trace:[]},['A','A']),/unique transition/);
});

test('invalid export input fails before producing an unreopenable result',()=>{
  const definition={op:'id',types:[]},input={kind:'term',definition,budget:2048};
  assert.throws(()=>makePortableResult({input,transitionIds:[],trace:['missing']}),/unknown transition/);
  assert.throws(()=>makePortableResult({input:{...input,budget:0},transitionIds:[],trace:[]}),/budget/);
  assert.throws(()=>makePortableResult({input:{...input,definition:{...definition,note:'x'.repeat(250000)}},transitionIds:[],trace:[]}),/limit/);
});
