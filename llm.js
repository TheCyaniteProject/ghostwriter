const fs = require('node:fs');
const path = require('node:path');
function readConfig() {
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'llm-models.json'),'utf8'));
  if(!Array.isArray(config.models)||typeof config.defaultPrompt!=='string')throw new Error('Invalid llm-models.json configuration.');
  const ids=new Set();
  for(const model of config.models){
    if(!model.id||ids.has(model.id)||!model.model||!['chat','responses'].includes(model.api)||!['none','bearer','api-key'].includes(model.auth))throw new Error('Invalid or duplicate model configuration.');
    ids.add(model.id);
    const url=new URL(model.endpoint);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Model endpoints must be HTTP(S) URLs without embedded credentials.');
  }
  return config;
}
function publicConfig(){const c=readConfig();return {defaultModel:c.defaultModel,defaultPrompt:c.defaultPrompt,models:c.models.map(m=>({id:m.id,label:m.label,endpoint:m.endpoint,model:m.model}))};}
async function keyStatus(fetcher=fetch,env=process.env){
  if(!env.OPENAI_API_KEY?.trim())return {state:'missing',message:'OPENAI_API_KEY is not set. OpenAI generation is unavailable; local and other providers can still be used.'};
  try{
    const response=await fetcher('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+env.OPENAI_API_KEY},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(response.status===401)return {state:'invalid',message:'OpenAI rejected OPENAI_API_KEY. Update the environment variable and restart Ghostwriter.'};
    if(!response.ok)return {state:'unverified',message:'OpenAI key could not be verified (HTTP '+response.status+'). Check access, service availability, and your connection.'};
    return {state:'valid',message:'OpenAI key verified. Model access depends on your account.'};
  }catch{return {state:'unverified',message:'Could not reach OpenAI to verify the key. Check your connection and retry.'};}
}
async function generate(request,{signal,fetcher=fetch,env=process.env}={}){
  const model=readConfig().models.find(m=>m.id===request.modelId);
  if(!model)throw new Error('Select a configured model.');
  if(typeof request.plan!=='string'||!request.plan.trim()||request.plan.length>200000||typeof request.prompt!=='string'||request.prompt.length>20000||!Array.isArray(request.references)||request.references.length>100)throw new Error('Invalid or oversized chapter plan.');
  const count=Number(request.wordCount);if(!Number.isInteger(count)||count<50||count>10000)throw new Error('Word count must be between 50 and 10,000.');
  const key=model.keyEnv?env[model.keyEnv]:null;
  if(model.auth!=='none'&&!key)throw new Error('Set '+model.keyEnv+' before using this provider.');
  const headers={'Content-Type':'application/json'};
  if(model.auth==='bearer')headers.Authorization='Bearer '+key;
  if(model.auth==='api-key')headers['api-key']=key;
  let instructions=request.prompt.replaceAll('{word_count}',String(count));
  const boundaryContext={};
  for(const direction of ['previous','next']){
    const context=request.boundaryContext?.[direction];if(context===undefined)continue;
    if(!context||typeof context.title!=='string'||!Array.isArray(context.beats)||context.beats.some(beat=>typeof beat!=='string'))throw new Error('Invalid adjacent Arc context.');
    boundaryContext[direction]=context;
  }
  if(Object.keys(boundaryContext).length)instructions+='\n\nThe boundary_context contains Beats from adjacent Arcs, NOT events to include in this chapter. Use previous Arc Beats only to understand what has already happened and where this chapter should begin; do not retell or dramatize them. Use next Arc Beats only to understand where this chapter should end; do not narrate, resolve, or reveal those upcoming events. Write only the events in the chapter plan.';
  if(request.styleGuide!==undefined&&(typeof request.styleGuide!=='string'||request.styleGuide.length>200000))throw new Error('Style Guide must be text of at most 200,000 characters.');
  const input=JSON.stringify({style_guide:request.styleGuide||'',chapter_plan:request.plan,references:request.references,...(Object.keys(boundaryContext).length?{boundary_context:boundaryContext}:{})});
  if(input.length>400000)throw new Error('Chapter references are too large.');
  const body=model.api==='responses'?{model:model.model,instructions,input,store:false}:{model:model.model,messages:[{role:'system',content:instructions},{role:'user',content:input}]};
  const response=await fetcher(model.endpoint,{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
  if(!response.ok)throw new Error('Generation failed (HTTP '+response.status+'). '+({401:'Check the provider API key.',403:'Check model access and permissions.',404:'Check the endpoint and model or deployment name.',429:'Provider quota or rate limit reached.'}[response.status]||'Check the provider configuration and retry.'));
  const data=await response.json();
  if(data.status==='incomplete')throw new Error('The provider returned an incomplete response. Retry with a shorter chapter.');
  const text=model.api==='responses'?(data.output||[]).flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n'):data.choices?.[0]?.message?.content;
  if(typeof text!=='string'||!text.trim())throw new Error('The provider returned no chapter text (possibly a refusal).');
  if(data.choices?.[0]?.finish_reason==='length')throw new Error('The provider truncated the draft. Increase its output limit or request fewer words.');
  return {text,words:text.trim().split(/\s+/u).length};
}
module.exports={readConfig,publicConfig,keyStatus,generate};
