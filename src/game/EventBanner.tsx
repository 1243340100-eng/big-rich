import {useCallback,useEffect,useRef,useState} from 'react';
import {Radio,X} from 'lucide-react';
import {CYCLES} from '../../shared/catalog';
import {eventHeatText} from '../../shared/districts';
import type {GameState,Log} from '../../shared/types';

export const GLOBAL_EVENT_PREFIX='全球事件';

/** Newest public global-event log in the room. Private logs never match. */
export function latestGlobalEvent(state:GameState|null){
  return state?.logs.find(log=>log.kind==='event'&&log.text.startsWith(GLOBAL_EVENT_PREFIX));
}

/** A banner is only new when the log id was absent from the previous room state. */
export function newGlobalEvent(previous:GameState|null,state:GameState|null){
  if(!state)return undefined;
  const latest=latestGlobalEvent(state);if(!latest)return undefined;
  if(!previous||previous.code!==state.code)return undefined;
  return previous.logs.some(log=>log.id===latest.id)?undefined:latest;
}

export function useGlobalEventBanner(state:GameState|null){
  const previous=useRef<GameState|null>(null);
  const [banner,setBanner]=useState<Log|undefined>();
  useEffect(()=>{
    const old=previous.current;previous.current=state;
    if(!state){setBanner(undefined);return;}
    if(!old||old.code!==state.code){setBanner(undefined);return;}
    const latest=latestGlobalEvent(state);
    if(latest&&!old.logs.some(log=>log.id===latest.id))setBanner(latest);
  },[state]);
  const dismiss=useCallback(()=>setBanner(undefined),[]);
  return {banner,dismiss};
}

export function EventBanner({state,event,onClose}:{state:GameState;event:Log;onClose:()=>void}){
  const heat=eventHeatText(state.economy.event);
  return <aside className="event-banner" role="status" aria-live="polite" aria-label="全球事件播报" data-event-id={event.id}>
    <span className="event-banner-icon" aria-hidden="true"><Radio size={20}/></span>
    <div className="event-banner-copy">
      <small>第 {event.round} 轮 · {state.economy.event} · 全球事件</small>
      <h2>{state.economy.headline??state.economy.event}</h2>
      <p>{state.economy.description}</p>
      <div className="event-banner-meta">
        <span>{CYCLES[state.economy.cycle]}</span>
        <span>房产指数 ×{state.economy.propertyIndex.toFixed(2)}</span>
        {heat&&<span>风口：{heat}</span>}
      </div>
    </div>
    <button type="button" className="event-banner-close" aria-label="关闭事件播报" title="关闭事件播报" onClick={onClose}><X size={16}/></button>
  </aside>;
}
