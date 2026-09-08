// Chapter plans contain text and Beat-ID tokens, never saved HTML.
function normalizeStudioPlans(){
  for(const arc of nodes.filter(n=>n.type==='arc')){
    const used=new Set();
    for(const chapter of arc.chapters){
      chapter.id ||= uid('chapter');
      if(!Array.isArray(chapter.plan))chapter.plan=arc.beats.filter(b=>b.chapterId===chapter.id||(!b.chapterId&&b.chapter===chapter.name)).map(b=>({type:'beat',beatId:b.id}));
      chapter.plan=chapter.plan.filter(token=>{
        if(token.type==='text')return true;
        if(!arc.beats.some(b=>b.id===token.beatId)||used.has(token.beatId))return false;
        used.add(token.beatId);return true;
      });
    }
    for(const beat of arc.beats){
      const chapter=arc.chapters.find(c=>c.plan.some(t=>t.type==='beat'&&t.beatId===beat.id));
      beat.chapterId=chapter?.id||null;beat.chapter=chapter?.name||null;
    }
  }
}
const studio=document.createElement('div');studio.className='studio-overlay';studio.hidden=true;
studio.innerHTML=`<section class="chapter-studio" role="dialog" aria-modal="true" aria-label="Chapter Studio">
<header class="studio-header"><div><span class="eyebrow">CHAPTER STUDIO</span><h2 id="studio-arc-name"></h2></div><button id="studio-close" aria-label="Close Chapter Studio">×</button></header>
<aside class="studio-sidebar"><h3>Chapters</h3><div id="studio-chapters"></div><button id="studio-add">+ New chapter</button><h3>Story elements</h3><p class="studio-help">Drag Beats into the plan. Drop References into either editor to attach them.</p><h4>Beats</h4><div id="studio-beats"></div><h4>References</h4><div id="studio-reference-list"></div></aside>
<main class="studio-main"><div id="studio-empty">Create a chapter to start planning.</div><div id="studio-fields" hidden>
<input id="studio-title" aria-label="Chapter title" placeholder="Chapter name"><nav class="studio-tabs"><button id="studio-plan-tab" class="active">Plan</button><button id="studio-draft-tab">Draft</button></nav>
<div id="studio-plan-view"><p class="studio-help">Arrange Beat blocks and type directions between them. Remove a block to release its Beat.</p><div id="studio-plan" contenteditable="true" role="textbox" aria-label="Chapter plan" aria-multiline="true"></div></div>
<div id="studio-draft-view" hidden><label>Previous drafts <select id="studio-history"><option value="">Current draft</option></select></label><textarea id="studio-draft" aria-label="Chapter draft" placeholder="Generate a draft or write here…"></textarea><div class="studio-draft-footer"><span id="studio-word-count"></span><button id="studio-accept">Use draft in Story</button></div></div>
<section class="studio-attachments"><h3>Attachments</h3><div id="studio-refs"></div></section></div></main>
<aside class="studio-settings"><h3>Generation</h3><label>Model<select id="studio-model"></select></label><p id="studio-endpoint" class="studio-help"></p><button id="studio-reload-models">Reload model configuration</button><label>Minimum words<input id="studio-words" type="number" min="50" max="10000" value="200"></label><fieldset class="studio-boundaries"><legend>Chapter boundaries</legend><label><input id="studio-previous-context" type="checkbox"> Previous Arc Beats</label><small id="studio-previous-name"></small><label><input id="studio-next-context" type="checkbox"> Next Arc Beats</label><small id="studio-next-name"></small><p class="studio-help">Context only: these events will not be written into this chapter.</p></fieldset><details><summary>Generation instructions</summary><textarea id="studio-prompt" aria-label="Generation instructions"></textarea><button id="studio-reset-prompt">Reset instructions</button></details><button id="studio-generate" class="share-button">Generate Draft</button><button id="studio-cancel" hidden>Cancel generation</button><p id="studio-status" role="status"></p></aside></section>`;
document.body.append(studio);
let studioArc=null,studioChapter=null,studioConfig=null,studioRange=null,studioBusy=false,studioReturnFocus=null;
const sq=id=>studio.querySelector('#studio-'+id);
const defaultStudioPrompt='Write a chapter of at least {word_count} words using the chapter plan and attached references. Follow the Beat order and incorporate the directions between them. Treat the plan as guidance, not text to quote. Return only the chapter prose.';
function studioChanged(){normalizeStudioPlans();renderNode(studioArc);renderStoryPanel();drawConnections();scheduleAutosave();}
function connectedStudioRefs(){return connections.filter(c=>c.type==='reference'&&c.to.node===studioArc.id).map(c=>nodes.find(n=>n.id===c.from.node)).filter(Boolean);}
function setStudioTab(tab){sq('plan-view').hidden=tab!=='plan';sq('draft-view').hidden=tab!=='draft';sq('plan-tab').classList.toggle('active',tab==='plan');sq('draft-tab').classList.toggle('active',tab==='draft');}
function openStudio(arcId){
  studioArc=nodes.find(n=>n.id===arcId&&n.type==='arc');if(!studioArc)return;
  normalizeStudioPlans();studioChapter=studioArc.chapters[0]||null;studioReturnFocus=document.activeElement;
  document.querySelector('.app-shell').inert=true;studio.hidden=false;studioRange=null;
  sq('status').textContent='';sq('arc-name').textContent=studioArc.title;drawStudio();loadStudioModels();sq('close').focus();
}
function closeStudio(){if(studioBusy){sq('status').textContent='Cancel generation before closing the studio.';return;}commitChapterTitle();studio.hidden=true;document.querySelector('.app-shell').inert=false;studioReturnFocus?.focus();}
async function loadStudioModels(){
  try{studioConfig=await window.ghostwriter.llmConfig();sq('model').replaceChildren();
    for(const model of studioConfig.models)sq('model').append(new Option(model.label,model.id));
    sq('model').value=studioChapter?.modelId||studioConfig.defaultModel;if(!sq('model').value)sq('model').selectedIndex=0;
    if(studioChapter)sq('prompt').value=studioChapter.prompt??studioConfig.defaultPrompt;updateEndpoint();
  }catch(error){sq('status').textContent='Model configuration: '+error.message;}
}
function updateEndpoint(){sq('endpoint').textContent=studioConfig?.models.find(m=>m.id===sq('model').value)?.endpoint||'';}
function drawStudioLists(){
  sq('chapters').replaceChildren();sq('beats').replaceChildren();
  sq('reference-list').replaceChildren();
  for(const ref of connectedStudioRefs()){
    const button=document.createElement('button');button.className='studio-beat-choice studio-reference-choice';
    button.textContent=ref.title;button.title=ref.text;button.draggable=!studioBusy;button.disabled=studioBusy||!studioChapter;
    const caption=document.createElement('small');caption.textContent=studioChapter?.referenceIds?.includes(ref.id)?'Attached':'Drag to attach';button.append(caption);
    button.ondragstart=e=>{e.dataTransfer.setData('application/x-studio-reference',ref.id);e.dataTransfer.effectAllowed='copy';};
    button.onclick=()=>attachStudioReference(ref.id);sq('reference-list').append(button);
  }
  if(!sq('reference-list').children.length)sq('reference-list').textContent='No connected References.';
  for(const chapter of studioArc.chapters){const button=document.createElement('button');button.className='studio-chapter-choice';button.textContent=chapter.name;button.classList.toggle('active',chapter===studioChapter);button.disabled=studioBusy;button.onclick=()=>{commitChapterTitle();studioChapter=chapter;studioRange=null;drawStudio();};sq('chapters').append(button);}
  for(const beat of studioArc.beats){
    const button=document.createElement('button');button.className='studio-beat-choice';button.draggable=!studioBusy;button.disabled=studioBusy||!studioChapter;
    button.textContent=beat.text;const caption=document.createElement('small');caption.textContent=beat.chapter||'Unassigned';button.append(caption);
    button.ondragstart=e=>{e.dataTransfer.setData('application/x-studio-beat',beat.id);e.dataTransfer.effectAllowed='move';};button.onclick=()=>insertStudioBeat(beat.id);sq('beats').append(button);
  }
}
function beatChip(beat){
  const span=document.createElement('span');span.className='studio-beat-chip';span.contentEditable='false';span.draggable=true;span.dataset.beatId=beat.id;
  const label=document.createElement('span');label.textContent=beat.text;span.append(label);
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title='Release Beat';remove.onclick=()=>{if(!studioBusy){span.remove();saveStudioPlan();}};span.append(remove);
  span.ondragstart=e=>{if(studioBusy){e.preventDefault();return;}e.dataTransfer.setData('application/x-studio-beat',beat.id);e.dataTransfer.effectAllowed='move';};return span;
}
function renderPlan(){sq('plan').replaceChildren();for(const token of studioChapter.plan){if(token.type==='text')sq('plan').append(document.createTextNode(token.text));else{const beat=studioArc.beats.find(b=>b.id===token.beatId);if(beat)sq('plan').append(beatChip(beat));}}}
function readPlan(){
  const tokens=[];
  const text=value=>{if(!value)return;const last=tokens.at(-1);if(last?.type==='text')last.text+=value;else tokens.push({type:'text',text:value});};
  const walk=node=>{if(node.nodeType===Node.TEXT_NODE){text(node.textContent);return;}if(node.dataset?.beatId){tokens.push({type:'beat',beatId:node.dataset.beatId});return;}if(node.nodeName==='BR'){text('\n');return;}if(['DIV','P'].includes(node.nodeName)&&tokens.length)text('\n');node.childNodes.forEach(walk);};
  sq('plan').childNodes.forEach(walk);return tokens;
}
function saveStudioPlan(){if(!studioChapter)return;studioChapter.plan=readPlan();studioChanged();drawStudioLists();}
function rememberStudioRange(){const s=window.getSelection();if(s.rangeCount&&sq('plan').contains(s.anchorNode))studioRange=s.getRangeAt(0).cloneRange();}
function insertStudioBeat(id,range){
  if(!studioChapter||studioBusy)return;const beat=studioArc.beats.find(b=>b.id===id);if(!beat)return;
  const owner=studioArc.chapters.find(c=>c.plan.some(t=>t.type==='beat'&&t.beatId===id));
  if(owner&&owner!==studioChapter&&!window.confirm('Move this Beat from “'+owner.name+'” to “'+studioChapter.name+'”?'))return;
  setStudioTab('plan');const editor=sq('plan');let caret=range||studioRange;
  if(!caret||!editor.contains(caret.startContainer)){caret=document.createRange();caret.selectNodeContents(editor);caret.collapse(false);}
  const withinChip=caret.startContainer.nodeType===Node.ELEMENT_NODE?caret.startContainer.closest('[data-beat-id]'):caret.startContainer.parentElement?.closest('[data-beat-id]');if(withinChip)caret.setStartAfter(withinChip);
  const chip=beatChip(beat);caret.collapse(true);caret.insertNode(chip);
  editor.querySelectorAll('[data-beat-id]').forEach(el=>{if(el!==chip&&el.dataset.beatId===id)el.remove();});
  for(const chapter of studioArc.chapters)if(chapter!==studioChapter)chapter.plan=chapter.plan.filter(t=>t.type!=='beat'||t.beatId!==id);
  const spacer=document.createTextNode(' ');chip.after(spacer);caret.setStartAfter(spacer);caret.collapse(true);editor.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(caret);studioRange=caret.cloneRange();saveStudioPlan();
}
function commitChapterTitle(){
  if(!studioChapter)return;const name=sq('title').value.trim()||studioChapter.name;
  if(studioArc.chapters.some(c=>c!==studioChapter&&c.name===name)){sq('status').textContent='Chapter names must be unique within an Arc.';sq('title').value=studioChapter.name;return;}
  studioChapter.name=name;studioChanged();drawStudioLists();
}
function drawStudio(){
  drawBoundaryControls();
  drawStudioLists();sq('empty').hidden=!!studioChapter;sq('fields').hidden=!studioChapter;sq('generate').disabled=!studioChapter||studioBusy;
  if(studioChapter)studioChapter.referenceIds??=[];
  drawStudioReferences();
  if(!studioChapter)return;
  sq('title').value=studioChapter.name;renderPlan();sq('draft').value=studioChapter.draft??studioChapter.content??'';
  sq('words').value=studioChapter.wordCount||200;sq('prompt').value=studioChapter.prompt??studioConfig?.defaultPrompt??defaultStudioPrompt;
  if(studioConfig){sq('model').value=studioChapter.modelId||studioConfig.defaultModel;updateEndpoint();}
  drawDraftHistory();updateWordCount();setStudioTab('plan');
}
function attachStudioReference(id){
  if(studioBusy||!studioChapter||!connectedStudioRefs().some(ref=>ref.id===id))return;
  studioChapter.referenceIds=[...new Set([...(studioChapter.referenceIds||[]),id])];
  drawStudioReferences();drawStudioLists();scheduleAutosave();
}
function drawStudioReferences(){
  sq('refs').replaceChildren();
  for(const ref of connectedStudioRefs().filter(ref=>studioChapter?.referenceIds?.includes(ref.id))){
    const card=document.createElement('div');card.className='studio-reference';
    const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('p');
    summary.textContent=ref.title;body.textContent=ref.text||'This reference is empty.';details.append(summary,body);
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','Remove attachment '+ref.title);remove.disabled=studioBusy;
    remove.onclick=()=>{studioChapter.referenceIds=studioChapter.referenceIds.filter(id=>id!==ref.id);drawStudioReferences();drawStudioLists();scheduleAutosave();};
    card.append(details,remove);sq('refs').append(card);
  }
  if(!sq('refs').children.length)sq('refs').textContent='Drop a Reference into the chapter to attach it.';
}
function drawDraftHistory(){sq('history').replaceChildren(new Option('Current draft',''));(studioChapter.history||[]).forEach((draft,i)=>sq('history').append(new Option('Draft '+(i+1)+' · '+new Date(draft.date).toLocaleString(),String(i))));}
function updateWordCount(){sq('word-count').textContent=sq('draft').value.trim().split(/\s+/u).filter(Boolean).length+' words';}
function setStudioBusy(busy){studioBusy=busy;sq('generate').hidden=busy;sq('generate').disabled=busy||!studioChapter;sq('cancel').hidden=!busy;sq('add').disabled=busy;sq('plan').contentEditable=String(!busy);for(const id of ['title','draft','accept','history','words','prompt','model','reset-prompt','reload-models'])sq(id).disabled=busy;sq('plan').querySelectorAll('button').forEach(b=>b.disabled=busy);sq('refs').querySelectorAll('button').forEach(input=>input.disabled=busy||!studioChapter);drawStudioLists();drawBoundaryControls();}
sq('add').onclick=()=>{commitChapterTitle();let i=studioArc.chapters.length+1;while(studioArc.chapters.some(c=>c.name==='Chapter '+i))i++;studioChapter={id:uid('chapter'),name:'Chapter '+i,content:'',plan:[],wordCount:200};studioArc.chapters.push(studioChapter);studioChanged();drawStudio();sq('title').focus();sq('title').select();};
sq('title').onchange=commitChapterTitle;sq('close').onclick=closeStudio;
sq('plan-tab').onclick=()=>setStudioTab('plan');sq('draft-tab').onclick=()=>setStudioTab('draft');
sq('plan').addEventListener('input',saveStudioPlan);sq('plan').addEventListener('keyup',rememberStudioRange);sq('plan').addEventListener('mouseup',rememberStudioRange);
sq('plan').addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));saveStudioPlan();});
sq('plan').addEventListener('dragover',e=>{if(!studioBusy&&(e.dataTransfer.types.includes('application/x-studio-beat')||e.dataTransfer.types.includes('application/x-studio-reference')))e.preventDefault();});
sq('plan').addEventListener('drop',e=>{e.preventDefault();if(studioBusy)return;const ref=e.dataTransfer.getData('application/x-studio-reference');if(ref){attachStudioReference(ref);return;}const id=e.dataTransfer.getData('application/x-studio-beat');if(id)insertStudioBeat(id,document.caretRangeFromPoint(e.clientX,e.clientY));});
sq('draft').oninput=()=>{studioChapter.draft=sq('draft').value;updateWordCount();scheduleAutosave();};
sq('history').onchange=()=>{const value=sq('history').value;sq('draft').value=value===''?(studioChapter.draft??studioChapter.content??''):studioChapter.history[Number(value)].text;updateWordCount();};
sq('accept').onclick=()=>{studioChapter.draft=sq('draft').value;studioChapter.content=studioChapter.draft;studioChanged();sq('status').textContent='Draft is now displayed in Story.';};
sq('model').onchange=()=>{if(studioChapter)studioChapter.modelId=sq('model').value;updateEndpoint();scheduleAutosave();};
sq('words').onchange=()=>{if(studioChapter){studioChapter.wordCount=Math.max(50,Math.min(10000,Number(sq('words').value)||200));sq('words').value=studioChapter.wordCount;scheduleAutosave();}};
sq('prompt').oninput=()=>{if(studioChapter){studioChapter.prompt=sq('prompt').value;scheduleAutosave();}};
sq('reset-prompt').onclick=()=>{if(studioChapter){studioChapter.prompt=studioConfig?.defaultPrompt||defaultStudioPrompt;sq('prompt').value=studioChapter.prompt;scheduleAutosave();}};
sq('reload-models').onclick=loadStudioModels;sq('cancel').onclick=()=>window.ghostwriter.cancelGeneration();
sq('generate').onclick=async()=>{
  if(!studioChapter||studioBusy)return;saveStudioPlan();commitChapterTitle();const arc=studioArc,chapter=studioChapter;
  const plan=chapter.plan.map(t=>t.type==='text'?t.text:' [Beat: '+arc.beats.find(b=>b.id===t.beatId)?.text+'] ').join('');
  if(!plan.trim()){sq('status').textContent='Add a Beat or some directions to the plan first.';return;}
  chapter.modelId=sq('model').value;chapter.prompt=sq('prompt').value;chapter.wordCount=Number(sq('words').value);setStudioBusy(true);sq('status').textContent='Generating a draft…';
  try{
    const result=await window.ghostwriter.generateChapter({boundaryContext:studioBoundaryContext(),styleGuide,modelId:chapter.modelId,prompt:chapter.prompt,wordCount:chapter.wordCount,plan,references:connectedStudioRefs().filter(r=>chapter.referenceIds.includes(r.id)).map(r=>({title:r.title,text:r.text}))});
    if(result.error)throw new Error(result.error);if(!nodes.includes(arc)||!arc.chapters.includes(chapter))return;
    chapter.history??=[];const previous=chapter.draft??chapter.content;if(previous)chapter.history.push({date:new Date().toISOString(),text:previous});
    chapter.draft=result.text;sq('draft').value=result.text;drawDraftHistory();updateWordCount();setStudioTab('draft');scheduleAutosave();sq('status').textContent='Draft ready: '+result.words+' words'+(result.words<chapter.wordCount?' — below your requested minimum.':'.')+' Review it, then choose Use draft in Story.';
  }catch(error){sq('status').textContent=error.message;}finally{setStudioBusy(false);}
};
studio.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeStudio();}
  if(e.key==='Tab'){const list=[...studio.querySelectorAll('button,input,select,textarea,[contenteditable="true"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
const studioMenu=document.createElement('button');studioMenu.dataset.action='studio';studioMenu.textContent='Write Chapters…';nodeMenu.append(studioMenu);
studioMenu.addEventListener('click',()=>{if(menuNode?.type==='arc')openStudio(menuNode.id);});
content.addEventListener('click',e=>{const button=e.target.closest('[data-open-studio]');if(button)openStudio(button.dataset.openStudio);});
function addStudioButton(el,node){if(node.type!=='arc')return;const button=document.createElement('button');button.className='arc-write-chapters';button.dataset.openStudio=node.id;button.textContent='Write Chapters…';el.append(button);}
function addDictionaryStudioLinks(){
  document.querySelectorAll('.outline-arc').forEach(group=>{
    const arcId=group.querySelector('[data-focus-node]')?.dataset.focusNode;if(!arcId)return;
    const button=document.createElement('button');button.className='arc-write-chapters';button.textContent='Write Chapters…';button.onclick=()=>openStudio(arcId);group.append(button);
  });
}
const warning=document.createElement('div');warning.id='llm-warning';warning.className='llm-warning';warning.setAttribute('role','status');
const retry=document.createElement('button');retry.textContent='Recheck API key';retry.id='llm-recheck';document.querySelector('.home-subtitle').after(warning,retry);
async function checkLLMKey(){warning.hidden=false;warning.textContent='Checking OpenAI connection…';retry.disabled=true;try{const status=await window.ghostwriter.llmKeyStatus();warning.textContent=status.message;warning.hidden=status.state==='valid';}catch{warning.textContent='Unable to check the OpenAI connection.';}finally{retry.disabled=false;}}
retry.onclick=checkLLMKey;checkLLMKey();
for(const target of [sq('draft'),sq('refs')]){
  target.addEventListener('dragover',e=>{if(!studioBusy&&e.dataTransfer.types.includes('application/x-studio-reference'))e.preventDefault();});
  target.addEventListener('drop',e=>{e.preventDefault();if(!studioBusy)attachStudioReference(e.dataTransfer.getData('application/x-studio-reference'));});
}
function adjacentStudioArc(direction){
  const link=connections.find(c=>c.type==='arc'&&(direction==='previous'?c.to.node===studioArc.id:c.from.node===studioArc.id));
  return nodes.find(n=>n.type==='arc'&&n.id===(direction==='previous'?link?.from.node:link?.to.node));
}
function drawBoundaryControls(){
  for(const direction of ['previous','next']){
    const arc=adjacentStudioArc(direction),control=sq(direction+'-context');
    control.checked=!!studioChapter?.[direction+'ArcContext'];control.disabled=!studioChapter||!arc||studioBusy;
    sq(direction+'-name').textContent=arc?arc.title+' · '+arc.beats.length+' Beats':'No connected '+direction+' Arc';
  }
}
function studioBoundaryContext(){
  const context={};
  for(const direction of ['previous','next']){
    const arc=adjacentStudioArc(direction);
    if(studioChapter?.[direction+'ArcContext']&&arc)context[direction]={title:arc.title,beats:arc.beats.map(beat=>beat.text)};
  }
  return context;
}
for(const direction of ['previous','next']){
  sq(direction+'-context').onchange=()=>{
    if(!studioChapter)return;studioChapter[direction+'ArcContext']=sq(direction+'-context').checked;scheduleAutosave();
  };
}
