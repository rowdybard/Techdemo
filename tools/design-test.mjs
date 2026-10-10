import assert from 'node:assert/strict';
import { config as defaults } from '../src/config.js';
import { takeDesign, putDesign, normalizeLook, MAX_LOOK_BYTES } from '../src/design.js';
import { lookOf, applyLook, keepFree } from '../src/look.js';
import { PRESETS, applyPreset, settingsJSON, loadSettings } from '../src/presets.js';
import { deluxeFeatures, freeDesign, FREE_SHELLS } from '../src/catalog.js';
import { OCCASIONS } from '../src/occasions.js';
import { readLink, giftLink, shortLink } from '../src/link.js';
import { rememberCheckout, trackPurchase } from '../src/track.js';
let passed=0;
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const fresh=()=>structuredClone(defaults);
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)}};
globalThis.localStorage=storage(); globalThis.sessionStorage=storage();
globalThis.location=new URL('https://skygreeting.com/'); globalThis.document={querySelector:()=>null};
await test('every shipped Look preserves its complete authored settings in a v2 greeting',()=>{
 for(const name in PRESETS){
  const c=fresh();applyPreset(c,name);c.place.environment='lake';c.lake.open=.73;
  c.palettes.custom[0][0]=2.17;c.look.palette='custom';c.look.lifetime=4.7;c.look.glitter=.81;
  const envelope=lookOf(c);assert.ok(new TextEncoder().encode(JSON.stringify(envelope)).length<MAX_LOOK_BYTES);
  const received=fresh();applyLook(received,JSON.parse(JSON.stringify(envelope)));
  assert.deepEqual(takeDesign(received),takeDesign(c),name);
 }
});
await test('a Free version swaps each paid shell for its nearest free one',()=>{
 const free=freeDesign({look:{mix:{peony:1,saturn:2,skull:1,kamuro:0.5}},fountains:{enabled:true,style:'mixed',sideBarges:true}});
 assert.deepEqual(deluxeFeatures(free),[]);assert.equal(free.look.mix.ring,2);assert.equal(free.look.mix.ghost,1);assert.equal(free.look.mix.willow,0.5);assert.equal(free.look.mix.peony,1);
 assert.equal(freeDesign({look:{mix:{peony:4,chrysanthemum:3}}}).look.mix.peony,5); // weights stay within 0..5
});
await test('Free new sends exclude side barges and paid mixes, including forged legacy inputs',()=>{
 for(const look of [{e:1,m:{peony:0,crackle:1},g:'mixed'}, {ver:2,design:{fountains:{sideBarges:true,enabled:true,style:'halloween'},look:{mix:{skull:2}}}}]){
  const result=normalizeLook(look,{tier:'free'});assert.equal(result.ver,2);assert.equal(result.design.fountains.sideBarges,false);
  assert.deepEqual(deluxeFeatures(result.design),[]);assert.ok(FREE_SHELLS.some((name)=>result.design.look.mix[name]>0));
 }
});
await test('published legacy greetings retain side barges while newly authored Free does not',()=>{
 const c=fresh();applyLook(c,{e:1,a:'lake',v:9});keepFree(c,OCCASIONS.birthday,{legacy:true});
 assert.equal(c.fountains.sideBarges,true);assert.equal(c.place.environment,'lake');assert.equal(c.landmarks.sweep,9);
 keepFree(c,OCCASIONS.birthday);assert.equal(c.fountains.sideBarges,false);
});
await test('malformed or oversized envelope is rejected and unsafe numeric settings cannot partially mutate',()=>{
 assert.equal(normalizeLook({ver:99,design:{}}),null);assert.equal(normalizeLook({ver:2,design:[]} ),null);
 assert.equal(normalizeLook({payload:'x'.repeat(MAX_LOOK_BYTES)}),null);
 for(const data of [{show:{shellsPerMinute:-1},sky:{timeOfDay:1}}, {fountains:{every:0}},{look:{mix:{peony:-2}}},{fountains:{sideBarges:'yes'}}]){
  const c=fresh(),before=structuredClone(c);assert.ok(loadSettings(c,JSON.stringify(data)));assert.deepEqual(c,before);
 }
});
await test('custom palette and control references survive settings import and draft application',()=>{
 const c=fresh(),array=c.palettes.custom,row=array[0],mix=c.look.mix,source=fresh();source.palettes.custom[0][0]=3.14;
 assert.equal(loadSettings(c,settingsJSON(source)),'');assert.equal(c.palettes.custom,array);assert.equal(array[0],row);assert.equal(c.look.mix,mix);assert.equal(row[0],3.14);
 putDesign(c,takeDesign(source));assert.equal(c.look.mix,mix);assert.equal(c.palettes.custom[0],row);
});
await test('new visitor gets Galaxy night beach; saved settings and explicit link override it',()=>{
 const c=fresh();readLink(c);assert.equal(c.place.environment,'beach');assert.equal(c.sky.timeOfDay,PRESETS.Galaxy.sky.timeOfDay);
 c.sky.timeOfDay=.44;c.place.environment='lake';localStorage.setItem('beach-fireworks-settings',settingsJSON(c));
 const saved=fresh();readLink(saved);assert.equal(saved.place.environment,'lake');assert.equal(saved.sky.timeOfDay,.44);
 location=new URL(giftLink({occasion:'birthday',message:'HELLO',look:{ver:2,design:takeDesign(fresh())}}));
 assert.equal(readLink(fresh()).place,'beach');localStorage=storage();location=new URL('https://skygreeting.com/');
});
await test('choosing any preset preserves mute and zero volume',()=>{
 for(const name in PRESETS){const c=fresh();c.sound.enabled=false;c.sound.volume=0;applyPreset(c,name);assert.equal(c.sound.enabled,false);assert.equal(c.sound.volume,0);}
 const c=fresh();applyPreset(c,'Classic');assert.equal(c.sky.timeOfDay,defaults.sky.timeOfDay);
});
await test('server refusal cannot be bypassed by a long-link fallback',async()=>{
 globalThis.fetch=async()=>({ok:false,status:400,json:async()=>({error:'blocked'})});
 await assert.rejects(shortLink({occasion:'birthday',message:'HELLO'}),/blocked/);
 globalThis.fetch=async()=>{throw new Error('offline')};assert.match(await shortLink({occasion:'birthday',message:'HELLO'}),/msg=HELLO/);
});
await test('purchase requires server payment, matching checkout and deduplication; actual amount only',()=>{
 const events=[];globalThis.window={gtag:(...event)=>events.push(event)};
 const id='7c8a9b10-1112-4314-9516-171819202122';
 const data={status:'paid',deluxe:true,paidAmountCents:199,currency:'USD',transactionId:id};
 assert.equal(trackPurchase(data,'birthday'),false);rememberCheckout(id);
 assert.equal(trackPurchase({...data,status:'free',deluxe:false},'birthday'),false);
 assert.equal(trackPurchase({...data,paidAmountCents:undefined},'birthday'),false);
 assert.equal(trackPurchase(data,'birthday'),true);assert.equal(events[0][2].value,1.99);
 rememberCheckout(id);assert.equal(trackPurchase(data,'birthday'),false);assert.equal(events.length,1);
 assert.ok(!JSON.stringify(events).includes('?g='));
});
console.log(`Design and analytics contracts: ${passed} PASS`);
