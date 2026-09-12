import {SCENARIOS, getScenario} from './scenarios.mjs';
import {replayTrace} from './engine.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = value => JSON.parse(JSON.stringify(value));
const fmt = value => value === null || value === undefined ? '—' : !Number.isFinite(value) ? 'unavailable' : value !== 0 && (Math.abs(value) < .001 || Math.abs(value) >= 1e9) ? value.toExponential(3) : Number(value.toFixed(3)).toLocaleString();
const KEY = 'gimmer-feedback-plan-v1', FILE_LIMIT = 2_000_000;
let worker = null, generation = 0, importGeneration = 0, busy = false, pendingKind = null;
let model = null, result = null, scenarioId = SCENARIOS[0].id, sourceExampleId = SCENARIOS[0].id, trace = [], stateId = null, certificate = null, certifiedTrace = [];
let dirty = false, activeTab = 'walk', requestedRestore = null;
const byTransition = id => model?.transitions.find(t => t.id === id);
const state = () => result?.states.find(s => s.id === stateId);
const verdictText = s => s?.guaranteed === true ? 'A guaranteed response is available within this horizon.' : s?.guaranteed === false ? (s.possible ? 'Successful paths exist, but completion is not guaranteed within this horizon.' : 'No successful path exists within this horizon.') : 'The calculation is partial: a guarantee is unknown.';
const tokenTable = marking => `<table><thead><tr><th>Place / evidence</th><th>Count</th></tr></thead><tbody>${model.places.map(p=>`<tr><td>${esc(p.label||p.id)}</td><td>${esc(marking[p.id]??0)}</td></tr>`).join('')}</tbody></table>`;
function setSaveEnabled() { for (const id of ['save','download']) $(id).disabled = busy || dirty || !result?.ok; }
function stopWorker() { generation++; worker?.terminate(); worker=null; busy=false; pendingKind=null; $('cancel').hidden=true; $('generate').disabled=false; setSaveEnabled(); }
function markDirty() { const interrupted=pendingKind; stopWorker(); dirty=true; scenarioId=null; $('scenario').value=''; $('scenario-description').textContent='Custom edited model. Review the changed rules and assumptions before interpreting the result.'; $('compare').disabled=true; $('comparison-label').textContent='Paired example comparisons are unavailable for a custom model.'; $('draft-status').textContent='Draft changed. Generate responses before saving this model. Any result below still belongs to the last analysed model.'; if(interrupted){$('status').textContent='The pending calculation was cancelled because the model draft changed.';if(interrupted==='certificate')$('plan-status').textContent='Certificate calculation cancelled after a draft change.';} setSaveEnabled(); }
function changeSummary(oldModel, next) {
  if (!oldModel) return '';
  const rules = m => JSON.stringify({transitions:m?.transitions,goal:m?.goal,places:Array.isArray(m?.places)?m.places.map(p=>{if(!p||typeof p!=='object')return p;const {initial,...rest}=p;return rest;}):m?.places});
  if (rules(oldModel)!==rules(next)) return 'The mechanism, goal or declared model description changed. This is a new model calculation; the previous observed history is not carried over.';
  const initial = m => Array.isArray(m?.places) ? m.places.map(p=>p?.initial) : m?.places;
  if (JSON.stringify(initial(oldModel))!==JSON.stringify(initial(next))) return 'Only the initial marking changed. The task rules and goal are the same.';
  return 'The mechanism and marking are unchanged; the exploration settings or saved checkpoint were reopened.';
}
function renderContext() {
  const c=model?.context||{};
  const expanded=$('boundary').value==='expanded';
  $('context-details').innerHTML=[['Boundary', expanded ? `${c.boundary||'Declared system'} and the external service` : c.boundary||'Not specified'],['Required value',c.value||'Coverage of the explicit goal token counts.'],['Stimulus',c.stimulus||'The model’s enabled uncontrolled outcomes.'],['Permitted response',c.response||'The enabled planner transitions.']].map(([k,v])=>`<div><h3>${esc(k)}</h3><p>${esc(v)}</p></div>`).join('')+`<div style="grid-column:1/-1"><h3>Stated assumptions</h3><p>${esc(c.assumptions||'Read the model before interpreting the result. Only the declared finite behavior is checked.')}</p></div>`;
}
function actorText(t) {
  const ids=$('boundary').value==='expanded' ? model?.context?.expandedActors : model?.context?.actors;
  const inside=Array.isArray(ids)&&ids.includes(t.actor);
  return t.actor ? `${t.actor} · ${inside?'inside':'outside'} the displayed boundary` : 'Actor not specified';
}
function chooseScenario(id) {
  importGeneration++; requestedRestore=null;
  const s=getScenario(id); scenarioId=s.id; sourceExampleId=s.id; $('scenario').value=s.id; $('horizon').value=String(s.horizon);
  $('model-editor').value=JSON.stringify(s.model,null,2); $('scenario-description').textContent=s.description;
  $('compare').disabled=!s.comparison; $('comparison-label').textContent=s.comparison ? `Compare with: ${getScenario(s.comparison).title}` : 'No paired comparison for this example.';
  $('restore-example').disabled=false; $('budget').value='normal'; $('boundary').value='team';
  startAnalysis();
}
function startAnalysis(restore=null) {
  importGeneration++; stopWorker();
  let next;
  try { next=JSON.parse($('model-editor').value); } catch (error) { $('error').hidden=false; $('error').textContent=`Model JSON could not be read: ${error.message}`; $('results').hidden=true; result=null; dirty=true; setSaveEnabled(); return; }
  const note=changeSummary(model,next); $('change-note').hidden=!note; $('change-note').textContent=note;
  model=copy(next); result=null; trace=[]; stateId=null; certificate=null; certifiedTrace=[]; requestedRestore=restore;
  dirty=false; $('draft-status').textContent='Calculating this draft…'; $('results').hidden=true; $('error').hidden=true; $('plan-result').hidden=true;
  $('resource-control').hidden=!Array.isArray(model?.places)||!model.places.some(p=>p?.id==='reserve');
  if (!$('resource-control').hidden) $('reserve').value=String(model.places.find(p=>p?.id==='reserve').initial);
  renderContext(); $('status').textContent='Exploring legal responses and every admitted review outcome…';
  const horizon=Number($('horizon').value), options={horizon};
  if ($('budget').value==='small') options.maxStates=2;
  const cases=SCENARIOS.find(s=>s.id===scenarioId)?.knownCases||[];
  launch('analyse',{model,options,cases});
}
function launch(kind,payload) {
  stopWorker(); pendingKind=kind; busy=true; const id=++generation;
  $('cancel').hidden=false; $('generate').disabled=true; setSaveEnabled();
  worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
  worker.onerror=event=>{if(id!==generation)return; stopWorker(); $('status').textContent='The calculation failed. Your model text is still available.'; $('error').hidden=false; $('error').textContent=event.message||'Worker error'; if(kind==='certificate')$('plan-status').textContent='Certificate unavailable. The model and observed events were retained.';};
  worker.onmessage=({data})=>{
    if(data.id!==generation)return;
    worker.terminate();worker=null;busy=false;pendingKind=null;$('cancel').hidden=true;$('generate').disabled=false;
    if(data.error){$('error').hidden=false;$('error').textContent=data.error;$('status').textContent='The calculation could not finish. Your model text is retained.';setSaveEnabled();return;}
    if(kind==='certificate'){certificate=data.result;renderCertificate();setSaveEnabled();return;}
    result=data.result;
    if(!result.ok){$('error').hidden=false;$('error').textContent=(result.errors||['Invalid model']).join('\n');$('status').textContent='The model was rejected. Correct the draft and generate again.';$('results').hidden=true;dirty=true;setSaveEnabled();return;}
    stateId=result.initialStateId; trace=[]; $('results').hidden=false; $('status').textContent=result.complete?'Calculation complete within the selected horizon.':'Calculation partial. The computing limit does not establish a guarantee or impossibility.';
    $('draft-status').textContent='The result uses this model and the selected horizon.';
    if(requestedRestore){
      const recovered=replayTrace(model,requestedRestore.trace||[],{horizon:result.horizon});
      if(recovered.ok){let id=result.initialStateId; for(const t of requestedRestore.trace||[]){const edge=result.edges.find(e=>e.from===id&&e.transitionId===t); if(!edge){id=null;break;}id=edge.to;}if(id){trace=[...(requestedRestore.trace||[])];stateId=id;}else $('save-status').textContent='The model reopened, but the checkpoint was not explored under this budget; showing the initial state.';}
      else $('save-status').textContent='The model reopened. The saved checkpoint failed fresh replay and was discarded: '+recovered.errors.join(' ');
      requestedRestore=null;
    }
    renderSummary(data.knownCases||[]); renderWalk(); renderPolicy(); switchTab('walk');setSaveEnabled();
  };
  worker.postMessage({id,kind,...payload});
}
function renderSummary(knownCases) {
  const s=result.summary; $('result-title').textContent=model.title||'Responses to the same goal'; $('verdict').textContent=verdictText(s);$('verdict').className='verdict'+(s.guaranteed===true?'':' warn');
  const entries=[[s.stateCount,'observed-state / horizon pairs'],[s.goalPathCount??0,'successful histories retained'],[s.worstDuration,'best worst-case sequential time'],[s.cutoffPathCount??0,'histories reaching the horizon']];
  $('metrics').innerHTML=entries.map(([n,label])=>`<div class="metric"><strong>${fmt(n)}</strong><span>${esc(label)}</span></div>`).join('');
  $('completeness').textContent=`Graph: ${result.completeness.graph?'complete':'partial'} · histories: ${result.completeness.paths?'complete':'partial'} · policy calculation: ${result.completeness.policy?'complete':'partial'}. Policy time sums sequential event durations; it is not a concurrent-scheduling optimum.`;
  $('known-cases').hidden=!knownCases.length;
  $('known-case-results').innerHTML=knownCases.map(c=>`<p><strong>${esc(c.name)} permit fixed in advance:</strong> ${c.summary.guaranteed===true?'a successful policy exists':c.summary.guaranteed===false?'no guarantee within the horizon':'unknown'}.</p>`).join('');
  const successes=result.paths.filter(p=>p.terminal==='goal');
  $('path').innerHTML=successes.map(p=>`<option value="${esc(p.id)}">${esc(p.trace.map(id=>byTransition(id)?.label||id).join(' → '))}</option>`).join('');
  $('path').disabled=!successes.length; $('plan-status').textContent=successes.length?'Choose this tab to construct a typed witness for the selected realised history.':'No successful history was retained within this exploration.';
  $('raw-stats').textContent=JSON.stringify({completeness:result.completeness,stats:result.stats,limits:result.limits,policyScope:result.policy?.scope},null,2);
}
function renderWalk() {
  const s=state();if(!s)return;
  $('turn-label').textContent=s.terminal==='goal'?'Goal reached':s.owner==='environment'?'Observe an outcome':'Choose a permitted response';
  $('checkpoint-title').textContent=trace.length?`After ${trace.length} observed event${trace.length===1?'':'s'}`:'Before the next event';
  $('checkpoint-status').textContent=s.terminal==='goal'?'The observed history reaches the declared current-value goal.':s.terminal==='cutoff'?'The event horizon is exhausted. This is not a claim that no longer route can succeed.':s.terminal==='deadlock'?'This marking does not meet the goal and no transition is enabled.':`${s.remaining} events remain. ${verdictText(s)}`;
  const tagged=model.places.filter(p=>p.artifact&&s.marking[p.id]>0);
  $('evidence-cards').innerHTML=tagged.map(p=>`<div class="evidence-card ${['current','stale','historical'].includes(p.status)?p.status:''}"><strong>${esc(p.artifact)}</strong>${esc(p.status||'present')} · ${esc(s.marking[p.id])}</div>`).join('');
  const last=trace.length?byTransition(trace.at(-1)):null;
  $('event-effect').hidden=!last; $('event-effect').textContent=last ? `${last.note||last.label} ${actorText(last)}.` : '';
  $('choices').innerHTML=(s.enabled||[]).map(id=>{
    const t=byTransition(id), edge=result.edges.find(e=>e.from===s.id&&e.transitionId===id), child=result.states.find(n=>n.id===edge?.to), win=s.winningChoices?.includes(id);
    const detail=t.owner==='environment'?'Simulate this reported outcome · not a planning choice':win?'Preserves a guarantee within the remaining horizon':child?.possible?'A successful path remains, but no guarantee from this choice':'No guaranteed completion established from this choice';
    return `<button class="choice ${t.owner==='environment'?'world':win?'winning':''}" data-transition="${esc(id)}" ${edge?'':'disabled'}><span>${esc(t.label||id)}</span><small>${esc(detail)}</small></button>`;
  }).join('');
  $('outcome-explanation').textContent=s.owner==='environment'?'These buttons let you test possible observations. The synthesized policy must cover every enabled outcome; it cannot choose which one happens.':s.terminal?'':'Green choices retain a guarantee. You may also inspect a risky choice to see what it loses.';
  $('policy-next').disabled=busy||!s.bestChoice||s.owner!=='planner';$('inspect-current').hidden=s.terminal!=='goal';$('back-step').disabled=!trace.length||busy;
  const counts=new Map();$('history').innerHTML=trace.map(id=>{counts.set(id,(counts.get(id)||0)+1);const t=byTransition(id);return `<li><strong>${esc(t?.label||id)}</strong><small>${esc(id)}#${counts.get(id)} · ${t?.owner==='environment'?'observed outcome':'chosen response'}</small></li>`;}).join('')||'<li>No events observed yet.</li>';
  $('marking-table').innerHTML=tokenTable(s.marking);
}
function step(id) {
  if(busy||!result)return; const edge=result.edges.find(e=>e.from===stateId&&e.transitionId===id);if(!edge)return;
  trace.push(id);stateId=edge.to;renderWalk();$('save-status').textContent='Checkpoint changed. Save again to keep this observed history.';
}
function restorePrefix(prefix) { let next=result.initialStateId;for(const id of prefix){const e=result.edges.find(e=>e.from===next&&e.transitionId===id);if(!e)return;next=e.to;}trace=[...prefix];stateId=next;renderWalk();$('save-status').textContent='Checkpoint changed; the browser copy is unchanged until saved again.'; }
function renderPolicy() {
  const proof=result.policy?.proof;
  $('policy-summary').innerHTML=proof?.ok ? `<p class="note">The returned policy was replayed across ${esc(proof.checkedStates)} reached states and ${esc(proof.environmentBranches)} uncontrolled branches. Every terminal meets the goal. Worst sequential duration: ${fmt(proof.worstDuration)}.</p>` : `<p class="note">${esc(verdictText(result.summary))} A successful history is a weaker claim than a verified response policy.</p>`;
  $('proof-state').innerHTML=result.states.map(s=>`<option value="${esc(s.id)}">${esc(s.id)} · ${s.remaining} events left · ${esc(s.terminal||s.owner||'unexplored')}</option>`).join('');
  renderProofState();
}
function renderProofState() {
  const s=result?.states.find(n=>n.id===$('proof-state').value);if(!s)return;
  $('proof-state-detail').innerHTML=`<p>${esc(verdictText(s))}</p><p><strong>Policy choice:</strong> ${esc(s.bestChoice?byTransition(s.bestChoice)?.label||s.bestChoice:'none required or established')}<br><strong>Every enabled event:</strong> ${esc((s.enabled||[]).map(id=>byTransition(id)?.label||id).join('; ')||'none')}</p>${tokenTable(s.marking)}`;
}
function switchTab(name) {
  activeTab=name;
  for(const n of ['walk','plan','proof']) { $('tab-'+n).setAttribute('aria-selected',String(n===name));$('tab-'+n).tabIndex=n===name?0:-1;$('panel-'+n).hidden=n!==name; }
  if(name==='plan'&&!certificate&&!busy&&$('path').value) requestCertificate(result.paths.find(p=>p.id===$('path').value)?.trace||[]);
}
function requestCertificate(path) {
  if(!result||!path.length&& !state()?.terminal)return;
  certificate=null;certifiedTrace=[...path];$('plan-result').hidden=true;$('plan-status').textContent='Constructing and replaying the typed token-supply witnesses…';
  launch('certificate',{model,trace:path,options:{horizon:result.horizon}});
}
function treeHTML(tree) {
  if(!tree)return '<p>No exact sequence/parallel tree preserves this witness. Its richer dependency and supply information is retained below.</p>';
  if(tree.type==='task')return `<span>${esc(tree.label||tree.id)} <small>(${esc(tree.id)})</small></span>`;
  return `<strong>${tree.type==='parallel'?'In parallel':'In sequence'}</strong><ul>${tree.children.map(t=>`<li>${treeHTML(t)}</li>`).join('')}</ul>`;
}
function renderCertificate() {
  if(!certificate?.ok){$('plan-status').textContent='Certificate rejected: '+(certificate?.errors||['No result']).join(' ');$('plan-result').hidden=true;return;}
  $('plan-status').textContent=`${certificate.complete?'Complete':'Partial'} producer-count ancestry calculation for this history. ${certificate.witnesses.length} witnesses retained. ${certificate.reason||''}`;
  $('witness').innerHTML=certificate.witnesses.map((w,i)=>`<option value="${i}">Witness ${i+1} · earliest finish ${fmt(w.makespan)} · ${w.exactTree?'exact work tree':'richer graph required'}</option>`).join('');
  $('plan-result').hidden=!certificate.witnesses.length;renderWitness();
}
function renderWitness() {
  const w=certificate?.witnesses[Number($('witness').value)||0];if(!w)return;
  $('plan-summary').textContent=`${certifiedTrace.length} distinct event occurrences. Earliest finish ${fmt(w.makespan)} time units for this fixed supply history; not a forecast of the review outcome.`;
  $('work-tree').innerHTML=treeHTML(w.tree);
  const v=w.monoidal?.verified||{};
  $('plan-checks').innerHTML=`<ul><li>Goal coverage: ${w.timedReplay?.goalReached?'reached':'not established'}</li><li>Independent timed resource replay: ${w.timedReplay?.ok?'passed':'not established'}</li><li>Counted supplies and retained context: ${v.tokenBalance&&v.framePreserved?'verified':'not established'}</li><li>Expanded monoidal term: ${v.compiled?'compiled and checked':esc(w.monoidal?.reason||'unavailable')}</li></ul>`;
  const labels=new Map(certificate.events.map(e=>[e.id,e.label||e.id]));const W=900,L=260,R=30,scale=W-L-R,height=55+w.schedule.length*48,max=w.makespan||1;
  $('timeline').innerHTML=`<svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Earliest schedule for the selected realized history">${Array.from({length:6},(_,i)=>`<text x="${L+scale*i/5}" y="20" font-size="12" fill="#596b62">${esc(fmt(max*(i/5)))}</text>`).join('')}${w.schedule.map((t,i)=>`<text x="4" y="${51+i*48}" font-size="12" fill="#193c35">${esc(labels.get(t.id)||t.id)}</text><rect x="${L+scale*(t.start/max)}" y="${34+i*48}" width="${Math.max(1,scale*((t.end-t.start)/max))}" height="22" rx="3" fill="#1d7763"/><text x="${L+scale*(t.start/max)}" y="${72+i*48}" font-size="11" fill="#596b62">${esc(t.id)} · ${esc(fmt(t.start))} → ${esc(fmt(t.end))}</text>`).join('')}</svg>`;
  const endpoint=p=>p.kind==='event'?p.eventId:p.kind==='input'?'Initial boundary':'Final boundary';
  $('wire-table').innerHTML=`<table><thead><tr><th>Supply type</th><th>Count</th><th>From</th><th>To</th></tr></thead><tbody>${(w.monoidal?.wires||[]).map(line=>`<tr><td>${esc(model.places.find(p=>p.id===line.place)?.label||line.place)}<br><small>${esc(line.type)}</small></td><td>${esc(line.count)}</td><td>${esc(endpoint(line.from))}</td><td>${esc(endpoint(line.to))}</td></tr>`).join('')}</tbody></table>`;
  $('certificate-detail').textContent=JSON.stringify({trace:certifiedTrace,scope:certificate.scope,monoidal:w.monoidal,timedReplay:w.timedReplay},null,2);
}
function bundle() { return {format:'gimmer-feedback-model',version:1,model:copy(model),horizon:result.horizon,budget:$('budget').value,checkpoint:{trace:[...trace]},boundary:$('boundary').value}; }
function bundleText() { const text=JSON.stringify(bundle());if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('This portable model exceeds the two-megabyte file limit.');return text; }
function restoreBundle(data,label) {
  if(!data||data.format!=='gimmer-feedback-model'||data.version!==1||!data.model||!Number.isInteger(data.horizon)||data.horizon<1||data.horizon>8)throw new Error('This is not a supported feedback-model file (version 1, horizon 1–8).');
  if(data.checkpoint?.trace!==undefined&&(!Array.isArray(data.checkpoint.trace)||data.checkpoint.trace.some(x=>typeof x!=='string')||data.checkpoint.trace.length>data.horizon))throw new Error('The saved checkpoint must be a transition-id list within the horizon.');
  scenarioId=null;sourceExampleId=null;$('scenario').value='';$('scenario-description').textContent='Custom or reopened model. Review its rules and assumptions before interpreting the result.';$('compare').disabled=true;$('comparison-label').textContent='Choose a supplied example to use its paired comparison.';$('restore-example').disabled=true;
  $('model-editor').value=JSON.stringify(data.model,null,2);$('horizon').value=String(data.horizon);$('budget').value=data.budget==='small'?'small':'normal';$('boundary').value=data.boundary==='expanded'?'expanded':'team';
  $('save-status').textContent=`${label}. Recomputing the result and replaying the checkpoint; imported claims are ignored.`;startAnalysis({trace:data.checkpoint?.trace||[]});
}

