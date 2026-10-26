import {useState} from 'react';
import type {Action,GameState,Player} from '../../shared/types';
import {TILES} from '../../shared/catalog';
import {cashflow} from './cashflow';
import {rescueOptions,type RescueOption} from './rescue';
import {fmt} from './CashflowPanel';

export function CashRescue({state,me,act,blocked}:{state:GameState;me:Player;act:(a:Action)=>void;blocked:string}) {
  const [amounts,setAmounts]=useState<Record<string,number>>({}),[confirmation,setConfirmation]=useState<{option:RescueOption;version:number}|null>(null);
  const f=cashflow(state,me),options=rescueOptions(state,me,amounts);
  const perform=(o:RescueOption)=>{if(!blocked&&!o.reason){act(o.action);setConfirmation(null);setAmounts({});}};
  // A changed quote, turn or holding invalidates a reviewed confirmation.
  const confirmed=confirmation?.version===state.version?options.find(o=>o.id===confirmation.option.id):undefined;
  return <div className="cash-rescue"><div className="rescue-summary"><b>现金 {fmt(me.cash)} 万 · 预计缺口 {fmt(f.gap)} 万</b><p>目标：补足现金缺口与下个个人回合净支出（固定支出减去经营收入），保留竞拍预留 {fmt(f.reserved)} 万。</p></div><p className="panel-note">按“每筹得 1 万的估算代价”排序：比较一个个人回合的增量支出、赎回费、交易损失，计入售房后的固定支出节省和经营收益减少，并假设一次税后租金机会损失。租金不保证发生；不预测股价涨跌。先选择下一步，执行后重新计算，不会自动结束回合。</p>{options.map(o=> {
    const label=(o.action.type==='mortgage'?'抵押 ':o.action.type==='sellProperty'?'出售 ':'')+(typeof o.action.tileId==='number'?TILES[o.action.tileId].name:o.label);
    const adjustable=o.id==='borrow'||o.id==='withdraw'||o.action.type==='stock';
    const reason=blocked||o.reason;
    return <article className={`rescue-option ${o.id==='restructure'?'restructure-option':''}`} key={o.id}><h3>{label}</h3><p className="rescue-result">净得 {fmt(o.amount)} 万 → 现金 {fmt(o.cashAfter)} 万 · {o.id==='restructure'?'重组后需重新评估':o.covered?'覆盖预计支出':'仍需继续筹资'}</p><p>{o.detail}</p>{adjustable&&<label>{o.action.type==='stock'?'卖出股数':'操作金额（万）'}<input aria-label={`${o.label.split(' ')[0]}${o.id}金额`} type="number" min="1" step={o.action.type==='stock'?'1':'.01'} value={amounts[o.id]??(o.action.type==='stock'?Number(o.action.qty):Number(o.action.amount))} onChange={e=>{setConfirmation(null);setAmounts({...amounts,[o.id]:Number(e.target.value)});}}/></label>}<small>操作后固定支出 {fmt(o.fixedAfter)} · 经营 +{fmt(o.operatingIncomeAfter)} · 净支出 {fmt(o.netAfter)} 万 / 个人回合</small><button className={o.id==='restructure'?'danger':'secondary'} disabled={!!reason} onClick={()=>setConfirmation({option:o,version:state.version})}>预览并确认{label}</button>{reason&&<p className="disabled-reason">{reason}</p>}{confirmed?.id===o.id&&<div className="rescue-confirm" role="group" aria-label="确认筹资"><p>确认{label}，预计现金变为 {fmt(o.cashAfter)} 万。{o.destructive?'此操作会改变资产或收租能力。':''}</p><button className="secondary" onClick={()=>setConfirmation(null)}>取消</button><button className={o.id==='restructure'?'danger':'secondary'} disabled={!!reason} onClick={()=>perform(o)}>确认执行此项</button></div>}</article>;
  })}{confirmation&&!confirmed&&<p role="status" className="disabled-reason">行情或状态已更新，请重新预览后确认。</p>}</div>;
}
