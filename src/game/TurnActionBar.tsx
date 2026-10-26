import {landAuctionStartPrice} from '../../shared/auctions';
import {Dice1,MoreHorizontal} from 'lucide-react';
import type {Action,GameState,Player} from '../../shared/types';
import {TILES} from '../../shared/catalog';
import {primaryAction} from './primaryAction';
import {cashflow} from './cashflow';
import {CashNumber,playCue} from './feedback';
import {fmt} from './CashflowPanel';
import {ShortcutActions} from './ShortcutActions';
import {SHORTCUT_ENTRY_TILES} from '../../shared/shortcuts';

interface Props {state:GameState;me:Player;selected:number|null;clock:number;blocked:string;shortcut:boolean;setShortcut:(v:boolean)=>void;act:(a:Action)=>void;onMore:()=>void;onCashflow:()=>void;onRescue:()=>void;onAssets:()=>void;onRanking:()=>void;onHome:()=>void;sound:boolean;volume:number;reduced:boolean;}
export function TurnActionBar(p:Props) {
  const {state,me}=p,cta=primaryAction(state,me,p.selected,p.clock),flow=cashflow(state,me);
  const reason=p.blocked||cta.reason||'';
  const perform=()=> {
    if(reason)return;
    switch(cta.kind){
      case 'rescue':p.onRescue();break;case 'ranking':p.onRanking();break;case 'auction':p.onAssets();break;
      case 'roll':p.act({type:'roll',shortcut:p.shortcut});break;
      case 'upgrade':p.act({type:'upgrade',tileId:cta.tileId});break;
      case 'end':if(p.sound)playCue('end',p.volume);p.act({type:'end'});break;
      case 'start':case 'buy':p.act({type:cta.kind});break;
    }
  };
  const mine=state.players[state.turn]?.id===me.id;
  return <div className="turn-panel action-bar"><div className="action-info"><div className="action-heading"><span className="turn-icon"><Dice1 size={20}/></span><div className="turn-copy" aria-live="polite"><h3>{cta.kind==='waiting'?cta.label:state.status==='lobby'?'准备开局':state.status==='finished'?'对局结束':mine?'你的回合':`${state.players[state.turn].name} 的回合`}</h3><p title={`${state.dice.length?`骰子 ${state.dice.join('、')} · `:''}${cta.preview}`}>{state.dice.length?`骰子 ${state.dice.join('、')} · `:''}{cta.preview}</p></div></div>{state.status==='playing'&&<button className={`cashflow-summary ${flow.gap>0?'at-risk':''}`} onClick={p.onCashflow} title={`${flow.runway}；点击查看现金流`}><span>现金 <b><CashNumber value={me.cash} reduced={p.reduced}/></b> 万</span><span title={`固定支出 ${fmt(flow.fixed)} · 经营收入 +${fmt(flow.operatingIncome)}`}>{flow.netFixed<=0?`净流入 +${fmt(-flow.netFixed)}`:`净支出 ${fmt(flow.netFixed)}`}/回合</span><span>现金流 ›</span></button>}</div><div className="action-controls"><ShortcutActions state={state} me={me} act={p.act} blocked={p.blocked}/><button className="more-action" aria-label="更多操作" title="更多操作" onClick={p.onMore}><MoreHorizontal size={18}/></button>{cta.kind==='roll'&&SHORTCUT_ENTRY_TILES.includes(me.position)&&<label className="shortcut"><input type="checkbox" checked={p.shortcut} onChange={e=>p.setShortcut(e.target.checked)}/>拐入内街</label>}{cta.kind==='buy'&&<><button className="secondary" aria-label={`低价拍卖，${landAuctionStartPrice(cta.tileId)} 万起拍`} title={state.reservations?.[cta.tileId]?'该地块已预定，只能全款买入或跳过':'以基础地价的 70% 起拍，所有玩家均可参与'} disabled={!!p.blocked||!!state.reservations?.[cta.tileId]} onClick={()=>p.act({type:'auction'})}>{fmt(landAuctionStartPrice(cta.tileId))} 万起拍</button><button className="secondary" disabled={!!p.blocked} onClick={()=>p.act({type:'decline'})}>跳过不买</button></>}{cta.kind==='upgrade'&&<button className="secondary" disabled={!!p.blocked} onClick={()=>p.act({type:'end'})}>结束回合</button>}{cta.kind==='rescue'&&<button className="secondary" disabled title="请先补足现金缺口">结束回合</button>}{cta.kind==='end'&&<button className="secondary" onClick={p.onAssets}>管理地产</button>}{cta.kind==='ranking'&&<button className="secondary" onClick={p.onHome}>返回首页</button>}{cta.kind!=='waiting'&&<button className="primary main-cta" disabled={!!reason} title={reason||undefined} onClick={perform}>{cta.label}</button>}{(cta.kind==='buy'||cta.kind==='upgrade')&&reason&&!p.blocked&&<button className="text-button" onClick={p.onRescue}>补现金</button>}</div>{reason&&cta.kind!=='waiting'&&<p className="disabled-reason" role="status">{reason}</p>}</div>;
}
