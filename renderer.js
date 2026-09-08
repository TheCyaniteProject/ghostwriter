const board = document.querySelector('#board');
const content = document.querySelector('#board-content');
const pathsGroup = document.querySelector('#connection-paths');
const draftPath = document.querySelector('#draft-connection');

let zoom = 1;
let pan = { x: 0, y: 0 };
let nextId = 1;
let nodes = [];
let connections = [];
let dragging = null;
let wiring = null;
let beatDrag = null;
let boardMode = 'select';
let sourceArcId = null;

const nodeMenu = document.createElement('div');
nodeMenu.className = 'node-context-menu';
nodeMenu.hidden = true;
nodeMenu.innerHTML = '<button type="button" data-action="set-source"><span class="menu-icon">★</span>Set as Source</button><button type="button" data-action="rename"><span class="menu-icon">✎</span>Rename</button><button type="button" data-action="remove-connections"><span class="menu-icon">⤫</span>Remove Connections</button>';
document.body.append(nodeMenu);
let menuNode = null;

const sample = [
  { type:'arc', x:170, y:160, title:'I · The signal', beats:['Mara arrives at the empty station','A light flickers offshore'], chapterMap:['Arrival','Arrival'], refs:2 },
  { type:'arc', x:520, y:280, title:'II · Into the fog', beats:['The radio answers back'], chapterMap:['The crossing'], refs:2 },
  { type:'reference', x:170, y:485, title:'The old logbook', text:'Every keeper wrote the same final line: “The light remembers.”' },
  { type:'reference', x:520, y:90, title:'Setting notes', text:'Salt-worn concrete, low fog, a distant mechanical pulse.' }
];

