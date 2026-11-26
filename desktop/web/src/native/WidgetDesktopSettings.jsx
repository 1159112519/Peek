import React,{useEffect,useId,useRef,useState} from 'react';
import {Activity,ArrowLeftRight,Grip,RotateCcw,Tag,Undo2,X} from 'lucide-react';
import {ThemedSelect} from '../themed-select';
import {t} from '../i18n/index.js';
import {ColorPane} from './TaskbarColorPane';
import {Readout,taskbarPreviewFootprint} from './TaskbarReadout';
import {taskbarMetrics} from './taskbar-layout';
import {displayModule,groups,moduleLabel,nameVariants,partLabels,variantLabel} from './taskbar-composer';
import {tabs,moveTab,withColor} from './taskbar-colors.mjs';
import {createTaskbarPreviewFeed} from './taskbar-preview';
import {native} from './bridge';

const behavior=[['topmost','始终置顶'],['clickThrough','鼠标穿透'],['locked','锁定位置'],['allowOutside','允许超出屏幕边界'],['hideFullscreen','全屏时隐藏']];
const presentation=[['swapNetwork','交换上传与下载位置'],['showUnits','显示单位'],['showTooltips','显示鼠标提示']];
const details=Object.fromEntries(taskbarMetrics.map(([id,label])=>[id,label]));
const inkWidth=118,cellHeight=17,insetX=11,insetY=8,limit=3,taskbarGap=12;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const height=r=>2*insetY+r*cellHeight;
const rowAt=size=>clamp(Math.round((size-2*insetY)/cellHeight),1,limit);
const indices=(cols,rows)=>Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>r*3+c)).flat();
const dragType='application/x-peek-desktop-cell';
const defaultVariant=id=>id==='up'||id==='down'?'arrow':id.startsWith('cpu')||id.startsWith('gpu')&&!['gpuMemory','gpuFan','gpuPower'].includes(id)||['storageRead','storageWrite'].includes(id)?'english':'chinese';
export function WidgetDesktopSettings({draft,saved,change,active}){
 const config=draft.desktop;
 const [colorDraft,setColorDraft]=useState(null),[snapshot,setSnapshot]=useState(null),[series,setSeries]=useState({}),[selected,setSelected]=useState(0);
 const [editorMode,setEditorMode]=useState('components'),[category,setCategory]=useState(0),[undo,setUndo]=useState([]),[moveFrom,setMoveFrom]=useState(null);
 const tabsId=useId();
 const [dragSize,setDragSize]=useState(null),[dragOver,setDragOver]=useState(null);
 const gesture=useRef(null),seen=useRef({});
 useEffect(()=>{if(!active){setColorDraft(null);setDragOver(null);return;}return createTaskbarPreviewFeed(native,'local',value=>{
  setSnapshot(value);if(!value)return;
  const next=[];for(const [id,sample] of Object.entries(value.values??{})){
   if(sample.stale||!Number.isFinite(sample.value)||seen.current[id]===sample.timeUtc)continue;
   seen.current[id]=sample.timeUtc;next.push([id,sample.value,sample.unit]);
  }
  if(next.length)setSeries(before=>{const copy={...before};for(const [id,value,unit] of next)copy[id]={unit,points:[...(before[id]?.unit===unit?before[id].points:[]).slice(-12),value]};return copy;});
 });},[active]);
 if(!config)return null;
 const update=patch=>change('desktop',{...config,...patch});
 const check=([key,label])=><label className="native-setting-check" key={key}><input type="checkbox" checked={Boolean(config[key])} onChange={e=>update({[key]:e.target.checked})}/><span>{t(label)}</span></label>;
 const actionRow=([key,label])=><label className="widget-option-row" key={key}><span>{t(label)}</span><input type="checkbox" checked={Boolean(config[key])} onChange={e=>update({[key]:e.target.checked})}/></label>;
 const field=(label,key,options)=><label className="widget-option-row widget-source-field"><span>{t(label)}</span><ThemedSelect aria-label={t(label)} value={String(config[key])} onChange={e=>update({[key]:e.target.value})}>{options}</ThemedSelect></label>;
 const cols=config.columns??3,rows=config.rows??2,cells=Array.from({length:9},(_,i)=>config.cells?.[i]??(!config.cells?config.metrics?.[i]:null)??null);
 const displayCells=cells.slice(),down=cells.indexOf('down'),up=cells.indexOf('up');if(config.swapNetwork&&down>=0&&up>=0)[displayCells[down],displayCells[up]]=[displayCells[up],displayCells[down]];
 const sourceIndex=i=>config.swapNetwork&&down>=0&&up>=0?(i===down?up:i===up?down:i):i;
 const layout=draft.taskbar?.layout,allPages=layout?.pages??[],activePage=allPages.findIndex(p=>p.id===layout.activePageId);
 const modules=new Map();for(let n=0;n<allPages.length;n++){const page=allPages[(Math.max(0,activePage)+n)%allPages.length];for(const slot of page.slots??[]){const module=slot.module;if(module&&!modules.has(module.metricId))modules.set(module.metricId,displayModule(module,page.grid.columns));}}
 const moduleFor=id=>{
  const base=modules.get(id)??{metricId:id,name:{variant:defaultVariant(id)},parts:['number']},custom=config.modules?.[id];
  return {...base,name:{variant:custom?.variant??base.name.variant},parts:custom?.parts?.length?custom.parts:base.parts};
 };
 const colors={...layout?.colors};for(const [id,color] of Object.entries(config.colors??{}))colors[id]={...colors[id],reading:color};
 for(const [id,row] of Object.entries(config.palette??{}))colors[id]={...colors[id],...row};
 const previewColors=colorDraft?withColor(colors,colorDraft.metric,colorDraft.part,colorDraft.value):colors;
 const format={...draft.taskbar,memoryMode:config.memoryMode},visible=indices(cols,rows),slot=visible.includes(selected)?selected:visible[0];
 // Move the assembled taskbar readout as one group. Keep its tracks untouched.
 const bandsFor=rowCount=>Array.from({length:3},(_,col)=>{
  const occupied=Array.from({length:rowCount},(_,r)=>displayCells[r*3+col]).filter(Boolean);
  const bounds=occupied.map(id=>taskbarPreviewFootprint(moduleFor(id),null,inkWidth,layout?.typography,format,config.labels?.[id],!config.showUnits));
  const left=bounds.length?Math.min(...bounds.map(b=>b.left)):0;
  return {left,span:bounds.length?Math.ceil(Math.max(...bounds.map(b=>b.right))-left):48};
 });
 const measureBands=rowCount=>{const bands=bandsFor(rowCount),edges=[0];for(let i=0;i<3;i++)edges.push(edges[i]+bands[i].span+(i?taskbarGap:0));return {bands,edges};};
 const {bands,edges}=measureBands(rows);
 const width=columns=>edges[columns]+insetX*2;
 const colAt=size=>[1,2,3].reduce((best,i)=>Math.abs(width(i)-size)<=Math.abs(width(best)-size)?i:best,1);
 const selectedId=displayCells[slot];
 const visualPatch=patch=>{setUndo(before=>[...before.slice(-19),{cells:config.cells,modules:config.modules,labels:config.labels,palette:config.palette,colors:config.colors}]);update(patch);};
 const move=(i,payload)=>{
  const item=typeof payload==='string'?{id:payload}:payload,id=item?.id;
  if(!id||!details[id])return;
  const real=sourceIndex(i),prior=cells.indexOf(id),next=cells.slice();if(prior>=0)next[prior]=next[real];next[real]=id;
  let style=config.modules;
  if(item.part||item.variant){let parts=moduleFor(id).parts;
   if(item.part){parts=prior===real&&!parts.includes(item.part)&&parts.length<2?[...parts,item.part]:[item.part];}
   style={...style,[id]:{...style?.[id],...(item.part?{parts}:{}),...(item.variant?{variant:item.variant}:{})}};
  }
  visualPatch({cells:next,modules:style});setSelected(i);
 };
 const startMetric=(e,id,extra={})=>{e.dataTransfer.setData(dragType,JSON.stringify({id,...extra}));e.dataTransfer.effectAllowed='move';};
 const acceptMetric=e=>{try{return JSON.parse(e.dataTransfer.getData(dragType));}catch{return null;}};
 const chooseSlot=i=>{
  if(moveFrom!=null&&moveFrom!==i){const a=sourceIndex(moveFrom),b=sourceIndex(i),next=cells.slice();[next[a],next[b]]=[next[b],next[a]];visualPatch({cells:next});}
  setMoveFrom(null);setSelected(i);
 };
 const categoryNav=label=><nav className="tb42-categories" aria-label={t(label)} style={{'--tb-cat-index':category}}><span className="tb42-category-marker" aria-hidden="true"/>{groups.map(([name],i)=><button type="button" key={name} aria-label={t(name)} aria-pressed={category===i} onClick={()=>setCategory(i)}><span className="control-label">{t(name)}</span></button>)}</nav>;
 const chooseMode=(mode,focus=false)=>{setEditorMode(mode);setColorDraft(null);if(focus)document.getElementById(tabsId+'-'+mode)?.focus();};
 const startResize=(e,x,y)=>{
  if(e.button!==0)return;e.preventDefault();const box=e.currentTarget.closest('.peek-desktop-preview').getBoundingClientRect();const w=width(cols),h=height(rows);
  gesture.current={x,y,w,h,sx:e.clientX,sy:e.clientY,scale:box.width/w,pointer:e.pointerId};
  e.currentTarget.setPointerCapture(e.pointerId);setDragSize({w,h});
 };
 const resize=e=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;
  const size={w:clamp(g.w+2*g.x*(e.clientX-g.sx)/g.scale,width(1),width(3)),h:clamp(g.h+g.y*(e.clientY-g.sy)/g.scale,height(1),height(3))};g.size=size;setDragSize(size);
 };
 const release=(e,commit)=>{const g=gesture.current;if(!g||g.pointer!==e.pointerId)return;gesture.current=null;
  if(commit&&g.size)update({columns:g.x?colAt(g.size.w):cols,rows:g.y?rowAt(g.size.h):rows});setDragSize(null);
 };
 const grips=[['right',1,0,'拖动调整列数'],['bottom',0,1,'拖动调整行数']];
 const geometry=dragSize??{w:width(cols),h:height(rows)},guideCols=gesture.current?.x?colAt(geometry.w):cols,guideRows=rowAt(geometry.h);
 const paint=measureBands(guideRows);
 return <div className="widget-general-groups">
  <div className="taskbar-settings peek-desktop-layout" data-reduced={Boolean(draft.taskbar?.reduced)}>
  <section className="tb42-editor peek-desktop-editor" data-widget-editor aria-labelledby="widget-desktop-layout-title">
   <header className="tb42-heading tb42-preview-tools"><h4 id="widget-desktop-layout-title">{t('实时预览')}</h4></header>
   <div className="peek-desktop-stage">
    <div className="peek-desktop-preview" data-resizing={Boolean(dragSize)} data-columns={guideCols} data-rows={guideRows} style={{width:geometry.w,height:geometry.h,'--peek-paper-alpha':(config.backgroundOpacity??82)/100}}>
     <div className="peek-desktop-grid" style={{width:Math.max(0,geometry.w-insetX*2),height:Math.max(0,geometry.h-insetY*2)}}>
      {displayCells.map((id,i)=>{const used=indices(guideCols,guideRows).includes(i);return <div key={i} className="peek-desktop-slot" data-guide={used} data-selected={slot===i&&!dragSize} data-drop={dragOver===i} style={{left:Math.max(0,(geometry.w-paint.edges[guideCols]-insetX*2)/2)+paint.edges[i%3]+(i%3?taskbarGap:0),width:paint.bands[i%3].span,top:Math.floor(i/3)*cellHeight}} onDragOver={e=>{if(e.dataTransfer.types.includes(dragType)){e.preventDefault();setDragOver(i);}}} onDragLeave={()=>setDragOver(v=>v===i?null:v)} onDrop={e=>{e.preventDefault();move(i,acceptMetric(e));setDragOver(null);}}>
       <button type="button" aria-label={id?t(details[id]):t('空位置')} tabIndex={used?0:-1} onClick={()=>chooseSlot(i)} draggable={Boolean(id)} onDragStart={e=>startMetric(e,id)} onDragEnd={()=>setDragOver(null)}>
        {id?<span className="peek-desktop-ink" style={{marginLeft:-paint.bands[i%3].left}}><Readout module={moduleFor(id)} width={inkWidth} snapshot={snapshot} points={series[id]?.points} format={format} colors={previewColors} typography={layout?.typography} literalNames labelOverride={config.labels?.[id]} hideUnit={!config.showUnits}/></span>:<span className="peek-desktop-empty" aria-hidden="true">+</span>}
       </button>
      </div>;})}
     </div>
     {grips.map(([name,x,y,label])=><button type="button" key={name} className={'peek-desktop-grip '+name} aria-label={t(label)} title={t(label)} onPointerDown={e=>startResize(e,x,y)} onPointerMove={resize} onPointerUp={e=>release(e,true)} onLostPointerCapture={e=>release(e,false)} onPointerCancel={e=>release(e,false)} onKeyDown={e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();update({columns:clamp(cols+x*(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0),1,3),rows:clamp(rows+y*(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0),1,3)});}}></button>)}
    </div>
   </div>
   <label className="widget-option-row peek-desktop-opacity"><span>{t('背景不透明度')}</span><input type="range" min="20" max="100" value={config.backgroundOpacity??82} onChange={e=>update({backgroundOpacity:Number(e.target.value)})}/><output>{config.backgroundOpacity??82}%</output></label>
   <div className="tb43-mode-bar">
    <div className="tb43-modes" role="tablist" aria-label={t('桌面编辑方式')} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();chooseMode(moveTab(editorMode,e.key),true);}}>
     {tabs.map(([mode,label])=><button key={mode} id={tabsId+'-'+mode} type="button" role="tab" aria-selected={editorMode===mode} aria-controls={tabsId+'-pane-'+mode} tabIndex={editorMode===mode?0:-1} onClick={()=>chooseMode(mode)}><span className="control-label">{t(label)}</span></button>)}
    </div>
    <div className="tb42-edit-actions" hidden={editorMode!=='components'}>
     {selectedId&&<><button type="button" title={t(moveFrom==null?'交换位置':'选目标位置')} aria-label={t('交换位置')} aria-pressed={moveFrom!=null} onClick={()=>setMoveFrom(moveFrom==null?slot:null)}><Grip size={14}/></button>{moduleFor(selectedId).parts.length===2&&<button type="button" title={t('数字与图形换序')} onClick={()=>visualPatch({modules:{...config.modules,[selectedId]:{...config.modules?.[selectedId],parts:[...moduleFor(selectedId).parts].reverse()}}})}><ArrowLeftRight size={13}/></button>}<button type="button" title={t('移除选中的模块')} aria-label={t('移除')} onClick={()=>{const next=cells.slice();next[sourceIndex(slot)]=null;visualPatch({cells:next});}}><X size={14}/></button></>}
     <button type="button" title={t('撤销')} aria-label={t('撤销')} disabled={!undo.length} onClick={()=>{update(undo.at(-1));setUndo(undo.slice(0,-1));}}><Undo2 size={14}/></button>
     <button type="button" title={t('还原草稿')} aria-label={t('还原草稿')} disabled={!saved||['cells','modules','palette','labels'].every(key=>JSON.stringify(config[key])===JSON.stringify(saved[key]))} onClick={()=>{update({cells:saved.cells,modules:saved.modules,palette:saved.palette,labels:saved.labels,colors:saved.colors});setUndo([]);}}><RotateCcw size={13}/></button>
    </div>
   </div>
   <div className="tb43-editor-panes">
    <section className="tb42-library" role="tabpanel" id={tabsId+'-pane-components'} aria-labelledby={tabsId+'-components'} hidden={editorMode!=='components'}>
     <div className="tb42-library-body">
      {categoryNav('组件分类')}
      <div className="tb42-shelf"><div className="tb42-palette-legend" aria-hidden="true"><Tag size={10}/><Activity size={11}/></div>
       <div className="tb42-shelf-scroll" role="region" aria-label={t('显示项目')} tabIndex={0}>
        <div className="tb42-shelf-rows" key={category}>
         {groups[category][1].map(id=>{const item=moduleFor(id),name=details[id];return <div className="tb42-library-item" key={id} data-metric={id} data-located={selectedId===id} aria-label={t(name)}>
          <div className="tb42-library-names">{nameVariants(id).map(variant=><button type="button" key={variant} data-variant={variant} draggable title={`${t(name)}: ${t(variantLabel[variant])}`} aria-label={`${t(name)} ${t(variantLabel[variant])}`} onDragStart={e=>startMetric(e,id,{variant})} onClick={()=>move(slot,{id,variant})}><Readout format={format} colors={previewColors} module={{...item,name:{variant},parts:[]}} snapshot={snapshot} literalNames catalogueScale={1.08} centerCatalogueName mode="name"/></button>)}</div>
          <span className="tb42-palette-divider" aria-hidden="true"/>
          <div className="tb42-library-parts">{Object.entries(partLabels).map(([part,label])=><button type="button" key={part} draggable data-library-part={part} title={`${t(name)}: ${t(label)}`} aria-label={`${t(name)} ${t(label)}`} onDragStart={e=>startMetric(e,id,{part})} onClick={()=>move(slot,{id,part})}><Readout format={format} colors={previewColors} module={{...item,parts:[part]}} snapshot={snapshot} points={series[id]?.points} literalNames catalogueScale={1.06} mode="part"/></button>)}</div>
         </div>;})}
        </div>
       </div>
      </div>
     </div>
    </section>
    <section className="tb-color-panel" role="tabpanel" id={tabsId+'-pane-colors'} aria-labelledby={tabsId+'-colors'} hidden={editorMode!=='colors'}>
     {editorMode==='colors'&&<ColorPane metrics={groups[category][1]} categoryIndex={category} navigation={categoryNav('颜色分类')} selected={selectedId} colorMap={config.palette??{}} previewMap={previewColors} changeColor={(id,part,color)=>{const fallbacks={...config.colors};if(part==='reading')delete fallbacks[id];visualPatch({palette:withColor(config.palette??{},id,part,color),colors:fallbacks});}} previewColor={setColorDraft} reduced={Boolean(draft.taskbar?.reduced)}/>}
    </section>
    <section className="tb42-typography" role="tabpanel" id={tabsId+'-pane-tuning'} aria-labelledby={tabsId+'-tuning'} hidden={editorMode!=='tuning'}>
     <div className="peek-desktop-position">
      <div className="widget-option-row"><span>{t('选中位置')}</span><output>{Math.floor(slot/3)+1} · {slot%3+1}</output></div>
      {selectedId&&<label className="widget-option-row"><span>{t('显示文字')}</span><input aria-label={t('显示文字')} autoComplete="off" value={config.labels?.[selectedId]??''} placeholder={moduleLabel(moduleFor(selectedId),details[selectedId])} maxLength={12} onChange={e=>update({labels:{...config.labels,[selectedId]:e.target.value}})}/></label>}
      <p className="widget-group-note">{t('拖动预览中的组件可交换位置；缩小网格不会清空原来的位置。')}</p>
     </div>
    </section>
   </div>
  </section>
  </div>
  <section className="widget-settings-group" aria-labelledby="widget-desktop-behavior-title">
   <h4 id="widget-desktop-behavior-title">{t('桌面窗口')}</h4>
   {actionRow(['enabled','显示桌面监测'])}
   <div className="widget-check-grid widget-desktop-behavior">{behavior.map(check)}</div>
   <div className="widget-option-list widget-desktop-fields">
    {field('双击动作','doubleClick',[['settings','打开小组件设置'],['taskmanager','打开任务管理器'],['none','不执行操作']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>))}
    {field('内存显示','memoryMode',[['percent','已用百分比'],['used','已用容量'],['free','可用容量']].map(([id,label])=><option key={id} value={id}>{t(label)}</option>))}
    {presentation.map(actionRow)}
   </div>
  </section>
 </div>;
}
