import {mortgageAmount,auctionReserve,tradeSettlementQuote,bankSaleQuote,loanLimit,money,propertyValue,settlementQuote,effectiveUpgradeCost} from '../../shared/finance';
import type {GameState,Player,Property} from '../../shared/types';
import {estimateStockOrder} from '../market/marketMath';

export const cashReserve=(s:GameState,p:Player)=>auctionReserve(s,p.id);
export const tradeCashCommitment=(s:GameState,p:Player)=>money(s.trades.filter(t=>t.from===p.id&&t.expires>=s.round).reduce((n,t)=>{const quote=tradeSettlementQuote(s,t);return n+t.giveCash+quote.fromTax+quote.fromStockCharge;},0));
export function propertyActionReason(s:GameState,p:Player,a:Property,type:'mortgage'|'redeem'|'sellProperty') {
  if(s.status!=='playing')return '当前不在对局中';
  if(a.owner!==p.id)return '你不拥有此地产';
  if(s.auction?.tileId===a.tileId)return '该地产正在拍卖';
  if(s.trades.some(t=>t.expires>=s.round&&(t.from===p.id&&t.giveProperty===a.tileId||t.to===p.id&&t.wantProperty===a.tileId)))return '该地产涉及未完成提案，请先处理交易';
  if(type==='mortgage'&&a.mortgage)return '已抵押';
  if(type==='redeem'&&p.cash-cashReserve(s,p)-tradeCashCommitment(s,p)<money(a.mortgage*1.05))return '可用现金不足，含竞拍预留和交易提案';
  if(type==='sellProperty'&&money(p.cash+bankSaleQuote(s,a).net)<cashReserve(s,p))return '出售款不足清偿抵押并保留竞拍资金';
  return '';
}
export function cashflow(s:GameState,p:Player) {
  const estimate=settlementQuote(s,p),reserved=cashReserve(s,p),available=money(p.cash-reserved);
  const stocks=money(s.stocks.reduce((n,a)=>n+(p.stocks[a.id]?.qty??0)*a.price,0));
  // One executable order per holding, limited to the reducer's 1000-share cap.
  const stockNet=money(s.stocks.reduce((n,a)=>n+(estimateStockOrder(a,p,Math.min(1000,p.stocks[a.id]?.qty??0),'sell')?.amount??0),0));
  const mortgage=money(s.properties.filter(a=>a.owner===p.id&&!a.mortgage&&!propertyActionReason(s,p,a,'mortgage')).reduce((n,a)=>n+mortgageAmount(s,a),0));
  const netFixed=money(estimate.fixed-estimate.operatingIncome);
  const runway=available<0?`现金缺口 ${-available} 万`:estimate.fixed===0&&estimate.operatingIncome===0?'暂无固定支出':netFixed<=0?'现金流为正':available<netFixed?'不足 1 回合':`约可撑 ${Math.floor(available/netFixed)} 回合`;
  return {...estimate,reserved,available,stocks,stockNet,mortgage,credit:loanLimit(s,p),runway,netFixed,gap:money(Math.max(0,netFixed-available))};
}
export function upgradeReason(s:GameState,p:Player,a:Property|undefined) {
  if(s.status!=='playing')return '当前不在对局中';
  if(!a||a.owner!==p.id)return '请选择自己的地产';
  if(a.level>=3)return '已满级';
  if(a.mortgage)return '已抵押，须先赎回';
  if(s.players[s.turn]?.id!==p.id)return '请在自己的管理阶段升级';
  if(s.phase!=='manage')return '请先完成移动、购买或拍卖';
  if(p.cash<0)return '请先补足现金缺口';
  const cost=effectiveUpgradeCost(s,p,a.tileId);
  if(p.cash-cashReserve(s,p)<cost)return '现金不足，可先结束回合或补现金';
  if(p.cash-cashReserve(s,p)-tradeCashCommitment(s,p)<cost)return '现金涉及未完成交易提案，请先处理交易';
  return '';
}