function uid(prefix){ return `${prefix}-${nextId++}`; }
function esc(value=''){ return value.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function addNode(type,x,y,data={}){
  const node={ id:uid(type),type,x,y,title:data.title || (type==='arc'?'Untitled arc':'New reference'),text:data.text||'',beats:(data.beats||[]).map((text,index)=>({id:uid('beat'),text,chapter:data.chapterMap?.[index]||null})),refs:data.refs||1 };
  if(type==='arc'&&!sourceArcId)sourceArcId=node.id;
  nodes.push(node); renderNode(node);drawConnections();renderStoryPanel();return node;
}

function renderNode(node){
  let el=document.querySelector(`[data-id="${node.id}"]`);
  if(!el){el=document.createElement('article');content.append(el);}
  el.className=`node ${node.type}-node`; el.dataset.id=node.id; el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;
  if(node.type==='arc'){
    const beats=node.beats.length?node.beats.map((b,i)=>`<div class="beat-item" draggable="true" data-beat-id="${b.id}" data-index="${i}"><span class="beat-diamond">◆</span><input value="${esc(b.text)}" aria-label="Beat text"><span class="grip">⠿</span></div>`).join(''):'<div class="empty-beats">Drop a beat here</div>';
    const refPorts=Array.from({length:node.refs},(_,i)=>`<div class="ref-port-wrap"><span class="port input ref-input" data-port="ref-${i}" aria-label="Reference input ${i+1}"></span></div>`).join('');
    const chapterLinks=actualChaptersForArc(node).map((chapter,index)=>`<button class="arc-chapter-link" data-chapter-index="${index}"><span>§</span>${esc(chapter.name)}</button>`).join('');
    const source=node.id===sourceArcId;
    el.innerHTML=`${source?'<span class="source-star" title="Story source">★</span>':'<span class="port input arc-input" data-port="arc-in"></span>'}<span class="port output" data-port="out"></span><div class="ref-ports">${refPorts}</div><header class="node-header"><span class="node-symbol">A</span><input class="node-title" value="${esc(node.title)}" readonly><button class="node-menu" aria-label="Node menu">•••</button></header><div class="node-body"><span class="field-label">BEATS</span><div class="beats">${beats}</div></div>${chapterLinks?`<div class="arc-chapters"><span class="field-label">CHAPTERS</span>${chapterLinks}</div>`:''}<footer class="arc-footer"><span><strong>${node.beats.length}</strong> beat${node.beats.length===1?'':'s'}</span><span>${source?'Story source':`${node.refs-1} reference${node.refs-1===1?'':'s'} · 1 open`}</span></footer>`;
  } else {
    el.innerHTML=`<span class="port output" data-port="out"></span><header class="node-header"><span class="node-symbol">R</span><input class="node-title" value="${esc(node.title)}" readonly><button class="node-menu" aria-label="Node menu">•••</button></header><div class="node-body"><span class="field-label">REFERENCE</span><textarea placeholder="Write a note…">${esc(node.text)}</textarea></div>`;
  }
  bindNode(el,node);
}

function bindNode(el,node){
  el.querySelector('textarea')?.addEventListener('input',e=>node.text=e.target.value);
  el.querySelector('.node-header').addEventListener('pointerdown',e=>startMove(e,node,el));
  el.querySelector('.node-menu').addEventListener('click',e=>{e.stopPropagation();showNodeMenu(node,e.clientX,e.clientY)});
  el.addEventListener('contextmenu',e=>{e.preventDefault();showNodeMenu(node,e.clientX,e.clientY)});
  el.addEventListener('pointerdown',()=>{document.querySelectorAll('.node.selected').forEach(n=>n.classList.remove('selected'));el.classList.add('selected')});
  el.querySelectorAll('.port').forEach(port=>port.addEventListener('pointerdown',e=>startWire(e,node,port)));
  el.querySelectorAll('.ref-input').forEach(port=>port.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();disconnectReference(node,port.dataset.port)}));
  el.querySelectorAll('.arc-chapter-link').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();openArcChapter(node.id,+button.dataset.chapterIndex)}));
  if(node.type==='arc')el.querySelectorAll('.arc-input,.port.output').forEach(port=>port.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();disconnectArcPort(node,port.dataset.port)}));
  el.querySelectorAll('.beat-item').forEach(item=>{
    item.querySelector('input').addEventListener('input',e=>{node.beats[+item.dataset.index].text=e.target.value;renderStoryPanel()});
    item.addEventListener('dragstart',e=>{beatDrag={source:node.id,beatId:item.dataset.beatId};e.dataTransfer.setData('application/x-beat',item.dataset.beatId);setTimeout(()=>item.style.opacity='.35')});
    item.addEventListener('dragend',()=>{item.style.opacity='';beatDrag=null;document.querySelectorAll('.drop-ready,.drag-over').forEach(x=>x.classList.remove('drop-ready','drag-over'))});
    item.addEventListener('dragover',e=>{e.preventDefault();item.classList.add('drag-over')});
    item.addEventListener('dragleave',()=>item.classList.remove('drag-over'));
    item.addEventListener('drop',e=>{e.preventDefault();moveBeat(node,+item.dataset.index);});
  });
  if(node.type==='arc'){
    el.addEventListener('dragover',e=>{if(beatDrag||e.dataTransfer.types.includes('application/x-node')){e.preventDefault();el.classList.add('drop-ready')}});
    el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('drop-ready')});
    el.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();el.classList.remove('drop-ready');if(beatDrag)moveBeat(node,node.beats.length);else if(e.dataTransfer.getData('application/x-node')==='beat'){node.beats.push({id:uid('beat'),text:'New story beat',chapter:null});renderNode(node);renderStoryPanel()}});
  }
}

function moveBeat(target,index){
  if(!beatDrag)return;const source=nodes.find(n=>n.id===beatDrag.source);const old=source.beats.findIndex(b=>b.id===beatDrag.beatId);if(old<0)return;const [beat]=source.beats.splice(old,1);if(source===target&&old<index)index--;if(source!==target)beat.chapter=null;target.beats.splice(index,0,beat);renderNode(source);if(source!==target)renderNode(target);renderStoryPanel();beatDrag=null;
}

