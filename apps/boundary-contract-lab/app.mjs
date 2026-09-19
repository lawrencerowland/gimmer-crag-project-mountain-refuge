import {SCENARIOS} from './scenarios.mjs';
import {renderPetri,renderMonoidal} from './views.mjs';

const $=id=>document.getElementById(id), KEY='gimmer-boundary-contract-v1';
const clone=x=>JSON.parse(JSON.stringify(x));
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let model=null,result=null,worker=null,timer=null,epoch=0,dirty=true,activeTab='steps',pendingSupply=false;
const names=new Map();
const label=id=>names.get(id)||id;
function status(text,error=false){$('status').textContent=text;$('status').className='status'+(error?' error':'');}
function settle(){if(worker)worker.terminate();worker=null;clearTimeout(timer);$('generate').disabled=false;$('cancel').hidden=true;}
function invalidate(message='Unchecked changes. Check the construction to see a current result.') {epoch++;settle();dirty=true;$('results').hidden=true;$('verdict').replaceChildren();$('metrics').replaceChildren();$('counterexample').replaceChildren();$('save').disabled=true;$('download').disabled=true;status(message);}
function tab(name,focus=false){activeTab=name;for(const id of ['steps','plans','proof']){const yes=id===name;$('tab-'+id).setAttribute('aria-selected',String(yes));$('tab-'+id).tabIndex=yes?0:-1;$('panel-'+id).hidden=!yes;}if(focus)$('tab-'+name).focus();}
function describe(d){
 names.clear();for(const f of d.fragments||[])for(const e of f.events||[])names.set(e.id,e.label||e.id);
 $('description').textContent=d.description||d.title||'Custom construction';$('assumptions').replaceChildren(...(d.assumptions||[]).map(s=>el('li',s)));
 $('fragments').replaceChildren();$('resources').replaceChildren();
 for(const f of d.fragments||[]){const box=el('div',undefined,'fragment');box.append(el('h4',f.title||f.label||f.id));for(const e of f.events||[])box.append(el('p',(e.label||e.id)+' · '+e.duration+' time units'));if(!(f.events||[]).length)box.append(el('p','Resource ownership or pass-through only; no work event.'));$('fragments').append(box);
  for(const p of f.places||[]){const l=el('label',f.id+' / '+p.id);const i=el('input');i.type='number';i.min='0';i.max='64';i.step='1';i.value=p.initial;i.dataset.fragment=f.id;i.dataset.place=p.id;l.append(i,el('small','Locally owned tokens'));$('resources').append(l);}
  for(const p of f.ports||[])if(p.direction==='in'){const l=el('label',f.id+' / '+p.id);const i=el('input');i.type='number';i.min='0';i.max='64';i.step='1';i.value=p.supply||0;i.dataset.fragment=f.id;i.dataset.port=p.id;const connected=(d.connections||[]).some(c=>c.to===f.id+'.'+p.id);l.append(i,el('small',connected?'Connected: old supply is discharged':'Unconnected external supply'));$('resources').append(l);}
 }
 $('connections').replaceChildren(...(d.connections||[]).map(c=>el('div',c.from+' → '+c.to,'connection')));
 if(!(d.connections||[]).length)$('connections').append(el('p','No ports are identified. Ownership stays disjoint.'));
 for(const i of $('resources').querySelectorAll('input'))i.addEventListener('input',()=>{pendingSupply=true;invalidate('Supply edits are pending. Apply supplies or check the connection.');});
}
function load(d,note){pendingSupply=false;invalidate();$('editor').value=JSON.stringify(d,null,2);check(note);}
function validatePresentation(d){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('A construction must be an object.');
 for(const key of ['title','description'])if(d[key]!==undefined&&typeof d[key]!=='string')throw Error(key+' must be text.');
 if(d.assumptions!==undefined&&(!Array.isArray(d.assumptions)||d.assumptions.some(x=>typeof x!=='string')))throw Error('Assumptions must be a list of text statements.');
 for(const f of Array.isArray(d.fragments)?d.fragments:[]){if(!f||typeof f!=='object')continue;for(const key of ['title','label'])if(f[key]!==undefined&&typeof f[key]!=='string')throw Error('Fragment '+key+' must be text.');for(const e of Array.isArray(f.events)?f.events:[])if(e&&e.label!==undefined&&typeof e.label!=='string')throw Error('Event labels must be text.');}
}
function check(note='Construction checked.'){
 try{if(pendingSupply)mergeSupplies();}catch(e){status(e.message,true);return;}
 invalidate('Checking both routes…');let d;try{if($('editor').value.length>250000)throw Error('Construction is too large. Maximum 250,000 characters.');d=JSON.parse($('editor').value);validatePresentation(d);}catch(e){status('Could not read the construction: '+e.message,true);return;}
 const id=epoch;$('generate').disabled=true;$('cancel').hidden=false;
 worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
 worker.onerror=e=>{if(id!==epoch)return;settle();status('The calculation could not finish: '+e.message,true);};
 worker.onmessage=({data})=>{if(data.id!==epoch)return;settle();if(data.error){status('Construction rejected: '+data.error,true);return;}if(data.result.status==='invalid'||data.result.errors?.length){status('Construction rejected: '+(data.result.errors||[]).join('; '),true);return;}model=clone(d);result=data.result;dirty=false;syncExample();describe(model);render();$('save').disabled=false;$('download').disabled=false;status(note+(result.status==='complete'?'':' The result includes a bound or incomplete calculation; inspect the limits.'));$('pending-note').textContent='The checked definition is ready to save. Edits are not saved until you choose Save or Download.';};
 timer=setTimeout(()=>{if(id!==epoch)return;invalidate('Calculation stopped at the time limit. This is unknown, not an impossibility result.');},30000);
 worker.postMessage({id,model:d,options:{caps:$('budget').value==='small'?{maxStates:2,maxSteps:2,maxWords:2}:{maxStates:256,maxSteps:6561,maxWords:5000}}});
}
function syncExample(){
 const preset=SCENARIOS.find(s=>s.id===model.id);
 const exact=preset&&JSON.stringify(preset)===JSON.stringify(model);
 const old=$('scenario').querySelector('option[value="custom-checked"]');if(old)old.remove();
 if(exact)$('scenario').value=preset.id;
 else{const o=el('option',(model.title||'Custom construction')+' — edited');o.value='custom-checked';$('scenario').append(o);$('scenario').value='custom-checked';}
}
function render(){
 const c=result.comparison||{},equal=c.status==='equivalent',unknown=c.status==='unknown';$('results').hidden=false;
 $('verdict').replaceChildren(el('h3',equal?'Both routes preserve the same steps.':unknown?'The comparison is incomplete.':'The two routes disagree.','verdict-title'+(!equal&&!unknown?' bad':'')),el('p',equal?'The enriched contract and directly connected process agree throughout this finite construction.':unknown?'A limit stopped the calculation. A missing state or step cannot establish a difference.':'Inspect the replayable difference below before using this construction.'));
 $('metrics').replaceChildren();for(const [value,text]of [[result.states?.length||0,'reachable states'],[result.steps?.length||0,'joint steps'],[result.words?.length||0,'complete orders']]){const m=el('div',undefined,'metric');m.append(el('strong',String(value)),el('span',text));$('metrics').append(m);}
 $('counterexample').replaceChildren();const naive=result.naive||{};
 if(naive.comparison){const box=el('div',undefined,'counterexample');box.append(el('h4',naive.comparison.status==='different'?'A weaker summary loses something':naive.comparison.status==='unknown'?'The weaker-summary check is incomplete':'No loss found for this weaker summary'),el('p',naive.explanation||naive.kind));if(naive.comparison.counterexample){
 const w=naive.comparison.counterexample;
 if(w.kind==='step'){
  box.append(el('p',(w.presentIn==='right'?'The weaker version wrongly allows: ':'The weaker version loses this lawful step: ')+(w.events||[]).map(label).join(' + ')+'.'));
  box.append(el('p',w.completed?.length?'After: '+w.completed.map(label).join(', ')+'.':'This difference is already present before any work completes.'));
  const b=el('button','Inspect this decision');b.onclick=()=>{const mask=result.eventIds.reduce((m,id,i)=>m+(w.completed.includes(id)?1<<i:0),0);$('state').value=String(mask);tab('steps');renderState();$('state').focus();};box.append(b);
 }else if(w.kind==='marking')box.append(el('p','The two descriptions leave different resource counts at the same completed-work state.'));
 const details=el('details'),summary=el('summary','Exact replayable witness');details.append(summary,el('pre',JSON.stringify(w,null,2)));box.append(details);
 }$('counterexample').append(box);}
 if(c.counterexample)$('counterexample').append(el('pre',JSON.stringify(c.counterexample,null,2)));
 if(result.reasons?.length)$('counterexample').append(el('p','Limits: '+result.reasons.join('; '),'error'));
 $('state').replaceChildren(...(result.states||[]).map(s=>{const o=el('option',s.completed?.length?s.completed.map(label).join(' + '):'Nothing completed — initial state');o.value=String(s.mask);return o;}));renderState();
 const words=result.words||[];$('word-summary').textContent=words.length+' complete orders returned. '+(result.wordsComplete===false?'Order enumeration reached its display/search bound. ':'')+'Showing the first '+Math.min(words.length,120)+'. Each arrow below is an ordering choice, not automatically a physical dependency.';
 $('words').replaceChildren(...words.slice(0,120).map(w=>el('div',Array.isArray(w)?(w.length?w.map(label).join(' → '):'No events — the selected scope is already complete.'):String(w))));if(!words.length)$('words').append(el('p','No complete order was returned. Check whether exploration completed before drawing an impossibility conclusion.'));
 renderSchedule();$('contract-summary').replaceChildren();for(const c of result.contracts||[]){const item=el('div',undefined,'fragment');item.append(el('h4',c.source?.title||c.source?.id||c.id||'Open fragment'),el('p',(c.states?.length??c.localStates?.length??'?')+' internal states; boundary demands are retained even when the standalone supply cannot meet them.'));$('contract-summary').append(item);}tab(activeTab);
}
function renderState(){const s=(result?.states||[]).find(s=>String(s.mask)===$('state').value);if(!s){for(const id of ['state-marking','step-list','boundary-joining','net-diagram','monoidal-arrow'])$(id).replaceChildren();$('arrow-step').replaceChildren();$('arrow-step').disabled=true;$('arrow-step').onchange=null;$('net-caption').textContent='No explored marking is available. The calculation stopped before a state could be returned; the previous diagram has been cleared.';$('step-note').textContent='No next step can be offered without an explored state.';$('monoidal-arrow').append(el('p','No executable arrow is shown because no explored marking is available.'));return;}$('state-marking').replaceChildren();for(const [name,count]of Object.entries(s.marking||{})){const t=el('span',undefined,'token');t.append(el('b',String(count)),document.createTextNode(name));$('state-marking').append(t);}
 const steps=(result.steps||[]).filter(e=>e.from===s.mask);const placeKey=renderPetri(result.net,s,steps,model);renderMonoidal(result.net,s,steps,placeKey,label);$('step-list').replaceChildren(...steps.map(step=>{const b=el('button',step.events.map(label).join(' + '));b.title='Take this atomic step and inspect the next state';b.onclick=()=>{$('state').value=String(step.to);renderState();};return b;}));$('step-note').textContent=steps.length?'Choose a step to move to its resulting state. Joint work must have its whole input supply available now.':s.terminal?'All selected work is complete, including sinks.':'No next step is returned here. In a complete exploration this is a dead end; under a cutoff its status is unknown.';
}
function renderSchedule(){const s=result.schedule||{};$('schedule').replaceChildren();const layers=s.layers||[];if(!layers.length){$('schedule-note').textContent=s.status==='valid'&&s.makespan===0?'No work is selected: completion at time 0.':'No complete representative schedule was returned.';return;}const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');const rows=(s.intervals||[]).map(x=>({id:x.event,start:x.start,finish:x.finish}));const end=Math.max(...rows.map(r=>r.finish),1),width=850,height=rows.length*37+40,left=240;svg.setAttribute('width',width);svg.setAttribute('height',height);svg.setAttribute('role','img');svg.setAttribute('aria-label','Representative batch schedule. '+rows.map(r=>label(r.id)+' from '+r.start+' to '+r.finish).join('; '));for(let n=0;n<rows.length;n++){const row=rows[n];const t=document.createElementNS(ns,'text');t.setAttribute('x','4');t.setAttribute('y',String(30+n*37));t.setAttribute('font-size','13');t.setAttribute('fill','#203934');t.textContent=label(row.id).slice(0,34);svg.append(t);const rect=document.createElementNS(ns,'rect');rect.setAttribute('x',String(left+row.start/end*560));rect.setAttribute('y',String(11+n*37));rect.setAttribute('width',String(Math.max(3,(row.finish-row.start)/end*560)));rect.setAttribute('height','27');rect.setAttribute('rx','4');rect.setAttribute('fill',n%2?'#708c6a':'#175b49');svg.append(rect);const time=document.createElementNS(ns,'text');time.setAttribute('x',String(left+row.start/end*560+6));time.setAttribute('y',String(30+n*37));time.setAttribute('fill','white');time.setAttribute('font-size','12');time.textContent=row.start+'–'+row.finish;svg.append(time);} $('schedule').append(svg);$('schedule-note').textContent='Representative finish: '+(s.makespan??end)+' toy time units. '+(s.status||'')+'. Batch waiting may be conservative; the state/step equality does not claim equality of every timed schedule.';}
function checked(){if(dirty||!model){$('save-status').textContent='Check the current edits before saving or downloading.';return false;}return true;}
function pack(){return {schema:'gimmer-boundary-construction-v1',savedAt:new Date().toISOString(),model,observations:{status:result.status,comparison:result.comparison,weakSummary:result.naive?.comparison||null}};}
function unpack(x){if(x?.schema!=='gimmer-boundary-construction-v1'||!x.model)throw Error('Expected a Gimmer boundary construction file.');return x.model;}
for(const s of SCENARIOS){const o=el('option',s.title);o.value=s.id;$('scenario').append(o);}
$('scenario').onchange=()=>load(clone(SCENARIOS.find(x=>x.id===$('scenario').value)),'Example checked.');
$('generate').onclick=()=>check();$('check-editor').onclick=()=>check('Edited construction checked.');$('budget').onchange=()=>check('Budget applied.');$('cancel').onclick=()=>invalidate('Cancelled. No current result; check again when ready.');$('editor').oninput=()=>{pendingSupply=false;invalidate();};
$('restore').onclick=()=>load(clone(SCENARIOS.find(x=>x.id===$('scenario').value)||SCENARIOS.find(x=>x.id===model?.id)||SCENARIOS[0]),'Original example restored and checked.');
function mergeSupplies(){const d=JSON.parse($('editor').value);for(const i of $('resources').querySelectorAll('input')){const n=Number(i.value);if(!i.value.trim()||!Number.isInteger(n)||n<0||n>64)throw Error('Supply counts must be whole numbers from 0 to 64.');const f=d.fragments.find(f=>f.id===i.dataset.fragment);if(i.dataset.port)f.ports.find(p=>p.id===i.dataset.port).supply=n;else f.places.find(p=>p.id===i.dataset.place).initial=n;}$('editor').value=JSON.stringify(d,null,2);pendingSupply=false;}
$('apply-resources').onclick=()=>{pendingSupply=true;check('New supplies checked.');};
$('state').onchange=renderState;
for(const id of ['steps','plans','proof']){$('tab-'+id).onclick=()=>tab(id);$('tab-'+id).onkeydown=e=>{const ids=['steps','plans','proof'];let n=ids.indexOf(id);if(e.key==='ArrowRight')n=(n+1)%3;else if(e.key==='ArrowLeft')n=(n+2)%3;else if(e.key==='Home')n=0;else if(e.key==='End')n=2;else return;e.preventDefault();tab(ids[n],true);};}
$('save').onclick=()=>{if(!checked())return;try{const p=pack();localStorage.setItem(KEY,JSON.stringify(p));$('save-status').textContent='Saved “'+(model.title||model.id||'Custom construction')+'” in this browser at '+new Date(p.savedAt).toLocaleString()+'. Use Reopen browser copy to find it. No file was created.';}catch(e){$('save-status').textContent='Not saved: browser storage is unavailable. Download a file instead.';}};
$('reopen').onclick=()=>{try{const raw=localStorage.getItem(KEY);if(!raw)throw Error('No saved browser copy.');const p=JSON.parse(raw);load(unpack(p),'Browser copy reopened and recomputed.');$('save-status').textContent='Reopened the copy saved '+new Date(p.savedAt).toLocaleString()+'. Corrections need a new save.';}catch(e){$('save-status').textContent='Could not reopen: '+e.message;}};
$('download').onclick=()=>{if(!checked())return;const blob=new Blob([JSON.stringify(pack(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='gimmer-boundary-construction.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('save-status').textContent='Download requested: gimmer-boundary-construction.json. Open that file to recompute this construction; no browser copy was changed.';};
$('import-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;invalidate('Reading construction file…');const id=epoch;try{if(f.size>1000000)throw Error('File too large; maximum 1,000,000 bytes.');const raw=await f.text();if(id!==epoch)return;const m=unpack(JSON.parse(raw));load(m,'Imported construction recomputed.');$('save-status').textContent='Opened '+f.name+'. This is not saved in the browser until you choose Save.';}catch(error){if(id===epoch){status('File not opened: '+error.message,true);$('save-status').textContent='File not opened. The saved browser copy is unchanged.';}}finally{e.target.value='';}};
$('forget').onclick=()=>{try{localStorage.removeItem(KEY);$('save-status').textContent='Browser copy removed. The checked construction remains on screen; downloaded files are unchanged.';}catch(e){$('save-status').textContent='Could not remove browser copy: '+e.message;}};
document.querySelector('.hero .button').onclick=()=>{tab('steps');requestAnimationFrame(()=>$('panel-steps').scrollIntoView({block:'start'}));};
for(const [id,scenario]of [['show-shared','owned-lifting-resource'],['show-independent','independent-lifting-resources']])$(id).onclick=()=>{tab('steps');load(clone(SCENARIOS.find(s=>s.id===scenario)),'Comparison example checked.');};
load(clone(SCENARIOS[0]),'Example checked.');
