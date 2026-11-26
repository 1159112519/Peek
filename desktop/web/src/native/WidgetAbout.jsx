import React,{useEffect,useState} from 'react';
import {CheckCircle2,ExternalLink,Info,RefreshCw} from 'lucide-react';
import {Button} from '../components';
import {t} from '../i18n/index.js';
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

export function WidgetAbout({info,iconThemeId,automatic,onAutomaticChange,dirty,status,setStatus}) {
 const [linkError,setLinkError]=useState(false);
 async function openReleases(){
  setLinkError(false);
  try{await native.request('widget.updates.releases')}catch{setLinkError(true)}
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
 return <div className="widget-general-groups">
  <section className="widget-settings-group widget-about-identity" aria-labelledby="widget-about-name">
   <img className="peek-about-icon" alt="" src={peekIconSrc(iconThemeId)} width="40" height="40"/>
   <div className="widget-about-copy"><h4 id="widget-about-name">Peek</h4>
    <p className="widget-about-meta">{info ? <><span>{t('版本')} v{info.version}</span><span>{t('Windows 正式版')}</span></> : t('正在读取版本…')}</p>
   </div>
   <Button className="widget-about-action" icon={RefreshCw} data-alternate={alternate||undefined} disabled={!info||installing||(canInstall&&dirty)} busy={checking} onClick={()=>update(action)}>
    <span className="widget-about-action-reference" aria-hidden={alternate||undefined}>{t('检查更新')}</span>
    {alternate&&<span className="widget-about-action-label">{t(actionText)}</span>}
   </Button>
  </section>
  <section className="widget-settings-group" aria-labelledby="widget-about-updates">
   <h4 id="widget-about-updates">{t('软件更新')}</h4>
   <div className="widget-option-list">
    <div className="widget-option-row widget-about-update-row">
     <div className="widget-about-status" data-state={status.state} role="status">
      <StatusIcon size={14} aria-hidden="true"/><span>{t(statusText[status.state]||statusText.error,[`v${status.version}`])}</span>
     </div>
     <Button icon={ExternalLink} onClick={openReleases} disabled={installing}>{t('查看发布记录')}</Button>
    </div>
    {downloading&&<progress className="widget-update-progress" aria-label={t('更新下载进度')} value={status.progress||0} max="100"/>}
    {canInstall&&dirty&&<p className="widget-group-note">{t('请先应用或取消更改，再安装更新。')}</p>}
    {status.state==='applyError'&&status.detail&&<p className="widget-group-note" role="alert">{t(status.detail)}</p>}
    <label className="widget-option-row widget-about-auto">
     <span>{t('启动时自动检查更新')}</span><input type="checkbox" checked={automatic===true} disabled={automatic==null||downloading||installing} onChange={e=>onAutomaticChange(e.target.checked)}/>
    </label>
   </div>
   {linkError&&<p className="widget-group-note" role="alert">{t('无法打开 GitHub 发布页。')}</p>}
  </section>
 </div>;
}
