import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS} from '../apps/boundary-contract-lab/scenarios.mjs';
import {analyze,compileContract,composeContracts,glueFragments,exploreNet,compareBehaviors,replaySchedule,scheduleForWord,identityFragment,renameFragment} from '../apps/boundary-contract-lab/engine.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const fixture=id=>clone(SCENARIOS.find(s=>s.id===id));

test('all worked examples compare complete state, joint-step and marking behavior',()=>{
  for(const s of SCENARIOS){const r=analyze(s);assert.equal(r.status,'complete',s.id);assert.equal(r.comparison.status,'equivalent',s.id);assert.equal(r.comparison.markingsChecked,true,s.id);if(s.naive)assert.equal(r.naive.comparison.status,'different',s.id);if(r.words.length)assert.equal(r.schedule.replay.valid,true,s.id);else assert.equal(r.schedule.status,'impossible',s.id);}
});
test('contract composition works after the source nets have been removed',()=>{
  const s=fixture('partial-availability'),cs=s.fragments.map(f=>compileContract(f));for(const c of cs)delete c.source;
  const product=composeContracts(cs,s.connections).behavior,direct=exploreNet(glueFragments(s.fragments,s.connections));assert.equal(compareBehaviors(product,direct).status,'equivalent');
});
test('one shared resource and two owned resources have equal words but different joint capacity',()=>{
  const shared=analyze(fixture('owned-lifting-resource')),two=analyze(fixture('independent-lifting-resources'));
  assert.deepEqual(shared.words,two.words);assert.equal(shared.steps.some(s=>s.events.length===2),false);assert.equal(two.steps.some(s=>s.events.length===2),true);assert.equal(shared.schedule.makespan,5);assert.equal(two.schedule.makespan,3);
});
test('schedule replay rejects resource overlap and accepts return at the exact finish',()=>{
  const r=analyze(fixture('owned-lifting-resource'));
  assert.equal(replaySchedule(r.net,[{event:'Frame',start:0,finish:2},{event:'Roof',start:0,finish:3}]).valid,false);
  assert.equal(replaySchedule(r.net,[{event:'Frame',start:0,finish:2},{event:'Roof',start:2,finish:5}]).valid,true);
  assert.equal(replaySchedule(r.net,[{event:'Frame',start:0,finish:2}]).valid,false);
  assert.equal(replaySchedule(r.net,[{event:'Frame',start:0,finish:3},{event:'Roof',start:3,finish:6}]).valid,false);
});
test('replayed alternative words preserve either-support and full scope',()=>{
  const r=analyze(fixture('alternative-support'));
  assert.equal(r.words.length,4);for(const w of r.words)assert.equal(scheduleForWord(r.net,w).status,'valid');
  assert.equal(scheduleForWord(r.net,['C','A','B']).status,'invalid');
  assert.equal(scheduleForWord(r.net,['A','C']).status,'invalid');
});
test('counterexamples include smallest exposed boundary step and a legal prefix',()=>{
  const released=analyze(fixture('replenished-boundary')).naive.comparison.counterexample;
  assert.deepEqual(released.completed,['Release']);assert.deepEqual(released.events,['Roof']);assert.deepEqual(released.trace,['Release']);
  const doubled=analyze(fixture('owned-lifting-resource')).naive.comparison.counterexample;
  assert.deepEqual(doubled.completed,[]);assert.deepEqual(doubled.events,['Frame','Roof']);
});
test('explicit identity projection preserves counts and transferring external supply',()=>{
  const f=fixture('replenished-boundary').fragments[1];f.ports[0].supply=1;
  const direct=composeContracts([compileContract(f)],[]).behavior;
  const id=identityFragment('identity','lifting-resource',1),withId=composeContracts([compileContract(id),compileContract(f)],[{from:'identity.output',to:'method.borrow'}]).behavior;
  assert.equal(compareBehaviors(direct,withId,{markingProjection:{right:{'identity.wire=method.lift':'method.lift'}}}).status,'equivalent');
});
test('explicit occurrence and boundary renaming produces the declared state correspondence',()=>{
  const f=fixture('replenished-boundary').fragments[1],renamed=renameFragment(f,{id:'other',events:{Roof:'Panel'},places:{lift:'hoist'},ports:{borrow:'input'}});
  assert.equal(renamed.id,'other');assert.equal(renamed.events[0].id,'Panel');assert.deepEqual(renamed.events[0].consume,{hoist:1});assert.equal(renamed.ports[0].id,'input');assert.equal(renamed.ports[0].place,'hoist');
});
test('incomplete internal initial marking cannot be silently recovered inside a larger product',()=>{
  const f={id:'blocked',places:[{id:'p',type:'p',initial:2}],ports:[],events:[]};
  const c=compileContract(f,{caps:{maxCount:1}}),other=compileContract(fixture('replenished-boundary').fragments[0]);
  assert.equal(composeContracts([c,other],[]).behavior.status,'incomplete');
});
test('glued source counts above the numeric budget report incomplete on both routes',()=>{
  const s=fixture('owned-lifting-resource');s.fragments[0].places[0].initial=100000;s.fragments[1].places[0].initial=100000;
  const r=analyze(s,{caps:{maxCount:100000}});assert.equal(r.status,'incomplete');assert.equal(r.direct.status,'incomplete');assert.equal(r.comparison.status,'unknown');
});
test('ordinary identifiers matching object properties remain valid local places and occurrences',()=>{
  for(const name of ['constructor','toString','hasOwnProperty']){
    const f={id:'F',places:[{id:name,type:'resource',initial:1}],ports:[],events:[{id:name,duration:1,consume:{[name]:1},produce:{}}]};
    const r=analyze({fragments:[f],connections:[]});assert.equal(r.status,'complete');assert.equal(r.comparison.status,'equivalent');assert.equal(r.steps.length,1);assert.equal(r.schedule.status,'valid');assert.deepEqual(renameFragment(f),f);
  }
});
