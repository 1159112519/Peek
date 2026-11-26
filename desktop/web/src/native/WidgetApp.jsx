import React,{useEffect,useLayoutEffect,useState} from 'react';
import {Check,Sun,Moon,Monitor} from 'lucide-react';
import {Button,IconButton} from '../components';
import {ThemedSelect} from '../themed-select';
import {ToolNavigation} from '../foundation/ToolNavigation';
import {useOpticalAlignment} from '../foundation/optical-alignment';
import {installMotionTokens} from '../motion';
import {applyAppearance,resolveAppearance} from '../appearance/resolve-appearance';
import {setLanguage,t,useLocale} from '../i18n/index.js';
import {TaskbarSettings} from './TaskbarSettings';
import {WidgetTaskbarOptions} from './WidgetTaskbarOptions';
import {WidgetSampling,WidgetReminders} from './WidgetOptions';
import {WidgetDesktopSettings} from './WidgetDesktopSettings';
import {WidgetAbout,usePeekUpdateStatus} from './WidgetAbout';
import {PeekIconPicker,peekIconSrc} from './PeekIcons';
import {native} from './bridge';
import './widget-settings.css';

function applyWidgetAppearance(appearance){
 applyAppearance(resolveAppearance({theme:appearance?.theme,appearanceMode:appearance?.mode},appearance?.mode!=='light'));
}

export function prepareWidget(){
 installMotionTokens();
 applyWidgetAppearance(globalThis.__ASTER_APPEARANCE);
 document.documentElement.dataset.widgetWindow='true';
 document.title='Peek';
}

const appearanceOptions=[['light',Sun,'浅色'],['dark',Moon,'深色'],['system',Monitor,'跟随系统']];

