import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright');
const [oldExe,fixture,evidence,kind]=process.argv.slice(2).map((arg,i)=>i<3?path.resolve(arg):arg);
assert(['portable','installed','bad-hash'].includes(kind));
const currentVersion=process.env.PEEK_TEST_FROM??'0.1.2',targetVersion=process.env.PEEK_TEST_TO??'0.1.3';
const legacy=process.env.PEEK_TEST_LEGACY==='1';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const data=path.join(evidence,'data');const launcher=path.join(evidence,'Peek.exe');
await fs.mkdir(path.join(data,'Fixture'),{recursive:true});
await fs.copyFile(oldExe,launcher);
const original=await hash(launcher);
const isInstaller=kind==='installed';
const assetName=isInstaller?`Peek-Setup-v${targetVersion}.exe`:'Peek.exe';
const updateAsset=path.join(data,'Fixture',assetName);
await fs.copyFile(path.join(fixture,assetName),updateAsset);
// Install the version fixture immediately before the manual check, so startup cannot race the assertion.
await fs.writeFile(path.join(data,'peek-update-package.test.txt'),`${isInstaller?'installed':'portable'}\n${kind==='bad-hash'?'0'.repeat(64):await hash(updateAsset)}\n`);
const server=createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const {port}=server.address();await new Promise(resolve=>server.close(resolve));
const child=spawn(launcher,['--smoke',data,'--debug-port',String(port)],{cwd:evidence,stdio:'ignore',windowsHide:true});
let browser,p;
async function attach(){
 for(let i=0;i<140;i++){
  if(!browser?.isConnected())try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port,{timeout:550});}catch{}
  const page=browser?.contexts().flatMap(c=>c.pages()).find(page=>page.url().startsWith('https://asterhub.local')&&!page.isClosed());
  if(page){page.setDefaultTimeout(12000);await page.locator('.widget-page:visible').waitFor();await page.evaluate(()=>document.fonts.ready);return page;}
  await wait(250);
 }
 throw Error('Peek WebView2 did not start: '+data);
}
const pageErrors=[];
const about=()=>p.getByRole('tab',{name:'关于',exact:true}).click();
const button=(name)=>p.getByRole('button',{name,exact:true});
const check=(state)=>p.locator(`.widget-about-status[data-state="${state}"]`).waitFor();
const screenshot=(name)=>p.screenshot({path:path.join(evidence,`${name}.png`),animations:'disabled'});
const theme=async(name,dataset)=>{await button(name).click();await p.waitForFunction(mode=>document.documentElement.dataset.appearanceMode===mode,dataset);};
try{
 p=await attach();p.on('pageerror',e=>pageErrors.push(e.message));
 await about();await p.locator('.widget-about-meta').getByText(new RegExp(`^(?:版本 )?v${currentVersion.replaceAll(".","\\.")}$`)).waitFor();await theme('浅色','light');
 const auto=p.getByLabel('启动时自动检查更新');const oldAuto=await auto.isChecked();await auto.setChecked(!oldAuto);
 const apply=p.locator('.widget-settings-actions').getByRole('button',{name:'应用',exact:true});await apply.click();await p.getByRole('status').filter({hasText:'已应用'}).waitFor();
 const checkButton=button('检查更新');
 const shape=button=>button.evaluate(node=>{
  const css=getComputedStyle(node);
  return [css.borderRadius,css.borderWidth,css.borderStyle,css.fontSize,css.fontWeight];
 });
 const before=await checkButton.boundingBox();assert(before);
 const beforeShape=await shape(checkButton);
 await screenshot('检查更新-浅色');
 await fs.writeFile(path.join(data,'peek-update.test.txt'),`302\n/1159112519/Peek/releases/tag/v${targetVersion}\n`);
 await checkButton.click();await check('available');
 if(!legacy){
  const identity=p.locator('.widget-about-identity');
  const originalSlot=identity.getByRole('button',{name:'安装并重启',exact:true});
  assert.equal(await identity.getByRole('button').count(),1);
  assert.equal(await p.locator('#widget-about-updates + .widget-option-list').getByRole('button').count(),1);
  assert.equal(await checkButton.count(),0);
  assert.equal(await button('下载更新').count(),0);
  const after=await originalSlot.boundingBox();assert(after);
  assert.deepEqual(after,before,"Keep the original check button bounds");
  assert.deepEqual(await shape(originalSlot),beforeShape);
  assert(await originalSlot.evaluate(node=>{
   const label=node.querySelector('.widget-about-action-label'),range=document.createRange();
   range.selectNodeContents(label);
   const text=range.getBoundingClientRect(),box=node.getBoundingClientRect();
   return text.left>=box.left+8&&text.right<=box.right-8&&text.top>=box.top&&text.bottom<=box.bottom;
  }),'The new label fits inside the unchanged button');
 }
 await screenshot('发现更新-浅色');
 await theme('深色','dark');await screenshot('发现更新-深色');
 const install=button('安装并重启');
 if(!legacy){
  await auto.setChecked(oldAuto);
  assert(await install.isDisabled(),'Do not start an update with unsaved settings');
  await auto.setChecked(!oldAuto);
  await apply.click();await p.getByRole('status').filter({hasText:'已应用'}).waitFor();
 }
 await button(legacy?'下载更新':'安装并重启').click();
 if(kind==='bad-hash'){
  await check('applyError');await p.getByText(/SHA-256/).waitFor();assert.equal(await hash(launcher),original);assert.equal(child.exitCode,null);if(legacy)assert.equal(await install.count(),0);else assert(await install.isEnabled(),'Allow retry after a download verification failure');await screenshot('拒绝错误哈希');
 }else{
  if(legacy){await check('ready');await screenshot('安装并重启-深色');await install.click();}
  for(let i=0;i<120&&child.exitCode===null;i++)await wait(250);
  assert.equal(child.exitCode,0,'old Peek did not exit cleanly');
  await browser.close().catch(()=>{});browser=null;p=null;
  p=await attach();await about();await p.locator('.widget-about-meta').getByText(new RegExp(`^(?:版本 )?v${targetVersion.replaceAll(".","\\.")}$`)).waitFor();
  assert.equal(await p.getByLabel('启动时自动检查更新').isChecked(),!oldAuto,'automatic check setting was not preserved');
  await p.waitForFunction(()=>document.documentElement.dataset.appearanceMode==='dark');await screenshot('重启后版本-深色');
  const updates=path.join(data,'Updates');const dirs=await fs.readdir(updates);assert.equal(dirs.length,1);
  const job=path.join(updates,dirs[0]);let completed='';for(let i=0;i<100&&!completed;i++){completed=await fs.readFile(path.join(job,'completed.txt'),'utf8').catch(()=>null);if(!completed)await wait(100);}
  assert.equal(completed,targetVersion,await fs.readFile(path.join(job,'error.txt'),'utf8').catch(()=>''));
  assert.equal(await hash(launcher),await hash(path.join(fixture,'Peek.exe')));
  if(isInstaller)assert.match(await fs.readFile(path.join(job,'install.log'),'utf8'),/installation process succeeded/i);
 }
 assert.deepEqual(pageErrors,[]);console.log(JSON.stringify({kind,verified:true,evidence}));
}catch(e){if(p&&!p.isClosed())await screenshot('failure').catch(()=>{});throw e;}
finally{
 if(p&&!p.isClosed())await p.evaluate(()=>chrome.webview.postMessage({id:'qa-quit',method:'widget.smoke.quit',params:{}})).catch(()=>{});
 if(browser?.isConnected())await browser.close().catch(()=>{});
 for(let i=0;i<30&&child.exitCode===null;i++)await wait(100);
 if(child.exitCode===null)child.kill();
}
