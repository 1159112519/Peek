// Final output pixels, rather than font ascent/descent alone, define the visible bottom.
// Each measurement is cached at the current font, DPI and subpixel origin.
const cache=new Map(),boundsCache=new Map(),measureCache=new Map();let canvas,measureContext;
export function centerTaskbarInk(text,font,cx,cy){
 if(typeof document==='undefined'||!document.fonts.check(font,text))return {x:cx,y:cy};
 const key=font+'|'+text;let offset=boundsCache.get(key);
 if(!offset){
  measureContext??=document.createElement('canvas').getContext('2d');measureContext.font=font;
  const m=measureContext.measureText(text);
  offset={x:(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,y:(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2};
  boundsCache.set(key,offset);
 }
 return {x:cx+offset.x,y:cy+offset.y};
}
export function taskbarInkY(text,font,bottom,phase={x:0,y:0},threshold=128){
 if(!text||typeof document==='undefined'||!document.fonts.check(font))return bottom;
 const dpr=globalThis.devicePixelRatio||1,fx=((phase.x*dpr)%1+1)%1,fy=(((phase.y+bottom)*dpr)%1+1)%1;
 const key=[text,font,dpr,fx.toFixed(4),fy.toFixed(4),threshold].join('|');let shift=cache.get(key);
 if(shift===undefined){canvas??=document.createElement('canvas');const width=Math.ceil((text.length*16+20)*dpr),height=Math.ceil(40*dpr);canvas.width=width;canvas.height=height;const c=canvas.getContext('2d',{willReadFrequently:true});c.setTransform(dpr,0,0,dpr,0,0);c.font=font;c.fillStyle='#fff';c.textBaseline='alphabetic';const base=Math.ceil(24*dpr);c.fillText(text,(4+fx)/dpr,(base+fy)/dpr);const data=c.getImageData(0,0,width,height).data;let last=-1;for(let y=height-1;y>=0&&last<0;y--)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>=threshold){last=y;break;}shift=last<0?0:(base+Math.round(fy)-1-last)/dpr;if(cache.size>=768)cache.clear();cache.set(key,shift);}
 return bottom+shift;
}

export function measureTaskbarInk(text,font){
 if(!text)return {width:0,left:0,height:0,right:0};
 if(typeof document==='undefined'||!document.fonts.check(font,text))return {width:[...text].length*8,left:0,height:9,right:[...text].length*8};
 const key=font+'|'+text;if(measureCache.has(key))return measureCache.get(key);
 measureContext??=document.createElement('canvas').getContext('2d');measureContext.font=font;
 const m=measureContext.measureText(text),result={width:Math.max(0,m.actualBoundingBoxLeft+m.actualBoundingBoxRight),left:m.actualBoundingBoxLeft,height:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent,right:m.actualBoundingBoxRight};
 if(measureCache.size>=512)measureCache.clear();measureCache.set(key,result);return result;
}
// Cache glyph ink bounds at output DPI for placement, not for drawing.
const readoutBounds=new Map();let maskCanvas,maskContext;
export const readoutLabelBody=text=>text.replace(/[gjpqy]/g,c=>({g:'o',j:'i',p:'o',q:'o',y:'v'})[c]);
const inkThreshold=112;
export function taskbarReadoutBounds(text,font,screen){
 if(!text||!screen?.sx||typeof document==='undefined'||!document.fonts.check(font,text))return null;
 const {sx,sy}=screen,key=[text,font,sx,sy,document.fonts.status].join('|');
 if(readoutBounds.has(key))return readoutBounds.get(key);
 maskCanvas??=document.createElement('canvas');
 maskContext??=maskCanvas.getContext('2d',{willReadFrequently:true});
 const c=maskContext,pad=4,base=Math.ceil(23*sy);
 c.font=font;const m=c.measureText(text),width=Math.ceil((m.width+14)*sx),height=Math.ceil(38*sy);
 maskCanvas.width=width;maskCanvas.height=height;c.setTransform(sx,0,0,sy,pad,base);c.font=font;c.fillStyle='#fff';c.fillText(text,0,0);
 const a=c.getImageData(0,0,width,height);let l=width,r=0,t=height,b=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(a.data[(y*width+x)*4+3]>=inkThreshold){l=Math.min(l,x);r=Math.max(r,x+1);t=Math.min(t,y);b=Math.max(b,y+1);}
 if(r<=l||b<=t)return null;
 // Measure at output DPI, but never paint this canvas. Visible glyphs remain text.
 const mask={w:r-l,h:b-t,top:t-base,left:l-pad};
 if(readoutBounds.size>=768)readoutBounds.clear();readoutBounds.set(key,mask);return mask;
}
export function taskbarReadoutGeometry({screen, bottom, digitRef, unit, digits, start, unitGap, flowGap}){
 if(!screen||!digitRef||digits.some(d=>!d.mask))return null;
 const {x,y,sx,sy}=screen,atX=local=>Math.round(x+local*sx),localY=px=>(px-y)/sy;
 const foot=Math.round(y+bottom*sy),row=foot-Math.max(digitRef.h,unit?.h??0)/2;
 let edge=atX(start);
 const placed=digits.map(d=>{
  const px=flowGap==null?atX(start+d.x+(d.advance-d.mask.w/sx)/2):edge;
  edge=px+d.mask.w+Math.round((flowGap??0)*sx);
  return {...d,x:px,y:d.placeholder?Math.round(row-d.mask.h/2):foot-d.mask.h};
 });
 const right=Math.max(...placed.map(d=>d.x+d.mask.w));
 const first=Math.min(unit?foot-unit.h:Infinity,...placed.map(d=>d.y));
 const last=Math.max(unit?foot:-Infinity,...placed.map(d=>d.y+d.mask.h));
 return {digits:placed,right,foot,row,center:localY((first+last)/2),unitX:right+Math.round(unitGap*sx)};
}
