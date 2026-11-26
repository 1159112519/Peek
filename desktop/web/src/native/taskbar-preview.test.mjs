import test from 'node:test';import assert from 'node:assert/strict';import {createTaskbarPreviewFeed} from './taskbar-preview.js';
function harness(){const events=new Map(),pending=[],timers=new Map();let tick=0;const snapshots=[];const client={subscribe(fn,type){events.set(type,fn);return()=>events.delete(type)},request(method,params,{signal}){return new Promise((resolve,reject)=>pending.push({method,params,signal,resolve,reject}))}};const stop=createTaskbarPreviewFeed(client,'server-b',v=>snapshots.push(v),{setTimer(fn,ms){const id=++tick;timers.set(id,{fn,ms});return id},clearTimer(id){timers.delete(id)}});return {events,pending,timers,snapshots,stop};}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('preview displays exact cached device snapshot without a synthetic timeline',async()=>{const h=harness();assert.equal(h.pending.length,1);assert.equal(h.pending[0].method,'taskbar.status');assert.equal(h.pending[0].params.deviceId,'server-b');const snapshot={values:{cpu:{Text:'7',unit:'%',animate:false}}};h.pending[0].resolve({snapshot});await flush();assert.equal(h.snapshots[0],snapshot);assert.equal([...h.timers.values()][0].ms,1000);h.stop();});
test('capture bursts do not overlap requests and refresh after the in-flight read',async()=>{const h=harness();h.events.get('capture')();h.events.get('capture-light')();assert.equal(h.pending.length,1);h.pending[0].resolve({snapshot:{values:{}}});await flush();assert.equal([...h.timers.values()][0].ms,60);const timer=[...h.timers.values()][0];timer.fn();assert.equal(h.pending.length,2);h.stop();h.pending[1].resolve({snapshot:{values:{}}});await flush();assert.equal(h.snapshots.length,1);assert.equal(h.timers.size,0);});
test('device switch disposal aborts old reads and removes subscriptions',async()=>{const h=harness();h.stop();assert.equal(h.events.size,0);assert(h.pending[0].signal.aborted);h.pending[0].resolve({snapshot:{device:'old'}});await flush();assert.deepEqual(h.snapshots,[]);assert.equal(h.timers.size,0);});
test('missing cached telemetry stays unavailable instead of showing made-up readings',async()=>{const h=harness();h.pending[0].reject(Error('unavailable'));await flush();assert.deepEqual(h.snapshots,[null]);h.stop();});

import {alignDesktopValues,taskbarDisplay,taskbarGlyphWidth,taskbarNumberWidth,taskbarReadoutLeftShift,taskbarPlaceKey} from './taskbar-display.js';
test('preview and native widget bound every metric without clipping a numeric prefix',()=>{for(const label of ['CPU','内存','GPU','R','W','↓','↑'])for(const value of [0,99.99,999.9,9999,-9999,123456789,Number.MAX_VALUE])for(const unit of ['%','K/s','GHz','GB','W','rpm']){const s={value,Text:String(value),unit,decimals:1},before=JSON.stringify(s),d=taskbarDisplay(s,label);assert(d.x>=d.start);assert(d.x+taskbarNumberWidth(d.text)<=d.end+.001);assert.equal(JSON.stringify(s),before);assert(d.unitStart>=d.end);}});
test('desktop right-aligns nearby value / unit groups to the upper row, without crossing the label',()=>{
 const at=(text,left,right,nameRight=24)=>({text,left,right,nameRight});
 assert.deepEqual(alignDesktopValues([at('24',43,64),at('8',59,74)]),[0,-10]);
 assert.deepEqual(alignDesktopValues([at('79',40,64),at('169',32,67),at('23',41,62)]),[0,-3,2]);
 assert.deepEqual(alignDesktopValues([at('0',39,50),at('4.0',32,63),at('0',39,50)]),[0,0,0]);
 assert.deepEqual(alignDesktopValues([at('24',39,58),at('8',37,65,28)]),[0,0]);
 assert.deepEqual(alignDesktopValues([at('—',47,59),at('—',50,62),at('8',49,60)]),[0,-3,0]);
 assert.deepEqual(alignDesktopValues([at('24',40,51),at('8',50,58),at('9',54,64)]),[0,-7,0]);
});
test('widget abbreviates GB after conversion without changing telemetry or rates',()=>{
 const memory={value:14.2,unit:'GB',decimals:1};assert.equal(taskbarDisplay(memory,'Used','GB',()=>88,{id:'memoryUsed'}).unit,'G');
 assert.equal(memory.unit,'GB');assert.equal(taskbarDisplay({...memory,value:1024},'Used','GB',()=>88).unit,'TB');
 assert.equal(taskbarDisplay({...memory,unit:'G/s'},'↓','K/s',()=>88,{id:'down'}).unit,'G/s');
});
test('large transfer readings upgrade units and reduce excess decimals',()=>{const d=taskbarDisplay({value:123456789,unit:'K/s',decimals:1},'R');assert.equal(d.unit,'G/s');assert.equal(d.text,'118');const normal=taskbarDisplay({value:23.6,unit:'M/s',decimals:1},'R');assert.equal(normal.text,'23.6');assert.equal(normal.start,17);assert.equal(normal.unitStart,60);});
test('unavailable readings stay unavailable and digit keys identify decimal place',()=>{assert.equal(taskbarDisplay(null,'GPU').text,'—');assert.equal(taskbarDisplay({value:0,unit:'%',decimals:0},'GPU').text,'0');assert.equal(taskbarPlaceKey('9.0',0),taskbarPlaceKey('19.0',1));assert.equal(taskbarPlaceKey('9.0',2),taskbarPlaceKey('19.00',3));});

