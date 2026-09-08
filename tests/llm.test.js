const {test}=require('node:test');
const assert=require('node:assert/strict');
const {keyStatus,generate}=require('../llm');
test('key states distinguish missing, rejected, and network failures',async()=>{
  assert.equal((await keyStatus(null,{})).state,'missing');
  assert.equal((await keyStatus(async()=>({status:401,ok:false}),{OPENAI_API_KEY:'test'})).state,'invalid');
  assert.equal((await keyStatus(async()=>{throw Error('offline')},{OPENAI_API_KEY:'test'})).state,'unverified');
  assert.equal((await keyStatus(async()=>({ok:true}),{OPENAI_API_KEY:'test'})).state,'valid');
});
const request={modelId:'openai-sol',styleGuide:'Use warm, playful prose.',plan:'[Beat: Leave the bed] Quietly.',prompt:'Write {word_count} words.',wordCount:200,references:[{title:'Dog',text:'Secret hero.'}]};
test('adjacent Arc Beats are separate context with boundary-only instructions for both APIs',async()=>{
  for(const modelId of ['openai-sol','lmstudio']){
    await generate({...request,modelId,boundaryContext:{previous:{title:'Before',beats:['Falls asleep']},next:{title:'After',beats:['Returns home']}}},{env:{OPENAI_API_KEY:'test'},fetcher:async(url,options)=>{
      const body=JSON.parse(options.body),instructions=body.instructions||body.messages[0].content,context=JSON.parse(body.input||body.messages[1].content);
      assert.match(instructions,/NOT events to include/);assert.match(instructions,/do not retell/);assert.match(instructions,/do not narrate/);
      assert.deepEqual(context.boundary_context.next.beats,['Returns home']);assert.equal(context.chapter_plan,request.plan);
      return {ok:true,json:async()=>modelId==='openai-sol'?{output:[{content:[{type:'output_text',text:'Draft.'}]}]}:{choices:[{message:{content:'Draft.'}}]}};
    }});
  }
});
test('Responses adapter sends separate instructions/context and extracts prose',async()=>{
  const result=await generate(request,{env:{OPENAI_API_KEY:'test'},fetcher:async(url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.instructions,'Write 200 words.');assert.equal(body.store,false);assert.equal(JSON.parse(body.input).chapter_plan,request.plan);assert.equal(JSON.parse(body.input).style_guide,request.styleGuide);assert.equal(options.headers.Authorization,'Bearer test');
    return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'A good dog.'}]}]})};
  }});assert.equal(result.text,'A good dog.');assert.equal(result.words,3);
});
test('local and Azure adapters use correct endpoint and authentication',async()=>{
  for(const [modelId,env] of [['lmstudio',{}],['azure',{AZURE_OPENAI_API_KEY:'azure-test'}]]){
    await generate({...request,modelId},{env,fetcher:async(url,options)=>{
      assert.equal(JSON.parse(options.body).messages[1].role,'user');
      assert.equal(JSON.parse(JSON.parse(options.body).messages[1].content).style_guide,request.styleGuide);
      if(modelId==='azure')assert.equal(options.headers['api-key'],'azure-test');else assert.equal(options.headers.Authorization,undefined);
      return {ok:true,json:async()=>({choices:[{message:{content:'Home again.'},finish_reason:'stop'}]})};
    }});
  }
});
test('errors preserve no partial output and hide raw provider error bodies',async()=>{
  await assert.rejects(generate(request,{env:{}}),/OPENAI_API_KEY/);
  await assert.rejects(generate(request,{env:{OPENAI_API_KEY:'test'},fetcher:async()=>({ok:false,status:401})}),/HTTP 401/);
  await assert.rejects(generate(request,{env:{OPENAI_API_KEY:'test'},fetcher:async()=>({ok:true,json:async()=>({status:'incomplete'})})}),/incomplete/);
});
