import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const [exe,evidence]=process.argv.slice(2).map(arg=>path.resolve(arg));
const helper=fileURLToPath(new URL('./peek-native-menu-capture.ps1',import.meta.url));
const baseline=process.argv.includes('--baseline');
const version=process.env.PEEK_TEST_VERSION??'0.1.3';
const next=version.replace(/\d+$/,patch=>String(Number(patch)+1));
await fs.mkdir(evidence,{recursive:true});
const data=await fs.mkdtemp(path.join(evidence,'isolated-'));
await fs.writeFile(path.join(data,'preferences.json'),JSON.stringify({language:'zh-CN',widgetAutoCheckUpdates:false,widgetTrayVisible:false,taskbar:{enabled:false},widgetMonitoring:{probeGateway:false},widgetDesktop:{enabled:false}}));
const srv=createServer();await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;await new Promise(r=>srv.close(r));
const child=spawn(exe,['--smoke',data,'--debug-port',String(port)],{cwd:path.dirname(exe),windowsHide:true,stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser,p;
const bridge=(method,params={})=>p.evaluate(({method,params})=>new Promise((resolve,reject)=>{const w=chrome.webview,id=crypto.randomUUID();const f=e=>{if(e.data.id!==id)return;clearTimeout(timer);w.removeEventListener('message',f);e.data.ok?resolve(e.data.result):reject(Error(e.data.error))};const timer=setTimeout(()=>{w.removeEventListener('message',f);reject(Error(method+' timeout'))},6000);w.addEventListener('message',f);w.postMessage({id,method,params});}),{method,params});
const tab=(name)=>p.getByRole('tab',{name,exact:true});
const shot=(name)=>p.screenshot({path:path.join(evidence,name+'.png'),animations:'disabled'});
const report={};
const updateButton=()=>p.locator('.widget-about-action:visible');
async function buttonGeometry(){return updateButton().evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,radius:getComputedStyle(el).borderRadius}})}
async function fixture(revision){await fs.writeFile(path.join(data,'peek-update.test.txt'),`302\n/1159112519/Peek/releases/tag/v${revision}\n`);await updateButton().click()}
try{
 for(let i=0;i<100&&!p;i++){if(child.exitCode!==null)throw Error('Peek exited early');if(!browser?.isConnected())try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:600})}catch{}p=browser?.contexts().flatMap(c=>c.pages()).find(page=>page.url().startsWith('https://asterhub.local'));if(!p)await wait(250);}
 assert(p);p.setDefaultTimeout(6000);
 await p.locator('.widget-page:visible').waitFor({timeout:12000});
 const initial=await bridge('desktop.settings');assert.equal(initial.appInfo.version,version);
 for(const mode of baseline?['light']:['light','dark']){
  const pages=report[mode]={};
  await bridge('widget.appearance',{mode});await p.waitForFunction(m=>document.documentElement.dataset.appearanceMode===m,mode);await p.evaluate(()=>document.fonts.ready);
  for(const [name,id] of [['常规','general'],['任务栏','taskbar'],['桌面','desktop'],['采集','sampling'],['关于','about']]){
   await tab(name).click();
   const page=p.locator('.widget-page:visible');
   pages[id]=await page.innerText();
   if(!baseline)assert.doesNotMatch(pages[id],/\ufffd|缁勪欢|棰滆壊|浣嶇疆|鍚嶇О|璇绘暟|鍥惧舰/);
   if(!baseline)await shot(id+'-'+mode);
   if(id==='taskbar'){
    const editor=p.getByRole('tablist',{name:'任务栏编辑方式'});
    const names=await editor.getByRole('tab').allTextContents();
    if(baseline){console.log('Baseline editor tabs:',JSON.stringify(names));await shot('taskbar-encoding-before');assert.notDeepEqual(names,['组件','颜色','位置']);continue;}
    assert.deepEqual(names,['组件','颜色','位置']);
    await tab('颜色').click();await p.getByRole('columnheader',{name:'名称',exact:true}).waitFor();
    await p.getByRole('columnheader',{name:'读数',exact:true}).waitFor();await p.getByRole('columnheader',{name:'图形',exact:true}).waitFor();
    const colorSpec=await p.locator('.tb-color-panel:visible').evaluate(el=>{
     const table=el.querySelector('.tb-color-table'), sample=el.querySelector('.tb-color-row [role="columnheader"]'), category=el.querySelector('.tb42-categories .control-label');
     return [getComputedStyle(table).backgroundColor,getComputedStyle(sample).fontSize,getComputedStyle(category).fontSize];
    });
    assert.deepEqual(colorSpec,['rgba(0, 0, 0, 0)','12px','12px']);
    await shot('taskbar-colors-'+mode);
    const colorChip=p.getByRole('button',{name:'CPU 利用率 · 名称颜色',exact:true});
    await colorChip.click();
    const picker=p.locator('.tb-color-picker');
    const format=picker.getByRole('combobox',{name:'颜色格式',exact:true});
    const hex=picker.getByRole('textbox',{name:'HEX',exact:true});
    await hex.fill('#AA7733');
    const shape=await format.evaluate(el=>{
     const cs=getComputedStyle(el),box=el.getBoundingClientRect();
     const input=getComputedStyle(el.nextElementSibling),arrow=el.querySelector('svg').getBoundingClientRect(),text=el.querySelector('span').getBoundingClientRect();
     return {height:box.height,inputHeight:parseFloat(input.height),radius:cs.borderRadius,inputRadius:input.borderRadius,font:cs.fontSize,inputFont:input.fontSize,labelFits:text.right<=arrow.left&&arrow.right<box.right};
    });
    assert.equal(shape.height,shape.inputHeight);assert.equal(shape.radius,shape.inputRadius);assert.equal(shape.font,shape.inputFont);assert(shape.labelFits);
    const list=p.getByRole('listbox',{name:'颜色格式',exact:true});
    await format.click();await list.waitFor();
    assert.deepEqual(await list.getByRole('option').allTextContents(),['HEX','RGB']);
    assert(await list.evaluate(el=>{
     const box=el.firstElementChild.getBoundingClientRect(),hit=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);
     const css=getComputedStyle(el),theme=getComputedStyle(document.documentElement);
     return el.contains(hit)&&css.backgroundImage.includes(theme.getPropertyValue('--surface2').trim().startsWith('#')?'rgb(':'gradient')&&css.color===getComputedStyle(document.querySelector('.tb-color-picker')).color;
    }));
    await shot('color-format-'+mode);
    await p.keyboard.press('Escape');await list.waitFor({state:'hidden'});assert(await picker.isVisible());
    await format.click();await list.getByRole('option',{name:'RGB',exact:true}).click();
    assert.equal(await picker.getByRole('textbox',{name:'RGB',exact:true}).inputValue(),'170, 119, 51');
    await format.press('Enter');await list.waitFor();await format.press('Home');await format.press('Enter');
    assert.equal(await hex.inputValue(),'#AA7733');
    await picker.getByRole('button',{name:'取消',exact:true}).click();await picker.waitFor({state:'hidden'});
   }
  }
  if(baseline){await shot('about-before');continue;}
  await p.getByRole('checkbox',{name:'启动时自动检查更新'}).waitFor();
  await p.getByText('启动时静默检查，发现新版本后询问。',{exact:true}).waitFor();
  const rows=await p.locator('.widget-about-entry:visible').evaluateAll(els=>els.map(e=>[e.offsetHeight,e.offsetWidth,getComputedStyle(e).borderRadius]));
  assert.equal(rows.length,3);assert(rows.every(([h,w,r])=>h===rows[0][0]&&Math.abs(w-rows[0][1])<=1&&r===rows[0][2]));
  for(const [label,count] of [['最近更新',3]]){
   await p.getByRole('button',{name:new RegExp('^'+label)}).click();
   const dialog=p.getByRole('dialog',{name:label,exact:true});
   await dialog.waitFor();assert.equal(await dialog.locator('article').count(),count);
   await dialog.getByText('v'+version,{exact:true}).waitFor();
   await shot((count===1?'version-log-':'recent-')+mode);
   await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  }
  await p.getByRole('button',{name:/^版本日志/}).click();
  assert.equal(await p.getByRole('dialog',{name:'版本日志',exact:true}).count(),0);
  let releaseUrl;for(let i=0;i<30&&!releaseUrl;i++){releaseUrl=await fs.readFile(path.join(data,'peek-open-version.test.txt'),'utf8').catch(()=>null);if(!releaseUrl)await wait(100);}
  assert.equal(releaseUrl?.replace(/^\ufeff/,''),'https://github.com/1159112519/Peek/releases/tag/v'+version);
  await p.getByRole('button',{name:/^GitHub/}).click();
  let url;for(let i=0;i<30&&!url;i++){url=await fs.readFile(path.join(data,'peek-open-github.test.txt'),'utf8').catch(()=>null);if(!url)await wait(100);}
  assert.equal(url?.replace(/^\ufeff/,''),'https://github.com/1159112519/Peek');
  const g=await buttonGeometry();
  if(mode==='light'){
   await fixture(version);await p.getByText('当前已是最新版本',{exact:true}).waitFor();
   await shot('about-light-current');
  }else{
   await fixture(next);await p.getByRole('button',{name:'安装并重启',exact:true}).waitFor();
   assert.deepEqual(await buttonGeometry(),g);
   await shot('about-dark-install');
  }
 }
 if(!baseline&&!process.argv.includes('--skip-menu')){
  const {pid}=await bridge('widget.smoke.window-state');
  const suite=[['tray','Escape'],['taskbar','Outside'],['tray','Escape'],['desktop','SelectSettings']];
  for(const [idx,[surface,action]] of suite.entries()){
   execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-PeekPid',String(pid),'-ActivateSettings'],{windowsHide:true,stdio:'inherit'});
   await bridge('widget.smoke.menu',{surface});await wait(400);
   execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',helper,'-PeekPid',String(pid),'-Out',path.join(evidence,`native-menu-${idx}-${surface}.png`),'-Action',action],{windowsHide:true,stdio:'inherit'});
  }
  assert(await p.getByRole('tab',{name:'关于',exact:true}).isVisible());
  await assert.rejects(fs.access(path.join(data,'WebViewPopups')));
 }
 console.log('Packaged UI smoke completed');
}finally{
 await fs.writeFile(path.join(evidence,'settings-text.json'),JSON.stringify(report,null,2));
 if(p&&!p.isClosed())await bridge('widget.smoke.quit').catch(()=>{});
 if(browser?.isConnected())await browser.close().catch(()=>{});
 if(!p||child.exitCode===null){
  const log=await fs.readFile(path.join(data,'Diagnostics/asterhub.log'),'utf8').catch(()=>null);
  const pid=log?.match(/\[(\d+)\] session/)?.[1];
  if(pid){const root=data.replaceAll("'","''");try{execFileSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p -and $p.Path -like '${root}\\PortableRuntime\\*\\PeekHost.exe'){Stop-Process -Id $p.Id}`],{windowsHide:true})}catch{}}
 }
 for(let i=0;i<40&&child.exitCode===null;i++)await wait(100);
}
