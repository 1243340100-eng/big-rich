import { money,stockFeeRate } from '../../shared/finance';
import type { Player, Stock, StockReport } from '../../shared/types';

export type MarketTone = 'market-up'|'market-down'|'market-flat';
export const priceText=(value:number)=>value.toFixed(2);
export const marketTone=(value:number):MarketTone=>value>0?'market-up':value<0?'market-down':'market-flat';
export const reportVerdict = {beat:'超预期',miss:'不及预期',inline:'符合预期'} as const;
export const reportImpactText=(report:StockReport)=>`${report.impact>=0?'+':''}${(report.impact*100).toFixed(1)}%`;
export function changeLabel(price:number,previous:number) {
  const change=previous>0?(price/previous-1)*100:0;
  return `${change>0?'▲ +':change<0?'▼ -':'— '}${Math.abs(change).toFixed(2)}%`;
}
export interface QuotePoint { price:number; round:number; current:boolean; x:number; y:number; }
export function quoteWindow(stock:Stock,round:number,width=280,height=64,range=30) {
  const history=stock.history.slice(-30);
  const firstRound=Math.max(1,round-history.length+1);
  const values=(stock.closes??history.map((price,i)=>({price,round:firstRound+i}))).filter(p=>p.round>=round-range+1&&p.round<=round&&Number.isFinite(p.price)&&p.price>0).slice(-range).map(p=>({...p,current:false}));
  const current=Number.isFinite(stock.price)&&stock.price>0?stock.price:values.at(-1)?.price??1;
  if(values.length===0||values.at(-1)!.price!==current)values.push({price:current,round,current:true});
  else values[values.length-1].current=true;
  const high=Math.max(...values.map(p=>p.price)),low=Math.min(...values.map(p=>p.price));
  const previous=Number.isFinite(stock.previous)&&stock.previous>0?stock.previous:current;
  const min=Math.min(low,previous),max=Math.max(high,previous),pad=Math.max((max-min)*.12,max*.008,.015);
  const bottom=min-pad,top=max+pad;
  const y=(price:number)=>height-8-(price-bottom)/(top-bottom)*(height-16);
  const points:QuotePoint[]=values.map((p,i)=>({...p,x:values.length===1?width-7:7+i/(values.length-1)*(width-14),y:y(p.price)}));
  const line=points.length===1?`M 7 ${points[0].y} L ${width-7} ${points[0].y}`:points.map((p,i)=>`${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
  return {points,line,area:`${line} L ${width-7} ${height} L 7 ${height} Z`,high,low,previous,baselineY:y(previous)};
}

export type OrderSide='buy'|'sell';
export function estimateStockOrder(stock:Stock,player:Player,qty:number,side:OrderSide) {
  if(!Number.isInteger(qty)||qty<1||qty>1000)return null;
  const holding=player.stocks[stock.id]??{qty:0,cost:0};
  if(side==='sell'&&holding.qty<qty)return null;
  const feeRate=stockFeeRate(player,stock.id);
  const impact=Math.min(.025,qty*.001),direction=side==='buy'?1:-1;
  // Match the authoritative reducer's order of rounding, including the final cash amount.
  const gross=money(qty*stock.price*(1+direction*impact));
  const basis=side==='sell'?money(holding.cost/holding.qty*qty):0;
  const tax=side==='sell'?money(Math.max(0,gross-basis)*.1):0;
  const amount=side==='buy'?money(gross*(1+feeRate)):money(gross*(1-feeRate)-tax);
  const fee=money(side==='buy'?amount-gross:gross-tax-amount);
  const cashAfter=money(player.cash+(side==='buy'?-amount:amount));
  const nextQuote=money(Math.max(1,Math.min(500,stock.price*(1+direction*impact))));
  return {gross,basis,tax,amount,fee,feeRate,impact:direction*impact,cashAfter,nextQuote,executionPrice:gross/qty};
}
export function maximumStockQuantity(stock:Stock,player:Player,side:OrderSide,availableCash=player.cash) {
  if(side==='sell')return Math.min(1000,player.stocks[stock.id]?.qty??0);
  let low=0,high=1000;
  while(low<high){const middle=Math.ceil((low+high)/2);if(estimateStockOrder(stock,player,middle,'buy')!.amount<=availableCash)low=middle;else high=middle-1;}
  return low;
}
export function nextDividend(round:number,lastRound:number) {
  const next=(Math.floor(round/5)+1)*5;
  return next>lastRound?null:{round:next,remaining:next-round};
}
