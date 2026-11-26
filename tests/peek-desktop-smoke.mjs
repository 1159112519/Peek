import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import { createRequire } from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const nativeInput=process.env.PEEK_NATIVE_INPUT;
const controls=nativeInput?spawn(path.resolve(nativeInput),[],{stdio:['pipe','pipe','inherit'],windowsHide:true}):null;
const responses=controls?createInterface({input:controls.stdout}):null;
const input=async(...args)=>{const pending=once(responses,'line');controls.stdin.write(args.join('|')+'\n');const [status,result]=(await pending)[0].split('|');assert.equal(status,'ok');return result;};
const exe=path.resolve(process.argv[2]), evidence=path.resolve(process.argv[3]);
await fs.mkdir(evidence,{recursive:true});const data=await fs.mkdtemp(path.join(evidence,'data-'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const bridge=(p,method,params={})=>p.evaluate(({method,params})=>new Promise((resolve,reject)=>{
 const web=chrome.webview,id=crypto.randomUUID();
 function received(e){if(e.data.id!==id)return;clearTimeout(timer);web.removeEventListener('message',received);e.data.ok?resolve(e.data.result):reject(Error(e.data.error));}
 const timer=setTimeout(()=>{web.removeEventListener('message',received);reject(Error(method+' timeout'));},5000);
 web.addEventListener('message',received);web.postMessage({id,method,params});
}),{method,params});
const apply=async p=>{await p.locator('.widget-settings-actions').getByRole('button',{name:'应用',exact:true}).click();await p.getByRole('status').filter({hasText:'已应用'}).waitFor();};
async function drag(p,selector,dx,dy){const el=p.locator(selector);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width/2+dx,b.y+b.height/2+dy,{steps:12});await p.mouse.up();await wait(220);}
async function run(body){
 const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const child=spawn(exe,['--smoke',data,'--debug-port',String(port),...(process.env.PEEK_SMOKE_TASKBAR==='1'?['--smoke-taskbar']:[])],{cwd:path.dirname(exe),stdio:'ignore',windowsHide:true});
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
}
const telemetry=async p=>(await bridge(p,'widget.smoke.monitoring')).desktop;
const options=p=>bridge(p,'desktop.settings');
const dimensions=p=>p.locator('.peek-desktop-preview').evaluate(el=>`${el.dataset.columns} × ${el.dataset.rows}`);
await run(async p=>{
 assert.equal(await dimensions(p),'3 × 2');
 assert.equal(await p.locator('.peek-desktop-dimensions').count(),0);
 assert.equal(await p.locator('.peek-desktop-grip').count(),2);
 assert.equal(await p.locator('.peek-desktop-grip.corner').count(),0);
 await drag(p,'.peek-desktop-grip.bottom',0,130);assert.equal(await dimensions(p),'3 × 3');
 // Keep the full readout clickable, not just its center; the resize handles must stay outside.
 const covered=await p.locator('.peek-desktop-slot[data-guide=true]>button').evaluateAll(buttons=>buttons.flatMap((b,index)=>{
  const r=b.getBoundingClientRect();
  return [[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1]].flatMap(([x,y])=>document.elementFromPoint(x,y)?.closest(".peek-desktop-grip")?[index]:[]);
 }));
 assert.deepEqual(covered,[],'resize handle covers visible readout');
 await p.locator('.peek-desktop-slot[data-guide=true]').nth(8).getByRole('button').click();
 await p.getByRole('navigation',{name:'组件分类'}).getByRole('button',{name:'GPU',exact:true}).click();
 await p.getByRole('button',{name:'GPU 温度 数字',exact:true}).click();
 await p.getByRole('checkbox',{name:'显示桌面监测',exact:true}).check();
 await p.getByRole('checkbox',{name:'全屏时隐藏',exact:true}).uncheck(); // Tests must show the isolated widget even if the host is fullscreen.
 await p.getByRole('slider',{name:'背景不透明度'}).fill('67');
 await p.locator('.widget-settings-body:visible').evaluate(el=>el.scrollTop=0);
 await p.screenshot({path:path.join(evidence,'desktop-settings-3x3.png'),animations:'disabled'});
 await p.getByRole('button',{name:'浅色',exact:true}).click();
 await wait(280);await p.screenshot({path:path.join(evidence,'desktop-settings-light.png'),animations:'disabled'});
 const panel=p.locator('.peek-desktop-editor .tb43-editor-panes');
 await panel.screenshot({path:path.join(evidence,'desktop-library-light.png'),animations:'disabled'});
 const nav=p.locator('.foundation-tool-navigation');
 await nav.getByRole('tab',{name:'任务栏',exact:true}).click();
 await p.locator('.taskbar-settings .tb43-editor-panes:visible').screenshot({path:path.join(evidence,'taskbar-library-reference.png'),animations:'disabled'});
 await nav.getByRole('tab',{name:'桌面',exact:true}).click();
 await p.getByRole('tab',{name:'颜色',exact:true}).click();await p.getByRole('table',{name:'按指标设置颜色'}).waitFor();
 await p.screenshot({path:path.join(evidence,'desktop-settings-colors.png'),animations:'disabled'});
 await p.getByRole('tab',{name:'位置',exact:true}).click();await p.getByRole('textbox',{name:'显示文字'}).waitFor();
 await p.screenshot({path:path.join(evidence,'desktop-settings-position.png'),animations:'disabled'});
 await p.getByRole('tab',{name:'组件',exact:true}).click();
 const cdp=await p.context().newCDPSession(p);
 const viewport=await p.evaluate(()=>({height:window.innerHeight,dpr:window.devicePixelRatio}));
 try{
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:480,height:viewport.height,deviceScaleFactor:viewport.dpr,mobile:false});
  await p.locator('.widget-settings-body:visible').evaluate(el=>el.scrollTop=0);
  await p.screenshot({path:path.join(evidence,'desktop-settings-narrow.png'),animations:'disabled'});
  await panel.screenshot({path:path.join(evidence,'desktop-library-narrow.png'),animations:'disabled'});
 }finally{await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();}
 await apply(p);let saved=(await options(p)).desktop;
 assert.equal(saved.backgroundOpacity,67);assert.equal(saved.cells[8],'gpuTemperature');assert.equal(saved.rows,3);
 await wait(650);await capture(p,'desktop-3x3');
 await theme(p,'dark');await capture(p,'desktop-dark-3x3');
 await p.locator('.widget-settings-body:visible').evaluate(el=>el.scrollTop=0);
 await p.mouse.move(4,4);await wait(175);
 const slots=p.locator('.peek-desktop-slot[data-guide=true]');
 const transparent=()=>slots.evaluateAll(items=>items.filter(slot=>getComputedStyle(slot).boxShadow.includes('rgba(0, 0, 0, 0)')).length);
 assert.equal(await transparent(),9,'no preview cell outlines should be visible at rest');
 await p.screenshot({path:path.join(evidence,'desktop-settings-dark.png'),animations:'disabled'});
 await slots.first().hover();await wait(175);assert.equal(await transparent(),8,'only the hovered preview cell gets an outline');
 await p.screenshot({path:path.join(evidence,'desktop-settings-hover.png'),animations:'disabled'});
 await p.mouse.move(4,4);
 await panel.screenshot({path:path.join(evidence,'desktop-library-dark.png'),animations:'disabled'});
 await p.getByRole('tab',{name:'颜色',exact:true}).click();
 await panel.screenshot({path:path.join(evidence,'desktop-colors-dark.png'),animations:'disabled'});
 await p.getByRole('tab',{name:'位置',exact:true}).click();
 await panel.screenshot({path:path.join(evidence,'desktop-position-dark.png'),animations:'disabled'});
 await p.getByRole('tab',{name:'组件',exact:true}).click();
 await p.locator('.peek-desktop-grip.right').press('ArrowLeft');
 assert.equal(await dimensions(p),'2 × 3');
 await p.locator('.peek-desktop-grip.bottom').press('ArrowUp');
 assert.equal(await dimensions(p),'2 × 2');
 await apply(p);await wait(250);await capture(p,'desktop-dark-2x2');
 await theme(p,'light');await capture(p,'desktop-light-2x2');
 await drag(p,'.peek-desktop-grip.right',-430,-100);
 assert.equal(await dimensions(p),'1 × 2');
 await drag(p,'.peek-desktop-grip.bottom',0,-100);assert.equal(await dimensions(p),'1 × 1');
 await apply(p);saved=(await options(p)).desktop;
 assert.equal(saved.columns,1);assert.equal(saved.rows,1);assert.equal(saved.cells[8],'gpuTemperature');
 await capture(p,'desktop-1x1');
});
await run(async p=>{
 const saved=(await options(p)).desktop;assert.equal(saved.columns,1);assert.equal(saved.rows,1);assert.equal(saved.cells[8],'gpuTemperature');
 assert.equal(await dimensions(p),'1 × 1');
 await capture(p,'desktop-1x1-restarted');
 assert.equal(await p.getByRole('button',{name:'在桌面调整',exact:true}).count(),0);
 await assert.rejects(bridge(p,'widget.desktop.edit'));
 await drag(p,'.peek-desktop-grip.right',370,120);
 assert.equal(await dimensions(p),'3 × 1');
 await drag(p,'.peek-desktop-grip.bottom',0,120);assert.equal(await dimensions(p),'3 × 3');
 assert.equal((await telemetry(p)).columns,1,'desktop must not resize before settings are applied');
 await apply(p);
 const restored=await telemetry(p);assert.equal(restored.columns,3);assert.equal(restored.rows,3);assert.equal(restored.width,restored.columnStops[2]);assert.equal(restored.height,67);
 await capture(p,'desktop-3x3-restored');
 await p.getByRole('checkbox',{name:'鼠标穿透',exact:true}).check();await apply(p);
 assert.equal((await options(p)).desktop.clickThrough,true);
 await p.getByRole('checkbox',{name:'鼠标穿透',exact:true}).uncheck();await p.getByRole('checkbox',{name:'锁定位置',exact:true}).check();await apply(p);
 if(nativeInput&&process.env.PEEK_SMOKE_MENU==='1'){
  const box=await telemetry(p), x=Math.round((box.screenLeft+box.screenRight)/2), y=Math.round((box.screenTop+box.screenBottom)/2);
  assert.equal(box.visible,true);
  await input('goto',x,y);await input('right');await wait(350);
  const menu=(await input('window','menu')).split(',').map(Number);assert(menu.length===5&&menu[1]>=0);
  await input('capture',path.join(evidence,'desktop-context-menu.png'),menu[1],menu[2],menu[3]-menu[1],menu[4]-menu[2]);
  const taskbarBefore=(await bridge(p,'taskbar.status')).host;
  // The first action is hide; click it through the native menu, not through the settings bridge.
  await input('goto',menu[1]+Math.round((menu[3]-menu[1])/2),menu[2]+Math.round((menu[4]-menu[2])*.18));await input('down');await input('up');await wait(300);
  assert.equal(await telemetry(p),null,'first desktop menu item did not hide the desktop widget');
  assert.equal((await options(p)).desktop.enabled,false);
  assert.equal((await bridge(p,'taskbar.status')).host.state,taskbarBefore.state);
  if(process.env.PEEK_SMOKE_TASKBAR==='1')assert.equal(taskbarBefore.state,'attached');
 }
 if(nativeInput&&process.env.PEEK_SMOKE_NOTIFY==='1'){
  const id=await bridge(p,'widget.smoke.notify');
  await fs.writeFile(path.join(evidence,'notification-app-id.txt'),id);
  await wait(900);await input('capture',path.join(evidence,'windows-notification.png'));
 }
});
if(controls){const finished=once(controls,'exit');controls.stdin.end();await finished;}
console.log(JSON.stringify({result:'PASS',evidence,data}));
