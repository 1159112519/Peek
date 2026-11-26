import {t,tr,useLocale} from '../i18n/index.js';
import {metricCss} from './taskbar-colors.mjs';
import React,{useLayoutEffect,useRef,useId,useState} from 'react';
import {Cpu,Microchip,MemoryStick,HardDrive,Thermometer,Zap,Fan,Download,Upload,Wifi,WifiOff,Activity} from 'lucide-react';
import {taskbarScrollValues,taskbarScrollPath} from './taskbar-scroll';
import {numberFrames} from '../number-motion';
import {moduleLabel} from './taskbar-composer';
import {taskbarMetrics} from './taskbar-layout';
import {taskbarDisplay,taskbarUnitFamily,taskbarGlyphWidth,taskbarNumberWidth,taskbarReadoutLeftShift,taskbarPlaceKey} from './taskbar-display';
const details=Object.fromEntries(taskbarMetrics.map(row=>[row[0],row]));
import {centerTaskbarInk,measureTaskbarInk,taskbarInkY,taskbarReadoutBounds,taskbarReadoutGeometry,readoutLabelBody} from './taskbar-ink';
const ease='cubic-bezier(.22,.74,.28,1)';
export const taskbarLabelFont='400 11.5px "Taskbar Inter","HarmonyOS Sans SC",sans-serif';
export const taskbarUnitFont='400 10.5px "Taskbar Inter",sans-serif';
export const taskbarDigitFont='500 12.5px "Taskbar Inter",sans-serif';
const labelFont=taskbarLabelFont,unitFont=taskbarUnitFont,numberFont=taskbarDigitFont;
// Shared 88 x 17 cell: installed slots, library and stage render the same component.
function readoutTextPosition(mask,screen,x,y){
 return {x:(x-mask.left-screen.x)/screen.sx,y:(y-mask.top-screen.y)/screen.sy};
}
function Digit({value,x,center,bottom,numberMotion,phase,position,geometry,advance}){useLocale();
 const next=useRef(null),old=useRef(null),previous=useRef(value),history=useRef({value,prior:value});
 if(history.current.value!==value)history.current={value,prior:history.current.value};const prior=history.current.prior;
 useLayoutEffect(()=>{const before=previous.current;previous.current=value;if(before===value||numberMotion==='direct')return;
  const options={duration:240,easing:ease};
  const incoming=next.current.animate(numberFrames(numberMotion,true,14),options);
  const outgoing=old.current.animate(numberFrames(numberMotion,false,14),options);
  return()=>{incoming.cancel();outgoing.cancel()};
 },[value,numberMotion]);
 const y=glyph=>taskbarInkY(glyph,numberFont,bottom,{x:phase.x+x,y:phase.y});
 if(position){
  const priorMask=taskbarReadoutBounds(prior,numberFont,phase);
  const priorX=priorMask?Math.round(phase.x+x*phase.sx+(advance*phase.sx-priorMask.w)/2):0;
  const priorY=priorMask?prior==='—'||prior==='…'?Math.round(geometry.row-priorMask.h/2):geometry.foot-priorMask.h:0;
  return <g data-digit={value}><text ref={old} {...(priorMask?readoutTextPosition(priorMask,phase,priorX,priorY):{x,y:y(prior)})} opacity="0" aria-hidden="true">{tr(prior)}</text><text ref={next} {...readoutTextPosition(position.mask,phase,position.x,position.y)}>{tr(value)}</text></g>;
 }
 return <g data-digit={value}><text ref={old} x={x} y={y(prior)} opacity="0" aria-hidden="true">{tr(prior)}</text><text ref={next} x={x} y={y(value)}>{tr(value)}</text></g>;
}
function Chart({kind,id,sample,points,cores,x,y,motion}){useLocale();
 const path=useRef(null),frame=useRef(0),last=useRef(0),scale=useRef(null),trackKey=useRef(null),lineClip=useId().replaceAll(':',''),lineMask=lineClip+'-fade';
 const ratio=Math.min(1,Math.max(0,(sample?.value??0)/100)),hasData=sample?.value!=null&&!sample.stale;
 const mode=kind==='bars'&&id==='cpu'&&cores?.length?'cores':kind==='bars'&&['gpu','memory','gpuMemory'].includes(id)?'ring':kind==='bars'&&sample?.unit==='%'&&id!=='cpu'?'ticks':'line';
 useLayoutEffect(()=>{
  if(mode!=='line'||!hasData||points?.length<2||!points){last.current=0;scale.current=null;trackKey.current=null;return;}
  if(!path.current)return;
  const key=id+'|'+sample.unit;if(trackKey.current!==key){scale.current=null;last.current=0;trackKey.current=key;}
  scale.current??=Math.max(1,Math.abs(points[0]));
  const p=taskbarScrollValues(points,sample.unit,scale.current),start=performance.now(),duration=Math.min(750,Math.max(120,(start-last.current)*.85)),animate=motion&&last.current>0;
  last.current=start;
  const tick=now=>{if(!path.current)return;const t=animate?1-Math.pow(1-Math.min(1,(now-start)/duration),3):1;
   path.current.setAttribute('d',taskbarScrollPath(p,x,y,t));path.current.dataset.scrollProgress=String(t);
   if(t<1)frame.current=requestAnimationFrame(tick);
  };tick(start);return()=>cancelAnimationFrame(frame.current);
 },[points,mode,hasData,motion,x,y,sample?.unit,id]);
 if(!hasData||mode==='line'&&!(points?.length>1))return <text x={x} y={y+3} className="taskbar-cell-unit taskbar-chart-empty">—</text>;
 if(mode==='ring')return <g className="taskbar-chart"><circle cx={x+9} cy={y-.5} r="4.5" opacity=".28"/><circle cx={x+9} cy={y-.5} r="4.5" pathLength="100" strokeDasharray={`${ratio*100} 100`} transform={`rotate(-90 ${x+9} ${y-.5})`}/></g>;
 if(mode==='ticks')return <g className="taskbar-chart">{tr(Array.from({length:10},(_,i)=><line key={i} x1={x+i*2.3} x2={x+i*2.3} y1={y-2} y2={y+3} opacity={i<ratio*10?1:.28}/>))}</g>;
 if(mode==='cores'){const n=Math.min(12,cores.length);return <g className="taskbar-chart-core">{tr(Array.from({length:n},(_,i)=>{const values=cores.slice(Math.floor(i*cores.length/n),Math.floor((i+1)*cores.length/n));const h=Math.max(1,Math.min(9,.09*values.reduce((a,b)=>a+b,0)/values.length));return <rect key={i} x={x+i*22/n} y={y+3-h} width={Math.max(1,22/n-1)} height={h}/>}))}</g>}
 return <g data-chart-motion="scroll"><defs><clipPath id={lineClip}><rect x={x} y={y-5.6} width="22" height="9.2"/></clipPath><linearGradient id={lineMask}><stop offset="0" stopColor="white" stopOpacity="0"/><stop offset=".09" stopColor="white"/><stop offset=".91" stopColor="white"/><stop offset="1" stopColor="white" stopOpacity="0"/></linearGradient><mask id={lineMask+'-mask'} maskUnits="userSpaceOnUse" x={x} y={y-6} width="22" height="11"><rect x={x} y={y-6} width="22" height="11" fill={`url(#${lineMask})`}/></mask></defs><g clipPath={`url(#${lineClip})`} mask={`url(#${lineMask}-mask)`}><path ref={path} className="taskbar-chart"/></g></g>;
}
const metricIcon={cpu:Cpu,cpuFrequency:Activity,cpuTemperature:Thermometer,gpu:Microchip,gpuFrequency:Activity,gpuMemory:Microchip,gpuTemperature:Thermometer,gpuPower:Zap,gpuFan:Fan,memory:MemoryStick,memoryUsed:MemoryStick,storage:HardDrive,storageRead:Download,storageWrite:Upload,ping:Wifi,loss:WifiOff,io:Activity};
// Reserve against the widest supported value and unit. Offsets can close a gap,
// but not bring the ink of neighboring parts into contact.
const nameFor=(id,module)=>module?moduleLabel(module,details[id]?.[2]||'未知'):details[id]?.[2]||'—';
const problemMetrics=new Set(['ping','loss','gpuPower','memoryUsed']);
const usedNameGap=7;
function readoutLayout(id,module,peer,width,mode,typography,format,labelOverride,hideUnit){
 const row=details[id],label=labelOverride||nameFor(id,module);
 const parts=module?.parts??['number'],numeric=parts.includes('number'),partOnly=mode==='part';
 const adjust=part=>{if(mode)return 0;const limit=part.endsWith('X')?6:2;return Math.max(-limit,Math.min(limit,(Number(typography?.global?.[part])||0)+(Number(typography?.metrics?.[id]?.[part])||0)))||0;};
 const labelInk=measureTaskbarInk(label,labelFont),labelWidth=label==='◇'?10.5:labelInk.width;
 const paired=!mode&&parts.length===1&&numeric&&peer?.parts.length===1&&peer.parts[0]==='number'&&(
  (id==='up'&&peer.metricId==='down')||(id==='down'&&peer.metricId==='up')||
  (id==='storageRead'&&peer.metricId==='storageWrite')||(id==='storageWrite'&&peer.metricId==='storageRead')||
  (id==='cpuFrequency'&&peer.metricId==='gpuFrequency')||(id==='gpuFrequency'&&peer.metricId==='cpuFrequency'));
 const peerRow=paired?details[peer.metricId]:null,peerLabel=paired?nameFor(peer.metricId,peer):'';
 const network=id==='up'||id==='down';
 const gap=8,graphWidth=24,unitGap=4,minGap=4;
 const unitId=id==='memory'&&format?.memoryMode==='used'?'memoryUsed':id==='memory'&&format?.memoryMode==='free'?'memoryFree':id;
 const protectUsed=!mode&&unitId==='memoryUsed'&&parts[0]==='number';
 const nameGap=protectUsed?usedNameGap:minGap;
 const nudge=!mode&&!network?taskbarGlyphWidth('0'):0;
 const nameSpace=(name,w)=>w+(['↑','↓'].includes(name)?10:Math.max(7,parts[0]==='number'?nudge+nameGap:0));
 const peerSpace=paired?nameSpace(peerLabel,peerLabel==='◇'?10.5:measureTaskbarInk(peerLabel,labelFont).width):0;
 const first=partOnly||!parts.length?0:Math.max(nameSpace(label,labelWidth),peerSpace);
 const reservedUnit=hideUnit?0:Math.max(0,...taskbarUnitFamily(unitId,row?.[3]||'',format?.networkBits).map(u=>measureTaskbarInk(u,unitFont).width),...(paired?taskbarUnitFamily(peer.metricId,peerRow[3],format?.networkBits).map(u=>measureTaskbarInk(u,unitFont).width):[]));
 const other=parts.filter(part=>part!=='number').length*graphWidth+Math.max(0,parts.length-1)*gap;
 const fixedTrack=Math.max(0,Math.min(taskbarNumberWidth('88.8'),(partOnly?72:width)-first+nudge-other-reservedUnit-unitGap-2));
 function place(numberWidth,unitWidth){
  const numberTrack=partOnly?numberWidth:fixedTrack;
  const labelStart=adjust('labelX');
  let edge=partOnly?0:labelStart+labelWidth+nameGap,nominal=first;
  const tracks=parts.map((part,index)=>{
   if(part!=='number'){
    const x=Math.max(edge,nominal+adjust('graphX'));edge=x+graphWidth+minGap;nominal+=graphWidth+gap;return {part,x,w:graphWidth};
   }
   const x=Math.max(edge,nominal-nudge+adjust('numberX'));
   const numberEnd=x+numberTrack;
   const unitLeft=Math.max(numberEnd+3,nominal-nudge+numberTrack+unitGap+adjust('unitX'));
   const w=(partOnly?unitWidth:reservedUnit)>0?unitLeft-x+(partOnly?unitWidth:reservedUnit):numberTrack;
   const legacyShift=mode?0:taskbarReadoutLeftShift(id,x,numberTrack,edge-minGap);
   const shift=protectUsed&&index===0?Math.min(legacyShift,x-edge):legacyShift;
   edge=x+w+minGap;nominal+=numberTrack+unitGap+reservedUnit+gap-nudge;
   return {part,x:x-shift,w,start:numberEnd-numberWidth-shift,unitLeft:unitLeft-shift,unitGap:Math.max(2,3+adjust('unitX'))};
  });
  return {tracks,left:partOnly?0:labelStart,right:Math.max(partOnly?0:labelStart+labelWidth,...tracks.map(t=>t.x+t.w))};
 }
 return {row,label,labelInk,labelWidth,fixedTrack,adjust,place,unitId};
}
function displayFor(snapshot,id,format,label,row,fixedTrack){
 const alias=id==='memory'&&['used','free'].includes(format?.memoryMode)?(format.memoryMode==='used'?'memoryUsed':'memoryFree'):id;
 return taskbarDisplay(snapshot?.values?.[alias],label,row?.[3]||'',()=>fixedTrack,{...format,id,networkBits:format?.networkBits&&(id==='up'||id==='down')});
}
function desktopDigitOffsets(text,optical){
 const offsets=Array(text.length).fill(0);
 const edge=(glyph)=>{const m=measureTaskbarInk(glyph,numberFont),step=taskbarGlyphWidth(glyph);
  return optical?[(step-m.width)/2,(step+m.width)/2]:[-m.left,m.right];};
 for(let i=text.length-2;i>=0;i--){
  if(!/[0-9]/.test(text[i])||!/[0-9]/.test(text[i+1]))continue;
  const gap=taskbarGlyphWidth(text[i])+edge(text[i+1])[0]-edge(text[i])[1]+offsets[i+1];
  offsets[i]=Math.min(2,Math.max(0,gap-2));
 }
 return offsets;
}
export function taskbarPreviewFootprint(module,peer,width,typography,format,labelOverride,hideUnit,snapshot){
 const d=readoutLayout(module.metricId,module,peer,width,undefined,typography,format,labelOverride,hideUnit);
 const bounds=d.place(d.fixedTrack,0);
 if(!snapshot||module.parts?.length!==1||module.parts[0]!=='number')return bounds;
 const {text,unit}=displayFor(snapshot,module.metricId,format,d.label,d.row,d.fixedTrack),numberWidth=taskbarNumberWidth(text);
 const unitInk=measureTaskbarInk(unit,unitFont),number=d.place(numberWidth,unitInk.width).tracks[0];
 const first=measureTaskbarInk(text[0],numberFont),optical=problemMetrics.has(d.unitId),last=text.at(-1);
 const tail=measureTaskbarInk(last,numberFont),lastAdvance=taskbarGlyphWidth(last);
 const firstOffset=['up','down'].includes(module.metricId)?0:desktopDigitOffsets(text,optical)[0]??0;
 const left=number.start+firstOffset+(optical?(taskbarGlyphWidth(text[0])-first.width)/2:-first.left);
 const numericRight=number.start+numberWidth-lastAdvance+(optical?(lastAdvance+tail.width)/2:tail.right);
 const unitWidth=hideUnit?0:unitInk.width;
 const right=!unitWidth?numericRight:optical?numericRight+number.unitGap+unitWidth:number.unitLeft+unitWidth;
 const nameRight=bounds.left+d.labelWidth,nameGap=d.unitId==='memoryUsed'?usedNameGap:3;
 return {left:Math.min(bounds.left,left),right:Math.max(nameRight,right),nameRight,value:{text,left,right,nameRight,nameGap}};
}
export function Readout({id,module,peer,snapshot,numberMotion='direct',chartMotion=true,points,width=88,typography,mode,colors,format,catalogueScale=1,literalNames=false,centerCatalogueName=false,labelOverride,hideUnit=false,valueShift=0,desktopReadout=false}){useLocale();
 const root=useRef(null),syncPhase=useRef(null),[phase,setPhase]=useState({x:0,y:0});
 useLayoutEffect(()=>{
  let frame;const round=n=>Math.round(n*4096)/4096;
  const measure=()=>{const m=root.current?.getScreenCTM();if(!m||m.a<=0||m.d<=0)return;
   const d=globalThis.devicePixelRatio||1,snap=n=>round((n%1+1)%1),rect=root.current.getBoundingClientRect();
   const next={x:snap(m.e*d),y:snap(m.f*d),sx:round(m.a*d),sy:round(m.d*d),legacyX:((rect.x*d)%1)/d,legacyY:((rect.y*d)%1)/d,fonts:document.fonts.status};
   setPhase(old=>Object.keys(next).every(k=>old[k]===next[k])?old:next);
  };
  const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)};
  syncPhase.current=measure;measure();const observer=new ResizeObserver(queue),svg=root.current;
  if(svg)observer.observe(svg);const surface=svg?.closest('.peek-desktop-preview,.tb42-preview');if(surface)observer.observe(surface);
  window.addEventListener('resize',queue);document.addEventListener('scroll',queue,true);document.fonts.addEventListener('loadingdone',queue);
  document.addEventListener('animationend',queue,true);document.addEventListener('transitionend',queue,true);
  return()=>{syncPhase.current=null;cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',queue);document.removeEventListener('scroll',queue,true);document.fonts.removeEventListener('loadingdone',queue);document.removeEventListener('animationend',queue,true);document.removeEventListener('transitionend',queue,true);};
 },[]);
 useLayoutEffect(()=>{syncPhase.current?.();});
 id=module?.metricId??id;const row=details[id],sample=snapshot?.values?.[id],clip=useId().replace(/[^a-zA-Z0-9_-]/g,''),label=labelOverride||nameFor(id,module);
 const Icon=label==='◇'?(metricIcon[id]??Activity):null;
 const parts=module?.parts??['number'],numeric=parts.includes('number'),nameOnly=mode==='name',partOnly=mode==='part';
 // Library samples describe the item being picked, not the installed RAM display mode.
 const catalogueNumber=partOnly&&numeric&&literalNames;
 if(catalogueNumber&&id==='memory')format={...format,memoryMode:'percent',hidePercent:false};
 const scale=catalogueNumber?catalogueScale+1/12.5:nameOnly&&literalNames&&!Icon?catalogueScale+1/11.5:catalogueScale;
 const {labelInk,labelWidth,fixedTrack,adjust,place,unitId}=readoutLayout(id,module,peer,width,mode,typography,format,labelOverride,hideUnit);
 const {text,unit}=displayFor(snapshot,id,format,label,row,fixedTrack);
 const renderedUnit=tr(unit),unitInk=measureTaskbarInk(renderedUnit,unitFont),numberWidth=taskbarNumberWidth(text);
 const {tracks,left,right}=place(numberWidth,unitInk.width),number=tracks.find(track=>track.part==='number');
 const start=(number?.start??0)+valueShift+(catalogueNumber?2:0),unitStart=(number?.unitLeft??0)+unitInk.left+valueShift;
 const problem=numeric&&!nameOnly&&(catalogueNumber||problemMetrics.has(unitId));
 const proportionalInk=catalogueNumber||(desktopReadout&&problem&&unitId==='memoryUsed');
 const bottom=13.5+adjust('number'),center=bottom-measureTaskbarInk('0',numberFont).height/2;
 const legacyPhase={x:phase.legacyX??0,y:phase.legacyY??0};
 const readWidth=number?.w??0,graphWidth=24;
 const hitTracks=tracks.map(({x,w})=>`${x.toFixed(3)}:${w.toFixed(3)}`).join(',');
 useLayoutEffect(()=>{const slot=root.current?.closest('.tb42-slot');if(!slot||mode)return;const ranges=hitTracks.split(',').filter(Boolean).map(s=>s.split(':').map(Number));
  slot.style.setProperty('--tb-ink-left',`${left-1}px`);
  slot.style.setProperty('--tb-ink-width',`${right-left+6}px`);
  for(let i=0;i<2;i++){const previous=ranges[i-1],next=ranges[i];const from=next?Math.max(0,next[0]-2):previous?previous[0]+previous[1]+4:0;
   slot.style.setProperty(`--tb-track${i}-x`,`${Math.min(width-14,from+2)}px`);slot.style.setProperty(`--tb-track${i}-w`,`${Math.min(Math.max(14,width-from-3),next?Math.max(14,next[1]+4):14)}px`);}
  return()=>{for(const name of ['--tb-ink-left','--tb-ink-width','--tb-track0-x','--tb-track0-w','--tb-track1-x','--tb-track1-w'])slot.style.removeProperty(name);};
 },[hitTracks,width,mode,left,right]);
 const renderedLabel=literalNames?label:tr(label);
 const unitMask=problem&&!hideUnit?taskbarReadoutBounds(renderedUnit,unitFont,phase):null;
 // Align the letter bodies of rates, as in the live readout. The diagonal of
 // the slash can descend lower; retain it for the full unit's horizontal ink.
 const rateFoot=catalogueNumber&&unitMask&&renderedUnit.includes('/')
  ?taskbarReadoutBounds(renderedUnit.replace('/',''),unitFont,phase):null;
 const unitDescent=rateFoot?rateFoot.top+rateFoot.h-unitMask.top:unitMask?.h;
 const offsets=desktopReadout&&!['up','down'].includes(id)?desktopDigitOffsets(text,problem):[];
 const digits=[];let cursor=0;
 for(const glyph of text){const advance=taskbarGlyphWidth(glyph);digits.push({x:cursor+(offsets[digits.length]??0),advance,mask:problem?taskbarReadoutBounds(glyph,numberFont,phase):null,placeholder:glyph==='—'||glyph==='…'});cursor+=advance;}
 const geometry=problem?taskbarReadoutGeometry({screen:phase,bottom,digitRef:taskbarReadoutBounds('0',numberFont,phase),unit:unitMask,digits,start,unitGap:catalogueNumber?4:number?.unitGap??3,flowGap:catalogueNumber?2:undefined}):null;
 const sampleRight=catalogueNumber&&geometry?((unitMask?geometry.unitX+unitMask.w:geometry.right)-phase.x)/phase.sx:null;
 const visibleWidth=nameOnly?Math.ceil(Math.max(14,labelWidth+4)):partOnly?Math.ceil((sampleRight??(numeric?readWidth+(catalogueNumber?2:0):graphWidth))+2):width;
 const namePosition=nameOnly&&!Icon?centerTaskbarInk(centerCatalogueName?renderedLabel:label,labelFont,visibleWidth/2,8.5):null;
 // Center the body of Ping, excluding the descender.
 const catalogueY=centerCatalogueName&&id==='ping'&&renderedLabel==='Ping'
  ?centerTaskbarInk(readoutLabelBody(renderedLabel),labelFont,0,8.5).y:namePosition?.y;
 const labelX=namePosition?namePosition.x:labelInk.left+adjust('labelX');
 const labelCenter=nameOnly?8.5:(geometry?.center??8.5)+adjust('label');
 // Keep names as text: the font rasterizer handles stems and antialiasing at
 // the final origin. The optical pairs use ink bounds for placement, not painting.
 const desktopHan=desktopReadout&&!Icon&&numeric&&/[0-9]/.test(text)&&/[\u3400-\u9fff\uf900-\ufaff]/.test(renderedLabel);
 const hanBottom=(geometry?(geometry.foot-phase.y)/phase.sy:bottom)+adjust('label');
 const labelY=desktopHan
  ?taskbarInkY(renderedLabel,labelFont,hanBottom,{x:legacyPhase.x+labelX,y:legacyPhase.y},160)
  :centerCatalogueName&&namePosition?catalogueY:geometry
  ?centerTaskbarInk(readoutLabelBody(renderedLabel),labelFont,0,labelCenter).y
  :taskbarInkY(renderedLabel,labelFont,13.5+adjust('label'),{x:legacyPhase.x+labelX,y:legacyPhase.y});
 return <svg ref={root} className="taskbar-mini-cell" data-proportional-ink={proportionalInk||undefined} data-custom-name={Boolean(colors?.[id]?.label)} viewBox={`0 0 ${visibleWidth} 17`} width={visibleWidth*scale} height={17*scale} style={{...metricCss(colors,id),width:visibleWidth*scale,minWidth:visibleWidth*scale,overflow:mode?undefined:'visible'}} role="img" aria-label={`${tr(row?.[1]||id||'空位置')} ${text} ${unit}`}>
  {numeric&&sample?.reason&&<title>{t(sample.reason)}</title>}
  <defs><clipPath id={clip}><rect x={catalogueNumber?0:start-1} y=".5" width={catalogueNumber?visibleWidth:numberWidth+2} height="16"/></clipPath></defs>
  {!partOnly&&(Icon?<Icon x={nameOnly?(visibleWidth-10.5)/2:adjust('labelX')} y={geometry?labelCenter-5.25:3+adjust('label')} width={10.5} height={10.5} className="taskbar-metric-icon" strokeWidth={1.8}/>:<text className="taskbar-cell-label" x={labelX} y={labelY}>{renderedLabel}</text>)}
  {tr(tracks.map(({part,x})=>part==='number'?null:<Chart key={part} kind={part} id={id} sample={sample} cores={snapshot?.cpuCores} points={points} x={x+.75} y={10+adjust('graph')} motion={chartMotion}/>))}
  {numeric&&<><g className="taskbar-cell-number" clipPath={`url(#${clip})}`}>{[...text].map((c,i)=><Digit key={taskbarPlaceKey(text,i)} value={c} x={start+digits[i].x} advance={digits[i].advance} center={center} bottom={bottom} phase={geometry?phase:legacyPhase} position={geometry?.digits[i]} geometry={geometry} numberMotion={sample?.animate===false?'direct':numberMotion}/>)}</g>
  {!hideUnit&&renderedUnit&&(geometry&&unitMask?<text className="taskbar-cell-unit" {...readoutTextPosition(unitMask,phase,geometry.unitX,geometry.foot-unitDescent)}>{renderedUnit}</text>:<text className="taskbar-cell-unit" x={unitStart} y={taskbarInkY(unit.replace('/',''),unitFont,13.5+adjust('unit'),{x:legacyPhase.x+unitStart,y:legacyPhase.y})}>{renderedUnit}</text>)}</>}

 </svg>;
}
