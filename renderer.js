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
let readerTextSize = 16;
let styleGuide = '';

const nodeMenu = document.createElement('div');
nodeMenu.className = 'node-context-menu';
nodeMenu.hidden = true;
nodeMenu.innerHTML = '<button type="button" data-action="set-source"><span class="menu-icon">★</span>Set as Source</button><button type="button" data-action="rename"><span class="menu-icon">✎</span>Rename</button><button type="button" data-action="remove-connections"><span class="menu-icon">⤫</span>Remove Connections</button><button type="button" class="danger" data-action="delete"><span class="menu-icon">×</span>Delete</button>';
document.body.append(nodeMenu);
let menuNode = null;


function uid(prefix){ return `${prefix}-${nextId++}`; }
function esc(value=''){ return value.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function addNode(type,x,y,data={}){
  const chapters=[...new Set((data.chapterMap||[]).filter(Boolean))].map(name=>({id:uid('chapter'),name,content:'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'}));
  const defaultTitles={arc:'Untitled arc',reference:'New reference',container:'New container'};
  const node={ id:uid(type),type,x,y,title:data.title||defaultTitles[type]||'',text:data.text||'',chapters,beats:(data.beats||[]).map((text,index)=>({id:uid('beat'),text,chapter:data.chapterMap?.[index]||null})),refs:data.refs||1,width:data.width||460,height:data.height||300,color:data.color||'#72a9a4' };
  if(type==='arc'&&!sourceArcId)sourceArcId=node.id;
  nodes.push(node); renderNode(node);drawConnections();renderStoryPanel();return node;
}

function renderNode(node){
  const previous=document.querySelector(`[data-id="${node.id}"]`);
  const wasSelected=previous?.classList.contains('selected');
  const el=document.createElement('article');
  if(previous)previous.replaceWith(el);else content.append(el);
  el.className=`node ${node.type}-node${wasSelected?' selected':''}`; el.dataset.id=node.id; el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;
  if(node.type==='arc'){
    const beats=node.beats.length?node.beats.map((b,i)=>`<div class="beat-item" draggable="true" data-beat-id="${b.id}" data-index="${i}"><span class="beat-diamond">◆</span><input value="${esc(b.text)}" aria-label="Beat text"><span class="grip">⠿</span></div>`).join(''):'<div class="empty-beats">Drop a beat here</div>';
    const refPorts=Array.from({length:node.refs},(_,i)=>`<div class="ref-port-wrap"><span class="port input ref-input" data-port="ref-${i}" aria-label="Reference input ${i+1}"></span></div>`).join('');
    const chapterLinks=actualChaptersForArc(node).map((chapter,index)=>`<button class="arc-chapter-link" data-chapter-index="${index}"><span>§</span>${esc(chapter.name)}</button>`).join('');
    const source=node.id===sourceArcId;
    el.innerHTML=`${source?'<span class="source-star" title="Story source">★</span>':'<span class="port input arc-input" data-port="arc-in"></span>'}<span class="port output" data-port="out"></span><div class="ref-ports">${refPorts}</div><header class="node-header"><span class="node-symbol">A</span><input class="node-title" value="${esc(node.title)}" readonly><button class="node-menu" aria-label="Node menu">•••</button></header><div class="node-body"><span class="field-label">BEATS</span><div class="beats">${beats}</div></div>${chapterLinks?`<div class="arc-chapters"><span class="field-label">CHAPTERS</span>${chapterLinks}</div>`:''}<footer class="arc-footer"><span><strong>${node.beats.length}</strong> beat${node.beats.length===1?'':'s'}</span><span>${source?'Story source':`${node.refs-1} reference${node.refs-1===1?'':'s'} · 1 open`}</span></footer>`;
  } else if(node.type==='reference') {
    el.innerHTML=`<span class="port output" data-port="out"></span><header class="node-header"><span class="node-symbol">R</span><input class="node-title" value="${esc(node.title)}" readonly><button class="node-menu" aria-label="Node menu">•••</button></header><div class="node-body"><span class="field-label">REFERENCE</span><textarea placeholder="Write a note…">${esc(node.text)}</textarea></div>`;
  } else if(node.type==='container'){
    el.style.width=`${node.width}px`;el.style.height=`${node.height}px`;el.style.setProperty('--container-color',node.color);
    el.innerHTML=`<header class="node-header"><span class="node-symbol">□</span><input class="node-title" value="${esc(node.title)}" readonly><button class="node-menu" aria-label="Container menu">•••</button><button class="element-delete" aria-label="Delete container">×</button></header><div class="container-colors">${['#72a9a4','#8b7ee3','#e49a76','#d0a843','#778fa8'].map(color=>`<button class="container-color" data-color="${color}" style="--swatch:${color}" aria-label="Use color ${color}"></button>`).join('')}</div><span class="container-resize" title="Resize container"></span>`;
  } else {
    el.innerHTML=`<span class="sticky-drag" title="Drag note"></span><button class="element-delete sticky-delete" aria-label="Delete sticky note">×</button><textarea aria-label="Sticky note" placeholder="Write a note…">${esc(node.text)}</textarea>`;
  }
  if(['reference','sticky'].includes(node.type)){
    const size=node.noteSize||{width:node.type==='sticky'?220:250,height:150};
    el.style.width=size.width+'px';el.style.height=size.height+'px';
    const handle=document.createElement('span');
    handle.className='note-resize';handle.title='Resize '+(node.type==='sticky'?'sticky note':'reference');
    el.append(handle);
    handle.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;
      e.preventDefault();e.stopPropagation();
      const start={x:e.clientX,y:e.clientY,width:el.offsetWidth,height:el.offsetHeight};
      handle.setPointerCapture(e.pointerId);
      const move=ev=>{
        node.noteSize={width:Math.max(180,start.width+(ev.clientX-start.x)/zoom),height:Math.max(150,start.height+(ev.clientY-start.y)/zoom)};
        el.style.width=node.noteSize.width+'px';el.style.height=node.noteSize.height+'px';
        drawConnections();
      };
      const end=()=>{
        handle.removeEventListener('pointermove',move);
        handle.removeEventListener('pointerup',end);
        handle.removeEventListener('pointercancel',end);
        handle.removeEventListener('lostpointercapture',end);
      };
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);
      handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
    });
  }
  if(typeof addStudioButton==='function')addStudioButton(el,node);
  bindNode(el,node);
}

