import assert from 'node:assert/strict';
import test from 'node:test';
import {compileTerm,validateTerm,canonicalize,renameOccurrences,COMPOSITION_LIMITS} from '../apps/process-contract-lab/composition.mjs';
import {COMPOSITION_SCENARIOS,getCompositionScenario} from '../apps/process-contract-lab/composition-scenarios.mjs';
import {generate,analyse,validateModel} from '../apps/causal-plan-lab/core.mjs';

const event=(id,inputs,outputs,duration=1,label=id)=>({op:'event',id,label,duration,inputs,outputs});
const identity=(...types)=>({op:'id',types});
const seq=(...children)=>({op:'seq',children});
const par=(...children)=>({op:'par',children});
const permutation=(types,order)=>({op:'permute',types,order});
const compile=term=>{const c=compileTerm(term);assert.equal(c.ok,true,c.errors.join('\n'));assert.equal(validateModel(c.model).ok,true);return c;};
const traces=c=>{const g=generate(c.model,{maxExecutions:50000,maxNodes:100000});assert.equal(g.complete,true,g.reason);return g.executions;};
const words=xs=>xs.map(x=>JSON.stringify(x)).sort();
const fixture=id=>compile(getCompositionScenario(id).term);
function permutations(xs){return xs.length?xs.flatMap((x,i)=>permutations(xs.filter((_,j)=>j!==i)).map(rest=>[x,...rest])):[[]];}
const legalWords=(ids,edges)=>permutations(ids).filter(word=>edges.every(([a,b])=>word.indexOf(a)<word.indexOf(b)));
const wireRelations=c=>c.wires.filter(w=>w.from.kind==='event'&&w.to.kind==='event').map(w=>[w.from.eventId,w.to.eventId]);

test('all published examples compile, except the explicitly ill-typed handoff',()=>{
  for(const example of COMPOSITION_SCENARIOS){
    const c=compileTerm(example.term);
    assert.equal(c.ok,example.id!=='type-mismatch',`${example.id}: ${c.errors.join('; ')}`);
    if(c.ok){assert.equal(validateModel(c.model).ok,true);assert.equal(c.events.length,c.model.transitions.length);}
    else {assert.equal(c.model,null);assert.match(c.errors.join(' '),/does not match/);}
  }
});

test('typed selective wiring constructs N without inserting A before D',()=>{
  const c=fixture('selective-n');
  assert.deepEqual(words(wireRelations(c)),words([['A','C'],['B','C'],['B','D']]));
  const expected=legalWords(['A','B','C','D'],[['A','C'],['B','C'],['B','D']]);
  assert.equal(expected.length,5);
  assert.deepEqual(words(traces(c)),words(expected));
  assert.ok(traces(c).some(t=>JSON.stringify(t)===JSON.stringify(['B','D','A','C'])));
  for(const trace of traces(c)){
    const a=analyse(c.model,trace);
    assert.equal(a.ok,true);assert.equal(a.makespan,7);assert.equal(a.exactTree,false);assert.ok(a.obstruction);
  }
});

test('an identity wire retains its exact boundary ownership and has no event',()=>{
  const c=compile(identity('a','resource:lift'));
  assert.equal(c.events.length,0);assert.equal(c.wires.length,2);
  assert.equal(c.model.places.length,2);assert.equal(c.instrumentation.unitSentinel,null);
  for(let i=0;i<2;i++){
    assert.equal(c.inputs[i].wire,c.outputs[i].wire);
    assert.deepEqual(c.wires.find(w=>w.id===c.inputs[i].wire),{id:c.inputs[i].wire,type:c.inputs[i].type,from:{kind:'input',index:i},to:{kind:'output',index:i}});
  }
  assert.deepEqual(traces(c),[[]]);
});

test('the empty identity has only an explicit completed sentinel and the empty trace',()=>{
  const c=compile(identity());
  assert.deepEqual(c.inputs,[]);assert.deepEqual(c.outputs,[]);assert.deepEqual(c.wires,[]);assert.deepEqual(c.events,[]);
  assert.deepEqual(c.instrumentation.completionPlaces,[]);
  assert.equal(c.model.places.length,1);assert.equal(c.model.places[0].id,c.instrumentation.unitSentinel);assert.equal(c.model.places[0].initial,1);
  assert.deepEqual(traces(c),[[]]);assert.equal(analyse(c.model,[]).makespan,0);
});

