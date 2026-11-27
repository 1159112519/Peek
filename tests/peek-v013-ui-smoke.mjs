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
let browser,p,pid;
const capture=filename=>execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-PeekPid',String(pid),'-Out',path.join(evidence,filename)],{windowsHide:true});
try{
 for(let i=0;i<100&&!p;i++){if(child.exitCode!==null)throw Error('Peek exited early');if(!browser?.isConnected())try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:600})}catch{}p=browser?.contexts().flatMap(c=>c.pages()).find(page=>page.url().startsWith('https://asterhub.local'));if(!p)await wait(250);}
 assert(p); await p.locator('.widget-page:visible').waitFor({timeout:12000}); await p.evaluate(()=>document.fonts.ready);
 const result=await bridge('desktop.settings');assert.equal(result.appInfo.version,'0.1.3');({pid}=await bridge('widget.smoke.window-state'));
 for(const mode of ['light','dark']){
  await bridge('widget.appearance',{mode});await wait(350);await p.getByRole('tab',{name:'任务栏',exact:true}).click();await p.getByRole('tab',{name:'颜色',exact:true}).click();
  const header=await p.locator('.tb-color-table [role="rowheader"]').first().evaluate(el=>getComputedStyle(el).fontSize);
  const nav=await p.locator('.tb-color-panel .tb42-categories .control-label').first().evaluate(el=>getComputedStyle(el).fontSize);assert.equal(header,nav);
  await p.screenshot({path:path.join(evidence,`color-table-${mode}.png`)});
  await p.getByRole('button',{name:'CPU 利用率 · 名称颜色',exact:true}).click();let popup=p.locator('.tb-color-picker');await popup.getByRole('combobox',{name:'颜色格式'}).click();await p.getByRole('option',{name:'RGB',exact:true}).click();await popup.getByRole('textbox',{name:'RGB',exact:true}).fill('17, 78, 132');
  if(mode==='light'){await popup.getByRole('button',{name:'保存当前颜色'}).click();await popup.getByRole('button',{name:'选用自定义颜色 #114E84'}).waitFor();}
  await popup.getByRole('button',{name:'选用自定义颜色 #114E84'}).waitFor();assert(await popup.getByRole('button',{name:'屏幕取色'}).isEnabled());
  await p.screenshot({path:path.join(evidence,`color-picker-${mode}.png`)});await popup.getByRole('button',{name:'取消',exact:true}).click();
  await p.getByRole('tab',{name:'桌面',exact:true}).click();await p.getByText('桌面窗口',{exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(evidence,`desktop-${mode}.png`)});
  await p.getByRole('tab',{name:'常规',exact:true}).click();await p.getByText('配置和数据',{exact:true}).scrollIntoViewIfNeeded();await p.screenshot({path:path.join(evidence,`general-${mode}.png`)});
  await bridge('widget.smoke.menu',{surface:mode==='light'?'tray':'taskbar'});await wait(400);capture(`native-menu-${mode}.png`);
  execFileSync('powershell.exe',['-NoProfile','-Command','Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("{ESC}")'],{windowsHide:true});await wait(250);
 }
 assert.equal(await fs.stat(path.join(data,'WebViewPopups')).then(()=>true,()=>false),false,'Right-click menus created a second browser profile');
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(data,'peek-color-swatches.json'),'utf8')),['#114E84']);
 console.log(`PASS: packaged Peek v0.1.3 PID ${pid}; screenshots, equal font sizes, RGB, persisted colors, eyedropper entry, native menu without popup browser profile.`);
}finally{
 if(p&&!p.isClosed())await bridge('widget.smoke.quit').catch(()=>{});
 for(let i=0;i<60&&child.exitCode===null;i++)await wait(100);
 if(child.exitCode===null&&pid){const command=`$id=${pid}; $p=Get-CimInstance Win32_Process -Filter "ProcessId=$id"; if($p.Name -eq 'PeekHost.exe' -and $p.CommandLine.Contains('${data.replaceAll("'","''")}')){Stop-Process -Id $id}`;try{execFileSync('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true})}catch{}}
 if(browser?.isConnected())await browser.close().catch(()=>{});
}
