import {useEffect,useState} from 'react';
import {Gavel} from 'lucide-react';
import {TILES} from '../../shared/catalog';
import {antitrustTax,money} from '../../shared/finance';
import type {Action,GameState,Player} from '../../shared/types';
import {tradeCashCommitment} from './cashflow';
import {fmt} from './CashflowPanel';
export function AuctionPanel({state,me,clock,act,busy}:{state:GameState;me:Player;clock:number;act:(a:Action)=>void;busy:boolean}) {
  const a=state.auction!,min=money(a.highest+(a.bidder?1:0)),[bid,setBid]=useState(min);
  useEffect(()=>setBid(money(a.highest+(a.bidder?5:0))),[a.highest,a.tileId,a.bidder]);
  const shared=busy?'正在等待连接或服务器确认':clock>=a.endsAt?'拍卖已到期，等待结算':a.passed.includes(me.id)?'你已退出本场竞拍':a.bidder===me.id?'你已是最高出价，资金已预留':'';
  const tax=antitrustTax(state,me.id,a.tileId),total=money(bid+tax);
  const reason=shared||(!Number.isFinite(bid)||bid<min||bid>100000?`最低出价 ${min} 万`:total>me.cash-tradeCashCommitment(state,me)?'可用现金不足，含反垄断税与交易提案':'');
  return <div className="auction-panel"><div className="section-label"><Gavel size={15}/>公开拍卖 <span>{Math.max(0,Math.ceil((a.endsAt-clock)/1000))}s</span></div><h3>{TILES[a.tileId].name}</h3><p>{a.bidder?'当前最高出价':'起拍价'} {fmt(a.highest)} 万 · {state.players.find(p=>p.id===a.bidder)?.name??'等待首位出价'}</p><p className="purchase-tax">你的反垄断税 {fmt(tax)} 万 · 本次合计 {fmt(total)} 万</p><div className="input-action"><input aria-label="竞拍金额" type="number" min={min} step=".01" value={bid} onChange={e=>setBid(Number(e.target.value))}/><button className="primary" disabled={!!reason} onClick={()=>act({type:'bid',amount:bid})}>出价</button></div>{reason&&<p className="disabled-reason">{reason}</p>}<button className="text-button" disabled={!!shared} onClick={()=>act({type:'pass'})}>{a.passed.includes(me.id)?'已退出竞拍':'退出本场竞拍'}</button><small>出价会预留报价与反垄断税；税款支付给银行。最低加价 1 万。最高出价不能撤销。</small></div>;
}