test('tighter readouts leave a protected right gutter for every neighbouring module',()=>{for(const label of ['CPU','内存','GPU','R','W','↓','↑'])for(const unit of ['%','W','M/s','GHz','']){const d=taskbarDisplay({value:9.8,unit,decimals:1},label);assert(d.x+taskbarNumberWidth(d.text)<=d.end+.001);assert(d.end<=77);assert(d.unitStart>=d.end);if(unit)assert(d.unitStart-d.end>=2)}});

test('three digit percent fits the named CPU module',()=>assert.equal(taskbarDisplay({value:100,unit:"%",decimals:0},"CPU").text,"100"));

test('slow display interval gates capture events as well as polling, without blocking first read',async()=>{
 let time=0,requests=0,scheduled=null;const events=new Map();
 const stop=createTaskbarPreviewFeed({subscribe(fn,type){events.set(type,fn);return()=>events.delete(type)},async request(){requests++;return {snapshot:{values:{}}}}},'local',()=>{},
 {minInterval:5000,now:()=>time,setTimer(fn,ms){scheduled={fn,ms};return 1},clearTimer(){scheduled=null}});
 await flush();assert.equal(requests,1);assert.equal(scheduled.ms,5000);
 time=600;events.get('capture')();assert.equal(scheduled.ms,4400);scheduled.fn();await flush();assert.equal(requests,1);
 time=5000;scheduled.fn();await flush();assert.equal(requests,2);stop();assert.equal(events.size,0);assert.equal(scheduled,null);
});
import {taskbarScrollValues,taskbarScrollPath} from './taskbar-scroll.js';
test('new tiny chart sample translates history horizontally without moving existing Y values',()=>{
 for(const unit of ['%','W','K/s']){const a=taskbarScrollValues([20,55,40,70],unit,70),b=taskbarScrollValues([20,55,40,70,200],unit,70);
 assert.deepEqual(a.slice(-3),b.slice(-4,-1));
 const before=taskbarScrollPath(b,5,10,0),after=taskbarScrollPath(b,5,10,1);
 const old=before.match(/-?\d+(?:\.\d+)?/g).map(Number),next=after.match(/-?\d+(?:\.\d+)?/g).map(Number);
 for(let i=0;i<old.length;i++)assert(Math.abs((old[i]-next[i])-(i%2?0:2))<.000001);
 }
});

test('number and unit move by half a digit where there is room and stop before the preceding ink',()=>{
 const digit=taskbarGlyphWidth('0'),track=3.6*digit,max=taskbarNumberWidth('88.8');
 for(const id of ['cpu','gpu','memoryUsed','cpuFrequency','gpuTemperature','storageRead']){
  assert.equal(taskbarReadoutLeftShift(id,30,track,21),digit/2);
  const tight=taskbarReadoutLeftShift(id,30,track,27);
  assert(tight>0&&tight<digit/2);
  assert(Math.abs(30+track-max-tight-27-1)<.001);
 }
 for(const id of ['up','down'])assert.equal(taskbarReadoutLeftShift(id,30,track,21),0);
});

test('Widget formats byte-based network samples as decimal bit rates without mutating raw data',()=>{
 const sample={value:1,unit:'K/s',decimals:1};
 assert.equal(taskbarDisplay(sample,'↓','K/s',()=>100,{networkBits:true}).unit,'kb/s');
 assert.equal(taskbarDisplay(sample,'↓','K/s',()=>100,{networkBits:true}).text,'8.2');
 assert.equal(taskbarDisplay(sample,'↓','K/s',()=>100).text,'1.0');
 assert.equal(taskbarDisplay({value:1,unit:'%'},'CPU','%',()=>100,{hidePercent:true}).unit,'');
 assert.equal(taskbarDisplay({value:1,unit:'GHz'},'CPU','GHz',()=>100,{hidePercent:true}).unit,'GHz');
 assert.equal(taskbarDisplay({...sample,stale:true},'↓','K/s',()=>100,{networkBits:true}).text,'—');
 assert.deepEqual(sample,{value:1,unit:'K/s',decimals:1});
});

test('Widget fixed rate, compact and hidden units keep the original sample intact',()=>{
 const sample={value:2,unit:'K/s',decimals:1};
 const render=options=>taskbarDisplay(sample,'↓','K/s',()=>100,options);
 assert.equal(render({id:'down',networkScale:0}).text,'2048');
 assert.equal(render({id:'down',networkBits:true,networkScale:1}).text,'16.4');
 assert.equal(render({id:'down',networkBits:true,networkScale:1,compactNetwork:true}).unit,'kb');
 assert.equal(render({id:'down',networkBits:true,networkScale:1,compactNetwork:true,hideNetworkUnit:true}).unit,'');
 assert.equal(render({id:'storageRead',networkBits:true,hideNetworkUnit:true}).unit,'K/s');
 assert.deepEqual(sample,{value:2,unit:'K/s',decimals:1});
});
