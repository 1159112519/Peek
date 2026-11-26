import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json'));
const {PNG}=require('pngjs');
const [after,before]=process.argv.slice(2);
const read=(base,tag,mode)=>PNG.sync.read(fs.readFileSync(path.join(base,`${tag}-${mode}.png`)));
function bounds(img,left,right,mode){
 let top=Infinity,bottom=-Infinity,minX=Infinity,maxX=-Infinity;
 for(let y=10;y<34;y++)for(let x=left;x<right;x++){
  const [r,g,b,a]=img.data.subarray((y*img.width+x)*4,(y*img.width+x)*4+4);
  if(a<95||!(mode==='light'?r<125&&g<151&&b<157:r>160&&g>160&&b>160))continue;
  top=Math.min(top,y);bottom=Math.max(bottom,y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);
 }
 assert(Number.isFinite(bottom),'fixture region does not contain visible ink');
 return {top,bottom,minX,maxX};
}
for(const mode of ['light','dark'])for(const [tag,numericRight] of [['han',174],['han-used',180]]){
 const image=read(after,tag,mode);
 const label=bounds(image,106,138,mode),digits=bounds(image,146,numericRight,mode);
 assert.equal(label.bottom,digits.bottom,`${tag} ${mode} visible label and number bottoms differ`);
 if(before){
  const old=read(before,tag,mode);
  assert.deepEqual([image.width,image.height],[old.width,old.height]);
  const oldLabel=bounds(old,106,138,mode);
  assert.deepEqual([label.minX,label.maxX],[oldLabel.minX,oldLabel.maxX],'Chinese label moved horizontally');
  // Compare every pixel outside the narrow region containing the selected Chinese name.
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   if(x>=104&&x<139&&y>=10&&y<34)continue;
   const i=(y*image.width+x)*4;
   assert.equal(image.data.readUInt32LE(i),old.data.readUInt32LE(i),`${tag} ${mode}: unrelated pixel changed at ${x},${y}`);
  }
 }
 console.log(`${tag} ${mode}: Chinese bottom ${label.bottom}, digit bottom ${digits.bottom}`);
}
