import React from 'react';
import {Button} from '../components';
import {ThemedSelect} from '../themed-select';
import {t} from '../i18n/index.js';
import {formatPeekMiB} from './peek-capacity.mjs';

export function SourceSelect({label,value,items=[],fallback,onChange}){
 return <label className="widget-option-row widget-source-field"><span>{t(label)}</span><ThemedSelect aria-label={t(label)} value={value??''} disabled={!value&&!items.length} onChange={e=>onChange(e.target.value)}>
  <option value="">{t(fallback)}</option>
  {value&&!items.some(item=>item.id===value)&&<option value={value}>{t('已保存的来源（不可用）')}</option>}
  {items.map(item=><option key={item.id} value={item.id}>{item.name}{item.active===false?' · '+t('未连接'):''}</option>)}
 </ThemedSelect></label>;
}
const samplingDefaults={adapter:'',disk:'',volume:'',cpuSource:'time'};
export function WidgetSampling({draft,change,sources}){
 const config=draft.monitoring??samplingDefaults;
 const changeSource=(key,value)=>change('monitoring',{...config,[key]:value});
 return <div className="widget-general-groups">
  <section className="widget-settings-group" aria-labelledby="widget-source-title">
   <h4 id="widget-source-title">{t('数据来源')}</h4>
   <div className="widget-option-list">
    <SourceSelect label="网络适配器" fallback="全部活动连接" value={config.adapter} items={sources?.adapters} onChange={value=>changeSource('adapter',value)}/>
    <SourceSelect label="存储卷" fallback="系统卷" value={config.volume} items={sources?.volumes??[]} onChange={value=>changeSource('volume',value)}/>
    <SourceSelect label="磁盘活动" fallback="所有物理磁盘" value={config.disk} items={sources?.disks??[]} onChange={value=>changeSource('disk',value)}/>
    <label className="widget-option-row widget-source-field"><span>{t('CPU 利用率来源')}</span><ThemedSelect aria-label={t('CPU 利用率来源')} value={config.cpuSource} onChange={e=>changeSource('cpuSource',e.target.value)}><option value="time">{t('CPU 使用时间')}</option><option value="performance">{t('Windows 性能计数器')}</option></ThemedSelect></label>
   </div>
   <p className="widget-group-note">{t('所选连接或磁盘不可用时，读数显示为 —，不会改用其他来源。')}</p>
  </section>
  <section className="widget-settings-group" aria-labelledby="widget-sampling-title">
   <h4 id="widget-sampling-title">{t('采样频率')}</h4>
   <div className="widget-option-list">
    <label className="widget-option-row"><span>{t('采样周期')}</span><ThemedSelect aria-label={t('采样周期')} value={String(draft.localIntervalMs??2000)} onChange={e=>change('localIntervalMs',Number(e.target.value))}>
     {[500,1000,2000,3000,5000,10000].map(ms=><option key={ms} value={String(ms)}>{ms/1000}{t(' 秒')}</option>)}
    </ThemedSelect></label>
    <div className="widget-option-row"><span className="widget-group-note">{t('采样决定读取系统数据的频率，与任务栏的显示更新间隔独立。')}</span><Button onClick={()=>{change('monitoring',{...config,...samplingDefaults});change('localIntervalMs',2000);}}>{t('恢复采集默认值')}</Button></div>
   </div>
  </section>
 </div>;
}
const reminderFields=[
 ['trafficMiB','当日流量', [200,500,1024,2048,5120,10240]],
 ['memoryPercent','内存利用率',[60,70,75,80,85,90,95,100],'%'],
 ['gpuCelsius','GPU 温度',[60,65,70,75,80,85,90,95,100,105,110],'°C']
];
export function WidgetReminders({draft,change,sources}){
 const config=draft.monitoring??{};
 const observed=sources?.trafficBytes;
 const trafficDescription=[t('流量只统计小组件运行时观察到的收发字节。'),Number.isFinite(observed)?t('今日已观测：')+formatPeekMiB(observed/1048576,{fractionDigits:1}):null].filter(Boolean).join(' ');
 return <section className="widget-settings-group" aria-labelledby="widget-reminder-title">
  <h4 id="widget-reminder-title">{t('通知提醒')}</h4>
  <div className="widget-option-list">
   {reminderFields.map(([key,label,thresholds,unit])=>{
    const value=config[key]??0;
    const options=value&&!thresholds.includes(value)?[...thresholds,value].sort((a,b)=>a-b):thresholds;
    const description=key==='trafficMiB'?trafficDescription:undefined;
    return <label className="widget-option-row" key={key}><span title={description}>{t(label)}</span><ThemedSelect aria-label={t(label)} aria-description={description} value={String(value)} onChange={e=>change('monitoring',{...config,[key]:Number(e.target.value)})}>
     <option value="0">{t('不提醒')}</option>{options.map(limit=><option key={limit} value={String(limit)}>{key==='trafficMiB'?formatPeekMiB(limit):`${limit} ${unit}`}</option>)}
    </ThemedSelect></label>;
   })}
  </div>
  {!draft.trayVisible&&<p className="widget-group-note" role="status">{t('通知区图标关闭时不发送提醒。')}</p>}
  {sources?.gpuAvailable===false&&<p className="widget-group-note">{t('当前没有可用的 GPU 温度读数。')}</p>}
 </section>;
}

