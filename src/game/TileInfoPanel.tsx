import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronUp,GripVertical,MapPin,X} from 'lucide-react';
import type {GameState} from '../../shared/types';
import {tileInfo} from './tileInfo';
import {useMobileLayout} from './preferences';
import './tile-info.css';

const format=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);
export function TileInfoPanel({state,tileId,viewerId,pinned,onClose,children}:{state:GameState;tileId:number;viewerId?:string;pinned:boolean;onClose:()=>void;children?:ReactNode}){
  const ref=useRef<HTMLElement>(null);
  const drag=useRef<{id:number;x:number;y:number;left:number;top:number}|null>(null);
  const mobile=useMobileLayout();
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{setExpanded(false);},[tileId,pinned,mobile]);
  const compact=mobile&&pinned&&!expanded;
  // 顶部固定着顶栏和行情条：把可拖动面板的顶边限制在它们下面，避免标题栏被盖住。
  const safeTop=()=>{
    const parent=ref.current?.parentElement;
    if(!parent)return 8;
    const parentTop=parent.getBoundingClientRect().top;
    let bottom=0;
    for(const selector of ['.topbar','.in-room .market-strip']) {
      const node=document.querySelector<HTMLElement>(selector);
      if(!node)continue;
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden')continue;
      const rect=node.getBoundingClientRect();
      if(rect.height>0)bottom=Math.max(bottom,rect.bottom);
    }
    return Math.max(8,Math.round(bottom-parentTop+8));
  };
  // 悬停预览跟随指针：不再固定钉在左上角挡住棋盘与左侧工具条。
  useEffect(()=>{
    const el=ref.current;
    const area=el?.parentElement;
    if(pinned||!el||!area)return;
    const move=(event:PointerEvent)=>{
      const rect=area.getBoundingClientRect();
      const width=el.offsetWidth, height=el.offsetHeight;
      let x=event.clientX-rect.left+18;
      let y=event.clientY-rect.top+16;
      if(x+width>rect.width-10)x=event.clientX-rect.left-width-18;
      if(y+height>rect.height-10)y=event.clientY-rect.top-height-16;
      el.style.left=`${Math.max(10,x)}px`;
      el.style.top=`${Math.max(safeTop(),y)}px`;
    };
    area.addEventListener('pointermove',move);
    return()=>area.removeEventListener('pointermove',move);
  },[pinned,tileId]);
  // 固定态可拖动：小屏上面板会压住底部操作栏，允许玩家把它挪开。
  const clamp=()=>{
    const el=ref.current,parent=el?.parentElement;
    if(!el||!parent)return;
    const maxLeft=Math.max(8,parent.clientWidth-el.offsetWidth-8);
    const minTop=safeTop();
    const maxTop=Math.max(minTop,parent.clientHeight-el.offsetHeight-8);
    const left=Number.parseFloat(el.style.left)||el.offsetLeft;
    const top=Number.parseFloat(el.style.top)||el.offsetTop;
    el.style.left=`${Math.min(maxLeft,Math.max(8,left))}px`;
    el.style.top=`${Math.min(maxTop,Math.max(minTop,top))}px`;
  };
  useEffect(()=>{
    if(!pinned)return;
    clamp();
    window.addEventListener('resize',clamp);
    return()=>window.removeEventListener('resize',clamp);
  },[pinned,tileId,expanded,mobile]);
  const startDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    const el=ref.current;
    if(!pinned||!el)return;
    if((event.target as HTMLElement).closest('button'))return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:el.offsetLeft,top:el.offsetTop};
  };
  const moveDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    const state=drag.current,el=ref.current,parent=el?.parentElement;
    if(!state||!el||!parent||state.id!==event.pointerId)return;
    const maxLeft=Math.max(8,parent.clientWidth-el.offsetWidth-8);
    const minTop=safeTop();
    const maxTop=Math.max(minTop,parent.clientHeight-el.offsetHeight-8);
    el.style.left=`${Math.min(maxLeft,Math.max(8,state.left+event.clientX-state.x))}px`;
    el.style.top=`${Math.min(maxTop,Math.max(minTop,state.top+event.clientY-state.y))}px`;
  };
  const endDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.id!==event.pointerId)return;
    drag.current=null;
    clamp();
  };
  const info=tileInfo(state,tileId,viewerId);if(!info)return null;
  // The compact property summary already prints operating income; avoid showing it twice.
  const compactTags=info.tags.filter(tag=>info.rent===null||!tag.startsWith('经营 ')).slice(0,2);
  return <aside ref={ref} className={`property-popover tile-info-panel ${pinned?'is-pinned':'is-preview'} ${compact?'is-compact':''}`} role="region" aria-label="地块简报" data-tile-id={tileId} data-info-mode={pinned?(compact?'compact':'expanded'):'hover'}>
    <div className={`popover-title ${pinned?'is-draggable':''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} title={pinned?'拖动可移动面板':undefined}>{pinned&&<GripVertical size={12} className="drag-grip" aria-hidden="true"/>}<span style={{color:info.tile.color}}>{info.tile.district}</span>{pinned?<div className="tile-title-actions">{mobile&&expanded&&<button type="button" className="tile-expand-toggle" aria-expanded={expanded} onClick={()=>setExpanded(false)}>收起<ChevronUp size={11}/></button>}<button type="button" className="icon-button" aria-label="取消选择" title="关闭地块信息" onClick={onClose}><X size={15}/></button></div>:<small>悬停预览</small>}</div>
    <h3>{info.tile.name}{info.level!==null&&<small>Lv.{info.level}{info.mortgaged?' · 已抵押':''}</small>}</h3>
    {pinned?compact?<div className="tile-compact">
      <div className="tile-compact-meta"><span>{info.owner}</span>{info.rent!==null&&<b>{format(info.rent)} 万/次</b>}</div>
      <p>{info.rent!==null?`经营 +${format(info.operatingIncome)} 万/回合`:info.purpose}</p>
      {compactTags.length>0&&<div className="tile-rule-tags">{compactTags.map(tag=><span key={tag}>{tag}</span>)}</div>}
      <button type="button" className="tile-compact-expand" aria-expanded={expanded} onClick={()=>setExpanded(true)}>展开全部信息<ChevronDown size={12}/></button>
    </div>:<>
      <dl className="tile-brief-lines"><div><dt>所属</dt><dd>{info.owner}</dd></div><div><dt>作用</dt><dd>{info.purpose}</dd></div></dl>
      {info.tags.length>0&&<div className="tile-rule-tags">{info.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
      <div className="tile-landing"><span><MapPin size={13}/>停留后</span><p>{info.arrival}</p></div>
      {info.value!==null&&<div className="property-numbers"><span>市值<b>{format(info.value)} 万</b></span><span>当前租金<b>{format(info.rent??0)} 万/次</b></span><span>经营收益<b>+{format(info.operatingIncome)} 万/回合</b></span></div>}
      {children}
      <small className="tile-info-hint">拖动标题栏可移动 · 点击空白处或 × 关闭</small>
    </>:<>
      <div className="tile-preview-meta"><span>{info.owner}</span>{info.rent!==null&&<b>{format(info.rent)} 万/次</b>}</div>
      <p className="tile-preview-line">{info.arrival}</p>
      {info.tags.length>0&&<div className="tile-rule-tags">{info.tags.slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>}
      <small className="tile-info-hint">点击地块固定查看完整信息</small>
    </>}
  </aside>;
}
