import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {chromium}=require('playwright'),{PNG}=require('pngjs');
const {createServer}=await import('../desktop/web/node_modules/vite/dist/node/index.js');
const server=await createServer({root:path.resolve(import.meta.dirname,'../desktop/web'),server:{host:'127.0.0.1',port:0},configFile:false});await server.listen();
const url='http://127.0.0.1:'+server.httpServer.address().port+'/peek-readout-pixels.html';
const browser=await chromium.launch({channel:'msedge'}),output=path.resolve(process.argv[2]);await fs.mkdir(output,{recursive:true});
function bounds(png,range,channel){let l=Infinity,r=-1,t=Infinity,b=-1;for(let y=range.y;y<range.y+range.h;y++)for(let x=range.x;x<range.x+range.w;x++){const i=(y*png.width+x)*4,v=png.data[i+channel];if(v<140||[0,1,2].some(c=>c!==channel&&v-png.data[i+c]<95))continue;l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}return {l,r,t,b};}
const failures=[];
try{
 for(const dpr of [1,1.25,1.5]){
  const page=await browser.newPage({viewport:{width:460,height:690},deviceScaleFactor:dpr});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.locator('#base svg').first().waitFor({timeout:6000}).catch(error=>{console.error(errors);throw error;});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(250);
  const inkFallbacks=await page.locator('#base [data-readout-ink]').count();
  if(inkFallbacks)failures.push(`${dpr}: ${inkFallbacks} digit/unit glyphs still paint bitmap coverage`);
  const full=await page.screenshot({path:path.join(output,`preview-${dpr}x.png`)}),png=PNG.sync.read(full);
  for(const id of ['base','change']){
   const regions=await page.locator(`#${id} [data-metric] > svg`).evaluateAll((nodes,dpr)=>nodes.map(node=>{const r=node.getBoundingClientRect();return {metric:node.parentElement.dataset.metric,name:node.getAttribute('aria-label'),x:Math.floor(r.left*dpr),y:Math.floor(r.top*dpr),w:Math.round(r.width*dpr),h:Math.round(r.height*dpr)};}),dpr);
   const labels={};
   for(let i=0;i<regions.length;i++){
    const {metric,name}=regions[i];
    const n=bounds(png,regions[i],1),u=bounds(png,regions[i],2),l=bounds(png,regions[i],0);
    if(n.r<0||l.r<0){failures.push(`${dpr} ${id}/${i}: missing name or number`);continue;}
    labels[metric]={...l,left:l.l-regions[i].x};
    if(metric==='memoryUsed'){
     if(!name.endsWith(' G'))failures.push(`${dpr} ${id}: expected G, got ${name}`);
     if(n.l-l.r-1<Math.round(7*dpr))failures.push(`${dpr} ${id}: Used/name gap ${n.l-l.r-1}`);
    }
    if(!['ping','loss','gpuPower','memoryUsed'].includes(metric))continue;
    if(id==='change'&&metric==='ping'){
     if(u.r>=0)failures.push(`${dpr} missing Ping should not draw a unit`);
    }else{
     if(u.r<0)failures.push(`${dpr} ${id}/${i}: missing unit ink`);
     if(n.b!==u.b)failures.push(`${dpr} ${id}/${i}: unit bottom ${u.b}, number bottom ${n.b}`);
     // At a fractional DPI, native font antialiasing can move the thresholded edge by one pixel.
     if(Math.abs(u.l-n.r-1-Math.round(3*dpr))>1)failures.push(`${dpr} ${id}/${i}: unit gap ${u.l-n.r-1}`);
    }
    // Sample the body of Ping separately from the g descender.
    const body=metric==='ping'?bounds(png,{...regions[i],x:l.l,w:Math.floor((l.r-l.l+1)*.69)},0):l;
    const delta=(body.t+body.b-Math.min(n.t,u.r>=0?u.t:Infinity)-Math.max(n.b,u.b))/2;
    if(Math.abs(delta)>1)failures.push(`${dpr} ${id}/${i}: name body is ${delta} px off center`);
   }
   if(labels.memory.left!==labels.memoryUsed.left)failures.push(`${dpr} ${id}: MEM/Used left ${labels.memory.left}/${labels.memoryUsed.left}`);
  }
  async function desktopMetrics(id){
   const cells=await page.locator(`#${id} [data-metric]`).evaluateAll((nodes,dpr)=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:Math.floor(r.left*dpr),y:Math.floor(r.top*dpr),w:Math.round(r.width*dpr),h:Math.round(r.height*dpr)};}),dpr);
   return cells.map(region=>({n:bounds(png,region,1),u:bounds(png,region,2)}));
  }
  const base=await desktopMetrics('desktop-base'),near=await desktopMetrics('desktop-near');
  for(const i of [0,2])if(Math.abs(near[i].n.l-near[i+3].n.l)>1)failures.push(`${dpr} desktop col ${i}: values not aligned: ${near[i].n.l}/${near[i+3].n.l}`);
  for(const i of [1,4])if(base[i].n.l!==near[i].n.l)failures.push(`${dpr} desktop col 1: wide value moved`);
  for(const i of [0,3])if(Math.abs((near[i].u.l-near[i].n.r)-(base[i].u.l-base[i].n.r))>1)failures.push(`${dpr} desktop: unit did not move with the number`);
  if(errors.length)failures.push(...errors);
  await page.close();
 }
}finally{await browser.close();await server.close();}
assert.deepEqual(failures,[]);console.log('Readout pixels passed at 100%, 125% and 150%.');
