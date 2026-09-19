// Presentation of the checked net and returned steps; this module does not decide enabling.
const NS='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
const html=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function svg(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
function lines(text,width=26){const words=String(text).replaceAll('=',' = ').split(/\s+/),rows=[];let line='';for(let word of words){while(word.length>width){if(line){rows.push(line);line='';}rows.push(word.slice(0,width));word=word.slice(width);}if((line+' '+word).trim().length>width){rows.push(line);line=word;}else line=(line+' '+word).trim();}if(line)rows.push(line);return rows;}
function label(parent,text,x,y,width=26,cls='diagram-label'){
 const rows=lines(text,width),node=svg('text',{x,y,class:cls,'text-anchor':'middle'});
 rows.forEach((row,i)=>node.append(svg('tspan',{x,dy:i?15:0},row)));parent.append(node);return rows.length;
}
export function renderPetri(net,state,steps,model){
 const holder=$('net-diagram');holder.replaceChildren();
 const ready=new Set(steps.flatMap(s=>s.events)),done=new Set(state.completed),places=net.places,events=net.events;
 const names=places.map((p,i)=>({id:p.id,alias:'p'+(i+1),name:p.type.replaceAll('-',' ')}));
 const key=new Map(names.map(p=>[p.id,p]));
 const joins=$('boundary-joining');joins.replaceChildren();
 for(const connection of model.connections){
  const [fromFragment,fromPort]=connection.from.split('.');
  const fragment=model.fragments.find(f=>f.id===fromFragment),port=fragment.ports.find(p=>p.id===fromPort);
  const place=net.places.find(p=>p.id.split('=').includes(fromFragment+'.'+port.place));
  const [toFragment,toPort]=connection.to.split('.'),receiver=model.fragments.find(f=>f.id===toFragment).ports.find(p=>p.id===toPort);
  const row=html('div',undefined,'boundary-row');row.append(html('span',connection.from+' · output','boundary-port'),html('span','→'),html('strong',key.get(place.id).alias+' · one shared place'),html('span','←'),html('span',connection.to+' · input','boundary-port'));
  joins.append(row,html('p','Joining identifies these two exposed places. The receiver’s separate external-supply assumption ('+(receiver.supply||0)+' tokens) is discharged; locally owned tokens are retained.','small'));
 }
 if(!model.connections.length)joins.append(html('p','⊗ · These fragments sit alongside one another with disjoint ownership. No boundary places are identified.','small'));
 const placeRows=places.map(p=>Math.max(126,68+15*lines(p.id,27).length+15*lines(p.type,28).length));
 const eventRows=events.map(e=>Math.max(126,80+15*lines(e.label||e.id,25).length));
 const height=Math.max(placeRows.reduce((a,b)=>a+b,0),eventRows.reduce((a,b)=>a+b,0),150)+50;
 const pic=svg('svg',{viewBox:`0 0 800 ${height}`,width:800,height,role:'img','aria-labelledby':'net-title net-description'});
 pic.append(svg('title',{id:'net-title'},'Petri net at the selected completed-work state'));
 pic.append(svg('desc',{id:'net-description'},'Places: '+places.map(p=>`${p.id}: ${state.marking[p.id]||0} tokens`).join('; ')+'. Events: '+events.map(e=>`${e.label||e.id}: ${done.has(e.id)?'completed':ready.has(e.id)?'admitted':'not returned as enabled'}`).join('; ')+'. Solid arrows consume; dashed arrows produce.'));
 const defs=svg('defs');for(const [name,color]of[['consume','#175b49'],['produce','#a24c30']]){const marker=svg('marker',{id:'net-'+name,markerWidth:7,markerHeight:7,refX:6,refY:3.5,orient:'auto'});marker.append(svg('path',{d:'M0 0 L7 3.5 L0 7',fill:color}));defs.append(marker);}pic.append(defs);
 const py=new Map(),ey=new Map();let cursor=35;
 places.forEach((p,i)=>{py.set(p.id,cursor+28);cursor+=placeRows[i];});cursor=35;
 events.forEach((e,i)=>{ey.set(e.id,cursor+28);cursor+=eventRows[i];});
 const arcs=svg('g',{'aria-hidden':'true'});
 for(const e of events)for(const kind of ['consume','produce'])for(const [id,n]of Object.entries(e[kind]))if(n>0){
  const y=py.get(id),z=ey.get(e.id),input=kind==='consume',color=input?'#175b49':'#a24c30';
  const d=input?`M 210 ${y-10} C 320 ${y-34}, 430 ${z-34}, 526 ${z-10}`:`M 526 ${z+10} C 430 ${z+40}, 320 ${y+40}, 210 ${y+10}`;
  arcs.append(svg('path',{d,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':input?'none':'6 4','marker-end':`url(#net-${kind})`}));
  if(n!==1){const yy=(y+z)/2+(input?-25:32);arcs.append(svg('rect',{x:351,y:yy-13,width:44,height:20,rx:4,fill:'#fffef8'}),svg('text',{x:373,y:yy,'text-anchor':'middle',fill:color,'font-size':12},String(n)));}
 }
 pic.append(arcs);
 for(const p of places){const y=py.get(p.id),n=state.marking[p.id]||0,g=svg('g',{'data-place':p.id});
  g.append(svg('circle',{cx:184,cy:y,r:28,fill:n?'#dfead8':'#fffef8',stroke:'#175b49','stroke-width':2}));
  if(n>0&&n<=4){for(let i=0;i<n;i++){const positions=n===1?[[0,0]]:n===2?[[-7,0],[7,0]]:n===3?[[-7,-5],[7,-5],[0,8]]:[[-7,-7],[7,-7],[-7,7],[7,7]];g.append(svg('circle',{cx:184+positions[i][0],cy:y+positions[i][1],r:4,fill:'#175b49'}));}}
  else g.append(svg('text',{x:184,y:y+5,'text-anchor':'middle','font-size':15,fill:'#175b49'},String(n)));
  const count=label(g,key.get(p.id).alias+' · '+key.get(p.id).name,184,y+47,28);
  label(g,p.id,184,y+47+15*count,27,'diagram-id');pic.append(g);
 }
 for(const e of events){const y=ey.get(e.id),g=svg('g',{'data-event':e.id,'data-status':done.has(e.id)?'completed':ready.has(e.id)?'enabled':'waiting'});
  const color=done.has(e.id)?'#566963':ready.has(e.id)?'#175b49':'#fffef8';
  g.append(svg('rect',{x:528,y:y-23,width:190,height:46,rx:4,fill:color,stroke:'#566963','stroke-width':1.5}));
  g.append(svg('title',{},'Occurrence '+e.id));const shortId=e.id.length>19?e.id.slice(0,18)+'…':e.id;
  label(g,(done.has(e.id)?'✓ ':ready.has(e.id)?'● ':'○ ')+shortId,623,y+5,22,done.has(e.id)||ready.has(e.id)?'diagram-event-light':'diagram-label');
  const count=label(g,e.label||e.id,623,y+48,25);label(g,done.has(e.id)?'Completed once':ready.has(e.id)?'Admitted next':'Waiting / not returned',623,y+48+15*count,27,'diagram-id');pic.append(g);
 }
 if(!events.length)label(pic,'No selected work events',590,70,28);
 holder.append(pic);
 const shared=net.ownership.filter(group=>group.length>1);
 $('net-caption').textContent=(shared.length?'Shared places: '+shared.map(g=>g.join(' = ')).join('; ')+'. ':'No places are shared: matching types remain separately owned. ')+ 'Every unlabelled arc has weight 1. Large counts are written as numbers. Pan sideways on a small screen; exact event signatures are below.';
 return key;
}
export function renderMonoidal(net,state,steps,key,labelEvent){
 const select=$('arrow-step');select.replaceChildren();
 const box=$('monoidal-arrow');box.replaceChildren();select.disabled=!steps.length;
 steps.forEach((s,i)=>{const option=html('option',s.events.map(labelEvent).join(' + '));option.value=String(i);select.append(option);});
 const format=map=>{const terms=net.places.filter(p=>(map[p.id]||0)>0).map(p=>`${map[p.id]===1?'':map[p.id]+'·'}${key.get(p.id).alias}`);return terms.length?terms.join(' ⊗ '):'I';};
 const eventMap=new Map(net.events.map(e=>[e.id,e]));
 function show(){
  box.replaceChildren();const step=steps[Number(select.value)];
  if(!step){box.append(html('p',state.terminal?'No unfinished event remains. The identity arrow would leave this marking unchanged.':'No next step was returned at this state; no executable event arrow is offered.'));return;}
  const remaining={...state.marking},output={...state.marking};
  for(const id of step.events){const e=eventMap.get(id);for(const[p,n]of Object.entries(e.consume)){remaining[p]-=n;output[p]-=n;}for(const[p,n]of Object.entries(e.produce))output[p]=(output[p]||0)+n;}
  const signature=html('div',undefined,'arrow-signatures');
  for(const id of step.events){const e=eventMap.get(id);signature.append(html('p',`${id} : ${format(e.consume)} → ${format(e.produce)} `),html('p',labelEvent(id),'small'));}box.append(signature);
  const context=format(remaining),expression=[...(context==='I'?[]:[`id[${context}]`]),...step.events].join(' ⊗ ');
  const flow=html('div',undefined,'arrow-flow');flow.append(html('span',format(state.marking),'arrow-object'),html('span','→'),html('strong',expression,'arrow-morphism'),html('span','→'),html('span',format(output),'arrow-object'));box.append(flow);
  box.append(html('p',`Read left to right: current marking → ${step.events.length>1?'task arrows alongside one another':'one task arrow'}${context==='I'?'':', carrying '+context+' unchanged'} → resulting marking. The symbol I means no tokens; ⊗ combines token counts or arrows, not elapsed time.`,'small'));
  const glossary=html('dl',undefined,'place-glossary');for(const p of net.places){glossary.append(html('dt',key.get(p.id).alias),html('dd',key.get(p.id).name+' · '+p.id));}box.append(glossary);
 }
 select.onchange=show;show();
}
