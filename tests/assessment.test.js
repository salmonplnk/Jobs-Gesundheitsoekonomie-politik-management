const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {stripTypeScriptTypes} = require('node:module');
const source = fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/assess-job/index.ts'),'utf8');
const helpers = import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source.split('// PURE_ASSESSMENT_START')[1].split('\n').slice(1).join('\n').split('// PURE_ASSESSMENT_END')[0])).toString('base64'));
const jobQuote = 'Für diese Stelle benötigen Sie einen Master in Gesundheitsökonomie.';
const docQuote = 'Master in Gesundheitsökonomie, Universität Luzern, abgeschlossen 2025.';
const input = () => ({job:{id:'hospital:123',title:'Health Economist',organization:'Hospital',url:'https://hospital.ch/jobs/123',description:jobQuote+' Sie arbeiten in Bern und entwickeln Modelle der ambulanten Versorgung.',description_truncated:false},profile:{education:'Master'},documents:[{id:'cv-1',doc_type:'cv',raw_text:docQuote}],criteria:[]});
const answer = row => ({summary:'Eine vom Modell frei formulierte Behauptung.',criteria:[{criterion:'qualification_education',status:'met',job_quote:jobQuote,document_id:'cv-1',document_quote:docQuote,reason:'Der geforderte Abschluss ist im Lebenslauf genannt.',...row}],strengths:['Erfundene Stärke'],gaps:[]});

test('keeps exact evidence and derives summary/strengths from grounded rows',async()=>{
  const {normalizeAssessmentInput,validateAssessment}=await helpers;
  const result=validateAssessment(answer(),normalizeAssessmentInput(input()));
  assert.equal(result.criteria[0].status,'met');
  assert.equal(result.criteria[0].evidence_valid,true);
  assert.equal(result.criteria[1].status,'unknown');
  assert.deepEqual(result.strengths,['Ausbildung und Fachrichtung']);
  assert.doesNotMatch(result.summary,/frei formulierte|Erfundene/);
});

test('fabricated quotes, foreign document IDs and missing CV evidence downgrade to unknown',async()=>{
  const {normalizeAssessmentInput,validateAssessment}=await helpers;
  for(const changed of [{document_quote:'Ich habe einen Doktortitel.'},{document_id:'someone-elses-cv'},{job_quote:'Es wird ein Doktorat verlangt.'},{document_quote:''}]){
    const result=validateAssessment(answer(changed),normalizeAssessmentInput(input()));
    assert.equal(result.criteria[0].status,'unknown');
    assert.deepEqual(result.strengths,[]);
  }
  const noDocs=input();noDocs.documents=[];
  assert.equal(validateAssessment(answer(),normalizeAssessmentInput(noDocs)).criteria[0].status,'unknown');
});

test('unmet also requires positive source evidence, missing facts are not gaps',async()=>{
  const {normalizeAssessmentInput,validateAssessment}=await helpers;
  const result=validateAssessment(answer({status:'unmet',document_quote:''}),normalizeAssessmentInput(input()));
  assert.equal(result.criteria[0].status,'unknown');
  assert.deepEqual(result.gaps,[]);
});

test('rejects malformed or invented criteria and duplicate document identifiers',async()=>{
  const {normalizeAssessmentInput,validateAssessment}=await helpers;
  const normalized=normalizeAssessmentInput(input());
  for(const value of [answer({status:'excellent'}),answer({criterion:'invented'}),{...answer(),stars:5},{...answer(),criteria:[answer().criteria[0],answer().criteria[0]]}]) assert.throws(()=>validateAssessment(value,normalized));
  const duplicate=input();duplicate.documents.push({...duplicate.documents[0]});
  assert.throws(()=>normalizeAssessmentInput(duplicate));
});

test('bounded inputs reject silent truncation and explicitly disclose provided truncated descriptions',async()=>{
  const {normalizeAssessmentInput,validateAssessment}=await helpers;
  const oversized=input();oversized.job.description='A'.repeat(31001);
  assert.throws(()=>normalizeAssessmentInput(oversized));
  const truncated=input();truncated.job.description_truncated=true;
  assert.match(validateAssessment(answer(),normalizeAssessmentInput(truncated)).summary,/gekürzt/);
  const longDoc=input();longDoc.documents[0].raw_text='A'.repeat(60001);
  assert.throws(()=>normalizeAssessmentInput(longDoc));
});

function endpoint({quota=true,provider,authenticated=true}={}) {
  let handler, paidCalls=0, paidBody;
  const code=stripTypeScriptTypes(source.replace(/^import .*createClient.*\n/m,'').replace(/export /g,''));
  const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_ANON_KEY:'test-anon',ANTHROPIC_API_KEY:'test-key',ASSESSMENT_MODEL:'configured-model'};
  const context=require('node:vm').createContext({URL,Request,Response,TextEncoder,AbortSignal,console,
    createClient:()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'user-1'}:null},error:null})},rpc:async(name,args)=>{
      assert.equal(name,'consume_job_quota');assert.equal(args.action_name,'assess-job');assert.equal(args.max_requests,10);
      return {data:quota,error:null};
    }}),
    fetch:async(url,options)=>{paidCalls++;paidBody=JSON.parse(options.body);return new Response(JSON.stringify(provider||{stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(answer())}]}),{headers:{'content-type':'application/json'}});},
    Deno:{env:{get:key=>env[key]},serve:fn=>{handler=fn;}},
  });
  require('node:vm').runInContext(code,context);
  return {request:()=>handler(new Request('https://demo.supabase.co/assess-job',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(input())})),calls:()=>paidCalls,body:()=>paidBody};
}

test('authentication and atomic quota block paid calls before provider access',async()=>{
  const unauthenticated=endpoint({authenticated:false});
  assert.equal((await unauthenticated.request()).status,401);assert.equal(unauthenticated.calls(),0);
  const limited=endpoint({quota:false});
  assert.equal((await limited.request()).status,429);assert.equal(limited.calls(),0);
});

test('endpoint rejects incomplete provider output and returns grounded assessment',async()=>{
  const incomplete=endpoint({provider:{stop_reason:'max_tokens',content:[{type:'text',text:JSON.stringify(answer())}]}});
  assert.equal((await incomplete.request()).status,502);
  const success=endpoint();const response=await success.request();
  assert.equal(response.status,200);assert.equal(success.calls(),1);assert.equal(success.body().model,'configured-model');
  const result=await response.json();assert.equal(result.assessment.criteria[0].status,'met');assert.equal(typeof result.assessed_at,'string');
});
