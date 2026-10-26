import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { Action, Player, Stock } from '../../shared/types';
import { estimateStockOrder, maximumStockQuantity, priceText, type OrderSide } from './marketMath';
export function StockOrder({stock,me,side,reserved,busy,onClose,act}:{stock:Stock;me:Player;side:OrderSide;reserved:number;busy:boolean;onClose:()=>void;act:(a:Action)=>void}) {
  const [quantity,setQuantity]=useState('1');
  const shares=me.stocks[stock.id]?.qty??0,initialShares=useRef(shares);
  useEffect(()=>{if(shares!==initialShares.current)onClose();},[shares,onClose]);
  const qty=Number(quantity),maximum=maximumStockQuantity(stock,me,side,me.cash-reserved),estimate=estimateStockOrder(stock,me,qty,side);
  const invalid=!Number.isInteger(qty)||qty<1||qty>1000;
  const error=invalid?'请输入 1–1000 之间的整数':side==='sell'&&!estimate?'持股数量不足':side==='buy'&&estimate&&estimate.cashAfter<reserved?'可用现金不足，请减少股数':null;
  function submit(event:FormEvent) {event.preventDefault();if(!error&&estimate&&!busy)act({type:'stock',stockId:stock.id,qty,side});}
  return <form className="stock-order" aria-label={`${stock.name}${side==='buy'?'买入':'卖出'}预览`} onSubmit={submit}>
    <div className="stock-order-head"><strong>{side==='buy'?'买入':'卖出'}预览</strong><button type="button" onClick={onClose} aria-label="收起交易预览"><X size={14}/></button></div>
    <label className="stock-quantity">交易股数<input aria-label={`${stock.name}交易股数`} type="number" min="1" max="1000" step="1" value={quantity} aria-invalid={!!error} onChange={e=>setQuantity(e.target.value)}/></label>
    <div className="stock-quick" aria-label="快捷股数">{[1,5].map(n=><button type="button" key={n} onClick={()=>setQuantity(String(n))}>{n} 股</button>)}<button type="button" disabled={maximum===0} onClick={()=>setQuantity(String(maximum))}>最大 {maximum} 股</button></div>
    {estimate&&<dl className="stock-estimate"><div className="stock-estimate-total"><dt>预计{side==='buy'?'花费':'到账'}</dt><dd>{priceText(estimate.amount)} 万</dd></div><div><dt>手续费 · {(estimate.feeRate*100).toFixed(1)}%</dt><dd>{priceText(estimate.fee)} 万</dd></div>{side==='sell'&&<div><dt>资本利得税</dt><dd>{priceText(estimate.tax)} 万</dd></div>}<div><dt>成交滑点</dt><dd>{estimate.impact>0?'+':''}{(estimate.impact*100).toFixed(2)}%</dd></div><div><dt>预计成交均价</dt><dd>{priceText(estimate.executionPrice)} 万</dd></div><div><dt>成交后市场报价</dt><dd>{priceText(estimate.nextQuote)} 万</dd></div><div><dt>预计剩余现金</dt><dd>{priceText(estimate.cashAfter)} 万</dd></div></dl>}
    {error&&<p className="stock-order-error" role="status">{error}</p>}
    {reserved>0&&<p className="stock-order-note">现金中有 {priceText(reserved)} 万为竞拍预留，最大股数已扣除此部分。</p>}
    <button className="stock-confirm" type="submit" disabled={busy||!!error||!estimate}>确认{side==='buy'?'买入':'卖出'} {Number.isInteger(qty)&&qty>0?qty:'—'} 股</button>
    <small className="stock-order-note">实时行情会变化，以上为当前报价的预计结果。</small>
  </form>;
}
