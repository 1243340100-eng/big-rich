import {auctionReserve} from '../../shared/finance';
import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, TrendingUp } from 'lucide-react';
import type { Action, GameState, Player, Stock } from '../../shared/types';
import { money } from '../../shared/finance';
import { StockOrder } from './StockOrder';
import { StockDetails } from './StockDetails';
import { StockChart } from './StockChart';
import { changeLabel, marketTone, priceText, quoteWindow, reportImpactText, reportVerdict, type OrderSide } from './marketMath';

export function MarketStrip({stocks,round}:{stocks:Stock[];round:number}) {
  return <div className="market-strip"><span className="strip-title"><TrendingUp size={15}/> 城市行情</span>{stocks.map(stock=>{
    const window=quoteWindow(stock,round);
    return <span key={stock.id} tabIndex={0} title={`${stock.name} · 昨收 ${priceText(window.previous)} 万 · 最近30轮最高 ${priceText(window.high)} 万 · 最低 ${priceText(window.low)} 万`}>
      {stock.name}<b>{priceText(stock.price)}</b><em className={marketTone(stock.price-stock.previous)}>{changeLabel(stock.price,stock.previous)}</em>
    </span>;
  })}</div>;
}

export function Market({state,me,act,busy}:{state:GameState;me:Player;act:(a:Action)=>void;busy:boolean}) {
  const [listOpen,setListOpen]=useState(false);
  const [selected,setSelected]=useState(state.stocks[0]?.id??'');
  const [range,setRange]=useState<5|10|30>(30);
  const [order,setOrder]=useState<{id:string;side:OrderSide}|null>(null);
  const [detail,setDetail]=useState<string|null>(null);
  const stock=state.stocks.find(s=>s.id===selected)??state.stocks[0];
  if(!stock)return <p className="market-guide">暂无股票行情</p>;
  const holding=me.stocks[stock.id]??{qty:0,cost:0},value=money(holding.qty*stock.price),profit=money(value-holding.cost);
  const open=order?.id===stock.id;
  return <section className="stock-market market-dashboard" aria-label="股票市场">
    <div className="section-label">证券交易所 <span>{state.stocks.length} 家上市公司</span></div>
    <p className="market-guide">点击右侧名称切换走势 · 涨跌幅对比上一轮收盘价</p>
    <button className="mobile-stock-switch" aria-expanded={listOpen} onClick={()=>setListOpen(v=>!v)}>{listOpen?'收起股票列表':'切换股票'} <span>{state.stocks.length} 只 · {stock.name}</span></button>
    <div className={`market-workspace ${listOpen?'stock-list-open':''}`}>
      <div className="market-main-chart">
        <div className="market-selected-head"><div><h4>{stock.name}</h4><small>{stock.sector}</small></div><div><b>{priceText(stock.price)} <small>万 / 股</small></b><span className={marketTone(stock.price-stock.previous)}>{changeLabel(stock.price,stock.previous)}</span></div></div>
        <div className="stock-range-tabs" role="group" aria-label="主图行情轮次">{([5,10,30] as const).map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>{n===30?'全部记录':`近 ${n} 轮`}</button>)}</div>
        <StockChart key={`${stock.id}-${range}`} stock={stock} round={state.round} detail range={range}/>
      </div>
      <div className="market-watchlist" role="group" aria-label="选择股票">
        <div className="market-watchlist-label">股票 / 本轮涨跌</div>
        {state.stocks.map(item=><button key={item.id} className="market-watch-item" aria-pressed={stock.id===item.id} onClick={()=>{setSelected(item.id);setRange(30);setOrder(null);setListOpen(false);}}>
          <strong>{item.name}</strong><span className={marketTone(item.price-item.previous)}>{changeLabel(item.price,item.previous)}</span>
        </button>)}
      </div>
    </div>
    <div className="market-selected-summary">
      <div className="stock-holding"><span>持有 {holding.qty} 股 · 市值 {priceText(value)} 万</span><span className={marketTone(profit)}>盈亏 {profit>0?'+':''}{priceText(profit)} 万</span></div>
      {stock.report&&<div className={`stock-report ${marketTone(stock.report.impact)}`}><span>最新财报 · 第 {stock.report.round} 轮</span><strong>{reportVerdict[stock.report.verdict]} {reportImpactText(stock.report)}</strong></div>}
      <div className="stock-actions"><button aria-expanded={open&&order.side==='buy'} disabled={busy||state.status!=='playing'} onClick={()=>setOrder(open&&order.side==='buy'?null:{id:stock.id,side:'buy'})}><ArrowDownLeft size={14}/>买入</button><button aria-expanded={open&&order.side==='sell'} disabled={busy||holding.qty===0||state.status!=='playing'} onClick={()=>setOrder(open&&order.side==='sell'?null:{id:stock.id,side:'sell'})}><ArrowUpRight size={14}/>卖出</button><button onClick={()=>setDetail(stock.id)}>放大图表 / 详情</button></div>
      {open&&<StockOrder key={`${stock.id}-${order.side}`} stock={stock} me={me} side={order.side} reserved={auctionReserve(state,me.id)} busy={busy||state.status!=='playing'} onClose={()=>setOrder(null)} act={act}/>}
    </div>
    <p className="market-dashboard-note">红涨绿跌 · 保留最近 30 轮记录 · 买卖费用在下单前展示</p>
    {detail&&state.stocks.find(s=>s.id===detail)&&<StockDetails stock={state.stocks.find(s=>s.id===detail)!} state={state} me={me} act={act} busy={busy} onClose={()=>setDetail(null)}/>}
  </section>;
}
