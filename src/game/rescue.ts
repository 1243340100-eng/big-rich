import {mortgageAmount,bankSaleQuote,restructuringQuote,credit,loanLimit,loanRate,money,propertyRent,propertyOperatingIncome,propertyValue,settlementQuote} from '../../shared/finance';
import type {Action,GameState,Player} from '../../shared/types';
import {estimateStockOrder} from '../market/marketMath';
import {cashflow} from './cashflow';

export interface RescueOption {id:string;label:string;action:Action;amount:number;cashAfter:number;availableAfter:number;fixedAfter:number;operatingIncomeAfter:number;netAfter:number;covered:boolean;cost:number;detail:string;reason:string;destructive:boolean;}
export function rescueOptions(s:GameState,p:Player,overrides:Record<string,number>={}) {
  const flow=cashflow(s,p),target=flow.gap,options:RescueOption[]=[];
  const common=s.status!=='playing'?'当前不在对局中':'';
  const outgoing=s.trades.filter(t=>t.expires>=s.round&&t.from===p.id);
  const involved=s.trades.filter(t=>t.expires>=s.round&&(t.from===p.id||t.to===p.id));
  const propertyTrade=(id:number)=>involved.some(t=>t.from===p.id?t.giveProperty===id:t.wantProperty===id);
  const stockTrade=(id:string)=>involved.some(t=>t.from===p.id?t.giveStock===id&&t.giveQty>0:t.wantStock===id&&t.wantQty>0);
  const add=(id:string,label:string,action:Action,amount:number,cost:number,detail:string,reason='',destructive=false,nextFixed=flow.fixed,nextOperating=flow.operatingIncome)=> {
    const cashAfter=money(p.cash+amount),availableAfter=money(cashAfter-flow.reserved),netAfter=money(nextFixed-nextOperating);
    options.push({id,label,action,amount,cashAfter,availableAfter,fixedAfter:nextFixed,operatingIncomeAfter:nextOperating,netAfter,covered:availableAfter>=netAfter,cost:amount>0?cost/amount:Infinity,detail,reason:common||reason,destructive});
  };
  const amountFor=(id:string,max:number)=>overrides[id]??money(Math.min(100000,max,Math.max(1,target)));
  const withdrawal=amountFor('withdraw',p.deposit);
  add('withdraw','提取存款',{type:'withdraw',amount:withdrawal},withdrawal,money(withdrawal*.01),'每个人回合少得 1% 存款增长；不改变债务。',p.deposit<1?'存款不足 1 万':!Number.isFinite(withdrawal)||withdrawal<1||withdrawal>Math.min(p.deposit,100000)?'请输入 1 万至可取存款之间的金额':'');
  for(const st of s.stocks) {
    const max=Math.min(1000,p.stocks[st.id]?.qty??0);if(!max)continue;
    let qty=1;while(qty<max&&(estimateStockOrder(st,p,qty,'sell')?.amount??0)<target)qty++;
    qty=overrides[`stock-${st.id}`]??qty;
    const quote=estimateStockOrder(st,p,qty,'sell');
    const holding=p.stocks[st.id];
    const nextP=quote?{...p,cash:quote.cashAfter,stocks:{...p.stocks,[st.id]:{qty:holding.qty-qty,cost:money(holding.cost-quote.basis)}}}:p;
    const nextS=quote?{...s,stocks:s.stocks.map(a=>a.id===st.id?{...a,price:quote.nextQuote}:a)}:s;
    const fixed=settlementQuote(nextS,nextP).fixed;
    add(`stock-${st.id}`,`卖出 ${st.name} ${qty} 股`,{type:'stock',stockId:st.id,side:'sell',qty},quote?.amount??0,money(qty*st.price-(quote?.amount??0)+fixed-flow.fixed),quote?`手续费 ${quote.fee}、税 ${quote.tax} 万；滑点 ${Math.abs(quote.impact*100).toFixed(1)}%；减少持仓。`:'请输入有效股数',stockTrade(st.id)?'该股票涉及未完成提案，请先处理交易':!quote?'股数须为整数，且不超过持仓与 1000 股':'',true,fixed);
  }
  const limit=loanLimit(s,p);
  let suggested=amountFor('borrow',limit);
  if(limit>=1)for(let i=0;i<8;i++) {
    const next={...p,cash:money(p.cash+suggested),debt:money(p.debt+suggested)},quote=settlementQuote(s,next);
    const gap=money(quote.fixed-quote.operatingIncome-(flow.available+suggested));
    if(gap<=0||suggested>=Math.min(100000,limit))break;
    suggested=money(Math.min(limit,100000,suggested+gap+.01));
  }
  const borrow=overrides.borrow??suggested,nextP={...p,cash:money(p.cash+borrow),debt:money(p.debt+borrow)};
  const postFixed=settlementQuote(s,nextP).fixed;
  add('borrow','申请信用贷款',{type:'borrow',amount:borrow},borrow,Math.max(0,money(postFixed-flow.fixed)),`贷款后信用 ${credit(s,nextP)}，利率 ${(loanRate(s,nextP)*100).toFixed(1)}%/个人回合；固定支出 ${postFixed} 万。`,limit<1?'信用贷款额度不足 1 万':!Number.isFinite(borrow)||borrow<1||borrow>Math.min(limit,100000)?'金额超出可贷额度':'',false,postFixed);
  for(const a of s.properties.filter(a=>a.owner===p.id)) {
    const value=propertyValue(s,a),rent=propertyRent(s,a),traded=propertyTrade(a.tileId),auction=s.auction?.tileId===a.tileId;
    const restriction=auction?'该地产正在拍卖':traded?'该地产涉及未完成提案，请先处理交易':'';
    if(!a.mortgage) {
      const amount=mortgageAmount(s,a),next=structuredClone(s);next.properties.find(b=>b.tileId===a.tileId)!.mortgage=amount;
      const quote=settlementQuote(next,{...p,cash:money(p.cash+amount)}),lost=propertyOperatingIncome(s,a);
      add(`mortgage-${a.tileId}`,`抵押 ${a.tileId}`,{type:'mortgage',tileId:a.tileId},amount,money(quote.fixed-flow.fixed+amount*.05+rent*.9+lost),`抵押息 ${(s.economy.baseRate*100+2).toFixed(1)}%/个人回合；赎回手续费 ${money(amount*.05)} 万；暂停收租 ${rent} 万/次、经营 +${lost} 万/回合。`,restriction,true,quote.fixed,quote.operatingIncome);
    }
    const amount=bankSaleQuote(s,a).net,next=structuredClone(s);next.properties.find(b=>b.tileId===a.tileId)!.owner=null;
    const quote=settlementQuote(next,{...p,cash:money(p.cash+amount)}),lost=propertyOperatingIncome(s,a);
    add(`sell-${a.tileId}`,`出售 ${a.tileId}`,{type:'sellProperty',tileId:a.tileId},amount,money(value-bankSaleQuote(s,a).gross+rent*.9+lost+quote.fixed-flow.fixed),`永久失去地产，回收按投入成本 85% 封顶，折价 ${money(value-bankSaleQuote(s,a).gross)} 万，清偿抵押 ${a.mortgage} 万；失去租金 ${rent} 万/次、经营 +${lost} 万/回合。`,restriction|| (p.cash+amount<flow.reserved?'净款不足清偿抵押并保留竞拍资金':''),true,quote.fixed,quote.operatingIncome);
  }
  options.sort((a,b)=>Number(!!a.reason)-Number(!!b.reason)||a.cost-b.cost||a.id.localeCompare(b.id));
  const restructuring=restructuringQuote(s,p),debtAfter=restructuring.debtAfter;
  const restructured={...p,cash:30,debt:debtAfter,stocks:{},deposit:0,bridgeLoan:undefined,defaults:p.defaults+1};
  const seized={...s,properties:s.properties.map(a=>a.owner===p.id?{...a,owner:null,mortgage:0}:a)};
  const restructuredQuote=settlementQuote(seized,restructured);
  add('restructure','破产重组',{type:'restructure'},money(30-p.cash),Infinity,`清算 ${s.properties.filter(a=>a.owner===p.id).length} 处地产、全部股票及存款；取消本人 ${restructuring.cancelledReservations.length} 份预定，已付 ${restructuring.forfeited} 万没收；过桥本金并入债务，剩余债务减免 80% 后为 ${debtAfter} 万；现金变为 30 万，信用永久降 D。`,p.cash>=0?'仅现金为负时可以重组':s.players[s.turn]?.id!==p.id?'请在自己回合申请重组':s.auction?'请等待当前拍卖结束':outgoing.length||involved.length?'请先处理未完成交易提案':'',true,restructuredQuote.fixed,restructuredQuote.operatingIncome);
  return options;
}
