import test from 'node:test';
import assert from 'node:assert/strict';
import { KENYA_SOURCES, KENYA_FACTS, KENYA_COUNTY_NAMES, scopedSources, selectEvidence, evidenceBundle, evidenceContext, isKenyanNews } from '../../artifacts/api-server/src/lib/kenya-evidence.ts';
import { KENYA_COUNTIES } from '../../artifacts/api-server/src/data/kenya-electoral-units.ts';
test('evidence directory covers the same 47 Kenyan counties as campaign geography',()=>{
 assert.deepEqual([...KENYA_COUNTY_NAMES].sort(),KENYA_COUNTIES.map(c=>c.name).sort());
 for(const county of KENYA_COUNTY_NAMES){const b=evidenceBundle({county},'water');assert.equal(b.country,'Kenya');assert.equal(b.county,county);assert.ok(b.facts.every(f=>f.county===null||f.county===county));}
});
test('Makueni historical figures never become another county or ward facts',()=>{
 const m=selectEvidence({county:'Makueni',constituency:'Kaiti'},'water sanitation',20);assert.ok(m.some(f=>f.id==='makueni-sanitation-baseline'));
 for(const county of ['Nairobi City','Kisumu','Turkana','Kiambu']){assert.ok(selectEvidence({county},'Makueni water sanitation',20).every(f=>f.county===null));assert.ok(!evidenceContext({county},'water').includes('35.6%'));assert.ok(!scopedSources({county}).some(s=>s.county==='Makueni'));}
 assert.ok(m.filter(f=>f.county).every(f=>f.period&&f.locator));assert.match(evidenceContext({county:'Makueni'},'sanitation'),/not ward-specific/);
});
test('unavailable and secondary sources cannot supply asserted facts',()=>{
 for(const f of KENYA_FACTS){const source=KENYA_SOURCES.find(s=>s.id===f.sourceId);assert.ok(source);assert.equal(source.status,'reviewed');assert.ok(['official','official-hosted'].includes(source.kind));}
 assert.equal(KENYA_SOURCES.find(s=>s.id==='iebc-2022').status,'unavailable');assert.equal(KENYA_SOURCES.find(s=>s.id==='debunk-kibwana').status,'discovery-only');
});
test('scope and language selection handle national and unsupported locations without inventing local data',()=>{
 assert.ok(selectEvidence({},'water').every(f=>f.county===null));
 const unsupported=evidenceBundle({county:'Washington'},'water');assert.equal(unsupported.county,null);assert.ok(unsupported.limitations.some(x=>x.includes('not in the Kenya')));
 assert.equal(selectEvidence({county:'Makueni County'},'maji sanitation')[0].county,'Makueni');
 assert.ok(evidenceBundle({county:'Turkana'}).limitations.some(x=>x.includes('No reviewed county-specific')));
});
test('news leads require Kenyan content, not just an injected Kenya query suffix',()=>{
 assert.equal(isKenyanNews({title:'New York election results',snippet:'County budget debate'},{county:'Washington'}),false);
 assert.equal(isKenyanNews({title:'Makueni water service report'},{county:'Makueni'}),true);
 assert.equal(isKenyanNews({title:'Kenya publishes a new statistical release'},{}),true);
 assert.equal(isKenyanNews({title:'Foreign country politics'},{county:'Kisumu'}),false);
});

import { validRate, historicalTurnout } from '../../artifacts/api-server/src/lib/electoral-evidence-quality.ts';
test('turnout quality checks preserve unknowns and require a same-election denominator',()=>{
 for(const missing of [null,undefined,'',-1,101,'not a rate'])assert.equal(validRate(missing),null);
 assert.equal(validRate('61.2'),61.2);assert.equal(validRate(0),0);
 assert.equal(historicalTurnout(500,null),null);assert.equal(historicalTurnout(1200,1000),null);assert.equal(historicalTurnout(600,1000),60);
});

import { applyCampaignGeography, CAMPAIGN, WARDS } from '../../artifacts/commandcentre/src/lib/wards.ts';
test('display scope follows the configured office instead of calling every campaign a constituency',()=>{
 const base={id:1,name:'Workspace name',wards:['Example'],constituency:null,seat:'President',area:null,county:null};
 applyCampaignGeography(base,1);assert.equal(CAMPAIGN.areaLabel,'Kenya');
 applyCampaignGeography({...base,seat:'Governor',county:'Kisumu'},1);assert.equal(CAMPAIGN.areaLabel,'Kisumu County');
 applyCampaignGeography({...base,seat:'MCA',wards:['Ukia']},1);assert.equal(CAMPAIGN.areaLabel,'Ukia Ward');
 applyCampaignGeography({...base,seat:'MP',wards:[],constituency:null},1);assert.equal(CAMPAIGN.areaLabel,'Constituency not configured');assert.deepEqual(WARDS,[]);
});
