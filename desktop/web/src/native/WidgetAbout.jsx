import React,{useEffect,useState} from 'react';
import {CheckCircle2,ExternalLink,Info,RefreshCw} from 'lucide-react';
import {Button} from '../components';
import {t} from '../i18n/index.js';
import {peekIconSrc} from './PeekIcons';
import {native} from './bridge';

const statusText={idle:'通过 GitHub 获取 Peek 正式版。',checking:'正在检查官方更新…',current:'当前已是最新版本',available:'发现新版本 {0}',unpublished:'GitHub 暂无 Peek 正式版。',error:'检查更新未完成，请稍后重试。'};
const idle={state:'idle'};

export function WidgetAbout({info,iconThemeId,automatic,onAutomaticChange}) {
 const [status,setStatus]=useState(idle),[linkError,setLinkError]=useState(false);
 useEffect(()=>{
  let active=true,observed=false;
  const unsubscribe=native.subscribe(next=>{observed=true;setStatus(next)},'peek-update');
  native.request('widget.updates.status').then(next=>{if(active&&!observed)setStatus(next)}).catch(()=>{});
  return ()=>{active=false;unsubscribe()};
 },[]);
 async function check(){
  setStatus({state:'checking'});
  try{setStatus(await native.request('widget.updates.check'))}catch{setStatus({state:'error'})}
 }
 async function openReleases(){
  setLinkError(false);
  try{await native.request('widget.updates.releases')}catch{setLinkError(true)}
 }
 const checking=status.state==='checking';
 const StatusIcon=status.state==='current'?CheckCircle2:Info;
 return <div className="widget-general-groups">
  <section className="widget-settings-group widget-about-identity" aria-labelledby="widget-about-name">
   <img className="peek-about-icon" alt="" src={peekIconSrc(iconThemeId)} width="40" height="40"/>
   <div className="widget-about-copy"><h4 id="widget-about-name">Peek</h4>
    <p className="widget-about-meta">{info ? <><span>{t('版本')} v{info.version}</span><span>{t('Windows 正式版')}</span></> : t('正在读取版本…')}</p>
   </div>
   <Button icon={RefreshCw} disabled={!info} busy={checking} onClick={check}>{t('检查更新')}</Button>
  </section>
  <section className="widget-settings-group" aria-labelledby="widget-about-updates">
   <h4 id="widget-about-updates">{t('软件更新')}</h4>
   <div className="widget-option-list">
    <div className="widget-option-row widget-about-update-row">
     <div className="widget-about-status" data-state={status.state} role="status">
      <StatusIcon size={14} aria-hidden="true"/><span>{t(statusText[status.state]||statusText.error,[`v${status.version}`])}</span>
     </div>
     <Button icon={ExternalLink} onClick={openReleases}>{t('查看发布记录')}</Button>
    </div>
    <label className="widget-option-row widget-about-auto">
     <span>{t('启动时自动检查更新')}</span><input type="checkbox" checked={automatic===true} disabled={automatic==null} onChange={e=>onAutomaticChange(e.target.checked)}/>
    </label>
   </div>
   {linkError&&<p className="widget-group-note" role="alert">{t('无法打开 GitHub 发布页。')}</p>}
  </section>
 </div>;
}
