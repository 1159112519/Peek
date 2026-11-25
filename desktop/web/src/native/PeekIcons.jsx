import React from 'react';
import {Check} from 'lucide-react';
import {t,useLocale} from '../i18n/index.js';
import themes from './peek-icon-themes.json';

export const peekIconTheme=id=>themes.find(theme=>theme.id===id)??themes[0];
export const peekIconSrc=id=>`/peek-icons/${peekIconTheme(id).id}.png`;
export function PeekIconPicker({value,onChange}){
 useLocale();
 const selected=peekIconTheme(value);
 return <section className="widget-settings-group peek-icon-picker" aria-labelledby="peek-icon-heading">
  <h4 id="peek-icon-heading">{t('应用图标')}</h4>
  <fieldset className="peek-icon-choices" aria-labelledby="peek-icon-heading">
   {themes.map(theme=><label key={theme.id} className="peek-icon-choice" data-selected={selected.id===theme.id}>
    <input name="peek-icon" type="radio" value={theme.id} aria-label={t(theme.name)} checked={selected.id===theme.id} onChange={()=>onChange(theme.id)}/>
    <img src={peekIconSrc(theme.id)} width="32" height="32" alt="" draggable="false"/>

    {selected.id===theme.id&&<Check size={12} aria-hidden="true"/>}
   </label>)}
  </fieldset>
  <p className="native-setting-help">{t('应用后更换窗口与通知区图标，不随深浅色切换。')}</p>
 </section>;
}
