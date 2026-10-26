import type {Action,GameState,Player,Property} from '../../shared/types';
import {money,propertyRent,propertyOperatingIncome,effectiveUpgradeCost,OPERATING_INCOME_LEVEL} from '../../shared/finance';
import {linkedStockSectors} from '../../shared/stockCatalog';
import {upgradeReason} from './cashflow';
import {fmt} from './CashflowPanel';
export function PropertyUpgrade({state,me,property,act,blocked}:{state:GameState;me:Player;property:Property;act:(a:Action)=>void;blocked:string}) {
  const reason=blocked||upgradeReason(state,me,property),cost=effectiveUpgradeCost(state,me,property.tileId);
  return <div className="upgrade-preview">{property.level<3&&!property.mortgage&&<p>当前周期租金 {fmt(propertyRent(state,property))} → {fmt(propertyRent(state,{...property,level:property.level+1}))} 万/次<br/>经营 +{fmt(propertyOperatingIncome(state,property))} → +{fmt(propertyOperatingIncome(state,{...property,level:property.level+1}))} 万/回合<br/>升级后现金 {fmt(money(me.cash-cost))} 万 · 维护 +{me.job==='企业家'?.48:.6} 万/回合<br/>估值上升，地产税也会增加</p>}{property.mortgage&&<p className="disabled-reason">抵押期间暂停经营收益；赎回后恢复。</p>}{property.level===2&&<p className="level-three-perks"><b>三级：租金 +1.40R · 经营 ×{OPERATING_INCOME_LEVEL[3]} · 抗周期 · 抵押率 75%</b><br/>指数下跌时，估值仅承受一半跌幅；经营收益的周期系数不低于 1.0。{state.sectorRevaluationTiles?.includes(property.tileId)?'本地块重估机会已使用。':linkedStockSectors(property.tileId).length?`首次封顶联动：${linkedStockSectors(property.tileId).map(s=>s.name).join('、')}；其余板块资金流出。`:'本地块无直接联动板块。'}</p>}<button className="secondary" disabled={!!reason} onClick={()=>act({type:'upgrade',tileId:property.tileId})}>{property.level>=3?'已满级':`立即升级 ${fmt(cost)} 万`}</button>{reason&&<p className="disabled-reason">{reason}</p>}</div>;
}