function bindNode(el,node){
  const titleInput=el.querySelector('.node-title');
  titleInput?.addEventListener('pointerenter',()=>{
    if(titleInput.readOnly&&titleInput.scrollWidth>titleInput.clientWidth){
      titleInput.title=titleInput.value;
    } else {
      titleInput.removeAttribute('title');
    }
  });
  titleInput?.addEventListener('focus',()=>titleInput.removeAttribute('title'));
  el.querySelector('textarea')?.addEventListener('input',e=>node.text=e.target.value);
  el.querySelector('.node-header')?.addEventListener('pointerdown',e=>startMove(e,node,el));
  el.querySelector('.sticky-drag')?.addEventListener('pointerdown',e=>startMove(e,node,el));
  el.querySelector('.node-menu')?.addEventListener('click',e=>{e.stopPropagation();showNodeMenu(node,e.clientX,e.clientY)});
  if(node.type!=='sticky')el.addEventListener('contextmenu',e=>{e.preventDefault();showNodeMenu(node,e.clientX,e.clientY)});
  el.addEventListener('pointerdown',()=>{document.querySelectorAll('.node.selected').forEach(n=>n.classList.remove('selected'));el.classList.add('selected')});
  el.querySelectorAll('.port').forEach(port=>port.addEventListener('pointerdown',e=>startWire(e,node,port)));
  el.querySelectorAll('.ref-input').forEach(port=>port.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();disconnectReference(node,port.dataset.port)}));
  el.querySelectorAll('.arc-chapter-link').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();openArcChapter(node.id,+button.dataset.chapterIndex)}));
  if(node.type==='arc')el.querySelectorAll('.arc-input,.port.output').forEach(port=>port.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();disconnectArcPort(node,port.dataset.port)}));
  el.querySelectorAll('.beat-item').forEach(item=>{
    const beatInput=item.querySelector('input');
    beatInput.readOnly=true;
    item.addEventListener('contextmenu',e=>{
      e.preventDefault();e.stopPropagation();
      showNodeMenu({type:'beat',arcId:node.id,id:item.dataset.beatId},e.clientX,e.clientY);
    });
    beatInput.addEventListener('pointerenter',()=>{
      if(beatInput.scrollWidth>beatInput.clientWidth)beatInput.title=beatInput.value;
      else beatInput.removeAttribute('title');
    });
    beatInput.addEventListener('input',()=>{
      if(beatInput.scrollWidth>beatInput.clientWidth)beatInput.title=beatInput.value;
      else beatInput.removeAttribute('title');
    });
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
  el.querySelectorAll('.container-color').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();node.color=button.dataset.color;el.style.setProperty('--container-color',node.color)}));
  el.querySelector('.container-resize')?.addEventListener('pointerdown',e=>startContainerResize(e,node,el));
  el.querySelector('.element-delete')?.addEventListener('click',e=>{e.stopPropagation();deleteCanvasElement(node)});
}

function deleteCanvasElement(node){
  if(!['container','sticky'].includes(node.type))return;
  nodes=nodes.filter(item=>item.id!==node.id);document.querySelector(`[data-id="${node.id}"]`)?.remove();drawConnections();
}

