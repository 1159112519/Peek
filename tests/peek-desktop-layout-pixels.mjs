// Verify actual WPF window captures produced by PeekDesktopLayoutProbe at 125%.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {PNG}=require('pngjs');
const [after,before]=process.argv.slice(2);
function ranges(dir,tag,mode,row,col,cols=3){
 const img=PNG.sync.read(fs.readFileSync(path.join(dir,`${tag}-${mode}.png`)));
 const out=[],y0=13+row*21;
 for(let x=Math.max(10,Math.floor(img.width*col/cols));x<Math.min(img.width-10,Math.floor(img.width*(col+1)/cols));x++){
  let ink=false;
  for(let y=y0;y<y0+16;y++){
   const i=(y*img.width+x)*4,[r,g,b,a]=img.data.subarray(i,i+4);
   if(a>95&&(mode==='light'?r<155&&g<168&&b<184:r>135&&g>135&&b>135)){ink=true;break;}
  }
  if(!ink)continue;
  if(out.at(-1)?.[1]===x-1)out.at(-1)[1]=x;else out.push([x,x]);
 }
 return out;
}
const close=(a,b,message)=>assert(Math.abs(a-b)<=1,`${message}: ${a} vs ${b}`);
const gaps=r=>r.slice(1).map(([x],i)=>x-r[i][1]-1);
for(const mode of ['light','dark']){
 const bands=Array.from({length:3},(_,c)=>Array.from({length:3},(_,r)=>ranges(after,'columns',mode,r,c)));
 const ends=bands.map(b=>b.map(r=>r.at(-1)[1]));
 const starts=bands.map(b=>Math.min(...b.map(r=>r[0][0])));
 const gutters=[starts[1]-Math.max(...ends[0])-1, starts[2]-Math.max(...ends[1])-1];
 close(...gutters,`${mode} gutters differ`);assert(gutters.every(g=>g>=14&&g<=17));
 ends.forEach((col,i)=>{assert(Math.max(...col)-Math.min(...col)<=1,`${mode} column ${i+1} right edge: ${col}`);});
 const upperBefore=ranges(before,'align',mode,0,1),upperAfter=ranges(after,'align',mode,0,1),lowerAfter=ranges(after,'align',mode,1,1);
 close(upperBefore.at(-1)[1]-upperBefore[0][0],upperAfter.at(-1)[1]-upperAfter[0][0],`${mode} upper value moved relative to its label`);
 close(upperAfter.at(-1)[1],lowerAfter.at(-1)[1],`${mode} 24% and 8% not aligned`);
 close(gaps(upperAfter).at(-1),gaps(lowerAfter).at(-1),`${mode} number-unit gap changed`);
 const cpu=gaps(ranges(after,'digits',mode,0,0).slice(-3));
 const ram=gaps(ranges(after,'digits',mode,0,1).slice(-5));
 const eightyEight=gaps(ranges(after,'digits',mode,1,1).slice(-3));
 assert(cpu[0]<=2&&ram.slice(0,3).every(x=>x<=2)&&eightyEight[0]===2,JSON.stringify({mode,cpu,ram,eightyEight}));
 console.log({mode,gutters,ends,percentRight:upperAfter.at(-1)[1],digits:[cpu[0],ram.slice(0,3),eightyEight[0]]});
}
