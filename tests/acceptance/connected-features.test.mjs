import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal, templateInput, templateComponents, detectionScores, validMedia } from '../../artifacts/api-server/src/lib/connected-features.ts';
const draft={name:'meeting_reminder',language:'en_US',category:'UTILITY',body:'Hello {{1}}, your meeting is at {{2}}.',examples:['Jane','10am']};
test('template placeholders require sequential numbers and corresponding samples',()=>{
  assert.equal(templateInput.safeParse(draft).success,true);
  for(const change of [{examples:[]},{body:'Hello {{2}}',examples:['Jane']},{body:'Hello {{name}}',examples:[]},{header:'{{1}}'},{name:'Invalid Name'}])assert.equal(templateInput.safeParse({...draft,...change}).success,false);
  assert.equal(templateInput.safeParse({...draft,body:'Hello {{1}} {{1}}',examples:['Jane']}).success,true);
});
test('Meta payload includes body samples and only configured header/footer',()=>{
  const components=templateComponents(templateInput.parse({...draft,header:'Reminder',footer:'Thank you'}));
  assert.deepEqual(components,[{type:'HEADER',format:'TEXT',text:'Reminder'},{type:'BODY',text:draft.body,example:{body_text:[draft.examples]}},{type:'FOOTER',text:'Thank you'}]);
  assert.deepEqual(templateComponents(templateInput.parse({...draft,body:'Welcome',examples:[]})),[{type:'BODY',text:'Welcome'}]);
});
test('saved provider secrets are authenticated, randomised and do not reveal credentials',()=>{
  const previous=process.env.INTEGRATION_SECRET;process.env.INTEGRATION_SECRET='a-test-key-not-used-in-production';
  try{const a=seal('private-provider-token'),b=seal('private-provider-token');assert.notEqual(a,b);assert.ok(!a.includes('private-provider-token'));assert.equal(unseal(a),'private-provider-token');const fields=a.split(':');fields[3]=Buffer.alloc(16).toString('base64');assert.throws(()=>unseal(fields.join(':')));assert.throws(()=>unseal('plaintext'));}finally{if(previous===undefined)delete process.env.INTEGRATION_SECRET;else process.env.INTEGRATION_SECRET=previous;}
});
test('detector scores never invent an authenticity verdict or convert missing results to zero',()=>{
  assert.deepEqual(detectionScores({type:{deepfake:0,ai_generated:.4}}),{deepfake:0,aiGenerated:.4,frames:[]});
  assert.deepEqual(detectionScores({type:{deepfake:.1}}),{deepfake:.1,aiGenerated:null,frames:[]});
  for(const payload of [{},{type:{}},{type:{deepfake:2}},{type:{deepfake:'0.5'}},{data:{frames:[]}}])assert.throws(()=>detectionScores(payload));
  const video=detectionScores({data:{frames:[{info:{position:0},type:{deepfake:.05}},{info:{position:1000},type:{deepfake:.9,ai_generated:.6}}]}});assert.equal(video.deepfake,.9);assert.equal(video.aiGenerated,.6);assert.equal(video.frames.length,2);
});
test('media upload validation checks file signatures, not just browser MIME labels',()=>{
  assert.equal(validMedia(Buffer.from([255,216,255,0]),'image/jpeg'),true);
  assert.equal(validMedia(Buffer.from([137,80,78,71,13,10,26,10]),'image/png'),true);
  assert.equal(validMedia(Buffer.from('not a jpeg'),'image/jpeg'),false);
  assert.equal(validMedia(Buffer.from('not a video'),'video/mp4'),false);
  assert.equal(validMedia(Buffer.alloc(0),'image/png'),false);
});