function startMove(e,node,el){
  if(e.button!==0||boardMode==='pan'||e.target.matches('button,input:not([readonly])'))return;e.preventDefault();const start={x:e.clientX,y:e.clientY,nx:node.x,ny:node.y};dragging={node,el,start};el.classList.add('dragging');el.setPointerCapture(e.pointerId);
  const move=ev=>{node.x=start.nx+(ev.clientX-start.x)/zoom;node.y=start.ny+(ev.clientY-start.y)/zoom;el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;drawConnections()};
  const up=()=>{el.classList.remove('dragging');el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);dragging=null};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
}

function showNodeMenu(node,x,y){
  menuNode=node;nodeMenu.hidden=false;
  const sourceAction=nodeMenu.querySelector('[data-action="set-source"]');sourceAction.hidden=node.type!=='arc'||node.id===sourceArcId;
  const width=150,height=48;
  nodeMenu.style.left=`${Math.min(x,window.innerWidth-width-8)}px`;
  nodeMenu.style.top=`${Math.min(y,window.innerHeight-height-8)}px`;
}

function setSourceArc(node){
  if(node.type!=='arc'||node.id===sourceArcId)return;const previous=nodes.find(item=>item.id===sourceArcId);
  connections=connections.filter(connection=>!(connection.type==='arc'&&connection.to.node===node.id));sourceArcId=node.id;
  if(previous)renderNode(previous);renderNode(node);drawConnections();renderStoryPanel();
}

function beginRename(node){
  const input=document.querySelector(`[data-id="${node.id}"] .node-title`);if(!input)return;
  const original=node.title;
  input.readOnly=false;input.classList.add('renaming');input.focus();input.select();
  const finish=()=>{node.title=input.value.trim()||'Untitled';input.value=node.title;input.readOnly=true;input.classList.remove('renaming');input.removeEventListener('blur',finish);input.removeEventListener('keydown',keys);renderStoryPanel()};
  const keys=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}if(e.key==='Escape'){input.value=original;input.blur()}};
  input.addEventListener('blur',finish);input.addEventListener('keydown',keys);
}

function startWire(e,node,port){
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();let kind=port.classList.contains('output')?'output':'input';
  const portName=port.dataset.port;
  const connectionIndex=connections.findIndex(c=>kind==='output'?(c.from.node===node.id&&c.from.port===portName):(c.to.node===node.id&&c.to.port===portName));
  let detached=null;
  if(connectionIndex>=0){
    detached=connections.splice(connectionIndex,1)[0];
    const anchor=kind==='output'?detached.to:detached.from;
    node=nodes.find(n=>n.id===anchor.node);
    port=document.querySelector(`[data-id="${anchor.node}"] [data-port="${anchor.port}"]`);
    kind=kind==='output'?'input':'output';
    drawConnections();
  }
  wiring={nodeId:node.id,port:port.dataset.port,kind,element:port};draftPath.removeAttribute('hidden');
  const move=ev=>drawDraft(ev.clientX,ev.clientY);
  const cleanup=()=>{draftPath.setAttribute('hidden','');draftPath.setAttribute('d','');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cleanup);window.removeEventListener('blur',cleanup);wiring=null;if(detached?.type==='reference')syncReferenceInputs(detached.to.node);drawConnections();renderStoryPanel()};
  const up=ev=>{const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.port');if(target&&target!==port){const targetNode=target.closest('.node');const targetKind=target.classList.contains('output')?'output':'input';if(targetKind!==kind)completeWire(node,port,targetNode,target,kind);}cleanup()};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cleanup);window.addEventListener('blur',cleanup);
}

