import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {ChevronDown,ChevronUp,X} from 'lucide-react';
import type {Settlement} from '../../shared/types';
import {useMobileLayout} from './preferences';

const format=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value===0?0:value);
const sign=(value:number)=>value>0?'+':'';

interface Note {
  left:number; delay:number; duration:number; drift:number; rotate:number; scale:number; symbol:string;
}
function moneyNotes(seedText:string):Note[] {
  let seed=2166136261;
  for(const char of seedText)seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  return Array.from({length:24},(_,index)=>({
    left:2+random()*96,
    delay:random()*.9,
    duration:2.2+random()*1.6,
    drift:(random()-.5)*150,
    rotate:-42+random()*84,
    scale:.68+random()*.55,
    symbol:index%4===0?'万':'¥',
  }));
}

export function SettlementReceipt({settlement,playerName,round,cash,deposit,reduced,onClose}:{settlement:Settlement;playerName:string;round:number;cash:number;deposit:number;reduced:boolean;onClose:()=>void}) {
  const mobile=useMobileLayout();
  const [expanded,setExpanded]=useState(!mobile);
  useEffect(()=>{setExpanded(!mobile);},[mobile,settlement.id,round]);
  const compact=mobile&&!expanded;
  const notes=useMemo(()=>moneyNotes(settlement.id??`${round}-${settlement.total}`),[settlement.id,round,settlement.total]);
  const total=settlement.total;
  const negative=total<0;
  const stamp=total>0?'盈余入账':negative?'支出结算':'账目平衡';
  const tone=total>0?'is-positive':negative?'is-negative':'is-neutral';
  const serial=(settlement.id??'LOCAL').replace(/-/g,'').slice(0,10).toUpperCase();
  const rows:{label:string;value:number;type:'out'|'in';note?:string}[]=[
    {label:'利息支出',value:-settlement.interest,type:'out'},
    {label:'地产税',value:-settlement.tax,type:'out'},
    {label:'维护费',value:-settlement.upkeep,type:'out'},
  ];
  if(settlement.rentPaid)rows.push({label:'支付过路租金',value:-settlement.rentPaid,type:'out',note:'上次结算后'});
  rows.push({label:'地产经营收入',value:settlement.operatingIncome,type:'in'});
  if(settlement.rentIncome)rows.push({label:'过路租金收入',value:settlement.rentIncome,type:'in',note:'上次结算后'});
  rows.push({label:'存款利息',value:settlement.depositIncome,type:'in',note:'转入存款'});
  return <>
    {!reduced&&<div className={`money-rain ${negative?'is-negative':''}`} aria-hidden="true">{notes.map((note,index)=>{const style={left:`${note.left}%`,animationDelay:`${note.delay}s`,animationDuration:`${note.duration}s`,'--drift':`${note.drift}px`,'--rot':`${note.rotate}deg`,'--scale':note.scale} as CSSProperties;return negative?<i className="debt-note" key={index} style={style}><b>-￥</b></i>:<i className="money-note" key={index} style={style}><b>{note.symbol}</b></i>;})}</div>}
    <aside className={`settlement-bill ${tone} ${compact?'is-compact':''}`} role="status" aria-label="回合结算账单">
      <div className="bill-paper">
        <header className="bill-head">
          <div>
            <span className="bill-brand">CAPITAL CITY · 资本之城</span>
            <h2>回合结算单</h2>
            <p>第 {round} 轮 · {playerName}</p>
          </div>
          <div className="bill-head-actions">
            {mobile&&expanded&&<button type="button" className="bill-toggle" aria-expanded={expanded} onClick={()=>setExpanded(false)}>收起<ChevronUp size={13}/></button>}
            <button type="button" className="bill-close" aria-label="收起结算账单" title="收起结算账单" onClick={onClose}><X size={15}/></button>
          </div>
        </header>
        {compact?<>
          <div className="bill-compact-total"><span>本期净变化</span><strong>{sign(total)}{format(total)} <small>万</small></strong></div>
          <div className="bill-compact-balance"><span>现金余额 <b>{format(cash)} 万</b></span><span>存款 <b>{format(deposit)} 万</b></span></div>
          <button type="button" className="bill-compact-expand" aria-expanded={expanded} onClick={()=>setExpanded(true)}>点击展开全部明细<ChevronDown size={13}/></button>
        </> : <>
          <div className="bill-rule"><span>¥</span></div>
          <dl className="bill-lines">
            {rows.map(row=><div className={`bill-line ${row.type}`} key={row.label}><dt>{row.label}{row.note&&<small>{row.note}</small>}</dt><dd>{sign(row.value)}{format(row.value)} 万</dd></div>)}
          </dl>
          <div className="bill-total"><span>本期净变化</span><strong>{sign(total)}{format(total)} <small>万</small></strong></div>
          <div className="bill-balance"><span>现金余额 <b>{format(cash)} 万</b></span><span>存款 <b>{format(deposit)} 万</b></span></div>
          <div className={`bill-stamp ${tone}`}>{stamp}</div>
          <div className="bill-barcode" aria-hidden="true"/>
          <footer className="bill-foot"><span>NO. {serial}</span><span>ROUND {String(round).padStart(2,'0')}</span><span>城市财政系统</span></footer>
        </>}
      </div>
    </aside>
  </>;
}
