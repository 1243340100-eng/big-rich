import type {Action,GameState,Player,Property} from '../../shared/types';
import {mortgageAmount,bankSaleQuote,money} from '../../shared/finance';
import {TILES} from '../../shared/catalog';
import {propertyActionReason} from './cashflow';
import {fmt} from './CashflowPanel';
export function PropertyFinance({state,me,property,blocked,confirm}:{state:GameState;me:Player;property:Property;blocked:string;confirm:(text:string,action:Action)=>void}) {
  const type=property.mortgage?'redeem':'mortgage',collateral=blocked||propertyActionReason(state,me,property,type),sale=blocked||propertyActionReason(state,me,property,'sellProperty');
  const amount=property.mortgage?money(property.mortgage*1.05):mortgageAmount(state,property);
  return <div className="property-finance"><button className="secondary" disabled={!!collateral} onClick={()=>confirm(`${type==='redeem'?'赎回':'抵押'}「${TILES[property.tileId].name}」：${type==='redeem'?`支付 ${amount} 万（含 5% 手续费），恢复收租与经营收益`:`获得 ${amount} 万，暂停收租与经营收益；抵押利率为基准利率 + 2%，赎回另付 5% 手续费`}。`,{type,tileId:property.tileId})}>{type==='redeem'?'赎回':'抵押'} {fmt(amount)} 万</button>{collateral&&<small className="disabled-reason">{collateral}</small>}<button className="secondary" disabled={!!sale} onClick={()=>confirm(`向银行出售「${TILES[property.tileId].name}」，永久失去地产、租金和经营收益：未抗跌估值的 70%，按投入成本 85% 封顶，再减去抵押债务，净得 ${fmt(bankSaleQuote(state,property).net)} 万。`,{type:'sellProperty',tileId:property.tileId})}>出售地产</button>{sale&&<small className="disabled-reason">{sale}</small>}</div>;
}
