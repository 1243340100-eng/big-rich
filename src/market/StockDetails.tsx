import {premiumText} from '../../shared/stockCatalog';
import {auctionReserve} from '../../shared/finance';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Action, GameState, Player, Stock } from '../../shared/types';
import { assets } from '../../shared/finance';
import { developmentText, stockInfo, valuationText } from '../../shared/stockCatalog';
import { StockChart } from './StockChart';
import { StockOrder } from './StockOrder';
import { changeLabel, marketTone, nextDividend, priceText, reportImpactText, reportVerdict, type OrderSide } from './marketMath';

export function StockDetails({stock,state,me,act,busy,onClose}:{stock:Stock;state:GameState;me:Player;act:(a:Action)=>void;busy:boolean;onClose:()=>void}) {
  const [range,setRange]=useState<5|10|30>(30),[side,setSide]=useState<OrderSide|null>(null);
  const dialog=useRef<HTMLDivElement>(null),orderRef=useRef<HTMLDivElement>(null),closeRef=useRef(onClose),title=useId();closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function key(event:KeyboardEvent) {
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRef.current();}
      if(event.key==='Tab'){
        const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')??[])];
        const first=items[0],last=items.at(-1);
        if(!dialog.current?.contains(document.activeElement)){event.preventDefault();(event.shiftKey?last:first)?.focus();return;}
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key,true);
    return ()=>{document.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  useEffect(()=>{
    if(!side)return;
    const frame=requestAnimationFrame(()=>{
      const node=orderRef.current;
      if(!node)return;
      const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({block:'nearest',behavior:reduced?'auto':'smooth'});
      node.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[side]);
  const info=stockInfo(stock.id),holding=me.stocks[stock.id]??{qty:0,cost:0},value=holding.qty*stock.price,profit=value-holding.cost,total=assets(state,me);
  const dividend=nextDividend(state.round,state.rules.rounds);
  const events=(stock.events??[]).filter(e=>e.round>=state.round-range+1&&e.round<=state.round).slice().reverse();
  return <div className="stock-details-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="stock-details" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={title}>
      <header className="stock-details-header"><div><small>{stock.sector} · {stock.id.toUpperCase()}</small><h2 id={title}>{stock.name}</h2></div><button onClick={onClose} aria-label="关闭股票详情"><X size={20}/></button></header>
      <div className="stock-details-body">
        <div className="stock-details-quote"><strong>{priceText(stock.price)} <small>万 / 股</small></strong><span className={marketTone(stock.price-stock.previous)}>{changeLabel(stock.price,stock.previous)}</span></div>
        <p>{info?.profile} · {stock.valuation?`估值${valuationText[stock.valuation]}`:'估值资料待服务更新'}{stock.development?` · 城市经营${developmentText[stock.development]}`:''}</p>
        <p className="stock-order-note">累计板块重估 <b>{premiumText(state.sectorPremium?.[stock.id]??0)}</b> · 首次三级封顶触发，资金在六板块间轮动。</p>
        {stock.report&&<div className={`stock-report-card ${marketTone(stock.report.impact)}`}><div><small>最新财报 · 第 {stock.report.round} 轮</small><strong>{reportVerdict[stock.report.verdict]} <b>{reportImpactText(stock.report)}</b></strong></div><p>{stock.report.summary}</p></div>}
        <div className="stock-range-tabs" role="group" aria-label="行情轮次">{([5,10,30] as const).map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>最近 {n} 轮</button>)}</div>
        <StockChart key={range} stock={stock} round={state.round} detail range={range}/>
        <p className="stock-event-legend">● 全球事件　◆ 财报　▲ 派息 / 除息　★ 板块重估</p>
        <div className="stock-actions"><button disabled={busy||state.status!=='playing'} onClick={()=>setSide('buy')}>买入</button><button disabled={busy||!holding.qty||state.status!=='playing'} onClick={()=>setSide('sell')}>卖出</button></div>
        {side&&<div className="stock-order-wrap" ref={orderRef}><StockOrder key={side} stock={stock} me={me} side={side} reserved={auctionReserve(state,me.id)} busy={busy||state.status!=='playing'} onClose={()=>setSide(null)} act={act}/></div>}
        <dl className="stock-details-stats"><div><dt>持仓 / 均价</dt><dd>{holding.qty} 股 / {holding.qty?priceText(holding.cost/holding.qty):'—'}</dd></div><div><dt>市值 / 资产占比</dt><dd>{priceText(value)} 万 / {total>0?(value/total*100).toFixed(1):'0.0'}%</dd></div><div><dt>持仓盈亏</dt><dd className={marketTone(profit)}>{profit>0?'+':''}{priceText(profit)} 万</dd></div><div><dt>每次税前股息率</dt><dd>{(stock.dividend*100).toFixed(1)}%</dd></div></dl>
        <p className="stock-dividend">{dividend?`第 ${dividend.round} 轮财报与派息 · 还有 ${dividend.remaining} 轮`:'本局财报与派息已结束'} · 派息时股价同步除息</p>
        <h3>影响因素</h3><p>{info?.factors.join(' · ')}</p><p className="stock-order-note">估值为区间判断，存在随机波动；全城开发日常加成最多 10%；三级封顶重估独立累计，最终基本面上限为基础价的 2.2 倍。</p>
        <h3>最近 {range} 轮消息</h3>
        {events.length?<ol className="stock-event-list">{events.map((e,i)=><li key={`${e.round}-${e.kind}-${i}`}><small>第 {e.round} 轮 · {e.kind==='global'?'全球事件':e.kind==='city'?'城市消息':e.kind==='report'?'公司财报':e.kind==='revaluation'?'板块重估':'股息结算'}</small><strong>{e.title}</strong><p>{e.description}</p></li>)}</ol>:<p className="stock-order-note">此窗口尚无已记录消息。旧存档不补造历史事件。</p>}
      </div>
    </div>
  </div>;
}
