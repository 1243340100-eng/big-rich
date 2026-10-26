import {useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {TILES} from '../../shared/catalog';
import type {CityEventResult,GameState} from '../../shared/types';

const RARITY_LABEL={common:'普通',uncommon:'少见',rare:'稀有'} as const;

export function latestCityEventLog(state:GameState|null){
  return state?.logs.find(log=>log.cityEvent);
}

export function newCityEvent(previous:GameState|null,state:GameState|null,meId?:string){
  if(!state||!meId)return undefined;
  if(!previous||previous.code!==state.code)return undefined;
  const latest=latestCityEventLog(state);if(!latest?.cityEvent)return undefined;
  if(previous.logs.some(log=>log.id===latest.id))return undefined;
  return latest.cityEvent.playerId===meId||latest.cityEvent.global?latest.cityEvent:undefined;
}

export function useCityEventDraw(state:GameState|null,meId?:string){
  const previous=useRef<GameState|null>(null);
  const [card,setCard]=useState<CityEventResult|undefined>();
  useEffect(()=>{
    const old=previous.current;previous.current=state;
    if(!state||!meId){setCard(undefined);return;}
    if(!old||old.code!==state.code){setCard(undefined);return;}
    const next=newCityEvent(old,state,meId);
    if(next)setCard(next);
  },[state,meId]);
  const dismiss=useCallback(()=>setCard(undefined),[]);
  return {card,dismiss};
}

export function CityEventDraw({result,reduced,onClose}:{result:CityEventResult;reduced:boolean;onClose:()=>void}){
  const [revealed,setRevealed]=useState(reduced);
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    if(reduced){setRevealed(true);return;}
    const timer=setTimeout(()=>setRevealed(true),450);
    return()=>clearTimeout(timer);
  },[result.id,reduced]);
  useEffect(()=>{
    const timer=setTimeout(()=>close.current(),7000);
    return()=>clearTimeout(timer);
  },[result.id]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    window.addEventListener('keydown',key);
    return()=>window.removeEventListener('keydown',key);
  },[]);
  const tileName=TILES[result.tileId]?.name??'城市事件';
  return <div className="city-event-overlay" role="dialog" aria-modal="true" aria-label="城市事件抽卡" data-event-id={result.id} onClick={()=>close.current()}>
    <div className={`city-event-card rarity-${result.rarity} ${revealed?'is-revealed':''}`} onClick={event=>{event.stopPropagation();setRevealed(true);}}>
      <div className="city-event-card-inner">
        <div className="city-event-face city-event-back">
          <small>{tileName}</small>
          <div className="city-event-emblem" aria-hidden="true">?</div>
          <strong>城市事件</strong>
          <span>正在抽卡…</span>
        </div>
        <div className="city-event-face city-event-front">
          <header>
            <small>{RARITY_LABEL[result.rarity]} · {tileName}</small>
            {result.global&&<b>全城</b>}
            <button type="button" className="city-event-close" aria-label="关闭城市事件" onClick={event=>{event.stopPropagation();onClose();}}><X size={16}/></button>
          </header>
          <h2>{result.title}</h2>
          <p>{result.description}</p>
          <div className={`city-event-effect ${result.amount>0?'is-positive':result.amount<0?'is-negative':''}`}>{result.effectText}</div>
          <button type="button" className="primary city-event-confirm" onClick={event=>{event.stopPropagation();onClose();}}>确定</button>
        </div>
      </div>
    </div>
  </div>;
}