function moveBeat(target,index){
  if(!beatDrag)return;const source=nodes.find(n=>n.id===beatDrag.source);const old=source.beats.findIndex(b=>b.id===beatDrag.beatId);if(old<0)return;const [beat]=source.beats.splice(old,1);if(source===target&&old<index)index--;if(source!==target)beat.chapter=null;target.beats.splice(index,0,beat);renderNode(source);if(source!==target)renderNode(target);renderStoryPanel();beatDrag=null;
}

function startMove(e,node,el){
  if(e.button!==0||boardMode==='pan'||e.target.matches('button,input:not([readonly])'))return;e.preventDefault();const start={x:e.clientX,y:e.clientY,nx:node.x,ny:node.y};dragging={node,el,start};el.classList.add('dragging');el.setPointerCapture(e.pointerId);
  const contained=node.type==='container'?nodes.filter(item=>{
    if(item===node||item.type==='container')return false;
    const childEl=document.querySelector(`[data-id="${item.id}"]`);
    const cx=item.x+childEl.offsetWidth/2,cy=item.y+childEl.offsetHeight/2;
    return cx>=node.x&&cx<=node.x+node.width&&cy>=node.y&&cy<=node.y+node.height;
  }).map(item=>({node:item,x:item.x,y:item.y})):[];
  const move=ev=>{const dx=(ev.clientX-start.x)/zoom,dy=(ev.clientY-start.y)/zoom;node.x=start.nx+dx;node.y=start.ny+dy;el.style.left=`${node.x}px`;el.style.top=`${node.y}px`;contained.forEach(child=>{child.node.x=child.x+dx;child.node.y=child.y+dy;const childEl=document.querySelector(`[data-id="${child.node.id}"]`);childEl.style.left=`${child.node.x}px`;childEl.style.top=`${child.node.y}px`});drawConnections()};
  const up=()=>{el.classList.remove('dragging');el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);dragging=null};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);
}

function startContainerResize(e,node,el){
  if(e.button!==0)return;e.preventDefault();e.stopPropagation();const start={x:e.clientX,y:e.clientY,width:node.width,height:node.height};e.target.setPointerCapture(e.pointerId);
  const move=ev=>{node.width=Math.max(280,start.width+(ev.clientX-start.x)/zoom);node.height=Math.max(190,start.height+(ev.clientY-start.y)/zoom);el.style.width=`${node.width}px`;el.style.height=`${node.height}px`};
  const end=()=>{e.target.removeEventListener('pointermove',move);e.target.removeEventListener('pointerup',end);e.target.removeEventListener('pointercancel',end)};e.target.addEventListener('pointermove',move);e.target.addEventListener('pointerup',end);e.target.addEventListener('pointercancel',end);
}

function showNodeMenu(node,x,y){
  nodeMenu.querySelector('[data-action="studio"]')?.toggleAttribute('hidden',node.type!=='arc');
  menuNode=node;nodeMenu.hidden=false;
  const sourceAction=nodeMenu.querySelector('[data-action="set-source"]');sourceAction.hidden=node.type!=='arc'||node.id===sourceArcId;
  nodeMenu.querySelector('[data-action="delete"]').hidden=!['arc','beat'].includes(node.type);
  nodeMenu.querySelector('[data-action="remove-connections"]').hidden=!['arc','reference'].includes(node.type);
  const {width,height}=nodeMenu.getBoundingClientRect();
  nodeMenu.style.left=`${Math.min(x,window.innerWidth-width-8)}px`;
  nodeMenu.style.top=`${Math.min(y,window.innerHeight-height-8)}px`;
}

function setSourceArc(node){
  if(node.type!=='arc'||node.id===sourceArcId)return;const previous=nodes.find(item=>item.id===sourceArcId);
  connections=connections.filter(connection=>!(connection.type==='arc'&&connection.to.node===node.id));sourceArcId=node.id;
  if(previous)renderNode(previous);renderNode(node);drawConnections();renderStoryPanel();
}

function beginRename(node){
  if(node.type==='beat'){renameBeat(node);return;}
  const input=document.querySelector(`[data-id="${node.id}"] .node-title`);if(!input)return;
  const original=node.title;
  input.readOnly=false;input.classList.add('renaming');input.focus();input.select();
  const finish=()=>{node.title=input.value.trim()||'Untitled';input.value=node.title;input.readOnly=true;input.classList.remove('renaming');input.removeEventListener('blur',finish);input.removeEventListener('keydown',keys);renderStoryPanel()};
  const keys=e=>{if(e.key==='Enter'){e.preventDefault();input.blur()}if(e.key==='Escape'){input.value=original;input.blur()}};
  input.addEventListener('blur',finish);input.addEventListener('keydown',keys);
}

