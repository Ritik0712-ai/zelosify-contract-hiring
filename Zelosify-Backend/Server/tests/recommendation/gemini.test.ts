import {afterEach,beforeEach,expect,it,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();vi.stubEnv('GEMINI_API_KEY','test-key-not-a-real-credential');vi.stubEnv('GEMINI_MODEL','gemini-3.1-flash-lite');vi.stubEnv('GEMINI_MIN_REQUEST_INTERVAL_MS','0');});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function reply(){return new Response(JSON.stringify({candidates:[{content:{role:'model',parts:[{functionCall:{name:'parse_resume',args:{}},thoughtSignature:'opaque'}]}}],usageMetadata:{promptTokenCount:8,candidatesTokenCount:4}}));}
it('uses native JSON Schema definitions and preserves model parts without exposing credentials',async()=>{
 const fetch=vi.fn(async()=>reply());vi.stubGlobal('fetch',fetch);const {GeminiClient}=await import('../../src/services/recommendation/gemini.js');
 const result=await new GeminiClient().turn('System',[{role:'user',parts:[{text:'Scoped task'}]}],[{name:'parse_resume',parameters:{type:'object',additionalProperties:false,properties:{}}}],AbortSignal.timeout(1000));
 const request=JSON.parse(fetch.mock.calls[0][1].body);expect(request.tools[0].functionDeclarations[0]).toHaveProperty('parametersJsonSchema.additionalProperties',false);expect(request.tools[0].functionDeclarations[0]).not.toHaveProperty('parameters');expect(result.content.parts[0].thoughtSignature).toBe('opaque');expect(result.usage).toEqual({input:8,output:4,thinking:0});expect(JSON.stringify(result)).not.toContain('test-key');
});
it('respects provider retry hints and returns a safe quota error',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{message:'private provider details',details:[{retryDelay:'42s'}]}}),{status:429})));const {GeminiClient}=await import('../../src/services/recommendation/gemini.js');
 await expect(new GeminiClient().turn('System',[],[],AbortSignal.timeout(1000))).rejects.toMatchObject({code:'PROVIDER_QUOTA',retryable:true,retryAfterMs:42000,message:'PROVIDER_QUOTA'});
});
it('cancelled pacing waiters do not delay following profiles with abandoned reservations',async()=>{
 vi.stubEnv('GEMINI_MIN_REQUEST_INTERVAL_MS','150');const fetch=vi.fn(async()=>reply());vi.stubGlobal('fetch',fetch);const {GeminiClient}=await import('../../src/services/recommendation/gemini.js');const client=new GeminiClient();
 await client.turn('System',[],[],AbortSignal.timeout(1000));
 await expect(client.turn('System',[],[],AbortSignal.timeout(10))).rejects.toMatchObject({code:'PROCESSING_TIMEOUT'});
 await expect(client.turn('System',[],[],AbortSignal.timeout(250))).resolves.toHaveProperty('content');expect(fetch).toHaveBeenCalledTimes(2);
});
