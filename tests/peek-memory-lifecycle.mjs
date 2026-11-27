import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const helper=fileURLToPath(new URL('./peek-memory-sample.ps1',import.meta.url));
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const exe=path.resolve(process.argv[2]);const evidence=path.resolve(process.argv[3]);await fs.mkdir(evidence,{recursive:true});
const data=await fs.mkdtemp(path.join(evidence,'isolate-'));await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify({widgetAutoCheckUpdates:false,widgetTrayVisible:false,taskbar:{enabled:false},widgetDesktop:{enabled:false},widgetMonitoring:{probeGateway:false}}));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const {port}=server.address();await new Promise(r=>server.close(r));
const args=['--smoke',data,'--debug-port',String(port)];
const launch=(extra=[])=>spawn(exe,args.concat(extra),{cwd:path.dirname(exe),windowsHide:true,stdio:'ignore'});
const child=launch(['--background']);let browser,p,pid;const phases=[];
const bridge=(method)=>p.evaluate(method=>new Promise((resolve,reject)=>{const w=chrome.webview,id=crypto.randomUUID();const receive=e=>{if(e.data.id!==id)return;clearTimeout(timer);w.removeEventListener('message',receive);e.data.ok?resolve(e.data.result):reject(Error(e.data.error))};const timer=setTimeout(()=>{w.removeEventListener('message',receive);reject(Error(method+' timeout'));},5000);w.addEventListener('message',receive);w.postMessage({id,method,params:{}});}),method);
const cli=(opts=[])=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-RootPid',String(pid),...opts],{encoding:'utf8',windowsHide:true});
async function condition(test){for(let i=0;i<40;i++){try{const v=await test();if(v)return v;}catch{}await wait(250);}throw new Error('Timed out waiting for required UI state');}
const write=()=>fs.writeFile(path.join(evidence,'memory-phases.json'),JSON.stringify(phases,null,2));
function snap(phase,state){
 const processes=JSON.parse(cli());const mib=n=>Math.round(n/104857.6)/10;
 const sample={phase,state,processes,privateWorkingSetMiB:mib(processes.reduce((sum,x)=>sum+x.privateWorkingSet,0))};
 phases.push(sample);console.log(JSON.stringify({phase,count:processes.length,privateWorkingSetMiB:sample.privateWorkingSetMiB,...state}));return processes;
}
async function connect(){
 browser=null;p=null;
 for(let i=0;i<90&&!p;i++){
  if(child.exitCode!==null)throw new Error(`launcher exited ${child.exitCode}`);
  if(!browser?.isConnected())try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:500})}catch{}
  p=browser?.contexts().flatMap(c=>c.pages()).find(x=>x.url().startsWith('https://asterhub.local')&&!x.isClosed());if(!p)await wait(250);
 }
 assert(p);await p.locator('.widget-page').first().waitFor({state:'attached',timeout:16000});
 return condition(async()=>{const s=await bridge('widget.smoke.window-state');return s.documentReady&&s.visible&&s;});
}
try{
 pid=Number(await condition(async()=>{
  const log=await fs.readFile(path.join(data,'Diagnostics','asterhub.log'),'utf8');if(!log.includes('widget-runtime-ready'))return false;
  return log.match(/\[(\d+)\] session/)?.[1];
 }));
 await wait(4000);
 assert.equal(snap('silent-start-never-opened',{}).length,1,'Silent start must not launch WebView2');
 launch();const open=await connect();assert.equal(open.pid,pid);assert(snap('settings-open',open).some(x=>x.role==='renderer'));
 await bridge('widget.close');await condition(async()=> !(await bridge('widget.smoke.window-state')).visible);
 launch();const reopened=await condition(async()=>{const s=await bridge('widget.smoke.window-state');return s.documentReady&&s.visible&&s;});
 assert.equal(reopened.pid,pid);assert(reopened.presentations>open.presentations);snap('quick-reopen',reopened);
 await bridge('widget.smoke.minimize');const minimized=await condition(async()=>{const s=await bridge('widget.smoke.window-state');return s.windowState==='Minimized'&&s;});snap('settings-minimized',minimized);
 launch();await condition(async()=> (await bridge('widget.smoke.window-state')).visible);await bridge('widget.close');
 await condition(async()=> !(await bridge('widget.smoke.window-state')).visible);snap('settings-closed-during-grace',{});
 await wait(20500);
 await condition(async()=>JSON.parse(cli()).length===1);
 assert.equal(snap('settings-released-after-idle',{}).length,1);
 launch();const cold=await connect();assert.equal(cold.pid,pid);assert(snap('cold-reopen-after-release',cold).some(x=>x.role==='renderer'));
 await bridge('widget.smoke.quit').catch(()=>{});await condition(async()=>child.exitCode!==null);assert.deepEqual(JSON.parse(cli()),[]);await write();
} finally {
 await write();
 if(pid&&child.exitCode===null){if(p&&!p.isClosed())try{await bridge('widget.smoke.quit')}catch{};await wait(350);try{process.kill(pid)}catch{}}
 if(child.exitCode===null)child.kill();if(browser?.isConnected())await browser.close().catch(()=>{});
}