function renameBeat(target){
  const arc=nodes.find(node=>node.id===target.arcId);
  const beat=arc?.beats.find(item=>item.id===target.id);
  const row=document.querySelector(`[data-id="${target.arcId}"] [data-beat-id="${target.id}"]`);
  if(!beat||!row)return;
  const input=row.querySelector('input'),original=beat.text;
  // Disable native row dragging while its text is being edited.
  row.draggable=false;input.readOnly=false;input.classList.add('renaming');input.focus();input.select();
  const finish=()=>{
    beat.text=input.value.trim()||'Untitled beat';input.value=beat.text;
    input.readOnly=true;row.draggable=true;input.classList.remove('renaming');
    input.removeEventListener('blur',finish);input.removeEventListener('keydown',keys);
    renderStoryPanel();scheduleAutosave();
  };
  const keys=e=>{
    if(e.key==='Enter'){e.preventDefault();input.blur();}
    if(e.key==='Escape'){e.preventDefault();input.value=original;input.blur();}
  };
  input.addEventListener('blur',finish);input.addEventListener('keydown',keys);
}

function deleteBeat(target){
  const arc=nodes.find(node=>node.id===target.arcId);if(!arc)return;
  arc.beats=arc.beats.filter(beat=>beat.id!==target.id);
  renderNode(arc);renderStoryPanel();drawConnections();scheduleAutosave();
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
  if(from.type==='arc'){
    let cursor=to.id;const seen=new Set();
    while(cursor&&!seen.has(cursor)){if(cursor===from.id)return;seen.add(cursor);cursor=connections.find(c=>c.type==='arc'&&c.from.node===cursor)?.to.node;}
  }
  const previousReferences=new Set(connections.filter(c=>c.type==='reference'&&c.from.node===a.node).map(c=>c.to.node));
  connections=connections.filter(c=>!(c.to.node===b.node&&c.to.port===b.port)&&!(c.from.node===a.node&&c.from.port===a.port));connections.push({id:uid('connection'),from:a,to:b,type:from.type});if(from.type==='reference'){previousReferences.add(to.id);previousReferences.forEach(syncReferenceInputs)}drawConnections();renderStoryPanel();
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

function deleteArc(node){
  if(node.type!=='arc')return;
  const hasContent=node.chapters.length>0||node.beats.length>0;
  if(hasContent&&!window.confirm(`Delete “${node.title}” and its ${node.chapters.length} chapter${node.chapters.length===1?'':'s'} and ${node.beats.length} beat${node.beats.length===1?'':'s'}?`))return;
  const outgoing=connections.find(connection=>connection.type==='arc'&&connection.from.node===node.id)?.to.node;
  connections=connections.filter(connection=>connection.from.node!==node.id&&connection.to.node!==node.id);
  nodes=nodes.filter(item=>item.id!==node.id);document.querySelector(`[data-id="${node.id}"]`)?.remove();
  if(sourceArcId===node.id){sourceArcId=(nodes.find(item=>item.id===outgoing&&item.type==='arc')||nodes.find(item=>item.type==='arc'))?.id||null;if(sourceArcId){connections=connections.filter(connection=>!(connection.type==='arc'&&connection.to.node===sourceArcId));renderNode(nodes.find(item=>item.id===sourceArcId))}}
  drawConnections();renderStoryPanel();
}

function pointFor(nodeId,portName){const el=document.querySelector(`[data-id="${nodeId}"]`);const port=el?.querySelector(`[data-port="${portName}"]`);if(!port)return null;const r=port.getBoundingClientRect(),br=board.getBoundingClientRect();return{x:(r.left+r.width/2-br.left-pan.x)/zoom,y:(r.top+r.height/2-br.top-pan.y)/zoom};}
function curve(a,b){const dx=Math.max(70,Math.abs(b.x-a.x)*.48);return`M ${a.x} ${a.y} C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`;}
function drawConnections(){pathsGroup.innerHTML=connections.map(c=>{const a=pointFor(c.from.node,c.from.port),b=pointFor(c.to.node,c.to.port);return a&&b?`<path class="connection-path ${c.type==='reference'?'reference':''}" d="${curve(a,b)}"></path>`:''}).join('');}
function drawDraft(clientX,clientY){const a=pointFor(wiring.nodeId,wiring.port),r=board.getBoundingClientRect(),b={x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};draftPath.setAttribute('d',wiring.kind==='output'?curve(a,b):curve(b,a));}
function applyTransform(){const t=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;content.style.transform=t;document.querySelector('#connections').style.transform=t;document.querySelector('#zoom-label').textContent=`${Math.round(zoom*100)}%`;drawConnections();}

function zoomAt(nextZoom,clientX,clientY){
  const bounded=Math.max(.1,Math.min(1.5,nextZoom));if(bounded===zoom)return;
  const r=board.getBoundingClientRect();
  const point={x:(clientX-r.left-pan.x)/zoom,y:(clientY-r.top-pan.y)/zoom};
  zoom=bounded;pan.x=clientX-r.left-point.x*zoom;pan.y=clientY-r.top-point.y*zoom;applyTransform();
}

function startPan(e){
  const emptyContainer=e.target.matches('.container-node');
  const canPan=e.button===1||boardMode==='pan'||((!e.target.closest('.node')||emptyContainer)&&e.button===0);if(!canPan)return;
  e.preventDefault();const start={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};board.classList.add('panning');board.setPointerCapture(e.pointerId);
  const move=ev=>{pan.x=start.px+ev.clientX-start.x;pan.y=start.py+ev.clientY-start.y;applyTransform()};
  const end=()=>{board.classList.remove('panning');board.removeEventListener('pointermove',move);board.removeEventListener('pointerup',end);board.removeEventListener('pointercancel',end)};
  board.addEventListener('pointermove',move);board.addEventListener('pointerup',end);board.addEventListener('pointercancel',end);
}

function chaptersForArc(arc){
  const groups=(arc.chapters||[]).map(chapter=>({name:chapter.name,beats:arc.beats.filter(beat=>beat.chapter===chapter.name)}));
  const unassigned=arc.beats.filter(beat=>!beat.chapter||!arc.chapters.some(chapter=>chapter.name===beat.chapter));
  if(unassigned.length||!groups.length)groups.push({name:'No Chapters',beats:unassigned});
  return groups;
}

function actualChaptersForArc(arc){
  return (arc.chapters||[]).map(chapter=>({name:chapter.name,content:chapter.content}));
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
  if(typeof normalizeStudioPlans==='function')normalizeStudioPlans();
  const reader=document.querySelector('#story-reader'),rail=document.querySelector('#chapter-rail'),outline=document.querySelector('#chapter-outline');
  if(!reader||!rail||!outline)return;
  const groups=orderedArcGroups(),arcs=[...groups.connected,...groups.disconnected];let chapterNumber=0;
  const chapters=arcs.flatMap(arc=>actualChaptersForArc(arc).map((group,index)=>({...group,arc,index,id:`chapter-${chapterNumber++}`})));
  rail.innerHTML=chapters.map(chapter=>`<button data-chapter="${chapter.id}" title="${esc(chapter.name)}">${esc(chapter.name)}</button>`).join('');
  reader.innerHTML=`<span class="reader-kicker">Manuscript</span><h2>${esc(document.querySelector('.document-title input').value)}</h2>${chapters.length?chapters.map(chapter=>`<article class="story-chapter" id="${chapter.id}" data-arc-id="${chapter.arc.id}" data-chapter-index="${chapter.index}"><h3>${esc(chapter.name)}</h3><span class="chapter-arc">${esc(chapter.arc.title)}</span><p>${esc(chapter.content??'')}</p></article>`).join(''):'<p class="story-empty">Add named chapters to see them in your story.</p>'}`;
  document.querySelector('#focus-reader-nav').innerHTML=chapters.map(chapter=>`<button data-focus-chapter="focus-${chapter.id}">${esc(chapter.name)}</button>`).join('');
  document.querySelector('#focus-reader-content').innerHTML=`<h1>${esc(document.querySelector('.document-title input').value)}</h1>${chapters.length?chapters.map(chapter=>`<article class="focus-reader-chapter" id="focus-${chapter.id}"><h2>${esc(chapter.name)}</h2><span>${esc(chapter.arc.title)}</span><p>${esc(chapter.content??'')}</p></article>`).join(''):'<p class="story-empty">Add named chapters to begin reading.</p>'}`;
  const renderArc=arc=>`<div class="outline-arc"><button class="outline-row outline-arc-row" data-focus-node="${arc.id}"><span class="outline-icon">${arc.id===sourceArcId?'★':'A'}</span>${esc(arc.title)}</button>${chaptersForArc(arc).map(chapter=>{const chapterId=chapters.find(item=>item.arc.id===arc.id&&item.name===chapter.name)?.id;return`${chapterId?`<button class="outline-row outline-chapter-row" data-open-chapter="${chapterId}"><span class="outline-icon">§</span>${esc(chapter.name)}</button>`:`<div class="outline-row outline-chapter-row"><span class="outline-icon">§</span>${esc(chapter.name)}</div>`}${chapter.beats.length?chapter.beats.map(beat=>`<button class="outline-row outline-beat-row" data-focus-node="${arc.id}" data-beat-id="${beat.id}"><span class="outline-icon">◆</span>${esc(beat.text)}</button>`).join(''):'<div class="outline-empty">No beats</div>'}`}).join('')}</div>`;
  outline.innerHTML=groups.connected.map(renderArc).join('')+(groups.disconnected.length?`<div class="outline-section-label">No Connections</div>${groups.disconnected.map(renderArc).join('')}`:'');
  if(typeof addDictionaryStudioLinks==='function')addDictionaryStudioLinks();
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
  if(beatId)el?.querySelector(`[data-beat-id="${beatId}"]`)?.animate([{background:'var(--surface)'},{background:'var(--purple-soft)'},{background:'var(--surface)'}],{duration:700});
}

function serializeProject(){
  return {format:'ghostwriter',version:1,title:document.querySelector('.document-title input').value,styleGuide,nodes,connections,sourceArcId,view:{zoom,pan},savedAt:new Date().toISOString()};
}

function loadProject(project){
  window.ghostwriter?.validateProject(project);
  if(!project||project.format!=='ghostwriter'||!Array.isArray(project.nodes)||!Array.isArray(project.connections))throw new Error('This is not a valid Ghostwriter project.');
  content.innerHTML='';nodes=project.nodes.map(node=>({...node,chapters:node.chapters||[],beats:node.beats||[],refs:node.refs||1,width:node.width||460,height:node.height||300,color:node.color||'#72a9a4'}));connections=project.connections;sourceArcId=project.sourceArcId||nodes.find(node=>node.type==='arc')?.id||null;
  zoom=Math.max(.1,Math.min(1.5,project.view?.zoom||1));pan={x:project.view?.pan?.x||0,y:project.view?.pan?.y||0};
  const ids=nodes.flatMap(node=>[node.id,...node.beats.map(b=>b.id),...node.chapters.map(c=>c.id||'')]).concat(connections.map(c=>c.id||''));
  nextId=ids.reduce((max,id)=>Math.max(max,Number(id.match(/-(\d+)$/)?.[1])||0),0)+1;
  document.querySelector('.document-title input').value=project.title||'Untitled Project';
  styleGuide=project.styleGuide||'';
  nodes.forEach(renderNode);nodes.filter(n=>n.type==='arc').forEach(n=>syncReferenceInputs(n.id));applyTransform();renderStoryPanel();
}

document.querySelectorAll('.tray-card').forEach(card=>card.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-node',card.dataset.nodeType);e.dataTransfer.effectAllowed='copy'}));
board.addEventListener('dragover',e=>e.preventDefault());
board.addEventListener('drop',e=>{e.preventDefault();if(beatDrag){const source=nodes.find(node=>node.id===beatDrag.source);if(source){source.beats=source.beats.filter(beat=>beat.id!==beatDrag.beatId);renderNode(source);renderStoryPanel()}beatDrag=null;return}const type=e.dataTransfer.getData('application/x-node');if(!type)return;if(type==='beat'){return}const r=board.getBoundingClientRect(),halfWidth=type==='container'?230:type==='sticky'?110:125;addNode(type,(e.clientX-r.left-pan.x)/zoom-halfWidth,(e.clientY-r.top-pan.y)/zoom-25)});
document.querySelector('#tray-toggle').addEventListener('click',()=>document.querySelector('#tray').classList.toggle('collapsed'));
document.querySelector('.board-hint button').addEventListener('click',()=>document.querySelector('#board-hint').remove());
document.querySelector('#zoom-in').addEventListener('click',()=>{const r=board.getBoundingClientRect();zoomAt(zoom+.1,r.left+r.width/2,r.top+r.height/2)});
document.querySelector('#zoom-out').addEventListener('click',()=>{const r=board.getBoundingClientRect();zoomAt(zoom-.1,r.left+r.width/2,r.top+r.height/2)});
document.querySelector('#fit-view').addEventListener('click',()=>{
  if(!nodes.length){zoom=1;pan={x:0,y:0};applyTransform();return;}
  const bounds=nodes.map(n=>{const el=document.querySelector(`[data-id="${n.id}"]`);return{x:n.x,y:n.y,right:n.x+el.offsetWidth,bottom:n.y+el.offsetHeight}});
  const left=Math.min(...bounds.map(b=>b.x)),top=Math.min(...bounds.map(b=>b.y)),right=Math.max(...bounds.map(b=>b.right)),bottom=Math.max(...bounds.map(b=>b.bottom));
  zoom=Math.max(.1,Math.min(1.5,(board.clientWidth-60)/(right-left),(board.clientHeight-60)/(bottom-top)));
  pan={x:board.clientWidth/2-(left+right)/2*zoom,y:board.clientHeight/2-(top+bottom)/2*zoom};applyTransform();
});
document.querySelectorAll('.tool[data-mode]').forEach(tool=>tool.addEventListener('click',()=>{boardMode=tool.dataset.mode;document.querySelectorAll('.tool[data-mode]').forEach(item=>item.classList.toggle('active',item===tool));board.classList.toggle('pan-mode',boardMode==='pan')}));
board.addEventListener('pointerdown',startPan);
board.addEventListener('wheel',e=>{
  // Let text areas handle their own scrolling instead of zooming the board.
  if(e.target.closest('textarea'))return;
  e.preventDefault();zoomAt(zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);
},{passive:false});
document.querySelector('#story-panel-toggle').addEventListener('click',()=>document.querySelector('#story-panel').classList.toggle('collapsed'));
document.querySelectorAll('.story-tab').forEach(tab=>tab.addEventListener('click',()=>setPanelTab(tab.dataset.panelTab)));
document.querySelector('#chapter-rail').addEventListener('click',e=>{const button=e.target.closest('[data-chapter]');if(button)jumpToChapter(button.dataset.chapter)});
document.querySelector('#story-reader').addEventListener('scroll',e=>{const chapters=[...e.currentTarget.querySelectorAll('.story-chapter')];const current=chapters.filter(chapter=>chapter.offsetTop<=e.currentTarget.scrollTop+90).at(-1)||chapters[0];document.querySelectorAll('#chapter-rail button').forEach(button=>button.classList.toggle('current',button.dataset.chapter===current?.id))});
document.querySelector('#reader-focus-button').addEventListener('click',()=>{document.querySelector('#reader-overlay').hidden=false});
document.querySelector('#focus-reader-close').addEventListener('click',()=>{document.querySelector('#reader-overlay').hidden=true});
function setReaderTextSize(size){readerTextSize=Math.max(13,Math.min(24,size));document.querySelector('.focus-reader').style.setProperty('--reader-font-size',`${readerTextSize}px`);document.querySelector('#reader-text-size').textContent=readerTextSize}
document.querySelector('#reader-text-smaller').addEventListener('click',()=>setReaderTextSize(readerTextSize-1));
document.querySelector('#reader-text-larger').addEventListener('click',()=>setReaderTextSize(readerTextSize+1));
document.querySelector('#reader-overlay').addEventListener('pointerdown',e=>e.stopPropagation());
document.querySelector('#focus-reader-nav').addEventListener('click',e=>{const button=e.target.closest('[data-focus-chapter]');if(!button)return;document.getElementById(button.dataset.focusChapter)?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('#focus-reader-nav button').forEach(item=>item.classList.toggle('current',item===button))});
document.querySelector('#focus-reader-content').addEventListener('scroll',e=>{const chapters=[...e.currentTarget.querySelectorAll('.focus-reader-chapter')];const current=chapters.filter(chapter=>chapter.offsetTop<=e.currentTarget.scrollTop+100).at(-1)||chapters[0];document.querySelectorAll('#focus-reader-nav button').forEach(button=>button.classList.toggle('current',button.dataset.focusChapter===current?.id))});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('#reader-overlay').hidden)document.querySelector('#reader-overlay').hidden=true});
document.querySelector('#chapter-outline').addEventListener('click',e=>{const chapter=e.target.closest('[data-open-chapter]');if(chapter)jumpToChapter(chapter.dataset.openChapter);else{const target=e.target.closest('[data-focus-node]');if(target)focusNode(target.dataset.focusNode,target.dataset.beatId)}});
document.querySelector('#story-panel-resize').addEventListener('pointerdown',e=>{const panel=document.querySelector('#story-panel');if(panel.classList.contains('collapsed'))return;e.preventDefault();const startX=e.clientX,startWidth=panel.getBoundingClientRect().width;panel.style.transition='none';e.target.setPointerCapture(e.pointerId);const move=ev=>{const width=Math.max(260,Math.min(520,startWidth+ev.clientX-startX));panel.style.width=`${width}px`;panel.style.flexBasis=`${width}px`};const end=()=>{panel.style.transition='';e.target.removeEventListener('pointermove',move);e.target.removeEventListener('pointerup',end);e.target.removeEventListener('pointercancel',end)};e.target.addEventListener('pointermove',move);e.target.addEventListener('pointerup',end);e.target.addEventListener('pointercancel',end)});
nodeMenu.addEventListener('click',e=>{const action=e.target.closest('button')?.dataset.action;if(action==='rename'&&menuNode)beginRename(menuNode);if(action==='set-source'&&menuNode)setSourceArc(menuNode);if(action==='remove-connections'&&menuNode)removeNodeConnections(menuNode);if(action==='delete'&&menuNode){if(menuNode.type==='beat')deleteBeat(menuNode);else deleteArc(menuNode)}nodeMenu.hidden=true;menuNode=null});
document.addEventListener('pointerdown',e=>{if(!nodeMenu.hidden&&!nodeMenu.contains(e.target)&&!e.target.closest('.node-menu')){nodeMenu.hidden=true;menuNode=null}});
window.addEventListener('blur',()=>{nodeMenu.hidden=true;menuNode=null});

