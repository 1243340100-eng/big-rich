import {BRIDGE} from '../../shared/shortcuts';
import {useState} from 'react';
import {Landmark} from 'lucide-react';
import {loanLimit,loanRate} from '../../shared/finance';
import type {Action,GameState,Player} from '../../shared/types';
import {cashReserve,tradeCashCommitment} from './cashflow';
import {fmt} from './CashflowPanel';
export function Bank({state,me,act,busy}:{state:GameState;me:Player;act:(a:Action)=>void;busy:boolean}) {
  const [amount,setAmount]=useState(20),available=me.cash-cashReserve(state,me)-tradeCashCommitment(state,me);
  function reason(type:string){
    if(busy)return '正在等待连接或服务器确认';
    if(state.status!=='playing')return '当前不在对局中';
    if(!Number.isFinite(amount)||amount<1||amount>100000)return '金额须在 1–100000 万之间';
    if(type==='borrow'&&amount>loanLimit(state,me))return '超过可用信用贷款额度';
    if(type==='withdraw'&&amount>me.deposit)return '存款余额不足';
    if(type==='repay'&&amount>me.debt)return '金额超过贷款余额';
    if(['repay','deposit'].includes(type)&&amount>available)return '可用现金不足，含竞拍预留和交易提案';
    return '';
  }
  return <><div className="bank-banner"><Landmark size={24}/><h3>星海城市银行</h3></div><div className="bank-stats"><div><span>信用贷款余额</span><b>{fmt(me.debt)} 万</b></div><div><span>贷款利率</span><b>{(loanRate(state,me)*100).toFixed(1)}% / 个人回合</b></div><div><span>剩余可贷额度</span><b>{fmt(loanLimit(state,me))} 万</b></div><div><span>活期存款 · 每回合 1%</span><b>{fmt(me.deposit)} 万</b></div></div>{me.bridgeLoan&&<p className="panel-note">过桥本金 {fmt(me.bridgeLoan.principal)} 万 · 每个人回合利息 {BRIDGE.rate*100}% · 第 {me.bridgeLoan.dueRound} 轮到期，本局仅可申请一次。</p>}<label>操作金额（万元）<input aria-label="银行操作金额" type="number" min="1" step=".01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label><div className="bank-actions">{[['borrow','申请贷款'],['repay','偿还贷款'],['deposit','存入活期'],['withdraw','提取存款']].map(([type,label])=><div key={type}><button className="secondary" disabled={!!reason(type)} onClick={()=>act({type,amount})}>{label}</button>{reason(type)&&<p className="disabled-reason">{reason(type)}</p>}</div>)}</div><p className="panel-note">贷款利率随信用与央行利率变化；新贷款可能改变信用等级。每个个人回合开始计息。抵押贷款在「地产」面板操作，利率为基准利率 + 2%。</p></>;
}
