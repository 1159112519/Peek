import React,{useId} from 'react';
import {Button} from '../components';
import {ThemedSelect} from '../themed-select';
import {t} from '../i18n/index.js';
import {numberMotionOptions} from '../number-motion';
import {taskbarRefreshIntervals,taskbarAutoPageIntervals} from './taskbar-layout';
import {SourceSelect} from './WidgetOptions';

// Standalone controls; the editor and preview remain shared with the original renderer.
export function WidgetTaskbarOptions({config,readoutFormat,numberMotion,refreshMs,canAutoPage,update,displays,openWindows}){
 const id=useId();
 const options=taskbarAutoPageIntervals.map(s=>[s,t(s<60?`${s} 秒`:`${s/60} 分钟`)]);
 const select=(label,optionLabel,value,items,change,disabled=false)=>
  <label className="widget-option-row"><span>{t(label)}</span><ThemedSelect aria-label={t(optionLabel)} disabled={disabled} value={value} onChange={e=>change(e.target.value)}>{items.map(([key,text])=><option key={key} value={key}>{text}</option>)}</ThemedSelect></label>;
 const check=(label,key,value,disabled=false)=>
  <label className="widget-option-row"><span>{t(label)}</span><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e=>update({[key]:e.target.checked})}/></label>;
 const group=(key,title,children)=>
  <section className="widget-settings-group" aria-labelledby={id+key}><h4 id={id+key}>{t(title)}</h4><div className="widget-option-list">{children}</div></section>;
 const monitorItems=displays?.map(({id,name,width,height})=>({id,name:name.replace(/^.*DISPLAY/,'Display ')+` · ${width} × ${height}`}));
 return <>
  {group('behavior','显示行为',<>
   {check('点击打开资源详情','clickDetails',config.clickDetails)}
   {check('自动切页','autoPage',config.autoPage,!canAutoPage)}
   {config.autoPage&&canAutoPage&&select('自动切页间隔','自动切页间隔',taskbarAutoPageIntervals.includes(config.intervalSeconds)?config.intervalSeconds:taskbarAutoPageIntervals[0],options,v=>update({intervalSeconds:Number(v)}))}
   {select('数字变化','任务栏数字变化',numberMotion,numberMotionOptions.map(([id,name])=>[id,t(name)]),v=>update({numberMotion:v,motion:v!=='direct'}))}
   {select('更新间隔','更新间隔',refreshMs,taskbarRefreshIntervals.map(ms=>[ms,`${ms/1000}${t(' 秒')}`]),v=>update({refreshMs:Number(v)}))}
  </>)}
  {group('formats','读数格式',<>
   {select('网速单位','网速单位',readoutFormat.networkBits?'bits':'bytes',[['bytes',t('字节每秒（B/s）')],['bits',t('比特每秒（b/s）')]],v=>update({networkBits:v==='bits'}))}
   {select('网速量纲','网速量纲',String(readoutFormat.networkScale),[['-1',t('自动')],...(readoutFormat.networkBits?['b/s','kb/s','Mb/s','Gb/s']:['B/s','K/s','M/s','G/s']).map((text,i)=>[String(i),text])],v=>update({networkScale:Number(v)}))}
   {select('内存显示','内存显示',readoutFormat.memoryMode,[['percent',t('已用百分比')],['used',t('已用容量')],['free',t('可用容量')]],v=>update({memoryMode:v}))}
   <div className="widget-format-toggles" role="group" aria-label={t('读数简写')}>
    {[["简洁网速","compactNetwork"],["隐藏网速单位","hideNetworkUnit"],["隐藏百分号","hidePercent"]].map(([label,key])=>
     <label key={key} className="widget-inline-check"><input type="checkbox" checked={Boolean(readoutFormat[key])} onChange={e=>update({[key]:e.target.checked})}/><span>{t(label)}</span></label>
    )}
   </div>
  </>)}
  {group('placement','显示位置',<>
   {(config.monitor||monitorItems?.length>1)&&<SourceSelect label="目标显示器" fallback="主显示器" value={config.monitor} items={monitorItems} onChange={monitor=>update({monitor})}/>}
   <div className="widget-option-row"><span>{t('系统任务栏')}</span><Button onClick={openWindows}>{t('Windows 任务栏设置')}</Button></div>
  </>)}
 </>;
}
