import {setLanguage} from './i18n/index.js';
import {native} from './native/bridge.js';
import React from "react";
import { createRoot } from "react-dom/client";
// Keep the shipped cascade: app dependencies first, then the shared and theme overrides.
import NativeApp from "./native/NativeApp.jsx";
import {WidgetApp,prepareWidget} from "./native/WidgetApp.jsx";
import "./foundation/tokens.css";
import "./styles.css";
import "./foundation/ui.css";
import "./refinements.css";
import "./native/native.css";
import "./motion-layout.css";
import "./native/layout.css";
import "./gpu-inspector.css";
import "./native/state.css";

import "./native/readability.css";
import "./resizable-table.css";
import "./native/usability.css";

// The launch shell stays up until each interface font weight is available.
// Mounting first would allow fallback glyphs to move when a popup is opened.
async function mount(){
 const widget=globalThis.__ASTER_WIDGET===true;
 const settings=native.available?native.request('desktop.settings').then(value=>({value}),error=>({error:error.message})):Promise.resolve({});
 const faces=['400 14px Inter','400 14px "HarmonyOS Sans SC"','500 14px "HarmonyOS Sans SC"','700 14px "HarmonyOS Sans SC"'];
 const fonts=Promise.allSettled(faces.map((face,i)=>document.fonts.load(face,i?'设置':'AsterHub 0123456789')));
 const [initial,loaded]=await Promise.all([settings,fonts]);
 if(initial.value)setLanguage(initial.value.language);
 if(loaded.some(r=>r.status==='rejected'||!r.value.length))console.error('Unable to load an interface font');
 if(widget){
   prepareWidget();
   createRoot(document.getElementById('root')).render(<React.StrictMode><WidgetApp initialSettings={initial.value} initialError={initial.error}/></React.StrictMode>);
 }else{
   if(initial.error)console.error('Language preferences unavailable',initial.error);
   createRoot(document.getElementById('root')).render(<React.StrictMode><NativeApp/></React.StrictMode>);
 }
}
void mount().catch(error=>{
 console.error('Interface initialization failed',error);
 if(globalThis.__ASTER_WIDGET===true)void native.request('widget.load-failed',{error:String(error.message||error)}).catch(()=>{});
});
import "./appearance/appearance.css";

import './foundation/control-alignment.css';

import './i18n/english-layout.css';