function completeWire(node,port,targetNodeEl,targetPort,kind){
  const a=kind==='output'?{node:node.id,port:port.dataset.port}:{node:targetNodeEl.dataset.id,port:targetPort.dataset.port};
  const b=kind==='input'?{node:node.id,port:port.dataset.port}:{node:targetNodeEl.dataset.id,port:targetPort.dataset.port};
  const from=nodes.find(n=>n.id===a.node),to=nodes.find(n=>n.id===b.node);if(!from||!to||a.port!=='out')return;
  if(from.type==='arc'&&b.port!=='arc-in')return;if(from.type==='reference'&&!b.port.startsWith('ref-'))return;if(from.type===to.type&&from.type==='reference')return;
  connections=connections.filter(c=>!(c.to.node===b.node&&c.to.port===b.port)&&!(c.from.node===a.node&&c.from.port===a.port));connections.push({id:uid('connection'),from:a,to:b,type:from.type});if(from.type==='reference')syncReferenceInputs(to.id);drawConnections();renderStoryPanel();
}

function syncReferenceInputs(arcId){
  const arc=nodes.find(n=>n.id===arcId&&n.type==='arc');if(!arc)return;
  const refs=connections.filter(c=>c.type==='reference'&&c.to.node===arcId);
  refs.forEach((connection,index)=>connection.to.port=`ref-${index}`);
  arc.refs=refs.length+1;renderNode(arc);
}

function disconnectReference(arc,portName){
  const before=connections.length;
  connections=connections.filter(c=>!(c.type==='reference'&&c.to.node===arc.id&&c.to.port===portName));
  if(connections.length!==before){syncReferenceInputs(arc.id);drawConnections()}
}

function disconnectArcPort(arc,portName){
  const before=connections.length;
  connections=connections.filter(connection=>!(connection.type==='arc'&&((portName==='out'&&connection.from.node===arc.id)||(portName==='arc-in'&&connection.to.node===arc.id))));
  if(connections.length!==before){drawConnections();renderStoryPanel()}
}

function removeNodeConnections(node){
  const affectedArcs=new Set(connections.filter(connection=>connection.type==='reference'&&(connection.from.node===node.id||connection.to.node===node.id)).map(connection=>connection.to.node));
  connections=connections.filter(connection=>connection.from.node!==node.id&&connection.to.node!==node.id);
  affectedArcs.forEach(syncReferenceInputs);drawConnections();renderStoryPanel();
}

function pointFor(nodeId,portName){const el=document.querySelector(`[data-id="${nodeId}"]`);const port=el?.querySelector(`[data-port="${portName}"]`);if(!port)return null;const r=port.getBoundingClientRect(),br=board.getBoundingClientRect();return{x:(r.left+r.width/2-br.left-pan.x)/zoom,y:(r.top+r.height/2-br.top-pan.y)/zoom};}
function curve(a,b){const dx=Math.max(70,Math.abs(b.x-a.x)*.48);return`M ${a.x} ${a.y} C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`;}
function drawConnections(){pathsGroup.innerHTML=connections.map(c=>{const a=pointFor(c.from.node,c.from.port),b=pointFor(c.to.node,c.to.port);return a&&b?`<path class="connection-path ${c.type==='reference'?'reference':''}" d="${curve(a,b)}"></path>`:''}).join('');}
function drawDraft(clientX,clientY){const a=pointFor(wiring.nodeId,wiring.port),r=board.getBoundingClientRect(),b={x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};draftPath.setAttribute('d',wiring.kind==='output'?curve(a,b):curve(b,a));}
function applyTransform(){const t=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;content.style.transform=t;document.querySelector('#connections').style.transform=t;document.querySelector('#zoom-label').textContent=`${Math.round(zoom*100)}%`;drawConnections();}

function zoomAt(nextZoom,clientX,clientY){
  const bounded=Math.max(.5,Math.min(1.5,nextZoom));if(bounded===zoom)return;
  const r=board.getBoundingClientRect();
  const point={x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};
  zoom=bounded;pan.x=clientX-r.left-point.x*zoom;pan.y=clientY-r.top-point.y*zoom;applyTransform();
}

