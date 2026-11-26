// Run against a packaged EXE, writing to an isolated smoke directory.
// Usage: node peek-preview-clarity.mjs <exe> <evidence-directory> <preferences.json>
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright'),{PNG}=require('pngjs');
const exe=path.resolve(process.argv[2]), evidence=path.resolve(process.argv[3]);
await fs.mkdir(evidence,{recursive:true});const data=await fs.mkdtemp(path.join(evidence,'data-'));
const fixture=JSON.parse(await fs.readFile(process.argv[4],'utf8'));
const ids=['down','memory','cpu','up','gpuMemory','gpu'];
fixture.taskbar.layout.pages.splice(1);
Object.assign(fixture.taskbar.layout.pages[0],{grid:{columns:3,rows:2},slots:ids.map((metricId,i)=>({column:i%3,row:Math.floor(i/3),id:`page-1-r${Math.floor(i/3)}c${i%3}`,module:{id:`module-${i}`,metricId,name:{variant:i%3===0?'arrow':i===1?'custom':'english',text:i===1?'RAM':undefined},parts:['number']}}))});
fixture.widgetAutoCheckUpdates=false;
fixture.widgetMonitoring={...fixture.widgetMonitoring,probeGateway:false};
Object.assign(fixture.widgetDesktop,{enabled:true,hideFullscreen:false,columns:3,rows:process.env.PEEK_MEMORY_ONLY==='1'?3:2,showUnits:true,memoryMode:'used',cells:['cpu','memoryUsed','gpu','down','memory','up','ping','gpuPower','loss'],labels:{memory:'RAM',memoryUsed:'RAM'},modules:Object.fromEntries(['gpu','memory','ping','gpuPower','memoryUsed','loss'].map(id=>[id,{variant:'english',parts:['number']}]))});
await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify(fixture));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const bridge=(p,method,params={})=>p.evaluate(({method,params})=>new Promise((resolve,reject)=>{
 const web=chrome.webview,id=crypto.randomUUID();
 function received(e){if(e.data.id!==id)return;clearTimeout(timer);web.removeEventListener('message',received);e.data.ok?resolve(e.data.result):reject(Error(e.data.error));}
 const timer=setTimeout(()=>{web.removeEventListener('message',received);reject(Error(method+' timeout'));},5000);
 web.addEventListener('message',received);web.postMessage({id,method,params});
}),{method,params});
async function run(body){
 const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const child=spawn(exe,['--smoke',data,'--debug-port',String(port)],{cwd:path.dirname(exe),stdio:'ignore',windowsHide:true});
 let browser,p;const errors=[];
 try{
  for(let i=0;i<160&&!p;i++){
   if(child.exitCode!==null)throw Error('Peek exited '+child.exitCode+' ('+data+')');
   if(!browser?.isConnected())try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:600});}catch{}
   p=browser?.contexts().flatMap(c=>c.pages()).find(page=>page.url().startsWith('https://asterhub.local'));
   if(!p)await wait(250);
  }
  assert(p,'Peek WebView2 not attached');p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.stack??e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.locator('.widget-page:visible').waitFor();await p.evaluate(()=>document.fonts.ready);
  const nativeStatus=await bridge(p,'taskbar.status');
  assert.equal(nativeStatus.snapshot.values.ping.reason,'前往采集设置开启网关探测');
  assert.equal(nativeStatus.snapshot.values.loss.reason,'前往采集设置开启网关探测');
  await fs.writeFile(path.join(evidence,'native-status.json'),JSON.stringify(Object.fromEntries(['ping','loss','gpuFan','gpuPower'].map(id=>[id,nativeStatus.snapshot.values[id]])),null,2));
  await p.evaluate(polish=>{const values=Object.fromEntries([['cpu',79,'%',0],['memory',89,'%',0],['memoryUsed',14.1,'GB',1],['gpu',0,'%',0],['gpuMemory',55,'%',0],['down',polish?98.5:169,'K/s',polish?1:0],['up',polish?10.2:4,'K/s',1],['storageRead',990,'K/s',0],['storageWrite',37.2,'M/s',1],['ping',23,'ms',0],['loss',0,'%',0],['gpuPower',5,'W',0],['gpuFan',null,'%',0]].map(([id,value,unit,decimals])=>[id,{value,unit,decimals,timeUtc:'fixture'}]));
  values.gpuFan.reason='显卡驱动未提供风扇读数';
  const w=chrome.webview,post=w.postMessage.bind(w);w.postMessage=msg=>{if(msg.method!=='taskbar.status')return post(msg);queueMicrotask(()=>w.dispatchEvent(new MessageEvent('message',{data:{id:msg.id,ok:true,result:{snapshot:{values}}}})));};},process.env.PEEK_SETTINGS_POLISH==='1');
  await p.locator('.foundation-tool-navigation').getByRole('tab',{name:'桌面',exact:true}).click();
  await p.locator('.peek-desktop-preview').waitFor();await body(p);assert.deepEqual(errors,[]);
 }catch(e){if(errors.length)console.error(errors);if(p&&!p.isClosed())await p.screenshot({path:path.join(evidence,`failure-${port}.png`)}).catch(()=>{});throw e;}
 finally{if(p&&!p.isClosed())await bridge(p,'widget.smoke.quit').catch(()=>{});if(browser?.isConnected())await browser.close().catch(()=>{});for(let i=0;i<30&&child.exitCode===null;i++)await wait(100);if(child.exitCode===null)child.kill();}
 if(errors.length)console.error('WebView errors:',errors);
}
async function capture(p,name){await bridge(p,'widget.smoke.desktop.capture');await fs.copyFile(path.join(data,'desktop-widget.png'),path.join(evidence,name+'.png'));}
async function theme(p,name){
 await p.getByRole('button',{name:name==='dark'?'深色':'浅色',exact:true}).click();
 await p.waitForFunction(mode=>document.documentElement.dataset.appearanceMode===mode,name);
 await wait(210);
 const box=await p.locator('.peek-desktop-preview').evaluate(el=>{
  const r=el.getBoundingClientRect(),g=el.querySelector('.peek-desktop-grid').getBoundingClientRect(),css=getComputedStyle(el);
  return {color:css.getPropertyValue('--peek-shell').trim(),horizontal:(g.left-r.left)-(r.right-g.right),vertical:(g.top-r.top)-(r.bottom-g.bottom),radius:parseFloat(css.borderTopLeftRadius)};
 });
 assert.equal(box.color,name==='dark'?'37 37 39':'252 248 239');
 assert(Math.abs(box.horizontal)<.15&&Math.abs(box.vertical)<.15,'preview grid is not centered in the outer shell');
 assert.equal(box.radius,16);
 const radii=await p.locator('.widget-appearance-actions').evaluate(el=>{
  const outer=getComputedStyle(el),inner=getComputedStyle(el.querySelector('[aria-pressed=true]'));
  return [parseFloat(outer.borderTopLeftRadius),parseFloat(outer.paddingTop),parseFloat(outer.borderTopWidth),parseFloat(inner.borderTopLeftRadius)];
 });
 assert(Math.abs(radii[3]-(radii[0]-radii[1]-radii[2]))<.5,'appearance buttons must share the outer corner center');
}
async function report(p,tag){
 await p.waitForTimeout(240);
 await p.screenshot({path:path.join(evidence,tag+'.png')});
 const state=await p.locator('.peek-desktop-slot[data-guide=true]').evaluateAll(nodes=>({dpr:devicePixelRatio,slots:nodes.map(node=>{const r=node.getBoundingClientRect(),s=node.querySelector('svg');return {label:s?.getAttribute('aria-label'),slot:[r.x,r.y,r.width,r.height],svg:s&&Object.fromEntries(["a","d","e","f"].map(k=>[k,s.getScreenCTM()?.[k]])),ink:s?[...s.querySelectorAll('.taskbar-cell-label,.taskbar-cell-number > [data-digit] > text:not([aria-hidden]),.taskbar-cell-unit')].map(k=>{const b=k.getBoundingClientRect();return [k.tagName,k.textContent,b.left,b.right,r.left-b.left,b.right-r.right];}):[]};})}));
 await fs.writeFile(path.join(evidence,tag+'.json'),JSON.stringify(state,null,2));
}
function glyphSpans(png,{left=0,right=png.width,top=0,bottom=png.height,dark=false}={}){
 const spans=[];
 for(let x=left;x<right;x++){
  let painted=false;
  for(let y=top;y<bottom&&!painted;y++){
   const i=(y*png.width+x)*4;
   const [r,g,b]=png.data.subarray(i,i+3);
   painted=dark?Math.min(r,g,b)>155:Math.max(r,g,b)<175;
  }
  if(!painted)continue;
  if(spans.at(-1)?.[1]===x-1)spans.at(-1)[1]=x;else spans.push([x,x]);
 }
 return spans;
}
async function desktopMemoryPreview(p,mode){
 await theme(p,mode);
 const boxes=await p.locator('.peek-desktop-slot[data-guide=true] svg[aria-label$="14.1 G"]').evaluateAll(nodes=>nodes.map(s=>{
  const n=s.querySelector('.taskbar-cell-number').getBoundingClientRect(),u=s.querySelector('text.taskbar-cell-unit').getBoundingClientRect();
  const d=devicePixelRatio;
  return {left:Math.floor(n.left*d)-1,right:Math.ceil(u.right*d)+1,top:Math.floor(Math.min(n.top,u.top)*d),bottom:Math.ceil(Math.max(n.bottom,u.bottom)*d),dark:document.documentElement.dataset.appearanceMode==='dark'};
 }));
 assert.equal(boxes.length,2,'both placed RAM samples should still follow the desktop capacity mode');
 const png=PNG.sync.read(await p.screenshot({path:path.join(evidence,`preview-memory-${mode}.png`)}));
 const spans=boxes.map(b=>glyphSpans(png,b));
 await fs.writeFile(path.join(evidence,`preview-memory-${mode}.json`),JSON.stringify(spans,null,2));
 return spans;
}
async function memoryCatalogue(p,tab){
 const library=p.locator('.tb42-library:visible');
 await library.getByRole('button',{name:'内存',exact:true}).click();
 const reading=id=>library.locator(`[data-metric=${id}] [data-library-part=number] svg`);
 const used=reading('memoryUsed');
 await p.waitForFunction(()=>document.querySelector('.tb42-library [data-metric=memoryUsed] [data-library-part=number] svg')?.getAttribute('aria-label')?.endsWith('14.1 G'));
 const png=PNG.sync.read(await used.screenshot({path:path.join(evidence,`used-${tab}.png`)}));
 const spans=glyphSpans(png);
 await p.screenshot({path:path.join(evidence,`memory-${tab}.png`)});
 const result={percent:await reading('memory').getAttribute('aria-label'),used:await used.getAttribute('aria-label'),spans};
 await fs.writeFile(path.join(evidence,`memory-${tab}.json`),JSON.stringify(result,null,2));
 return result;
}
function pixelInk(png,box,dark){
 let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity,weight=0,moment=0;
 for(let y=Math.max(0,Math.floor(box.top));y<Math.min(png.height,Math.ceil(box.bottom));y++)for(let x=Math.max(0,Math.floor(box.left));x<Math.min(png.width,Math.ceil(box.right));x++){
  const i=(y*png.width+x)*4,[r,g,b]=png.data.subarray(i,i+3);
  if(dark?Math.min(r,g,b)<155:Math.max(r,g,b)>175)continue;
  left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);
  const contrast=dark?Math.min(r,g,b)-30:240-Math.max(r,g,b);weight+=contrast;moment+=(y+.5)*contrast;
 }
 assert(weight,`no visible ink in ${JSON.stringify(box)}`);
 return {left,right,top,bottom,center:(top+bottom)/2,centroid:moment/weight};
}
async function settingsChromeAndRates(p){
 const all=[];
 for(const [page,tab] of [['desktop','桌面'],['taskbar','任务栏']]){
  await p.getByRole('tab',{name:tab,exact:true}).click();
  for(const mode of ['light','dark']){
   await p.getByRole('button',{name:mode==='light'?'浅色':'深色',exact:true}).click();
   await p.waitForFunction(mode=>document.documentElement.dataset.appearanceMode===mode,mode);
   for(const [category,samples] of [['网络',[['down','98.5 K/s'],['up','10.2 K/s']]],['存储',[['storageRead','990 K/s'],['storageWrite','37.2 M/s']]]]){
    const library=p.locator('.tb42-library:visible');
    await library.getByRole('button',{name:category,exact:true}).click();
    const numbers=samples.map(([id])=>`[data-metric=${id}] [data-library-part=number] svg`);
    for(const [i,[id,sample]] of samples.entries()){
     await library.locator(`${numbers[i]}[aria-label$="${sample}"]`).waitFor();
     await library.locator(numbers[i]).scrollIntoViewIfNeeded();
    }
    await p.mouse.move(4,4);await p.waitForTimeout(270);
    const boxes=await p.evaluate(selectors=>{
     const d=devicePixelRatio;
     const box=(r,l=r.left,h=r.right,top=r.top,bottom=r.bottom)=>({left:l*d,right:h*d,top:top*d,bottom:bottom*d});
     const nav=[...document.querySelectorAll('.foundation-tool-navigation [role=tab]')].map(node=>{
      const b=node.getBoundingClientRect(),r=node.querySelector('.tool-label').getBoundingClientRect();
      return {label:node.textContent,selected:node.getAttribute('aria-selected')==='true',target:(b.top+b.bottom)*d/2,box:box(b,r.left-1,r.right+1,b.top+4,b.bottom-4)};
     });
     const cells=selectors.map(selector=>{
      const s=[...document.querySelectorAll(selector)].find(x=>x.getBoundingClientRect().width>0);
      const unit=s.querySelector('.taskbar-cell-unit'),b=s.getBoundingClientRect(),u=unit.getBoundingClientRect(),slash=unit.textContent.indexOf('/');
      const matrix=unit.getScreenCTM(),a=unit.getStartPositionOfChar(slash).matrixTransform(matrix),z=unit.getStartPositionOfChar(slash+1).matrixTransform(matrix);
      return {text:s.getAttribute('aria-label'),digits:box(b,b.left,u.left-1),unit:box(b,u.left-1,u.right+1),bodyBeforeSlash:box(b,u.left-1,a.x),bodyAfterSlash:box(b,z.x+.5,u.right+1)};
     });
     return {nav,cells};
    },numbers);
    const tag=`${page}-${mode}-${category==='网络'?'network':'storage'}`;
    const png=PNG.sync.read(await p.screenshot({path:path.join(evidence,tag+'.png')}));
    const dark=mode==='dark';
    const nav=boxes.nav.map(({box,...item})=>({...item,...pixelInk(png,box,dark)}));
    const cells=boxes.cells.map(({text,...regions})=>({text,...Object.fromEntries(Object.entries(regions).map(([key,b])=>[key,pixelInk(png,b,dark)]))}));
    all.push({tag,nav,cells});
   }
  }
 }
 await fs.writeFile(path.join(evidence,'settings-ink.json'),JSON.stringify(all,null,2));
 for(const {tag,nav,cells} of all){
  const center=nav.reduce((total,n)=>total+n.center-n.target,0)/nav.length;
  assert(Math.abs(center)<=.85,`${tag}: navigation group visible ink is ${center} px from the button center`);
  for(const {text,digits,unit,bodyBeforeSlash,bodyAfterSlash} of cells){
   const bodyBottom=Math.max(bodyBeforeSlash.bottom,bodyAfterSlash.bottom);
   assert(Math.abs(digits.bottom-bodyBottom)<=1,`${tag}: ${text} unit body is ${digits.bottom-bodyBottom} px above the digits`);
   assert(unit.left-digits.right>=3,`${tag}: ${text} lacks a visible gap before the unit`);
  }
 }
}
async function catalogueAndGateway(p){
 const library=()=>p.locator('.widget-page:visible .tb42-library');
 const nav=p.locator('.foundation-tool-navigation');
 const pick=label=>nav.getByRole('tab',{name:label,exact:true}).click();
 async function typeSignature(){
  return library().locator('.tb42-categories button').evaluateAll(rows=>rows.map(row=>{
   const ink=row.querySelector('span.control-label,svg text');
   const {fontSize,fontFamily,fontWeight}=getComputedStyle(ink);
   return [row.getAttribute('aria-label'),fontSize,fontFamily,fontWeight];
  }));
 }
 async function readoutSignature(){
  return library().locator('.tb42-library-item svg text:not([aria-hidden=true])').evaluateAll(nodes=>nodes.map(ink=>[ink.textContent,getComputedStyle(ink).font]));
 }
 for(const mode of ['light','dark']){
  await theme(p,mode);
  await pick('桌面');
  await library().getByRole('button',{name:'网络',exact:true}).click();
  await library().locator('[data-metric=down] [data-library-part=number] svg[aria-label$="169 K/s"]').waitFor();
  const expectedType=await typeSignature(),expectedReadout=await readoutSignature();
  assert.equal(expectedType.length,5);
  assert(expectedType.every(([,size])=>size==='12px'),'Keep the smaller 12px category labels in both libraries');
  await library().getByRole('button',{name:'存储',exact:true}).scrollIntoViewIfNeeded();
  await p.mouse.move(4,4);
  await report(p,`desktop-catalogue-${mode}`);
  await pick('任务栏');
  await library().getByRole('button',{name:'网络',exact:true}).click();
  await library().locator('[data-metric=down] [data-library-part=number] svg[aria-label$="169 K/s"]').waitFor();
  await report(p,`taskbar-catalogue-${mode}`);
  assert.deepEqual(await typeSignature(),expectedType,'Same parameter library category typography in both editors');
  assert.deepEqual(await readoutSignature(),expectedReadout,'Same catalogue SVG text typography with the same sample');
 }
 await pick('采集');
 const status=p.locator('#widget-gateway-status');
 const expectStatus=message=>p.waitForFunction(text=>document.getElementById('widget-gateway-status')?.textContent.includes(text),message,{timeout:9000});
 await expectStatus('网关探测未开启');
 await status.scrollIntoViewIfNeeded();
 await report(p,'sampling-unset-dark');
 await theme(p,'light');
 await report(p,'sampling-unset-light');
 const enable=p.getByRole('checkbox',{name:'探测默认网关'});
 await enable.check();
 await expectStatus('应用后开始探测');
 await p.locator('.widget-settings-actions').getByRole('button',{name:'应用',exact:true}).click();
 await expectStatus('测试模式不发送网关请求');
 assert.equal(JSON.parse(await fs.readFile(path.join(data,'preferences.json'),'utf8')).widgetMonitoring.probeGateway,true);
 await p.evaluate(()=>{
  const web=chrome.webview,post=web.postMessage.bind(web);
  web.postMessage=msg=>{
   if(msg.method!=='widget.gateway.status')return post(msg);
   queueMicrotask(()=>web.dispatchEvent(new MessageEvent('message',{data:{id:msg.id,ok:true,result:window.peekTestGateway??{}}})));
  };
 });
 for(const [reading,message,tag] of [
  [{pingReason:'正在等待网关探测'},'正在等待网关探测','waiting'],
  [{pingReason:'所选网络没有可用的默认网关'},'所选网络没有可用的默认网关','no-gateway'],
  [{pingReason:'网关未响应 ICMP',lossReason:'网关尚未响应 ICMP，无法判断丢包率'},'网关可能不回 ICMP','no-reply'],
  [{ping:4,lossReason:'正在积累丢包样本'},'正在积累丢包样本','warming-up'],
  [{ping:4,loss:0},'Loss 0%','online'],
  [{pingReason:'网关未响应 ICMP',loss:100},'Loss 100%','established-loss'],
 ]){
  await p.evaluate(reading=>{window.peekTestGateway=reading},reading);
  try{await expectStatus(message);}catch(e){throw Error(`${tag}: expected ${message}, saw ${await status.textContent()}`,{cause:e});}
  if(tag==='no-reply'||tag==='online'){
   await status.scrollIntoViewIfNeeded();
   await report(p,`sampling-${tag}-light`);
  }
 }
 assert.match(await status.innerText(),/网关未响应 ICMP/);
}
if(process.env.PEEK_CATALOGUE_GATEWAY==='1')await run(catalogueAndGateway);
else if(process.env.PEEK_SETTINGS_POLISH==='1')await run(settingsChromeAndRates);
else if(process.env.PEEK_MEMORY_ONLY==='1')await run(async p=>{
 await theme(p,'light');
 const placed=p.locator('.peek-desktop-grid svg[aria-label$="14.1 G"]');
 await p.waitForFunction(()=>document.querySelectorAll('.peek-desktop-slot[data-guide=true] svg[aria-label$="14.1 G"]').length===2);
 assert.equal(await placed.count(),2,'placed RAM still follows the desktop capacity mode');
 const preview={};
 for(const mode of ['dark','light'])preview[mode]=await desktopMemoryPreview(p,mode);
 const desktop=await memoryCatalogue(p,'desktop');
 await p.getByRole('tab',{name:'任务栏',exact:true}).click();
 const taskbar=await memoryCatalogue(p,'taskbar');
 for(const [mode,rows] of Object.entries(preview))for(const [row,spans] of rows.entries()){
  assert.equal(spans.length,5,`desktop preview ${mode} row ${row+1}: visible ink for 1, 4, dot, 1, G: ${JSON.stringify(spans)}`);
  const gaps=spans.slice(1).map(([x],i)=>x-spans[i][1]-1);
  assert(gaps[0]>=2&&gaps[3]>=2,`desktop preview ${mode} row ${row+1}: first pair and unit must not touch: ${gaps}`);
 }
 for(const [tab,r] of Object.entries({desktop,taskbar})){
  assert.match(r.percent,/89 %$/,`${tab}: the catalogue must distinguish memory load from used capacity`);
  assert.match(r.used,/14.1 G$/);
  assert.equal(r.spans.length,5,`${tab}: all of 14.1 G must have separate visible strokes`);
  const gaps=r.spans.slice(1).map(([x],i)=>x-r.spans[i][1]-1);
  assert(Math.min(...gaps)>=2&&gaps[3]>=3,`${tab}: cramped digit or unit: ${gaps}`);
  assert(Math.max(...gaps.slice(0,3))-Math.min(...gaps.slice(0,3))<=3,`${tab}: inconsistent digit spacing: ${gaps}`);
 }
});
else await run(async p=>{
 for(const mode of ['light','dark']){
  await theme(p,mode);await report(p,'settings-'+mode);await capture(p,'desktop-'+mode);
 }
 for(const grip of ['right','bottom','bottom'])await p.locator('.peek-desktop-grip.'+grip).press(grip==='right'?'ArrowLeft':'ArrowUp');
 await p.locator('.peek-desktop-grip.right').press('ArrowRight');
 await theme(p,'light');await p.locator('.peek-desktop-grid svg[aria-label$="14.1 G"]').first().waitFor();await report(p,'one-row');
 const clipStyle=await p.addStyleTag({content:'.peek-desktop-slot[data-guide=true],.peek-desktop-slot[data-guide=true]>button,.peek-desktop-grid {overflow:visible!important}.peek-desktop-slot[data-guide=false] {visibility:hidden!important}'});
   await report(p,'one-row-unclipped');await clipStyle.evaluate(e=>e.remove());
 const [before,unclipped]=await Promise.all(['one-row','one-row-unclipped'].map(async id=>PNG.sync.read(await fs.readFile(path.join(evidence,id+'.png')))));
 const grid=await p.locator('.peek-desktop-grid').evaluate(g=>{const r=g.getBoundingClientRect(),d=devicePixelRatio;return {l:Math.floor(r.x*d)-1,r:Math.ceil(r.right*d)+1,t:Math.floor(r.y*d),b:Math.ceil(r.bottom*d)};});
 let affected=0;for(let y=grid.t;y<grid.b;y++)for(let x=grid.l;x<grid.r;x++){const i=(y*before.width+x)*4;if(Math.abs(before.data[i]-unclipped.data[i])>2)affected++;}
 console.log('Desktop preview pixels changed when removing the clip:',affected);
 await p.locator('.foundation-tool-navigation').getByRole('tab',{name:'任务栏',exact:true}).click();await p.waitForTimeout(500);
 await p.screenshot({path:path.join(evidence,'settings-taskbar.png')});
 const labels=await p.locator('.tb42-slide[data-active=true] .taskbar-cell-label').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,text:n.textContent})));
 assert.equal(labels.length,6);
 const issues=[];
 if(affected)issues.push(`Desktop preview clipped ${affected} text pixels`);
 if(labels.some(n=>n.tag!=='text'||!n.text))issues.push('Taskbar labels were converted to bitmap coverage rather than rendered as text');
 assert.deepEqual(issues,[]);
  await p.getByRole('button',{name:'深色',exact:true}).click();
  await p.waitForFunction(()=>document.documentElement.dataset.appearanceMode==='dark');
  await p.waitForTimeout(210);
  await p.screenshot({path:path.join(evidence,'settings-taskbar-dark.png')});
  await p.locator('.foundation-tool-navigation').getByRole('tab',{name:'桌面',exact:true}).click();
  const grip=axis=>p.locator('.peek-desktop-grip.'+axis);
  for(const [columns,rows,keys] of [[1,1,[['right','ArrowLeft'],['right','ArrowLeft']]],[2,2,[['right','ArrowRight'],['bottom','ArrowDown']]],[3,3,[['right','ArrowRight'],['bottom','ArrowDown']]]]){
    for(const [axis,key] of keys)await grip(axis).press(key);
    await p.locator(`.peek-desktop-preview[data-columns="${columns}"][data-rows="${rows}"]`).waitFor();
    await report(p,`settings-${columns}x${rows}`);
  }
  assert.equal(await p.locator('.peek-desktop-editor [data-readout-ink]').count(),0,'Values should render as text');
  const library=p.locator('.peek-desktop-editor .tb42-library');
  await theme(p,'light');
  await library.getByRole('button',{name:'网络',exact:true}).click();
  const ping=library.locator('[data-metric=ping] [data-variant=english] text');
  const y=await ping.evaluate(n=>{
   const svg=n.ownerSVGElement,ctx=document.createElement('canvas').getContext('2d');ctx.font=getComputedStyle(n).font;
   const bounds=ctx.measureText('Pino');
   return {bodyCenter:Number(n.getAttribute('y'))+(bounds.actualBoundingBoxDescent-bounds.actualBoundingBoxAscent)/2,cellCenter:svg.viewBox.baseVal.height/2};
  });
  assert(Math.abs(y.bodyCenter-y.cellCenter)<.15,'Ping body is not visually centered');
  assert.match(await library.locator('[data-metric=ping] [data-library-part=number] svg').getAttribute('aria-label'),/23 ms$/);
  assert.match(await library.locator('[data-metric=loss] [data-library-part=number] svg').getAttribute('aria-label'),/0 %$/);
  await report(p,'settings-network');
  await library.getByRole('button',{name:'内存',exact:true}).click();await report(p,'settings-memory');
  await library.getByRole('button',{name:'GPU',exact:true}).click();
  const fan=library.locator('[data-metric=gpuFan] [data-library-part=number]');
  assert.equal(await fan.getAttribute('title'),'显卡驱动未提供风扇读数');
  assert.match(await library.locator('[data-metric=gpuPower] [data-library-part=number] svg').getAttribute('aria-label'),/5 W$/);
  await fan.scrollIntoViewIfNeeded();await report(p,'settings-gpu');
  await p.getByRole('tab',{name:'采集',exact:true}).click();
  const enable=p.getByRole('checkbox',{name:'探测默认网关'});assert.equal(await enable.isChecked(),false);
  await p.screenshot({path:path.join(evidence,'settings-sampling.png')});
  await p.getByRole('button',{name:'深色',exact:true}).click();
 await p.waitForFunction(()=>document.documentElement.dataset.appearanceMode==='dark');
 await p.screenshot({path:path.join(evidence,'settings-sampling-dark.png')});
 await enable.check();await p.locator('.widget-settings-actions').getByRole('button',{name:'应用',exact:true}).click();
  await p.getByRole('status').filter({hasText:'已应用'}).waitFor();
  assert.equal(JSON.parse(await fs.readFile(path.join(data,'preferences.json'),'utf8')).widgetMonitoring.probeGateway,true);
 await p.getByRole('tab',{name:'关于',exact:true}).click();
 const heading=p.getByRole('heading',{name:'关于与更新'});await heading.waitFor();
 const hierarchy=await heading.evaluate(h=>[h,h.closest('main').querySelector('.widget-settings-actions>.button')].map(node=>getComputedStyle(node).fontSize));
 assert.deepEqual(hierarchy,['19px','13px'],'page title and footer text should each grow one step');
 await p.screenshot({path:path.join(evidence,'settings-about-dark.png')});
 await p.getByRole('button',{name:'浅色',exact:true}).click();
 await p.waitForFunction(()=>document.documentElement.dataset.appearanceMode==='light');
 await p.screenshot({path:path.join(evidence,'settings-about-light.png')});

});
console.log('Packaged Peek clarity check passed:',evidence);
