import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import {Trophy,X} from 'lucide-react';
import {netWorth} from '../../shared/finance';
import type {GameState,Player} from '../../shared/types';
import {fmt} from './CashflowPanel';
import {playCue} from './feedback';

const COLORS=['#d2a04b','#b8edb8','#f291b1','#77b9ff','#f8efde','#a6bac6'];
interface Piece {x:number;delay:number;duration:number;drift:number;rotate:number;scale:number;color:string;coin:boolean;}
function confetti(seedText:string):Piece[] {
  let seed=2166136261;
  for(const char of seedText)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  return Array.from({length:56},(_,index)=>({
    x:random()*100,
    delay:random()*.9,
    duration:2.8+random()*2.2,
    drift:(random()-.5)*180,
    rotate:-80+random()*160,
    scale:.65+random()*.8,
    color:COLORS[index%COLORS.length],
    coin:index%7===0,
  }));
}

export function victoryRanking(state:GameState) {
  return [...state.players].sort((a,b)=>netWorth(state,b)-netWorth(state,a));
}

export function useVictory(state:GameState|null) {
  const previous=useRef<GameState|null>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    const old=previous.current;previous.current=state;
    if(!state){setOpen(false);return;}
    if(!old||old.code!==state.code){setOpen(false);return;}
    if(old.status==='playing'&&state.status==='finished')setOpen(true);
  },[state]);
  const dismiss=useCallback(()=>setOpen(false),[]);
  return {open,dismiss};
}

export function VictoryOverlay({state,me,reduced,sound,volume,onClose,onHome}:{state:GameState;me?:Player;reduced:boolean;sound:boolean;volume:number;onClose:()=>void;onHome:()=>void}) {
  const ranking=victoryRanking(state);
  const winner=ranking[0];
  const pieces=useMemo(()=>confetti(`${state.code}-${state.finishedAt??'end'}`),[state.code,state.finishedAt]);
  const played=useRef(false);
  useEffect(()=>{
    if(played.current)return;
    played.current=true;
    if(sound)playCue('victory',volume);
  },[]);
  if(!winner)return null;
  return <div className="victory-overlay" role="dialog" aria-modal="true" aria-label="对局结算" onClick={onClose}>
    {!reduced&&<div className="victory-confetti" aria-hidden="true">{pieces.map((piece,index)=><i key={index} className={piece.coin?'victory-piece victory-coin':'victory-piece'} style={{left:`${piece.x}%`,animationDelay:`${piece.delay}s`,animationDuration:`${piece.duration}s`,'--drift':`${piece.drift}px`,'--rot':`${piece.rotate}deg`,'--scale':piece.scale,'--piece-color':piece.color} as CSSProperties}>{piece.coin&&<b>¥</b>}</i>)}</div>}
    <section className="victory-card" onClick={event=>event.stopPropagation()}>
      <button type="button" className="victory-close" aria-label="关闭结算动画" title="关闭结算动画" onClick={onClose}><X size={17}/></button>
      <span className="victory-kicker">FINAL SETTLEMENT · 最终结算</span>
      <div className="victory-trophy" aria-hidden="true"><Trophy size={42}/></div>
      <p className="victory-round">第 {state.rules.rounds} 轮 · 资本之城</p>
      <h2>{winner.id===me?.id?'你赢得了这座城':'对局结束'}</h2>
      <p className="victory-winner">{winner.id===me?.id?'冠军 · 你':`冠军 · ${winner.name}`}</p>
      <strong className="victory-networth">{fmt(netWorth(state,winner))}<small>万</small></strong>
      <div className="victory-divider"><span>最终净资产排名</span></div>
      <ol className="victory-ranking">{ranking.map((player,index)=><li key={player.id} className={index===0?'champion':''}>
        <span className="victory-rank">{index===0?<Trophy size={16}/>:String(index+1).padStart(2,'0')}</span>
        <b style={{color:player.color}}>{player.name}{player.id===me?.id&&<small>你</small>}</b>
        <small className="victory-job">{player.bot?'AI':player.job}</small>
        <strong>{fmt(netWorth(state,player))}<small>万</small></strong>
      </li>)}</ol>
      <div className="victory-actions"><button type="button" className="primary" onClick={onClose}>查看棋盘</button><button type="button" className="secondary" onClick={onHome}>返回首页</button></div>
    </section>
  </div>;
}
