import {money,propertyRent,propertyPurchaseQuote,effectiveUpgradeCost,propertyOperatingIncome} from '../../shared/finance';
import {TILES} from '../../shared/catalog';
import type {GameState,Player} from '../../shared/types';
import {cashflow,tradeCashCommitment,upgradeReason} from './cashflow';

const netText=(value:number)=>value<=0?`净流入 +${money(-value)}`:`净支出 ${value}`;
export type PrimaryAction=
 | {kind:'waiting';label:string;preview:string;reason:string}
 | {kind:'start'|'roll'|'end'|'ranking'|'auction'|'rescue';label:string;preview:string;reason:string}
 | {kind:'buy'|'upgrade';label:string;preview:string;reason:string;tileId:number};
export function primaryAction(s:GameState,p:Player,selected:number|null,clock=Date.now()):PrimaryAction {
  const current=s.players[s.turn],flow=cashflow(s,p);
  if(s.status==='finished')return {kind:'ranking',label:'查看排名',preview:'按最终净资产排名',reason:''};
  if(s.status==='lobby')return p.id===s.hostId?{kind:'start',label:'开始对局',preview:`${s.players.length} / 8 位投资人`,reason:s.players.length<2?'至少 2 人才能开始，可在更多操作中加 AI':''}:{kind:'waiting',label:'等待房主开局',preview:'房主正在准备对局',reason:''};
  if(p.casino)return {kind:'end',label:'结束回合',preview:'赌场会话进行中，筹码须先落袋',reason:'请先离开赌场'};
  if(p.cash<0)return {kind:'rescue',label:`补现金 ${money(-p.cash)} 万`,preview:`现金 ${p.cash} 万 → 0 万以上`,reason:''};
  if(s.auction)return {kind:'auction',label:'参与竞拍',preview:`当前 ${s.auction.highest} 万 · 剩余 ${Math.max(0,Math.ceil((s.auction.endsAt-clock)/1000))} 秒`,reason:''};
  if(current.id!==p.id)return {kind:'waiting',label:current.casinoActive?`等待 ${current.name} 离开赌场`:`等待 ${current.name} 行动`,preview:'股票、银行与交易仍可操作',reason:''};
  if(s.phase==='roll')return {kind:'roll',label:'掷骰子',preview:'单骰 · 移动 1–6 格',reason:''};
  if(s.phase==='buy') {
    const a=s.properties.find(a=>a.tileId===s.pendingTile&&!a.owner);
    if(!a)return {kind:'waiting',label:'正在同步地块',preview:'请稍候',reason:''};
    const quote=propertyPurchaseQuote(s,p.id,a),cost=quote.total;
    const held=s.reservations?.[a.tileId];
    const next=structuredClone(s);next.properties.find(b=>b.tileId===a.tileId)!.owner=p.id;
    const nextProperty=next.properties.find(b=>b.tileId===a.tileId)!;
    const nextFlow=cashflow(next,p);
    return {kind:'buy',tileId:a.tileId,label:held?`全款截胡 ${cost} 万`:`买入 ${cost} 万`,preview:`租金 ${propertyRent(next,nextProperty)} 万/次 · 经营 +${propertyOperatingIncome(next,nextProperty)} 万/回合 · 含反垄断税 ${quote.tax} 万${held?` · 定金 ${held.paid} 万将归你`:''} · 买后现金 ${money(p.cash-cost)} 万 · ${netText(nextFlow.netFixed)} 万/回合`,reason:flow.available<cost?'现金不足，可补现金、低价起拍或跳过不买':flow.available-tradeCashCommitment(s,p)<cost?'现金涉及未完成交易提案，请先处理交易':''};
  }
  const a=s.properties.find(a=>a.tileId===selected&&a.owner===p.id);
  if(a&&a.level<3&&!a.mortgage) {
    const cost=effectiveUpgradeCost(s,p,a.tileId);
    return {kind:'upgrade',tileId:a.tileId,label:`立即升级 ${cost} 万`,preview:`当前周期租金 ${propertyRent(s,a)} → ${propertyRent(s,{...a,level:a.level+1})} 万/次 · 经营 +${propertyOperatingIncome(s,a)} → +${propertyOperatingIncome(s,{...a,level:a.level+1})} 万/回合 · 余 ${money(p.cash-cost)} 万 · 维护 +${p.job==='企业家'?.48:.6} 万/回合`,reason:upgradeReason(s,p,a)};
  }
  return {kind:'end',label:'结束回合',preview:`下回合开始预计${netText(flow.netFixed)} 万（经营 +${flow.operatingIncome}）${a?` · ${upgradeReason(s,p,a)}`:''}`,reason:''};
}