test('completion monitors force discard occurrences to execute without adding enabling arcs',()=>{
  const discard=event('discard',['obsolete'],[],2);
  for(const term of [discard,par(identity('retained'),discard),seq(discard,identity())]){
    const c=compile(term);
    assert.deepEqual(traces(c),[['discard']]);
    const e=c.events[0],t=c.model.transitions[0];
    assert.deepEqual(Object.keys(t.inputs),e.inputWires);
    assert.deepEqual(Object.keys(t.outputs),[e.completionPlace]);
    assert.equal(c.model.goal[e.completionPlace],1);
    assert.equal(c.wires.some(w=>w.id===e.completionPlace),false);
    assert.equal(c.model.transitions.some(x=>e.completionPlace in x.inputs),false);
  }
});

test('sequential associativity preserves full denotation, stable wires and traces',()=>{
  const A=event('A',['a'],['b'],2),B=event('B',['b'],['c'],3),C=event('C',['c'],['d'],4);
  const left=compile(seq(seq(A,B),C)),right=compile(seq(A,seq(B,C)));
  assert.deepEqual(canonicalize(left),canonicalize(right));assert.deepEqual(left.wires,right.wires);
  assert.deepEqual(left.model,right.model);assert.deepEqual(traces(left),[['A','B','C']]);
});

test('left/right sequential identities and empty tensor identities preserve typed denotation',()=>{
  const f=seq(event('A',['a','resource:lift'],['b','resource:lift']),permutation(['b','resource:lift'],[1,0]));
  const original=compile(f);
  for(const equivalent of [seq(identity('a','resource:lift'),f),seq(f,identity('resource:lift','b')),par(identity(),f),par(f,identity())]){
    const c=compile(equivalent);assert.deepEqual(c.canonical,original.canonical);assert.deepEqual(c.wires,original.wires);assert.deepEqual(traces(c),traces(original));
  }
});

test('tensor associativity and interchange preserve selective port/event denotation',()=>{
  const f=event('f',['a'],['b'],2),g=event('g',['b'],['c'],3),h=event('h',['x'],['y'],4),k=event('k',['y'],['z'],5);
  const lhs=compile(seq(par(f,h),par(g,k))),rhs=compile(par(seq(f,g),seq(h,k)));
  assert.deepEqual(lhs.canonical,rhs.canonical);assert.deepEqual(lhs.wires,rhs.wires);
  const independent=legalWords(['f','g','h','k'],[['f','g'],['h','k']]);
  assert.deepEqual(words(traces(lhs)),words(independent));assert.deepEqual(words(traces(rhs)),words(independent));
  const extra=event('extra',['q'],['r']);
  assert.deepEqual(compile(par(par(f,h),extra)).canonical,compile(par(f,par(h,extra))).canonical);
});

test('every four-port permutation composed with its inverse is the same identity wiring',()=>{
  const types=['a','b','resource:c','d'],plain=compile(identity(...types));
  for(const order of permutations([0,1,2,3])){
    const inverse=order.map((_,i)=>order.indexOf(i));
    const c=compile(seq(permutation(types,order),permutation(order.map(i=>types[i]),inverse)));
    assert.deepEqual(c.canonical,plain.canonical);assert.deepEqual(c.wires,plain.wires);assert.deepEqual(traces(c),[[]]);
  }
});

test('port identity matters even when the two wire types have the same spelling',()=>{
  const f=par(event('A',['a'],['shared']),event('B',['b'],['shared']));
  const sinks=par(event('C',['shared'],['c']),event('D',['shared'],['d']));
  const normal=compile(seq(f,sinks));
  const crossed=compile(seq(f,permutation(['shared','shared'],[1,0]),sinks));
  assert.notDeepEqual(normal.canonical,crossed.canonical);
  assert.deepEqual(words(wireRelations(normal)),words([['A','C'],['B','D']]));
  assert.deepEqual(words(wireRelations(crossed)),words([['A','D'],['B','C']]));
});

test('threading one resource and tensoring two owned resources are distinct capacity models',()=>{
  const one=fixture('threaded-resource'),two=fixture('parallel-resources');
  const owned=c=>c.model.places.filter(p=>p.kind==='resource').reduce((n,p)=>n+p.initial,0);
  assert.equal(owned(one),1);assert.equal(owned(two),2);
  assert.deepEqual(traces(one),[['A','B']]);assert.deepEqual(words(traces(two)),words([['A','B'],['B','A']]));
  assert.equal(analyse(one.model,['A','B']).makespan,5);assert.equal(analyse(two.model,['A','B']).makespan,3);
  assert.equal(one.wires.find(w=>w.from.kind==='event'&&w.to.kind==='event').type,'resource:lift');
});