const settingsTabs=[['general','常规'],['taskbar','任务栏'],['desktop','桌面'],['sampling','采集'],['about','关于']];
const pageTitles={taskbar:'任务栏布局',desktop:'桌面组件',sampling:'数据采集',general:'常规设置',about:'关于与更新'};
function WidgetPage({name,busy,children}){
 return <div className="native-preferences-body widget-settings-body"><div className="widget-page" inert={busy||undefined}>
  <header className="widget-page-heading"><h1>{t(pageTitles[name])}</h1></header>{children}
 </div></div>;
}
export function WidgetApp({initialSettings,initialError}){
 useLocale();
 useOpticalAlignment();
 const [saved,setSaved]=useState(initialSettings),[draft,setDraft]=useState(initialSettings),[busy,setBusy]=useState(false),[error,setError]=useState(initialError||''),[done,setDone]=useState(false);
 const [visible,setVisible]=useState(false),[epoch,setEpoch]=useState(0);
 useLayoutEffect(()=>native.subscribe(message=>{
  setVisible(message.visible);
  if(!message.reset)return;
  setLanguage(message.reset.language);setDraft(message.reset);setSaved(message.reset);
  setBusy(false);setError('');setDone(false);setPage('general');setEpoch(message.epoch);
 },'widget-visibility'),[]);
 useLayoutEffect(()=>{document.getElementById('launch-shell')?.remove()},[]);
 const [page,setPage]=useState('general'),[sources,setSources]=useState(null);
 useEffect(()=>{
  if(!visible||page==='desktop'||page==='about')return;
  let active=true,pending=false,timer,attempts=0;
  const normalInterval=page==='general'?5000:12000;
  const keys=page==='taskbar'?['displays']:page==='sampling'?['adapters','volumes','disks']:['trafficBytes','gpuAvailable'];
  async function read(){
   if(!active||pending||document.hidden)return;
   clearTimeout(timer);pending=true;let interval=normalInterval;
   try{
    const source=await native.request('widget.sources');
    if(!active)return;
    if(page==='sampling'&&source.volumes==null&&attempts++<8)interval=900;
    setSources(old=>keys.every(key=>JSON.stringify(old?.[key])===JSON.stringify(source[key]))?old:{...old,...Object.fromEntries(keys.map(key=>[key,source[key]]))});
   }catch(e){if(active)setError(e.message);}
   finally{pending=false;if(active&&!document.hidden)timer=setTimeout(read,interval);}
  }
  void read();
  document.addEventListener('visibilitychange',read);
  return ()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',read);};
 },[page,visible]);
 useEffect(()=>{const favicon=document.querySelector('link[rel=icon]');if(favicon&&saved){favicon.type='image/png';favicon.href=peekIconSrc(saved.iconThemeId);}},[saved?.iconThemeId]);
 const [updateStatus,setUpdateStatus]=usePeekUpdateStatus();
 const updateInProgress=updateStatus.state==='downloading'||updateStatus.state==='installing';
 const dirty=Boolean(draft&&saved&&Object.keys(draft).some(key=>draft[key]!==saved[key]));
 const [appearanceMode,setAppearanceMode]=useState(globalThis.__ASTER_WIDGET_MODE??'dark');
 useEffect(()=>native.subscribe(value=>{applyWidgetAppearance(value);setAppearanceMode(value.preference);},'widget-appearance'),[]);
 async function setAppearance(mode){
  try{await native.request('widget.appearance',{mode});}catch(e){setError(e.message);}
 }
 const appearanceActions=<div className="widget-appearance-actions" role="group" aria-label={t('界面外观')}>
  {appearanceOptions.map(([mode,Icon,label])=><IconButton key={mode} icon={Icon} label={t(label)} className={mode===appearanceMode?'selected':''} aria-pressed={mode===appearanceMode} onClick={()=>setAppearance(mode)}/>)}
 </div>;
 // A ready notification belongs to a committed view, including a reset on dismissal.
 useEffect(()=>{
  if(!draft&&!error)return;
  let live=true, raf=0;
  void document.fonts.ready.then(()=>{
   if(live)raf=requestAnimationFrame(()=>{raf=requestAnimationFrame(()=>{if(live)void native.request('widget.ready',{epoch}).catch(()=>{});});});
  });
  return ()=>{live=false;cancelAnimationFrame(raf);};
 },[epoch,Boolean(draft),Boolean(error)]);
 function change(key,value){if(updateInProgress)return;setDraft(previous=>({...previous,[key]:value}));setDone(false);setError('');}
 async function close(){try{await native.request('widget.close')}catch(e){setError(e.message);}}
 async function apply(closeAfter=false){
  if(!draft||busy||updateInProgress)return;
  setBusy(true);setError('');
  try{const next=await native.request('widget.save',{taskbar:draft.taskbar,startup:draft.startup,autoCheckUpdates:draft.autoCheckUpdates,trayVisible:draft.trayVisible,language:draft.language,localIntervalMs:draft.localIntervalMs,monitoring:draft.monitoring,desktop:draft.desktop,iconThemeId:draft.iconThemeId});setLanguage(next.language);setDraft(next);setSaved(next);setDone('已应用');if(closeAfter)await close();}
  catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function repairStartup(){
  if(!saved||busy||updateInProgress)return;
  setBusy(true);setError('');setDone(false);
  try{
   const next=await native.request('widget.startup.repair');
   setSaved(old=>({...old,startup:next.startup,startupNeedsRepair:next.startupNeedsRepair}));
   setDraft(old=>({...old,startup:old.startup===saved.startup?next.startup:old.startup,startupNeedsRepair:next.startupNeedsRepair}));
   setDone('已重设登录启动项');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function openData(){try{await native.request('widget.data.open');}catch(e){setError(e.message);}}
 return <main className="widget-settings-window native-preferences" aria-label={t('小组件设置分类')}>
  <ToolNavigation density="compact" label={t('小组件设置分类')} items={settingsTabs} value={page} onChange={setPage} actions={appearanceActions} panels={{
   taskbar:<WidgetPage name="taskbar" busy={busy||updateInProgress}>
    {draft?<TaskbarSettings key={epoch} standalone active={visible&&page==='taskbar'} value={draft.taskbar} savedValue={saved.taskbar} settings={props=><WidgetTaskbarOptions {...props} displays={sources?.displays} openWindows={async()=>{try{await native.request('widget.windows.taskbar')}catch(e){setError(e.message)}}}/>} onChange={value=>change('taskbar',value)}/>:!error&&<p role="status">{t('正在读取设置…')}</p>}
   </WidgetPage>,
   desktop:<WidgetPage name="desktop" busy={busy||updateInProgress}>{draft&&<WidgetDesktopSettings draft={draft} saved={saved?.desktop} change={change} active={visible&&page==='desktop'}/>}</WidgetPage>,
   sampling:<WidgetPage name="sampling" busy={busy||updateInProgress}>{draft&&<WidgetSampling draft={draft} monitoring={saved?.monitoring} active={visible&&page==='sampling'} change={change} sources={sources}/>}</WidgetPage>,
   general:<WidgetPage name="general" busy={busy||updateInProgress}>
    {draft&&<div className="widget-general-groups">
     <section className="widget-settings-group" aria-labelledby="widget-monitoring-heading">
      <h4 id="widget-monitoring-heading">{t('监测显示')}</h4>
      <div className="widget-option-list">
       {[["taskbar","显示任务栏监测"],["desktop","显示桌面监测"]].map(([key,label])=>
        <label className="widget-option-row" key={key}><span>{t(label)}</span><input type="checkbox" checked={Boolean(draft[key].enabled)} onChange={e=>change(key,{...draft[key],enabled:e.target.checked})}/></label>
       )}
      </div>
     </section>
     <section className="widget-settings-group" aria-labelledby="widget-startup-heading">
      <h4 id="widget-startup-heading">{t('启动')}</h4>
      <div className="widget-option-list">
       <label className="widget-option-row widget-startup-check"><span>{t('登录 Windows 时静默启动')}</span><input type="checkbox" checked={draft.startup} disabled={busy} aria-describedby="widget-startup-help" onChange={e=>change('startup',e.target.checked)}/></label>
      </div>
      {(saved.startup||saved.startupNeedsRepair)&&<div className="widget-option-row"><span>{t('登录启动路径')}</span><Button onClick={repairStartup} disabled={busy||!(saved.startup||saved.startupNeedsRepair)}>{t('重设登录启动项')}</Button></div>}
      <p className="native-setting-help" id="widget-startup-help">{t(saved.startupNeedsRepair?'登录启动项指向旧位置，重设后会使用当前 EXE。':'登录时在后台运行，不打开设置窗口。')}</p>
     </section>
     <section className="widget-settings-group" aria-labelledby="widget-behavior-heading">
      <h4 id="widget-behavior-heading">{t('界面与托盘')}</h4>
      <div className="widget-option-list">
       <label className="widget-option-row"><span>{t('界面语言')}</span><ThemedSelect aria-label={t('界面语言')} disabled={busy} value={draft.language} onChange={e=>change('language',e.target.value)}><option value="zh-CN">简体中文</option><option value="en">English</option></ThemedSelect></label>
       <label className="widget-option-row"><span>{t('显示通知区图标')}</span><input type="checkbox" checked={draft.trayVisible} disabled={busy} aria-label={t('显示通知区图标')} onChange={e=>change('trayVisible',e.target.checked)}/></label>
      </div>
     </section>
     <WidgetReminders draft={draft} change={change} sources={sources}/>
     <section className="widget-settings-group widget-data-group" aria-labelledby="widget-data-heading">
      <div className="widget-option-row widget-data-row">
       <h4 id="widget-data-heading">{t('配置和数据')}</h4>
       <code className="widget-data-path" title={draft.dataPath}>{draft.dataPath}</code>
       <Button onClick={openData}>{t('打开配置文件夹')}</Button>
      </div>
     </section>
     <PeekIconPicker value={draft.iconThemeId} onChange={value=>change('iconThemeId',value)}/>
    </div>}
   </WidgetPage>,
   about:<WidgetPage name="about" busy={busy}><WidgetAbout info={saved?.appInfo} iconThemeId={saved?.iconThemeId} automatic={draft?.autoCheckUpdates} dirty={dirty} status={updateStatus} setStatus={setUpdateStatus} onAutomaticChange={value=>change('autoCheckUpdates',value)}/></WidgetPage>
  }}/>
  <footer className="widget-settings-footer"><div className="widget-settings-footer-inner">
   <div className="widget-settings-feedback">
    {error?<p className="native-error" role="alert">{error}</p>:<span className="native-settings-result" data-dirty={dirty} role="status">{(busy||dirty||done)&&<>{!busy&&!dirty&&done&&<Check size={14} aria-hidden="true"/>}<span className="widget-footer-label">{t(busy?'正在应用…':dirty?'有未应用的更改':done)}</span></>}</span>}
   </div>
   <div className="widget-settings-actions">
    <Button onClick={close} disabled={busy||updateInProgress}>{t('取消')}</Button>
    <Button onClick={()=>apply()} disabled={busy||!draft||updateInProgress}>{t('应用')}</Button>
    <Button tone="primary" onClick={()=>apply(true)} disabled={busy||!draft||updateInProgress}>{t('确定')}</Button>
   </div>
  </div></footer>
 </main>;
}