$('scenario').innerHTML='<option value="" disabled>Custom / reopened model</option>'+SCENARIOS.map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('');
$('scenario').addEventListener('change',()=>chooseScenario($('scenario').value));
$('generate').addEventListener('click',()=>startAnalysis());
$('horizon').addEventListener('change',()=>startAnalysis());$('budget').addEventListener('change',()=>startAnalysis());
$('cancel').addEventListener('click',()=>{importGeneration++;const kind=pendingKind;stopWorker();$('status').textContent='Calculation cancelled. Your model text and browser copy are unchanged.';if(kind==='certificate')$('plan-status').textContent='Certificate calculation cancelled. The observed checkpoint remains available.';});
$('model-editor').addEventListener('input',()=>{importGeneration++;markDirty();});
$('restore-example').addEventListener('click',()=>{if(sourceExampleId)chooseScenario(sourceExampleId);});
$('compare').addEventListener('click',()=>{const target=SCENARIOS.find(s=>s.id===scenarioId)?.comparison;if(target)chooseScenario(target);});
$('apply-reserve').addEventListener('click',()=>{const count=Number($('reserve').value);if(!Number.isSafeInteger(count)||count<0||count>3){$('status').textContent='Use a whole reserve count from zero to three.';return;}let next;try{next=JSON.parse($('model-editor').value);const p=Array.isArray(next?.places)&&next.places.find(p=>p?.id==='reserve');if(!p)throw new Error('No reserve place in this model.');p.initial=count;}catch(e){$('status').textContent=e.message;return;}$('model-editor').value=JSON.stringify(next,null,2);startAnalysis();});
$('choices').addEventListener('click',event=>{const b=event.target.closest('[data-transition]');if(b)step(b.dataset.transition);});
$('policy-next').addEventListener('click',()=>{const id=state()?.bestChoice;if(id)step(id);});
$('restart').addEventListener('click',()=>{if(!busy&&result)restorePrefix([]);});
$('back-step').addEventListener('click',()=>{if(!busy)restorePrefix(trace.slice(0,-1));});
$('inspect-current').addEventListener('click',()=>{if(busy||state()?.terminal!=='goal')return;const path=result.paths.find(p=>JSON.stringify(p.trace)===JSON.stringify(trace));if(path)$('path').value=path.id;switchTab('plan');if(certificate&&JSON.stringify(certifiedTrace)!==JSON.stringify(trace))requestCertificate(trace);});
$('path').addEventListener('change',()=>{const p=result?.paths.find(p=>p.id===$('path').value);if(p)requestCertificate(p.trace);});$('witness').addEventListener('change',renderWitness);$('proof-state').addEventListener('change',renderProofState);
for(const name of ['walk','plan','proof'])$('tab-'+name).addEventListener('click',()=>switchTab(name));
document.querySelector('.tabs').addEventListener('keydown',event=>{const names=['walk','plan','proof'];if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();let i=names.indexOf(activeTab);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;switchTab(names[i]);$('tab-'+names[i]).focus();});
$('boundary').addEventListener('change',()=>{renderContext();if(result)renderWalk();});
$('save').addEventListener('click',()=>{try{const text=bundleText();localStorage.setItem(KEY,text);if(localStorage.getItem(KEY)!==text)throw new Error('The saved copy could not be verified.');$('save-status').textContent=`Saved and verified in this browser: ${model.title||model.id}, horizon ${result.horizon}, ${trace.length} observed events. Reopen browser copy to return here. No file was created.`;}catch(e){$('save-status').textContent='Not saved: '+e.message;}});
$('reopen').addEventListener('click',()=>{importGeneration++;try{const saved=localStorage.getItem(KEY);if(!saved)throw new Error('No browser copy has been saved.');restoreBundle(JSON.parse(saved),'Browser copy reopened');}catch(e){$('save-status').textContent='Could not reopen: '+e.message;}});
$('forget').addEventListener('click',()=>{try{localStorage.removeItem(KEY);if(localStorage.getItem(KEY)!==null)throw new Error('Removal could not be verified.');$('save-status').textContent='Browser copy removed. The current model and any downloaded files remain available.';}catch(e){$('save-status').textContent='Removal failed: '+e.message;}});
$('download').addEventListener('click',()=>{try{const text=bundleText();const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='gimmer-feedback-model.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);$('save-status').textContent='Model download prepared: gimmer-feedback-model.json. The browser copy is unchanged. Opening the file recomputes the result.';}catch(e){$('save-status').textContent='Download could not be prepared: '+e.message;}});
$('import-file').addEventListener('change',async event=>{const file=event.target.files[0],ticket=++importGeneration;event.target.value='';if(!file)return;try{if(file.size>FILE_LIMIT)throw new Error('Model files must be no larger than two megabytes.');const content=await file.text();if(ticket!==importGeneration)return;restoreBundle(JSON.parse(content),'Model file opened');}catch(e){if(ticket===importGeneration)$('save-status').textContent='File not opened: '+e.message;}});
chooseScenario(SCENARIOS[0].id);