test('the eight-event refuge retains its six independent event orders and exact tree',()=>{
  const c=fixture('typed-refuge');
  const expected=legalWords(['survey','deliver','anchors','deck','walls','roof','inspect','open'],[
    ['survey','anchors'],['survey','inspect'],['deliver','deck'],['anchors','deck'],['deck','walls'],['deck','roof'],['walls','inspect'],['roof','inspect'],['inspect','open']
  ]);
  assert.equal(c.events.length,8);assert.equal(expected.length,6);assert.deepEqual(words(traces(c)),words(expected));
  for(const trace of traces(c)){const a=analyse(c.model,trace);assert.equal(a.makespan,15);assert.equal(a.exactTree,true);assert.equal(a.events.length,8);}
  for(const w of c.wires){assert.ok(w.from);assert.ok(w.to);}
});

test('globally repeated occurrence names reject, while explicit renaming permits template reuse',()=>{
  const f=event('work',['a'],['a']);
  assert.equal(compileTerm(seq(f,f)).ok,false);
  assert.match(compileTerm(par(f,f)).errors.join(' '),/duplicate event occurrence/);
  const second=renameOccurrences(f,'second:');
  const c=compile(seq(f,second));assert.deepEqual(traces(c),[['work','second:work']]);
  assert.equal(f.id,'work');assert.equal(second.id,'second:work');assert.equal(second.label,f.label);
});

test('canonicalization retains labels, durations, port types and wire multiplicities',()=>{
  const original=compile(event('A',['a'],['b'],2,'work'));
  for(const term of [event('A',['a'],['b'],3,'work'),event('A',['a'],['b'],2,'other'),event('A',['x'],['b'],2,'work'),event('A',['a'],['b','b'],2,'work')])
    assert.notDeepEqual(compile(term).canonical,original.canonical);
  const renamed=structuredClone(original);renamed.wires.forEach((w,i)=>w.id=`arbitrary-wire-${i}`);
  assert.deepEqual(canonicalize(renamed),original.canonical);
  assert.throws(()=>canonicalize({ok:false}),/successfully compiled/);
});

test('malformed terms never return a usable partial model',()=>{
  const malformed=[null,{},identity(''),{op:'unknown'},event('A',[],['a']),event('A',['a'],['b'],0),event('A',['a'],['b'],Infinity),
    {...event('A',['a'],['b']),label:4},permutation(['a','b'],[0,0]),permutation(['a','b'],[0]),permutation(['a'],[-1]),permutation(['a'],[.5]),
    {op:'seq',children:[]},{op:'par',children:[]},seq(event('A',['a'],['b']),event('B',['c'],['d'])),
    seq(identity('a'),identity('a','a')),event('', ['a'],['b'])];
  for(const term of malformed){const c=compileTerm(term);assert.equal(c.ok,false,JSON.stringify(term));assert.ok(c.errors.length);assert.equal(c.model,null);assert.deepEqual(c.wires,[]);}
  const cycle={op:'seq',children:[]};cycle.children.push(cycle);assert.match(compileTerm(cycle).errors.join(' '),/cyclic/);
});

test('declared structural budgets reject overlarge syntax before compilation',()=>{
  assert.equal(compileTerm(identity(...Array(COMPOSITION_LIMITS.maxPorts+1).fill('a'))).ok,false);
  let nested=identity('a');for(let i=0;i<COMPOSITION_LIMITS.maxDepth+1;i++)nested=seq(nested);
  assert.match(compileTerm(nested).errors.join(' '),/nesting/);
  const many=par(...Array.from({length:COMPOSITION_LIMITS.maxEvents+1},(_,i)=>event(`E${i}`,['a'],['b'])));
  assert.match(compileTerm(many).errors.join(' '),/event occurrences/);
});

test('compilation, result editing and scenario editing are isolated from source syntax',()=>{
  const example=getCompositionScenario('typed-refuge'),before=JSON.stringify(example.term),first=compile(example.term),snapshot=JSON.stringify(first.canonical);
  first.events[0].label='edited result';first.model.transitions[0].duration=999;first.inputs[0].type='edited port';
  assert.equal(JSON.stringify(example.term),before);assert.equal(JSON.stringify(compile(example.term).canonical),snapshot);
  example.term.children.length=0;assert.notEqual(getCompositionScenario('typed-refuge').term.children.length,0);
  assert.equal(getCompositionScenario('missing'),null);
  assert.deepEqual(validateTerm(identity('a','b')).inputs,['a','b']);
});
