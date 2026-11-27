import React from 'react';
import {createRoot} from 'react-dom/client';
import {Readout,taskbarPreviewFootprint} from './src/native/TaskbarReadout.jsx';
import './src/native/taskbar-settings.css';
import {alignDesktopValues} from './src/native/taskbar-display.js';
const rows=[['cpu','CPU',70,'%',0],['memory','MEM',90,'%',0],['gpu','GPU',0,'%',0],['down','↓',127,'K/s',0],['up','↑',85.1,'K/s',1],['gpuTemperature','GPU',49,'°C',0],['ping','Ping',32,'ms',0],['loss','Loss',3,'%',0],['gpuPower',null,115,'W',0],['cpuTemperature','CPU',42,'°C',0],['memoryUsed','Used',14.2,'GB',1],['gpuMemory','VRAM',67,'%',0]];
const modules=rows.map(([metricId])=>({metricId,name:{variant:'english'},parts:['number']}));
const values=Object.fromEntries(rows.map(([id,,value,unit,decimals])=>[id,{value,unit,decimals}]));
function Grid({name,theme='',probe=false,changed=false}){const snapshot={values:changed?{...values,down:{value:99.1,unit:'M/s',decimals:1},up:{value:1,unit:'K/s',decimals:0},ping:{value:null,stale:true},gpuPower:{value:5,unit:'W',decimals:0},memoryUsed:{value:9.8,unit:'GB',decimals:1}}:values};return <section className={'grid '+theme+(probe?' probe':'')} id={name}>{rows.map(([id,label],i)=><div key={id} data-metric={id}><Readout width={id==='memoryUsed'?88:106} module={modules[i]} labelOverride={label} snapshot={snapshot} literalNames/></div>)}</section>}
const desktopIds=['gpu','memory','ping','gpuPower','memoryUsed','loss'];
function Desktop({name,aligned}){
 const snapshot={values:{...values,gpuPower:{value:5,unit:'W'},ping:{stale:true},loss:{stale:true}}};
 const own=desktopIds.map(id=>modules.find(module=>module.metricId===id));
 const measures=own.map(module=>taskbarPreviewFootprint(module,null,118,undefined,undefined,undefined,false,snapshot).value);
 const shifts=[0,1,2].map(col=>alignDesktopValues([measures[col],measures[col+3]]));
 return <section className="grid probe" id={name} style={{gridTemplateColumns:'repeat(3, 118px)'}}>{own.map((module,i)=><div key={module.metricId} data-metric={module.metricId}><Readout width={118} module={module} snapshot={snapshot} valueShift={aligned?shifts[i%3][Math.floor(i/3)]:0} literalNames/></div>)}</section>;
}
await Promise.all([document.fonts.load('400 11.5px "Taskbar Inter"','Ping'),document.fonts.load('500 12.5px "Taskbar Inter"','0123456789'),document.fonts.load('400 11.5px "HarmonyOS Sans SC"','内存')]);
createRoot(document.querySelector('#root')).render(<div className="comparison offset"><h2>深色 · 原尺寸</h2><Grid name="dark"/><h2>浅色 · 原尺寸</h2><Grid name="light" theme="light"/><h2>像素分色检查</h2><Grid name="base" probe/><h2>数字、单位变化和缺测</h2><Grid name="change" probe changed/><h2>桌面读数 · 原位置 / 就近对齐</h2><Desktop name="desktop-base"/><Desktop name="desktop-near" aligned/></div>);