function startPan(e){
  const canPan=e.button===1||boardMode==='pan'||(!e.target.closest('.node')&&e.button===0);if(!canPan)return;
  e.preventDefault();const start={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};board.classList.add('panning');board.setPointerCapture(e.pointerId);
  const move=ev=>{pan.x=start.px+ev.clientX-start.x;pan.y=start.py+ev.clientY-start.y;applyTransform()};
  const end=()=>{board.classList.remove('panning');board.removeEventListener('pointermove',move);board.removeEventListener('pointerup',end);board.removeEventListener('pointercancel',end)};
  board.addEventListener('pointermove',move);board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);
}

function chaptersForArc(arc){
  const groups=[];
  arc.beats.forEach(beat=>{const name=beat.chapter||'No Chapters';let group=groups.find(item=>item.name===name);if(!group){group={name,beats:[]};groups.push(group)}group.beats.push(beat)});
  if(!groups.length)groups.push({name:'No Chapters',beats:[]});
  return groups;
}

function actualChaptersForArc(arc){
  const groups=[];
  arc.beats.filter(beat=>beat.chapter).forEach(beat=>{let group=groups.find(item=>item.name===beat.chapter);if(!group){group={name:beat.chapter,beats:[]};groups.push(group)}group.beats.push(beat)});
  return groups;
}

function orderedArcGroups(){
  const arcs=nodes.filter(node=>node.type==='arc'),byId=new Map(arcs.map(arc=>[arc.id,arc]));
  const next=new Map(connections.filter(c=>c.type==='arc').map(c=>[c.from.node,c.to.node]));
  const visit=(start,seen)=>{const result=[];let current=start;while(current&&byId.has(current)&&!seen.has(current)){seen.add(current);result.push(byId.get(current));current=next.get(current)}return result};
  const seen=new Set(),connected=visit(sourceArcId,seen),disconnected=[];
  const remaining=arcs.filter(arc=>!seen.has(arc.id));
  const incoming=new Set(connections.filter(c=>c.type==='arc'&&remaining.some(arc=>arc.id===c.from.node)&&remaining.some(arc=>arc.id===c.to.node)).map(c=>c.to.node));
  remaining.filter(arc=>!incoming.has(arc.id)).forEach(root=>disconnected.push(...visit(root.id,seen)));
  remaining.filter(arc=>!seen.has(arc.id)).forEach(arc=>disconnected.push(...visit(arc.id,seen)));
  return{connected,disconnected};
}

function renderStoryPanel(){
  const reader=document.querySelector('#story-reader'),rail=document.querySelector('#chapter-rail'),outline=document.querySelector('#chapter-outline');
  if(!reader||!rail||!outline)return;
  const groups=orderedArcGroups(),arcs=[...groups.connected,...groups.disconnected];let chapterNumber=0;
  const chapters=arcs.flatMap(arc=>actualChaptersForArc(arc).map((group,index)=>({...group,arc,index,id:`chapter-${chapterNumber++}`})));
  rail.innerHTML=chapters.map(chapter=>`<button data-chapter="${chapter.id}" title="${esc(chapter.name)}">${esc(chapter.name)}</button>`).join('');
  reader.innerHTML=`<span class="reader-kicker">Manuscript</span><h2>The Last Lighthouse</h2>${chapters.length?chapters.map(chapter=>`<article class="story-chapter" id="${chapter.id}" data-arc-id="${chapter.arc.id}" data-chapter-index="${chapter.index}"><h3>${esc(chapter.name)}</h3><span class="chapter-arc">${esc(chapter.arc.title)}</span>${chapter.beats.map(beat=>`<p>${esc(beat.text)}</p>`).join('')}</article>`).join(''):'<p class="story-empty">Add named chapters to see them in your story.</p>'}`;
  const renderArc=arc=>`<div class="outline-arc"><button class="outline-row outline-arc-row" data-focus-node="${arc.id}"><span class="outline-icon">${arc.id===sourceArcId?'★':'A'}</span>${esc(arc.title)}</button>${chaptersForArc(arc).map(chapter=>{const chapterId=chapters.find(item=>item.arc.id===arc.id&&item.name===chapter.name)?.id;return`${chapterId?`<button class="outline-row outline-chapter-row" data-open-chapter="${chapterId}"><span class="outline-icon">§</span>${esc(chapter.name)}</button>`:`<div class="outline-row outline-chapter-row"><span class="outline-icon">§</span>${esc(chapter.name)}</div>`}${chapter.beats.length?chapter.beats.map(beat=>`<button class="outline-row outline-beat-row" data-focus-node="${arc.id}" data-beat-id="${beat.id}"><span class="outline-icon">◆</span>${esc(beat.text)}</button>`).join(''):'<div class="outline-empty">No beats</div>'}`}).join('')}</div>`;
  outline.innerHTML=groups.connected.map(renderArc).join('')+(groups.disconnected.length?`<div class="outline-section-label">No Connections</div>${groups.disconnected.map(renderArc).join('')}`:'');
}

