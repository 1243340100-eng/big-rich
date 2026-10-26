import type {GameState,Player} from './types';
import {auctionReserve,tradeSettlementQuote,money,settlementQuote} from './finance';

export const CASINO_TILE=19,MIN_STAKE=10,MAX_STAKE=200,MAX_SPINS=10,MAX_MULTIPLIER=10;
export const CASINO_GRACE_MS=45000;
export const SECTORS=[0,1.1,1.2,1.4,1.1,1.8,0,1.1,1.2,1.4,0,1.1,1.2,1.8,1.1,0,1.4,1.2,1.1,0] as const;
export const sectorName=(factor:number)=>factor===0?'崩盘':factor===1.1?'微涨':factor===1.2?'上涨':factor===1.4?'大涨':'暴涨';
export const sectorColor=(factor:number)=>factor===0?'#4f2027':factor===1.1?'#28574b':factor===1.2?'#967542':factor===1.4?'#c6a153':'#f5dda2';
export function casinoLimits(s:GameState,p:Player) {
  const reserve=Math.max(30,money(settlementQuote(s,p).fixed*2));
  const commitments=money(s.trades.filter(t=>t.from===p.id&&t.expires>=s.round).reduce((n,t)=>{const quote=tradeSettlementQuote(s,t);return n+t.giveCash+quote.fromTax+quote.fromStockCharge;},0));
  const auction=auctionReserve(s,p.id);
  const max=Math.max(0,Math.min(MAX_STAKE,Math.floor((p.cash-auction-commitments-reserve)*.25/10)*10));
  return {reserve,max,commitments};
}
export function casinoEntryReason(s:GameState,p:Player) {
  if(s.status!=='playing')return '当前不在对局中';
  if(p.bot)return 'AI 不参与赌场';
  if(s.players[s.turn]?.id!==p.id)return '仅当前玩家可以进入';
  if(s.phase!=='manage'||p.position!==CASINO_TILE)return '须本回合停在星港赌场并完成移动';
  if(s.auction)return '拍卖期间不能入场';
  if(p.casino)return '已有正在进行的赌场会话';
  if(!p.casinoEligible)return '本次停留的入场资格已用完';
  if(p.cash<0)return '现金为负，请先解决现金缺口';
  if(s.trades.some(t=>t.expires>=s.round&&(t.from===p.id||t.to===p.id)))return '请先处理未完成交易提案';
  if(casinoLimits(s,p).max<MIN_STAKE)return '保留固定支出及安全金后，可用筹码不足 10 万';
  return '';
}
export function spinResult(stake:number,pot:number,spins:number,sector:number) {
  if(!Number.isInteger(sector)||sector<0||sector>=SECTORS.length)throw new Error('轮盘结果无效');
  // Integer cents and tenths keep half-cent rounding independent of float error.
  const next=Math.min(Math.round(stake*100)*MAX_MULTIPLIER,Math.round(Math.round(pot*100)*Math.round(SECTORS[sector]*10)/10))/100;
  const count=spins+1;
  return {pot:next,spins:count,ended:next===0||count>=MAX_SPINS||next>=stake*MAX_MULTIPLIER,status:next===0?'bust':count>=MAX_SPINS||next>=stake*MAX_MULTIPLIER?'limit':'active'} as const;
}
