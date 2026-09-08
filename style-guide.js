const styleEditor=document.createElement('div');
styleEditor.className='reader-overlay style-guide-overlay';styleEditor.hidden=true;
styleEditor.innerHTML=`<section class="style-guide-editor" role="dialog" aria-modal="true" aria-labelledby="style-guide-heading"><header><div><span class="eyebrow">PROJECT WRITING INSTRUCTIONS</span><h1 id="style-guide-heading">Style Guide</h1></div><button id="style-guide-import">Import TXT / MD…</button><button id="style-guide-close" aria-label="Close Style Guide">×</button></header><p>Write voice, tone, formatting, or storytelling guidance. Included with every chapter generation.</p><textarea id="style-guide-text" maxlength="200000" aria-label="Style Guide" placeholder="Describe how you want your story to read…"></textarea><footer id="style-guide-status" role="status">Changes are kept with your project.</footer></section>`;
document.body.append(styleEditor);
const styleText=styleEditor.querySelector('textarea');
const styleStatus=styleEditor.querySelector('footer');
let styleImporting=false;
function closeStyleGuide(){if(styleImporting)return;styleEditor.hidden=true;document.querySelector('.app-shell').inert=false;document.querySelector('#style-guide-open').focus();}
document.querySelector('#style-guide-open').onclick=()=>{styleText.value=styleGuide;styleStatus.textContent='Changes are kept with your project.';styleEditor.hidden=false;document.querySelector('.app-shell').inert=true;styleText.focus();};
styleText.addEventListener('input',()=>{styleGuide=styleText.value;scheduleAutosave();});
styleEditor.querySelector('#style-guide-close').onclick=closeStyleGuide;
styleEditor.querySelector('#style-guide-import').onclick=async()=>{
  if(styleImporting)return;
  if(styleGuide.trim()&&!window.confirm('Replace the current Style Guide with an imported file?'))return;
  styleImporting=true;styleText.disabled=true;styleEditor.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await window.ghostwriter.importStyleGuide();if(result.error)throw new Error(result.error);if(!result.canceled){styleGuide=result.text;styleText.value=styleGuide;styleStatus.textContent='Style Guide imported. Changes are kept with your project.';scheduleAutosave();}}
  catch(error){styleStatus.textContent=error.message;}
  finally{styleImporting=false;styleText.disabled=false;styleEditor.querySelectorAll('button').forEach(b=>b.disabled=false);styleText.focus();}
};
styleEditor.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeStyleGuide();}
  if(e.key==='Tab'){const elements=[...styleEditor.querySelectorAll('button,textarea')].filter(el=>!el.disabled);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