let hasProject=false;
let lastSavedState='';
let observedProjectState='';
let autosaveTimer=null;
function projectState(){const project=serializeProject();delete project.savedAt;return JSON.stringify(project);}
function markProjectSaved(state){
  lastSavedState=state;
  // A save dialog may remain open while further edits are made. Only clear
  // the pending autosave if the acknowledged snapshot is still current.
  if(projectState()===state){
    clearTimeout(autosaveTimer);autosaveTimer=null;
    observedProjectState=state;
  }else scheduleAutosave();
}
function scheduleAutosave(){
  if(!hasProject)return;
  const state=projectState();
  if(state===observedProjectState)return;
  observedProjectState=state;
  clearTimeout(autosaveTimer);
  autosaveTimer=null;
  if(state===lastSavedState)return;
  autosaveTimer=setTimeout(()=>{
    autosaveTimer=null;
    autosaveCurrent();
  },2000);
}
function autosaveCurrent(){
  clearTimeout(autosaveTimer);autosaveTimer=null;
  if(!hasProject)return {saved:true};
  const state=projectState();
  if(state===lastSavedState)return {saved:true};
  const result=window.ghostwriter?.autosave(serializeProject())||{saved:false};
  if(result.saved)markProjectSaved(state);
  return result;
}
window.prepareProjectChange=()=>{
  if(typeof styleEditor!=='undefined'&&!styleEditor.hidden){window.alert('Close the Style Guide before switching projects.');return false;}
  if(typeof studio!=='undefined'&&!studio.hidden){window.alert('Close Chapter Studio before switching projects.');return false;}
  if(!hasProject||projectState()===lastSavedState)return true;
  const result=autosaveCurrent();
  if(result.saved)return true;
  return window.confirm(result.error?'Autosave failed: '+result.error+'\nDiscard changes and continue?':'This project has unsaved changes. Discard them and continue?');
};
window.addEventListener('beforeunload',e=>{
  if(!hasProject||projectState()===lastSavedState)return;
  // Chromium suppresses window.confirm during unload. Let the main process
  // show a native confirmation when saving cannot complete.
  const result=autosaveCurrent();
  if(!result.saved){e.preventDefault();e.returnValue=false;}
});
// Observe serialized edits after each interaction's handlers have run.
for(const eventName of ['input','change','click','contextmenu','pointermove','pointerup','pointercancel','drop','dragend','keydown','focusout','wheel']){
  document.addEventListener(eventName,()=>queueMicrotask(scheduleAutosave));
}
document.querySelector('.document-title input').addEventListener('input',renderStoryPanel);
const home=document.querySelector('#project-home');
function enterProject(){clearTimeout(autosaveTimer);autosaveTimer=null;hasProject=true;home.hidden=true;document.querySelector('.app-shell').inert=false;renderStoryPanel();applyTransform();observedProjectState=projectState()}
async function showProjectHome(){
  home.hidden=false;document.querySelector('.app-shell').inert=true;
  document.querySelector('#home-resume').hidden=!hasProject;
  const list=document.querySelector('#recent-projects');
  try {
    const recent=await window.ghostwriter?.recentProjects()||[];
    list.replaceChildren();
    if(!recent.length)list.innerHTML='<p class="home-empty">No recent projects yet. Saved projects will appear here.</p>';
    recent.forEach(project=>{
      const button=document.createElement('button');button.className='template-choice';
      const title=document.createElement('strong');title.textContent=project.title;
      const detail=document.createElement('span');detail.textContent=project.path;
      button.append(title,detail);button.title=project.path;
      button.addEventListener('click',()=>window.ghostwriter.openProject(project.path));list.append(button);
    });
  } catch {list.textContent='Recent projects could not be loaded.'}
  const templates=document.querySelector('#project-templates');
  templates.replaceChildren();
  try {
    for(const template of await window.ghostwriter?.templates()||[]){
      const button=document.createElement('button');button.className='template-choice';
      const title=document.createElement('strong');title.textContent=template.title;
      const detail=document.createElement('span');detail.textContent=template.description;
      button.append(title,detail);
      button.addEventListener('click',()=>{
        window.ghostwriter.openTemplate(template.path);
      });
      templates.append(button);
    }
    if(!templates.children.length)templates.textContent='No templates available.';
  } catch {templates.textContent='Templates could not be loaded.'}
}
document.querySelectorAll('[data-template]').forEach(button=>button.addEventListener('click',async()=>{
  if(await window.ghostwriter?.newProject()===false)return;
  nodes=[];connections=[];sourceArcId=null;styleGuide='';nextId=1;content.replaceChildren();pan={x:0,y:0};zoom=1;
  lastSavedState='';
  document.querySelector('.document-title input').value='Untitled Project';
  addNode('arc',80,80,{title:'Source Arc'});
  enterProject();
}));
document.querySelector('#home-open').addEventListener('click',()=>window.ghostwriter?.openProject());
document.querySelector('#home-resume').addEventListener('click',enterProject);
window.ghostwriter?.onProjectMenu(showProjectHome);
showProjectHome();
renderStoryPanel();
requestAnimationFrame(drawConnections);
window.addEventListener('resize',drawConnections);
window.ghostwriter?.onSaveRequested(async mode=>{
  if(!hasProject)return;
  const state=projectState();
  try{
    const result=await window.ghostwriter.saveProject(mode,serializeProject());
    if(!result.canceled&&!result.error&&mode!=='template')markProjectSaved(state);
  }catch(error){window.alert('Could not save project: '+error.message);}
});
window.ghostwriter?.onProjectLoaded(project=>{try{loadProject(project);enterProject();markProjectSaved(projectState())}catch(error){window.alert(error.message)}});
