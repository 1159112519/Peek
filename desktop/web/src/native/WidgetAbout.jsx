import React,{useCallback,useEffect,useState} from 'react';
import {CheckCircle2,FileText,Github,History,Info,RefreshCw} from 'lucide-react';
import {createPortal} from 'react-dom';
import {Button,Modal} from '../components';
import {t,tr} from '../i18n/index.js';
import releases from './about-releases.json';
import {peekIconSrc} from './PeekIcons';
import {native} from './bridge';

const statusText={idle:'通过 GitHub 获取 Peek 正式版。',checking:'正在检查官方更新…',current:'当前已是最新版本',available:'发现新版本 {0}',downloading:'正在下载更新',ready:'更新已下载并校验',installing:'正在安装并重启 Peek…',applyError:'更新未完成，当前设置已保留。',unpublished:'GitHub 暂无 Peek 正式版。',error:'检查更新未完成，请稍后重试。'};
const idle={state:'idle'};

export function usePeekUpdateStatus(){
 const [status,setStatus]=useState(idle);
 useEffect(()=>{
  let active=true,observed=false;
  const unsubscribe=native.subscribe(next=>{observed=true;setStatus(next)},'peek-update');
  native.request('widget.updates.status').then(next=>{if(active&&!observed)setStatus(next)}).catch(()=>{});
  return ()=>{active=false;unsubscribe()};
 },[]);
 return [status,setStatus];
}

function AboutLog({onClose}){
 return createPortal(<Modal title={t('最近更新')} className="peek-about-log" onClose={onClose}>
  <div className="peek-about-log-scroll">{releases.length?releases.map(release=><article key={release.version}>
   <header><strong>v{release.version}</strong><time dateTime={release.date}>{release.date}</time></header>
   <ul>{[...release.added,...release.improved,...release.fixed].map((item,index)=><li key={index}>{tr(item)}</li>)}</ul>
  </article>):<p>{t('没有随附最近更新记录。')}</p>}</div>
 </Modal>,document.body);
}

function AboutEntry({icon:Icon,title,description,onClick,opensDialog}){
 return <button type="button" className="widget-about-entry" aria-haspopup={opensDialog?'dialog':undefined} onClick={onClick}>
  <Icon size={16} aria-hidden="true"/><span><strong>{title}</strong><small>{description}</small></span>
 </button>;
}

export function WidgetAbout({info,iconThemeId,automatic,onAutomaticChange,dirty,status,setStatus}) {
 const [linkError,setLinkError]=useState(false),[log,setLog]=useState(null);
 const closeLog=useCallback(()=>setLog(null),[]);
 async function openGitHub(page){
  setLinkError(false);
  try{await native.request('widget.about.'+page)}catch{setLinkError(true)}
 }
 async function update(action){
  // Native events own the state; a reply can arrive after a newer progress event.
  try{await native.request('widget.updates.'+action);}
  catch{setStatus(before=>({...before,state:action==='check'?'error':'applyError'}));}
 }
 const checking=status.state==='checking',downloading=status.state==='downloading',installing=status.state==='installing',ready=status.state==='ready';
 const canInstall=Boolean(status.version&&(ready||status.state==='available'||status.state==='applyError'));
 const action=downloading?'cancel':ready?'apply':canInstall?'install':'check';
 const actionText=downloading?'取消下载':installing?'正在安装…':canInstall?'安装并重启':'检查更新';
 const alternate=actionText!=='检查更新';
 const StatusIcon=status.state==='current'?CheckCircle2:Info;
 return <section className="widget-settings-group widget-about" aria-labelledby="widget-about-name">
  <header className="widget-about-identity">
   <img className="peek-about-icon" alt="" src={peekIconSrc(iconThemeId)} width="40" height="40"/>
   <div className="widget-about-copy"><h4 id="widget-about-name">Peek</h4>
    <p className="widget-about-meta">{info ? <><span>v{info.version}</span><span>{t('Windows 正式版')}</span></> : t('正在读取版本…')}</p>
   </div>
   <Button className="widget-about-action" icon={RefreshCw} data-alternate={alternate||undefined} disabled={!info||installing||(canInstall&&dirty)} busy={checking} onClick={()=>update(action)}>
    <span className="widget-about-action-reference" aria-hidden={alternate||undefined}>{t('检查更新')}</span>
    {alternate&&<span className="widget-about-action-label">{t(actionText)}</span>}
   </Button>
  </header>
  <div className="widget-about-details">
   <div className="widget-about-status" data-state={status.state} role="status">
    <StatusIcon size={14} aria-hidden="true"/><span>{t(statusText[status.state]||statusText.error,[`v${status.version}`])}</span>
   </div>
   {downloading&&<progress className="widget-update-progress" aria-label={t('更新下载进度')} value={status.progress||0} max="100"/>}
   {canInstall&&dirty&&<p className="widget-group-note">{t('请先应用或取消更改，再安装更新。')}</p>}
   {status.state==='applyError'&&status.detail&&<p className="widget-group-note" role="alert">{t(status.detail)}</p>}
   <div className="widget-about-startup">
    <label className="widget-inline-check">
     <input type="checkbox" checked={automatic===true} disabled={automatic==null||downloading||installing} onChange={e=>onAutomaticChange(e.target.checked)}/>
     <span>{t('启动时自动检查更新')}</span>
    </label>
    <p>{t('启动时静默检查，发现新版本后询问。')}</p>
   </div>
   <div className="widget-about-entries" role="group" aria-label={t('版本信息与帮助')}>
    <AboutEntry icon={FileText} title={t('版本日志')} description={t('在 GitHub 查看此版本')} onClick={()=>openGitHub('version')}/>
    <AboutEntry icon={History} title={t('最近更新')} description={t('最近三个版本')} onClick={()=>setLog('recent')} opensDialog/>
    <AboutEntry icon={Github} title="GitHub" description={t('项目主页')} onClick={()=>openGitHub('github')}/>
   </div>
   {linkError&&<p className="widget-group-note" role="alert">{t('无法打开 GitHub 页面。')}</p>}
  </div>
  {log&&<AboutLog onClose={closeLog}/>}
 </section>;
}
