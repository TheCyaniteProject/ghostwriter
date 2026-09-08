function validateProject(project) {
  const fail=()=>{throw new Error('Invalid Ghostwriter project: malformed nodes or connections.');};
  if(!project||project.format!=='ghostwriter'||project.version!==1||!Array.isArray(project.nodes)||!Array.isArray(project.connections))fail();
  const ids=new Set(),byId=new Map();
  const text=value=>typeof value==='string';
  for(const node of project.nodes){
    if(!node||!text(node.id)||!/^[-\w]+$/.test(node.id)||ids.has(node.id)||!['arc','reference','sticky','container'].includes(node.type)||!Number.isFinite(node.x)||!Number.isFinite(node.y))fail();
    ids.add(node.id);byId.set(node.id,node);
    if(node.type!=='sticky'&&!text(node.title))fail();
    if(node.text!==undefined&&!text(node.text))fail();
    for(const key of ['width','height'])if(node[key]!==undefined&&(!Number.isFinite(node[key])||node[key]<=0))fail();
    if(node.noteSize&&(!Number.isFinite(node.noteSize.width)||!Number.isFinite(node.noteSize.height)||node.noteSize.width<180||node.noteSize.height<150))fail();
    if(node.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(node.color))fail();
    if(node.type==='arc'){
      if(!Array.isArray(node.beats)||!Array.isArray(node.chapters))fail();
      for(const beat of node.beats)if(!beat||!text(beat.id)||!/^[-\w]+$/.test(beat.id)||!text(beat.text)||(beat.chapter!=null&&!text(beat.chapter)))fail();
      const chapterIds=new Set(),assignedBeats=new Set();
      for(const chapter of node.chapters){
        if(!chapter||!text(chapter.name)||(chapter.content!==undefined&&!text(chapter.content)))fail();
        if(chapter.id!==undefined){if(!text(chapter.id)||!/^[-\w]+$/.test(chapter.id)||chapterIds.has(chapter.id))fail();chapterIds.add(chapter.id);}
        for(const key of ['draft','prompt','modelId'])if(chapter[key]!==undefined&&!text(chapter[key]))fail();
        for(const key of ['previousArcContext','nextArcContext'])if(chapter[key]!==undefined&&typeof chapter[key]!=='boolean')fail();
        if(chapter.wordCount!==undefined&&(!Number.isInteger(chapter.wordCount)||chapter.wordCount<50||chapter.wordCount>10000))fail();
        if(chapter.referenceIds!==undefined&&(!Array.isArray(chapter.referenceIds)||chapter.referenceIds.some(id=>!text(id))))fail();
        if(chapter.history!==undefined&&(!Array.isArray(chapter.history)||chapter.history.some(d=>!d||!text(d.text)||!text(d.date))))fail();
        if(chapter.plan!==undefined){
          if(!Array.isArray(chapter.plan))fail();
          for(const token of chapter.plan){
            if(!token||!['text','beat'].includes(token.type))fail();
            if(token.type==='text'){if(!text(token.text))fail();}
            else {if(!node.beats.some(b=>b.id===token.beatId)||assignedBeats.has(token.beatId))fail();assignedBeats.add(token.beatId);}
          }
        }
      }
      if(node.refs!==undefined&&(!Number.isInteger(node.refs)||node.refs<1||node.refs>10000))fail();
    }
  }
  if(project.title!==undefined&&!text(project.title))fail();
  if(project.styleGuide!==undefined&&(!text(project.styleGuide)||project.styleGuide.length>200000))fail();
  if(project.sourceArcId!=null&&byId.get(project.sourceArcId)?.type!=='arc')fail();
  const usedOut=new Set(),usedIn=new Set(),next=new Map();
  for(const c of project.connections){
    const from=byId.get(c?.from?.node),to=byId.get(c?.to?.node);
    if(!from||!to||to.type!=='arc'||c.from.port!=='out'||c.type!==from.type||!['arc','reference'].includes(c.type))fail();
    if(c.type==='arc'&&(c.to.port!=='arc-in'||to.id===project.sourceArcId))fail();
    if(c.type==='reference'&&!/^ref-\d+$/.test(c.to.port))fail();
    const input=to.id+':'+c.to.port;
    if(usedOut.has(from.id)||usedIn.has(input))fail();
    usedOut.add(from.id);usedIn.add(input);
    if(c.type==='arc')next.set(from.id,to.id);
  }
  for(const id of next.keys()){const seen=new Set();let cursor=id;while(next.has(cursor)){if(seen.has(cursor))fail();seen.add(cursor);cursor=next.get(cursor);}}
  if(project.view){if(!Number.isFinite(project.view.zoom)||!Number.isFinite(project.view.pan?.x)||!Number.isFinite(project.view.pan?.y))fail();}
  return project;
}
module.exports={validateProject};
