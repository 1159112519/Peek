import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const exe=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),helper=fileURLToPath(new URL('./peek-native-menu-capture.ps1',import.meta.url));
await fs.mkdir(evidence,{recursive:true});const data=await fs.mkdtemp(path.join(evidence,'isolated-'));
await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify({widgetAutoCheckUpdates:false,widgetTrayVisible:false,taskbar:{enabled:false},widgetMonitoring:{probeGateway:false},widgetDesktop:{enabled:false}}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const bridge=(method,params={})=>p.evaluate(({method,params})=>new Promise((resolve,reject)=>{const w=chrome.webview,id=crypto.randomUUID();const f=e=>{if(e.data.id!==id)return;clearTimeout(timer);w.removeEventListener('message',f);e.data.ok?resolve(e.data.result):reject(Error(e.data.error))};const timer=setTimeout(()=>{w.removeEventListener('message',f);reject(Error(method+' timeout'))},6000);w.addEventListener('message',f);w.postMessage({id,method,params});}),{method,params});
const srv=createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;await new Promise(r=>srv.close(r));
const child=spawn(exe,['--smoke',data,'--debug-port',String(port)],{cwd:path.dirname(exe),windowsHide:true,stdio:'ignore'});
let browser,p,pid,swatches;
const capture=filename=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-PeekPid',String(pid),'-Out',path.join(evidence,filename)],{windowsHide:true});
try{
 for(let i=0;i<100&&!p;i++){if(child.exitCode!==null)throw Error('Peek exited early');if(!browser?.isConnected())try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:600})}catch{}p=browser?.contexts().flatMap(c=>c.pages()).find(page=>page.url().startsWith('https://asterhub.local'));if(!p)await wait(250);}
 assert(p); await p.locator('.widget-page:visible').waitFor({timeout:12000}); await p.evaluate(()=>document.fonts.ready);
 const result=await bridge('desktop.settings');assert.equal(result.appInfo.version,'0.1.3');({pid}=await bridge('widget.smoke.window-state'));
 const mode=process.argv.includes('--browser-baseline');
 if(!mode)execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-PeekPid',String(pid),'-ActivateSettings','-RaiseOnly'],{windowsHide:true,stdio:'inherit'});
 await p.getByRole('tab',{name:'任务栏',exact:true}).click();await p.getByRole('tab',{name:'颜色',exact:true}).click();
 await p.getByRole('button',{name:'CPU 利用率 · 名称颜色',exact:true}).click();
 const popup=p.locator('.tb-color-picker');
 await popup.getByRole('textbox',{name:'HEX',exact:true}).fill('#FF0000');
 const pick=popup.getByRole('button',{name:'屏幕取色'});
 if(mode){
  await p.evaluate(()=>{
   window.peekProbe={supported:typeof EyeDropper==='function'};
   const original=EyeDropper.prototype.open;EyeDropper.prototype.open=function(...args){
    const start=performance.now();Object.assign(window.peekProbe,{activation:navigator.userActivation.isActive,focus:document.hasFocus(),status:'pending'});
    const result=original.apply(this,args);result.then(value=>Object.assign(window.peekProbe,{status:'resolved',value,ms:performance.now()-start}),error=>Object.assign(window.peekProbe,{status:'rejected',error:String(error),ms:performance.now()-start}));return result;
   };
  });
  await pick.click();await wait(850);const actual=await p.evaluate(()=>window.peekProbe);
  console.log(JSON.stringify(actual));await fs.writeFile(path.join(evidence,'browser-eyedropper.json'),JSON.stringify(actual,null,2));
  assert.equal(actual.status,'pending','Browser eyedropper closes before sampling');
 }else{
  const input=fileURLToPath(new URL('./peek-eyedropper-input.ps1',import.meta.url));
  await p.evaluate(()=>{
   const w=chrome.webview,send=w.postMessage.bind(w),ids=new Set();window.peekColorRun=[];
   w.postMessage=message=>{if(message.method==='widget.colors.pick'){ids.add(message.id);window.peekColorRun.push({appRequest:message.id})}send(message)};
   w.addEventListener('message',({data})=>{if(ids.has(data?.id)||data?.type==='widget-visibility')window.peekColorRun.push(data)});
  });
  const fixture=fileURLToPath(new URL('./peek-eyedropper-swatches.ps1',import.meta.url));
  swatches=spawn('powershell.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',fixture,'-ParentPid',String(process.pid)],{windowsHide:true,stdio:'inherit'});
  const nativeInput=(action,hex='',x='0',y='0')=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',input,'-PeekPid',String(action==='Probe'?swatches.pid:pid),'-Action',action,'-Hex',hex||'#000000','-X',x,'-Y',y],{windowsHide:true,encoding:'utf8'}).trim();
  const open=async()=>{
   await p.waitForFunction(()=>document.querySelector('button[aria-label="屏幕取色"]')?.disabled===false,undefined,{timeout:6000});
   const {x,y}=await pick.evaluate(el=>{const r=el.getBoundingClientRect();return {x:Math.round((r.x+r.width/2)*devicePixelRatio),y:Math.round((r.y+r.height/2)*devicePixelRatio)}});
   nativeInput('Open','',String(x),String(y));
  };
  const sample=async requested=>{

   const [x,y,screen]=nativeInput('Probe',requested).split(',');
   assert.match(screen,/^#[0-9A-F]{6}$/);
   await open();nativeInput('Click',screen,x,y); console.log(JSON.stringify({requested,screen,x,y}));
   return {requested,screen,x:Number(x),y:Number(y)};
  };
  const green=await sample('#149571');
  await p.waitForFunction(v=>document.querySelector('input[aria-label="HEX"]')?.value===v,green.screen,{timeout:6000});
  await popup.getByRole('combobox',{name:'颜色格式'}).click();await p.getByRole('option',{name:'RGB',exact:true}).click();const blue=await sample('#A789E0'); assert.notEqual(blue.screen,green.screen);
  const rgb=blue.screen.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ');
  await p.waitForFunction(v=>document.querySelector('input[aria-label="RGB"]')?.value===v,rgb,{timeout:6000});
  await open();nativeInput('Escape');await pick.waitFor({state:'visible'});
  await p.waitForFunction(()=>document.querySelector('button[aria-label="屏幕取色"]')?.disabled===false,undefined,{timeout:6000});
  assert.equal(await popup.getByRole('textbox',{name:'RGB',exact:true}).inputValue(),rgb);
  await fs.writeFile(path.join(evidence,'screen-colors.json'),JSON.stringify({green,blue,rgb,escaped:true},null,2));
  await popup.getByRole('button',{name:'确定',exact:true}).click();
  await p.getByRole('button',{name:'CPU 利用率 · 名称颜色',exact:true}).click();
  assert.equal(await popup.getByRole('textbox',{name:'HEX',exact:true}).inputValue(),blue.screen);
  await p.screenshot({path:path.join(evidence,'picked-and-applied.png')});
  console.log('PASS: two actual screen clicks produced exact HEX / RGB; Esc did not overwrite color; accepted color persisted in the editor.');
 }
}catch(error){
 if(p&&!p.isClosed()){
  const diagnostic=await p.evaluate(()=>({events:window.peekColorRun,popup:document.querySelector('.tb-color-picker')?.innerText,fields:Array.from(document.querySelectorAll('.tb-color-picker input')).map(el=>[el.ariaLabel,el.value])})).catch(()=>null);
  console.error(JSON.stringify(diagnostic));await fs.writeFile(path.join(evidence,'failure.json'),JSON.stringify(diagnostic,null,2));
 }
 throw error;
}finally{
 if(swatches&&swatches.exitCode===null)swatches.kill();
 if(p&&!p.isClosed())await bridge('widget.smoke.quit').catch(()=>{});
 for(let i=0;i<60&&child.exitCode===null;i++)await wait(100);
 if(child.exitCode===null&&pid){const command=`$id=${pid}; $p=Get-CimInstance Win32_Process -Filter "ProcessId=$id"; if($p.Name -eq 'PeekHost.exe' -and $p.CommandLine.Contains('${data.replaceAll("'","''")}')){Stop-Process -Id $id}`;try{execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true})}catch{}}
 if(browser?.isConnected())await browser.close().catch(()=>{});
}