function setPanelTab(tab){
  document.querySelectorAll('.story-tab').forEach(button=>button.classList.toggle('active',button.dataset.panelTab===tab));
  document.querySelectorAll('.panel-view').forEach(view=>view.classList.toggle('active',view.dataset.panelView===tab));
}

function jumpToChapter(chapterId){
  const panel=document.querySelector('#story-panel');panel.classList.remove('collapsed');setPanelTab('story');requestAnimationFrame(()=>{const chapter=document.getElementById(chapterId);chapter?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('#chapter-rail button').forEach(button=>button.classList.toggle('current',button.dataset.chapter===chapterId))});
}

function openArcChapter(arcId,index){
  const chapter=document.querySelector(`.story-chapter[data-arc-id="${arcId}"][data-chapter-index="${index}"]`);if(chapter)jumpToChapter(chapter.id);
}

function focusNode(nodeId,beatId){
  const node=nodes.find(item=>item.id===nodeId);if(!node)return;const r=board.getBoundingClientRect();pan.x=r.width/2-(node.x+125)*zoom;pan.y=r.height/2-(node.y+80)*zoom;applyTransform();document.querySelectorAll('.node.selected').forEach(el=>el.classList.remove('selected'));const el=document.querySelector(`[data-id="${nodeId}"]`);el?.classList.add('selected');el?.animate([{transform:'scale(1)'},{transform:'scale(1.025)'},{transform:'scale(1)'}],{duration:280})
  if(beatId)el?.querySelector(`[data-beat-id="${beatId}"]`)?.animate([{background:'#f8f5ef'},{background:'#ffe5d8'},{background:'#f8f5ef'}],{duration:700});
}

