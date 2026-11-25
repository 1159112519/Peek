import React,{useEffect,useState} from 'react';
import {ThemedSelect} from '../themed-select';
import {t} from '../i18n/index.js';
import {TaskbarColorPicker,actualColor} from './TaskbarColorPane';

const metricList=[['cpu','CPU'],['memory','内存'],['gpu','GPU'],['storage','存储'],['down','下载'],['up','上传'],['gpuTemperature','GPU 温度']];
const behavior=[['topmost','始终置顶'],['clickThrough','鼠标穿透'],['locked','锁定位置'],['allowOutside','允许超出屏幕边界'],['hideFullscreen','全屏时隐藏']];
const presentation=[['swapNetwork','交换上传与下载位置'],['showUnits','显示单位'],['showTooltips','显示鼠标提示']];
export function WidgetDesktopSettings({draft,change,active}){
 const config=draft.desktop;
 const [target,setTarget]=useState(null),[preview,setPreview]=useState(null);
 useEffect(()=>{if(!active){setTarget(null);setPreview(null);}},[active]);
 if(!config)return null;
 const update=patch=>change('desktop',{...config,...patch});
 const check=([key,label])=><label className="native-setting-check" key={key}><input type="checkbox" checked={Boolean(config[key])} onChange={e=>update({[key]:e.target.checked})}/><span>{t(label)}</span></label>;
 const actionRow=([key,label])=><label className="widget-option-row" key={key}><span>{t(label)}</span><input type="checkbox" checked={Boolean(config[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;
 const metrics=Array.isArray(config.metrics)?config.metrics:[];
 const selected=metricList.filter(([id])=>metrics.includes(id));
 const field=(label,key,options)=><label className="widget-option-row widget-source-field"><span>{t(label)}</span><ThemedSelect aria-label={t(label)} value={String(config[key])} onChange={e=>update({[key]:key==='fontSize'?Number(e.target.value):e.target.value})}>{options}</ThemedSelect></label>;
 const finish=(save,color)=>{if(save){const colors={...config.colors};if(color)colors[target.metric]=color;else delete colors[target.metric];update({colors});}setTarget(null);setPreview(null);};
 return <div className="widget-general-groups">
  <section className="widget-settings-group" aria-labelledby="widget-desktop-window-title">
   <h4 id="widget-desktop-window-title">{t('桌面窗口')}</h4>
   <label className="widget-option-row widget-desktop-toggle"><span>{t('显示桌面监测')}</span><input type="checkbox" checked={config.enabled} onChange={e=>update({enabled:e.target.checked})}/></label>
   <div className="widget-check-grid widget-desktop-behavior">{behavior.map(check)}</div>
   {config.clickThrough&&<p className="widget-group-note">{t('穿透开启时，可从托盘或双击 EXE 回到设置。')}</p>}
  </section>
  <section className="widget-settings-group" aria-labelledby="widget-desktop-metrics-title">
   <h4 id="widget-desktop-metrics-title">{t('显示项目')}</h4>
   <div className="widget-option-list">
    {field('双击动作','doubleClick',[['settings','打开小组件设置'],['taskmanager','打开任务管理器'],['none','不执行操作']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>))}
    {field('读数字号','fontSize',[11,12,13,14,15,16,18,20,21].map(size=><option key={size} value={String(size)}>{size} px</option>))}
    {field('内存显示','memoryMode',[['percent','已用百分比'],['used','已用容量'],['free','可用容量']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>))}
   </div>
   <div className="widget-check-grid widget-desktop-fields">{metricList.map(([id,label])=><label key={id} className="native-setting-check"><input type="checkbox" checked={metrics.includes(id)} disabled={metrics.length===1&&metrics.includes(id)} onChange={e=>update({metrics:e.target.checked?[...metrics,id]:metrics.filter(x=>x!==id)})}/><span>{t(label)}</span></label>)}</div>
   <div className="widget-option-list widget-desktop-fields">{presentation.map(actionRow)}</div>
  </section>
  <section className="widget-settings-group" aria-labelledby="widget-desktop-labels-title">
   <h4 id="widget-desktop-labels-title">{t('显示文字与颜色')}</h4>
   <div className="widget-desktop-custom">
    {selected.map(([id,label])=>{
     const color=target?.metric===id?preview?.value??config.colors?.[id]:config.colors?.[id];
     return <div key={id} className="widget-desktop-item"><label htmlFor={'widget-label-'+id}>{t(label)}</label><input id={'widget-label-'+id} value={config.labels?.[id]??''} placeholder={t(label)} maxLength={12} onChange={e=>update({labels:{...config.labels,[id]:e.target.value}})}/>
      <button type="button" className="tb-color-chip" style={{'--chip':color??'var(--text)'}} aria-label={`${t(label)} · ${t('读数颜色')}`} aria-haspopup="dialog" aria-expanded={target?.metric===id} title={color??t('当前使用默认颜色')} onClick={e=>{setPreview(null);setTarget({metric:id,part:'reading',label:'读数',anchor:e.currentTarget,fallback:actualColor('var(--text)'),background:actualColor('var(--surface)')});}}><i/></button></div>;
    })}
   </div>
  </section>
  {active&&target&&<TaskbarColorPicker key={target.metric} target={target} original={config.colors?.[target.metric]??null} preview={value=>setPreview({value})} finish={finish} previewMessage="应用后更新桌面监测颜色"/>}
 </div>;
}
