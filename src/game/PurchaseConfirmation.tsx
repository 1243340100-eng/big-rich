import {TILES} from '../../shared/catalog';
import {money,propertyOperatingIncome,propertyPurchaseQuote} from '../../shared/finance';
import type {GameState,Player,Property} from '../../shared/types';
import {Dialog} from './Dialog';
import {cashReserve,tradeCashCommitment} from './cashflow';
import {fmt} from './CashflowPanel';

export function PurchaseConfirmation({state,me,property,blocked,onClose,onConfirm}:{state:GameState;me:Player;property:Property;blocked:string;onClose:()=>void;onConfirm:()=>void}){
  const quote=propertyPurchaseQuote(state,me.id,property);
  const available=money(me.cash-cashReserve(state,me)-tradeCashCommitment(state,me));
  const reason=blocked||(available<quote.total?'可用现金不足以支付地价与反垄断税':'');
  return <Dialog className="purchase-dialog" title={`确认买入 · ${TILES[property.tileId].name}`} onClose={onClose}>
    <dl className="purchase-summary"><div><dt>地产价格</dt><dd>{fmt(quote.price)} 万</dd></div><div><dt>反垄断税 · 支付银行</dt><dd>{fmt(quote.tax)} 万</dd></div><div><dt>合计支付</dt><dd><b>{fmt(quote.total)} 万</b></dd></div><div><dt>买后现金</dt><dd>{fmt(money(me.cash-quote.total))} 万</dd></div><div><dt>每回合经营收入</dt><dd>+{fmt(propertyOperatingIncome(state,property,true))} 万（税后）</dd></div></dl>
    <p className="purchase-note">同街区已有两块地产后，新增地产按基础地价收取反垄断税。经营收入受街区景气与当前事件风口影响；抵押期间暂停。成交以服务器实时校验为准。</p>
    <div className="modal-buttons"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!!reason} onClick={onConfirm}>确认买入 {fmt(quote.total)} 万</button></div>
    {reason&&<p className="disabled-reason">{reason}</p>}
  </Dialog>;
}