document.querySelectorAll('.tray-card').forEach(card=>card.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-node',card.dataset.nodeType);e.dataTransfer.effectAllowed='copy'}));
board.addEventListener('dragover',e=>e.preventDefault());
board.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('application/x-node');if(!type)return;if(type==='beat'){return}const r=board.getBoundingClientRect();addNode(type,(e.clientX-r.left-pan.x)/zoom-125,(e.clientY-r.top-pan.y)/zoom-25)});
document.querySelector('#tray-toggle').addEventListener('click',()=>document.querySelector('#tray').classList.toggle('collapsed'));
document.querySelector('.board-hint button').addEventListener('click',()=>document.querySelector('#board-hint').remove());
document.querySelector('#zoom-in').addEventListener('click',()=>{const r=board.getBoundingClientRect();zoomAt(zoom+.1,r.left+r.width/2,r.top+r.height/2)});
document.querySelector('#zoom-out').addEventListener('click',()=>{const r=board.getBoundingClientRect();zoomAt(zoom-.1,r.left+r.width/2,r.top+r.height/2)});
document.querySelector('#fit-view').addEventListener('click',()=>{zoom=1;pan={x:0,y:0};applyTransform()});
document.querySelectorAll('.tool[data-mode]').forEach(tool=>tool.addEventListener('click',()=>{boardMode=tool.dataset.mode;document.querySelectorAll('.tool[data-mode]').forEach(item=>item.classList.toggle('active',item===tool));board.classList.toggle('pan-mode',boardMode==='pan')}));
board.addEventListener('pointerdown',startPan);
board.addEventListener('wheel',e=>{e.preventDefault();zoomAt(zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY)},{passive:false});
document.querySelector('#story-panel-toggle').addEventListener('click',()=>document.querySelector('#story-panel').classList.toggle('collapsed'));
document.querySelectorAll('.story-tab').forEach(tab=>tab.addEventListener('click',()=>setPanelTab(tab.dataset.panelTab)));
document.querySelector('#chapter-rail').addEventListener('click',e=>{const button=e.target.closest('[data-chapter]');if(button)jumpToChapter(button.dataset.chapter)});
document.querySelector('#story-reader').addEventListener('scroll',e=>{const chapters=[...e.currentTarget.querySelectorAll('.story-chapter')];const current=chapters.filter(chapter=>chapter.offsetTop<=e.currentTarget.scrollTop+90).at(-1)||chapters[0];document.querySelectorAll('#chapter-rail button').forEach(button=>button.classList.toggle('current',button.dataset.chapter===current?.id))});
document.querySelector('#chapter-outline').addEventListener('click',e=>{const chapter=e.target.closest('[data-open-chapter]');if(chapter)jumpToChapter(chapter.dataset.openChapter);else{const target=e.target.closest('[data-focus-node]');if(target)focusNode(target.dataset.focusNode,target.dataset.beatId)}});
document.querySelector('#story-panel-resize').addEventListener('pointerdown',e=>{const panel=document.querySelector('#story-panel');if(panel.classList.contains('collapsed'))return;e.preventDefault();const startX=e.clientX,startWidth=panel.getBoundingClientRect().width;panel.style.transition='none';e.target.setPointerCapture(e.pointerId);const move=ev=>{const width=Math.max(260,Math.min(520,startWidth+ev.clientX-startX));panel.style.width=`${width}px`;panel.style.flexBasis=`${width}px`};const end=()=>{panel.style.transition='';e.target.removeEventListener('pointermove',move);e.target.removeEventListener('pointerup',end);e.target.removeEventListener('pointercancel',end)};e.target.addEventListener('pointermove',move);e.target.addEventListener('pointerup',end);e.target.addEventListener('pointercancel',end)});
nodeMenu.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.action;if(action==='rename'&&menuNode)beginRename(menuNode);if(action==='set-source'&&menuNode)setSourceArc(menuNode);if(action==='remove-connections'&&menuNode)removeNodeConnections(menuNode);nodeMenu.hidden=true;menuNode=null});
document.addEventListener('pointerdown',e=>{if(!nodeMenu.hidden&&!nodeMenu.contains(e.target)&&!e.target.closest('.node-menu')){nodeMenu.hidden=true;menuNode=null}});
window.addEventListener('blur',()=>{nodeMenu.hidden=true;menuNode=null});

sample.forEach(n=>addNode(n.type,n.x,n.y,n));
const arcs=nodes.filter(n=>n.type==='arc'),refs=nodes.filter(n=>n.type==='reference');
connections.push({id:uid('connection'),from:{node:arcs[0].id,port:'out'},to:{node:arcs[1].id,port:'arc-in'},type:'arc'});
connections.push({id:uid('connection'),from:{node:refs[0].id,port:'out'},to:{node:arcs[0].id,port:'ref-0'},type:'reference'});
connections.push({id:uid('connection'),from:{node:refs[1].id,port:'out'},to:{node:arcs[1].id,port:'ref-0'},type:'reference'});
renderStoryPanel();
requestAnimationFrame(drawConnections);
window.addEventListener('resize',drawConnections);
