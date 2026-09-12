import test from 'node:test';
import assert from 'node:assert/strict';
import {analyse,validate,replayTrace,certifyTrace,verifySchedule} from '../apps/feedback-plan-lab/engine.mjs';
const p=(id,initial=0,kind='condition')=>({id,label:id,kind,initial});
const t=(id,owner,inputs,outputs,duration=1)=>({id,label:id,owner,inputs,outputs,duration});
const model=(places,transitions,goal)=>({id:'focused-feedback',places,transitions,goal});
const retry=()=>model([p('ready',1),p('review'),p('cert'),p('done'),p('tool',1,'resource')],[t('work','planner',{ready:1,tool:1},{review:1,tool:1},2),t('pass','environment',{review:1},{cert:1}),t('fail','environment',{review:1},{ready:1}),t('finish','planner',{cert:1},{done:1})],{done:1});

test('native repeated review outcomes remain enabled at every return; optimistic completion is not a guarantee',()=>{
 const m=retry(),before=JSON.stringify(m),r=analyse(m,{horizon:8});
 assert(r.ok&&r.complete);assert.equal(r.summary.possible,true);assert.equal(r.summary.guaranteed,false);assert.equal(r.summary.worstDuration,null);
 assert(r.paths.some(p=>p.trace.filter(id=>id==='fail').length===4&&p.terminal==='cutoff'));
 const loops=r.states.filter(s=>s.marking.ready===1);assert(loops.length>=4);assert(new Set(loops.map(s=>s.remaining)).size>=4);
 assert.equal(JSON.stringify(m),before);
});
test('planner retains all winning choices and minimises worst sequential duration',()=>{
 const m=retry();m.transitions.push(t('fallback','planner',{ready:1,tool:1},{done:1,tool:1},10));
 const r=analyse(m,{horizon:4});assert(r.complete);assert.equal(r.summary.guaranteed,true);assert.deepEqual(r.summary.winningChoices,['work','fallback']);assert.equal(r.summary.bestChoice,'fallback');assert.equal(r.summary.worstDuration,10);
 assert(r.policy.proof.ok&&r.policy.proof.allTerminalsGoal);assert.equal(r.policy.proof.checkedStates,2);
 const short=analyse(m,{horizon:2});assert.deepEqual(short.summary.winningChoices,['fallback']);
});
test('an observed outcome supports contingent decisions, while all outcomes remain in the proof',()=>{
 const m=model([p('review',1),p('x'),p('y'),p('done')],[t('x','environment',{review:1},{x:1}),t('y','environment',{review:1},{y:1},2),t('a','planner',{x:1},{done:1},3),t('b','planner',{y:1},{done:1},4)],{done:1});
 const r=analyse(m,{horizon:2});assert(r.complete&&r.summary.guaranteed);assert.equal(r.summary.worstDuration,6);assert.equal(r.policy.proof.environmentBranches,2);assert.deepEqual(r.policy.decisions.map(d=>d.transitionId).sort(),['a','b']);
});
test('one adverse environment branch defeats a seemingly successful plan',()=>{
 const m=model([p('r',1),p('done'),p('bad')],[t('good','environment',{r:1},{done:1}),t('bad','environment',{r:1},{bad:1})],{done:1});
 const r=analyse(m,{horizon:3});assert(r.complete);assert.equal(r.summary.possible,true);assert.equal(r.summary.guaranteed,false);assert.equal(r.summary.deadlockPathCount,1);
});
test('horizon failure, true non-goal deadlock and initial goal are separate',()=>{
 const m=retry();assert.equal(analyse(m,{horizon:1}).paths[0].terminal,'cutoff');
 const d=analyse(model([p('done')],[],{done:1}),{horizon:2});assert.equal(d.summary.possible,false);assert.equal(d.paths[0].terminal,'deadlock');
 const identity=model([p('done',1)],[],{done:1}),r=analyse(identity,{horizon:1});assert(r.summary.guaranteed);assert.equal(r.summary.worstDuration,0);assert.deepEqual(r.paths[0].trace,[]);
 const c=certifyTrace(identity,[]);assert(c.ok&&c.complete);assert.equal(c.witnesses[0].makespan,0);assert(c.witnesses[0].monoidal.verified.framePreserved);
});
test('ownership ambiguity is rejected rather than given an implicit priority',()=>{
 const m=model([p('r',1),p('done')],[t('a','planner',{r:1},{done:1}),t('b','environment',{r:1},{done:1})],{done:1});
 const r=analyse(m,{horizon:2});assert(!r.ok&&!r.complete);assert.match(r.errors.join(' '),/Ambiguous ownership/);assert.equal(r.summary.guaranteed,null);assert(!replayTrace(m,[]).ok);
 const later=model([p('r',1),p('next'),p('done')],[t('go','planner',{r:1},{next:1}),t('a','planner',{next:1},{done:1}),t('b','environment',{next:1},{done:1})],{done:1});assert(!analyse(later,{horizon:1}).ok);
});
test('explicit per-transition caps and malformed definitions are rejected',()=>{
 for(const bad of [null,{}, {...retry(),transitions:[null]}, {...retry(),places:[null]}])assert.equal(validate(bad).ok,false);
 const m=retry();m.transitions[2].maxFirings=1;assert.match(validate(m).errors.join(' '),/censor adverse outcomes/);
 for(const h of [0,9,1.5,null]){const r=analyse(retry(),{horizon:h});if(h!==null)assert(!r.ok);}
 assert(!analyse(retry(),null).ok);assert(!analyse(retry(),{maxStates:0}).ok);
});
test('computational caps cannot prove a guarantee or bounded impossibility; exact-at-cap remains complete',()=>{
 const m=model([p('r',1),p('done'),p('bad')],[t('good','environment',{r:1},{done:1}),t('bad','environment',{r:1},{bad:1})],{done:1});
 const full=analyse(m,{horizon:2});
 for(const options of [{maxStates:2},{maxEdges:1},{maxPaths:1},{maxPathNodes:1},{maxCharacters:1}]){const r=analyse(m,{horizon:2,...options});assert(r.ok);assert(!r.complete);assert.equal(r.summary.guaranteed,null);assert.equal(r.summary.winningChoices,null);assert(!r.policy.complete);}
 for(const[name,n]of Object.entries({maxStates:full.states.length,maxEdges:full.edges.length,maxPaths:full.paths.length,maxPathNodes:full.stats.pathNodes,maxCharacters:full.stats.characters})){const r=analyse(m,{horizon:2,[name]:n});assert(r.complete,name);}
});
test('realised repeated paths have occurrence identities, typed token flow and count-replayed schedules',()=>{
 const m=retry(),trace=['work','fail','work','pass','finish'];const r=replayTrace(m,trace,{horizon:5});assert(r.ok&&r.goalReached);assert.deepEqual(r.events.map(e=>e.id),['work#1','fail#1','work#2','pass#1','finish#1']);
 const c=certifyTrace(m,trace,{horizon:5});assert(c.ok&&c.complete);assert.equal(c.witnesses.length,1);const w=c.witnesses[0];assert(w.timedReplay.ok&&w.monoidal.verified.compiled);assert.equal(w.makespan,7);assert(w.edges.some(e=>e.from==='work#1'&&e.to==='work#2'&&e.place==='tool'));
 assert(!certifyTrace(m,['work']).ok);assert(!replayTrace(m,['work','pass','finish','work']).ok);assert(!replayTrace(m,trace,{horizon:4}).ok);
});
test('selective evidence invalidation consumes stale evidence before a response',()=>{
 const m=model([p('review',1),p('evidence',1),p('repair'),p('retest'),p('ready'),p('done')],[t('discover','environment',{review:1,evidence:1},{repair:1}),t('revise','planner',{repair:1},{retest:1}),t('retest','environment',{retest:1},{evidence:1,ready:1}),t('commission','planner',{evidence:1,ready:1},{done:1})],{done:1});
 assert.equal(replayTrace(m,['discover']).marking.evidence,0);const r=analyse(m,{horizon:4});assert(r.summary.guaranteed);assert.deepEqual(r.paths[0].trace,['discover','revise','retest','commission']);
});
test('large untouched context stays counted and numeric overflow never deletes a bad transition',()=>{
 const m=retry();m.places.push(p('frame',80,'resource'));const c=certifyTrace(m,['work','pass','finish']);assert(c.ok&&c.complete);assert.equal(c.witnesses[0].monoidal.verified.compiled,false);assert.equal(c.witnesses[0].monoidal.wires.find(w=>w.place==='frame').count,80);
 const overflow=model([p('r',1),p('huge',Number.MAX_SAFE_INTEGER),p('done')],[t('safe','environment',{r:1},{done:1}),t('overflow','environment',{r:1},{huge:1})],{done:1});const r=analyse(overflow);assert(!r.ok&&!r.complete);assert.equal(r.summary.guaranteed,null);assert.match(r.errors.join(' '),/safe-integer/);
 const numeric=model([p('r',1),p('next'),p('done')],[t('a','planner',{r:1},{next:1},1e308),t('b','planner',{next:1},{done:1},1)],{done:1});assert(!analyse(numeric).ok);
});
test('public timed validator handles malformed entries and aggregate repeated-resource starts',()=>{
 const m=retry();assert(!verifySchedule(m,[null],[]).ok);assert(!verifySchedule(m,[],[null]).ok);
 const events=[{id:'work#1',transitionId:'work'},{id:'work#2',transitionId:'work'}];assert(!verifySchedule(m,events,[{id:'work#1',start:0,end:2},{id:'work#2',start:0,end:2}]).ok);
});

test('certificate ancestry and enriched-output budgets remain separate from a completed branch',()=>{
 const m=model([p('ready',1),p('pool',1),p('done')],[t('produce','planner',{ready:1},{pool:1}),t('finish','planner',{pool:1},{done:1})],{done:1}),trace=['produce','finish'];
 const full=certifyTrace(m,trace);assert(full.ok&&full.complete);assert.equal(full.witnesses.length,2);
 const ancestry=certifyTrace(m,trace,{maxWitnesses:1});assert(ancestry.ok&&!ancestry.complete);assert.equal(ancestry.reason,'maxWitnesses');
 const output=certifyTrace(m,trace,{maxCertificateCharacters:1});assert(output.ok&&!output.complete);assert.equal(output.reason,'maxCertificateCharacters');assert.equal(output.witnesses.length,0);
 const exact=certifyTrace(m,trace,{maxCertificateCharacters:full.stats.certificateCharacters});assert(exact.ok&&exact.complete);
 assert(!certifyTrace(m,trace,{maxCertificateCharacters:0}).ok);assert(!analyse(m,{horizon:null}).ok);
});
