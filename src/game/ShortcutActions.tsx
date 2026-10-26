import {useState,type ReactNode} from 'react';
import type {Action,GameState,Player} from '../../shared/types';
import {BRIDGE,EXHIBIT,INSIDER,exhibitionLevel,exhibitionWait} from '../../shared/shortcuts';
import {money,netWorth} from '../../shared/finance';
import {STOCK_CATALOG} from '../../shared/stockCatalog';
import {TILES} from '../../shared/catalog';

/**
 * 捷径内的主动动作：金融服务站的过桥资金、创投交易所的内幕、商务会展的办展。
 * 只在本人回合的 manage 阶段出现，避免和掷骰/购买的主按钮抢位置。
 */
export function ShortcutActions({state,me,act,blocked}:{state:GameState;me:Player;act:(a:Action)=>void;blocked:string}) {
  const [boost,setBoost]=useState('tech'),[dilute,setDilute]=useState('energy');
  const mine=state.players[state.turn]?.id===me.id;
  const reserved=Object.entries(state.reservations??{}).find(([,r])=>r.ownerId===me.id);
  const items:ReactNode[]=[];
  // 付尾款可以随时进行（预定与自己的回合无关）。
  if(reserved){
    const [tile,held]=reserved;
    const dueNow=Math.min(held.installment,money(held.total-held.paid));
    items.push(<button key="settle" className="secondary" disabled={!!blocked} onClick={()=>act({type:'settleReserve',tileId:Number(tile)})}>付 {TILES[Number(tile)].name} 分期 {dueNow} 万（剩 {money(held.total-held.paid)}）</button>);
  }
  if(!mine||state.phase!=='manage')return items.length?<div className="shortcut-actions">{items}</div>:null;
  if(me.position===32&&!me.bridgeLoan&&!me.bridgeLoanUsed){
    const amount=money(Math.max(BRIDGE.minAmount,netWorth(state,me)*BRIDGE.ratio));
    items.push(<button key="bridge" className="secondary" disabled={!!blocked} onClick={()=>act({type:'bridgeLoan'})}>借过桥资金 {amount} 万（{BRIDGE.rounds} 回合 · 利息 {BRIDGE.rate*100}%/回合）</button>);
  }
  if(me.position===33&&(me.insiderUsed??0)<INSIDER.uses&&state.round<state.rules.rounds){
    items.push(<button key="insider" className="secondary" disabled={!!blocked} onClick={()=>act({type:'insider'})}>买内幕 {INSIDER.fee} 万（剩 {INSIDER.uses-(me.insiderUsed??0)} 次）</button>);
  }
  const level=exhibitionLevel(state,me.id);
  if(level>=1){
    const wait=exhibitionWait(state,me.id);
    items.push(<span key="exhibit" className="shortcut-exhibit">
      <select aria-label="主角板块" value={boost} onChange={e=>setBoost(e.target.value)}>{STOCK_CATALOG.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="配角板块" value={dilute} onChange={e=>setDilute(e.target.value)}>{STOCK_CATALOG.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="secondary" disabled={!!blocked||boost===dilute||wait>0} title={wait>0?`冷却中，还需 ${wait} 回合`:undefined} onClick={()=>act({type:'exhibit',boostId:boost,diluteId:dilute})}>办展 {EXHIBIT.fee[level]} 万{wait>0?` · 冷却 ${wait}`:''}</button>
    </span>);
  }
  if(me.bridgeLoan){
    items.push(<button key="repay" className="secondary" disabled={!!blocked} onClick={()=>act({type:'bridgeRepay'})}>归还过桥资金 {me.bridgeLoan.principal} 万（第 {me.bridgeLoan.dueRound} 轮到期）</button>);
  }
  if(!items.length)return null;
  return <div className="shortcut-actions">{items}</div>;
}
