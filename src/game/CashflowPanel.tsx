import type {GameState,Player,Settlement} from '../../shared/types';
import {cashflow} from './cashflow';
export const fmt=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n===0?0:n);
export function SettlementDetails({value}:{value:Settlement}) {
  const rows:[string,number][]=[['利息',-value.interest],['地产税',-value.tax],['维护',-value.upkeep]];
  if(value.rentPaid)rows.push(['支付过路租金',-value.rentPaid]);
  if(typeof value.operatingIncome==='number')rows.push(['地产经营收入（税后）',value.operatingIncome]);
  if(value.rentIncome)rows.push(['过路租金收入',value.rentIncome]);
  rows.push(['存款利息（计入存款）',value.depositIncome],['财务净变化',value.total]);
  return <dl className="finance-grid settlement-lines">{rows.map(([label,amount])=><div key={label}><dt>{label}</dt><dd>{amount>0?'+':''}{fmt(amount)} 万</dd></div>)}</dl>;
}
export function CashflowPanel({state,me,onRescue}:{state:GameState;me:Player;onRescue:()=>void}) {
  const f=cashflow(state,me);
  return <div className="cashflow-panel"><dl className="finance-grid">{[['现金',me.cash],['存款',me.deposit],['竞拍预留',f.reserved],['可用现金',f.available],['股票市值',f.stocks],['股票可售净额（每只至多 1000 股）',f.stockNet],['可抵押额度（已扣提案占用）',f.mortgage],['可用信用贷款',f.credit]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{fmt(Number(value))} 万</dd></div>)}</dl><h3>最近一次实际回合结算</h3>{me.lastSettlement?<SettlementDetails value={me.lastSettlement}/>:<p>财务净变化 {fmt(me.lastFlow)} 万；此记录暂无分项明细。</p>}<h3>下个个人回合开始 · 保守估算</h3><dl className="finance-grid"><div><dt>利息 / 税 / 维护</dt><dd>{fmt(f.interest)} / {fmt(f.tax)} / {fmt(f.upkeep)} 万</dd></div><div><dt>预计现金支出</dt><dd>{fmt(f.fixed)} 万</dd></div><div><dt>预计经营收入（税后）</dt><dd>+{fmt(f.operatingIncome)} 万</dd></div><div><dt>预计净支出（负数=净收入）</dt><dd>{fmt(f.netFixed)} 万</dd></div><div><dt>结算后可用现金</dt><dd>{fmt(f.available-f.netFixed)} 万</dd></div><div><dt>现金跑道</dt><dd>{f.runway}</dd></div></dl><p className="panel-note">经营收入按当前地产、等级、街区景气和事件风口估算，已扣 10% 所得税；不含工资、过路租金、股息、股票波动、后续买卖和事件格。存款利息计入存款，不能直接支付现金支出。股票净额以当前报价逐只估算，实际成交以服务器重新校验为准。</p>{(f.gap>0||me.cash<0)&&<button className="secondary" onClick={onRescue}>查看补现金建议 · 预计缺口 {fmt(f.gap)} 万</button>}</div>;
}
