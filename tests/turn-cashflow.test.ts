import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {loanRate,money,propertyOperatingIncome,propertyRent,propertyValue,settlementQuote} from '../shared/finance';
import {JOBS} from '../shared/catalog';
import {cashflow,propertyActionReason,upgradeReason} from '../src/game/cashflow';
import {primaryAction} from '../src/game/primaryAction';
import {rescueOptions} from '../src/game/rescue';
import {estimateStockOrder} from '../src/market/marketMath';
import {TurnActionBar} from '../src/game/TurnActionBar';
import {CashflowPanel} from '../src/game/CashflowPanel';
import type {Action,GameState} from '../shared/types';

function game(){const s=createGame('FLOW01');addPlayer(s,'甲');addPlayer(s,'乙');return dispatch(s,s.hostId,{type:'start'});}
function owned(s:GameState,id=1){const a=s.properties.find(a=>a.tileId===id)!;a.owner=s.hostId;return a;}
test('CTA covers lobby, off-turn, roll, purchase, upgrade, end, auction, distress and finished states',()=> {
  let s=game();const p=s.players[0];
  assert.equal(primaryAction(s,p,null).kind,'roll');assert.equal(primaryAction(s,s.players[1],null).kind,'waiting');
  s.phase='buy';s.pendingTile=1;assert.equal(primaryAction(s,p,null).kind,'buy');
  s.phase='manage';const a=owned(s);assert.equal(primaryAction(s,p,1).kind,'upgrade');assert.equal(primaryAction(s,p,null).kind,'end');
  a.level=3;assert.equal(primaryAction(s,p,1).kind,'end');a.level=1;a.mortgage=20;assert.equal(primaryAction(s,p,1).kind,'end');
  s.auction={tileId:2,highest:15,bidder:null,passed:[],endsAt:Date.now()+10000,foreclosure:false};assert.equal(primaryAction(s,p,1).kind,'auction');
  p.cash=-1;assert.equal(primaryAction(s,p,1).kind,'rescue');s.turn=1;assert.equal(primaryAction(s,p,1).kind,'rescue');
  s.status='finished';assert.equal(primaryAction(s,p,1).kind,'ranking');
  s=createGame('LOBBY');addPlayer(s,'甲');assert.match(primaryAction(s,s.players[0],null).reason,/至少/);addPlayer(s,'乙');assert.equal(primaryAction(s,s.players[0],null).reason,'');assert.equal(primaryAction(s,s.players[1],null).kind,'waiting');
});
test('buy and upgrade previews expose actual landing rent, cycle, cash, upkeep and insufficient funds',()=> {
  const s=game(),p=s.players[0];s.phase='buy';s.pendingTile=1;s.economy.cycle=2;
  const cost=propertyValue(s,s.properties[0]);let c=primaryAction(s,p,null);assert.match(c.preview,/万\/次/);assert.ok(c.preview.includes(String(money(p.cash-cost))));
  p.cash=0;assert.match(primaryAction(s,p,null).reason,/现金不足/);
  const a=owned(s);s.phase='manage';p.cash=500;p.job='企业家';c=primaryAction(s,p,1);assert.equal(c.kind,'upgrade');assert.match(c.preview,/维护 \+0.48/);assert.ok(c.preview.includes(String(propertyRent(s,{...a,level:1}))));
  p.cash=0;assert.equal(primaryAction(s,p,1).kind,'upgrade');assert.match(primaryAction(s,p,1).reason,/现金不足/);
  a.level=3;assert.match(upgradeReason(s,p,a),/满级/);a.level=0;a.mortgage=1;assert.match(upgradeReason(s,p,a),/抵押/);a.mortgage=0;s.turn=1;assert.match(upgradeReason(s,p,a),/自己/);
});
test('runway excludes deposit interest and protects auction cash with explicit zero and partial cases',()=> {
  const s=game(),p=s.players[0];assert.equal(cashflow(s,p).runway,'暂无固定支出');p.debt=100;p.deposit=1000;p.cash=1;
  const f=cashflow(s,p);assert.equal(f.fixed,settlementQuote(s,p).interest);assert.match(f.runway,/不足 1/);assert.equal(f.gap,money(f.fixed-1));
  p.cash=-2;assert.match(cashflow(s,p).runway,/现金缺口 2/);
  p.cash=100;s.auction={tileId:1,highest:99,bidder:p.id,passed:[],endsAt:Date.now()+10000,foreclosure:false};assert.equal(cashflow(s,p).available,1);assert.match(cashflow(s,p).runway,/不足 1/);
});
test('shared quote matches original rounding and actual begin-turn debits across all jobs and cycles',()=> {
  for(const job of JOBS)for(let cycle=0;cycle<5;cycle++) {
    const s=game(),p=s.players[1];p.job=job;p.debt=83.27;p.deposit=29.95;p.cash=100;s.economy.cycle=cycle;s.economy.baseRate=.047;
    for(const a of s.properties.slice(0,8)){a.owner=p.id;a.level=a.tileId%4;a.mortgage=a.tileId%2?17.73:0;}
    const props=s.properties.filter(a=>a.owner===p.id),value=props.reduce((n,a)=>n+propertyValue(s,a),0);
    const interest=money(p.debt*loanRate(s,p)+props.reduce((n,a)=>n+a.mortgage*(s.economy.baseRate+.02),0));
    const tax=money(value*.008+Math.max(0,value-500)*.01),upkeep=money(props.reduce((n,a)=>n+a.level*.6,0)*(job==='企业家'?.8:1)),depositIncome=money(p.deposit*.01),operatingIncome=money(props.reduce((n,a)=>n+propertyOperatingIncome(s,a),0));
    const quote=settlementQuote(s,p);assert.deepEqual(quote,{interest,tax,upkeep,depositIncome,operatingIncome,fixed:money(interest+tax+upkeep),total:money(depositIncome+operatingIncome-interest-tax-upkeep)});
    s.phase='manage';const next=dispatch(s,s.hostId,{type:'end'}),after=next.players[1];
    assert.equal(after.cash,money(100+operatingIncome-interest-tax-upkeep));assert.equal(after.deposit,money(29.95+depositIncome));assert.equal(after.lastFlow,quote.total);
    assert.deepEqual({...after.lastSettlement,id:undefined,round:undefined},{interest,tax,upkeep,depositIncome,operatingIncome,total:quote.total,id:undefined,round:undefined});assert.ok(after.lastSettlement?.id);
    assert.equal(s.players[1].lastSettlement,undefined);
  }
});
test('rent received or paid since the last settlement is itemized on the next bill',()=>{
  let s=game();const owner=s.players[0],payer=s.players[1];owned(s);
  s.turn=1;s.phase='roll';payer.position=0;
  s=dispatch(s,payer.id,{type:'roll'},{diceRandom:()=>1});
  const rent=propertyRent(s,s.properties.find(a=>a.tileId===1)!),net=money(rent*.9);
  assert.equal(s.players[1].rentPaidSinceSettlement,rent);
  assert.equal(s.players[0].rentIncomeSinceSettlement,net);
  const ownerQuote=settlementQuote(s,s.players[0]);
  s.phase='manage';s=dispatch(s,payer.id,{type:'end'});
  const ownerBill=s.players[0].lastSettlement!;
  assert.equal(ownerBill.rentIncome,net);assert.equal(ownerBill.rentPaid,0);
  assert.equal(ownerBill.total,money(ownerQuote.total+net));assert.equal(s.players[0].lastFlow,ownerBill.total);
  assert.equal(s.players[0].rentIncomeSinceSettlement,0);
  const payerQuote=settlementQuote(s,s.players[1]);
  s.phase='manage';s=dispatch(s,s.players[0].id,{type:'end'});
  const payerBill=s.players[1].lastSettlement!;
  assert.equal(payerBill.rentIncome,0);assert.equal(payerBill.rentPaid,rent);
  assert.equal(payerBill.total,money(payerQuote.total-rent));assert.equal(s.players[1].rentPaidSinceSettlement,0);
});

test('settlement records are stable across off-turn finance and legacy records remain explicitly unavailable',()=> {
  const s=game(),p=s.players[0],id=p.lastSettlement!.id;
  const next=dispatch(s,p.id,{type:'borrow',amount:10});assert.equal(next.players[0].lastSettlement?.id,id);
  delete p.lastSettlement;p.lastFlow=-7.1;
  const html=renderToStaticMarkup(createElement(CashflowPanel,{state:s,me:p,onRescue:()=>{}}));assert.match(html,/暂无分项/);assert.match(html,/-7.1/);assert.equal(p.lastSettlement,undefined);
});
test('each enabled rescue suggestion is one reducer-valid action with an exact cash preview',()=> {
  const s=game(),p=s.players[0];p.cash=-10;p.deposit=7.25;p.debt=20;p.stocks.food={qty:30,cost:50};owned(s);owned(s,3).mortgage=10;
  const before=structuredClone(s),options=rescueOptions(s,p);assert.deepEqual(s,before);
  for(const o of options.filter(o=>!o.reason)) {
    const next=dispatch(s,p.id,o.action);assert.equal(next.players[0].cash,o.cashAfter,o.id);
    assert.equal(settlementQuote(next,next.players[0]).fixed,o.fixedAfter,o.id);
  }
  assert.equal(options.at(-1)?.id,'restructure');assert.equal(options.find(o=>o.id==='withdraw')!.cashAfter,-2.75);
});
test('stock rescue reuses authoritative fee, gain tax, slippage and single-order quantity cap',()=> {
  const s=game(),p=s.players[0];p.cash=-12;p.stocks.tech={qty:1200,cost:200};
  const options=rescueOptions(s,p,{'stock-tech':1000}),sale=options.find(o=>o.id==='stock-tech')!,q=estimateStockOrder(s.stocks.find(a=>a.id==='tech')!,p,1000,'sell')!;
  assert.equal(sale.amount,q.amount);assert.equal(sale.cashAfter,q.cashAfter);assert.match(sale.detail,/手续费/);assert.match(sale.detail,/滑点/);
  assert.match(rescueOptions(s,p,{'stock-tech':1001}).find(o=>o.id==='stock-tech')!.reason,/1000/);
  p.cash=-100;assert.ok(rescueOptions(s,p,{'stock-tech':1}).find(o=>o.id==='stock-tech')!.cashAfter<0);
});
test('rescue fixed-cost forecasts remain exact when an action crosses a credit band or changes retained stock quotes',()=> {
  for(const debt of [0,14.9,29.9,44.9,59.9,80])for(const cash of [-30,0,20]) {
    const s=game(),p=s.players[0];p.debt=debt;p.cash=cash;p.deposit=25;p.stocks.food={qty:10,cost:20};owned(s).level=2;
    for(const option of rescueOptions(s,p,{'stock-food':3}).filter(o=>!o.reason&&o.id!=='restructure')) {
      const after=dispatch(s,p.id,option.action);assert.equal(option.fixedAfter,settlementQuote(after,after.players[0]).fixed,`${debt}/${cash}/${option.id}`);
    }
  }
});
test('rescue ordering changes with current rates, uses post-borrow credit, and never auto-includes restructuring',()=> {
  const s=game(),p=s.players[0];p.cash=-10;p.deposit=30;p.stocks.food={qty:10,cost:1000};s.economy.baseRate=.01;
  const low=rescueOptions(s,p),stockLow=low.findIndex(o=>o.id==='stock-food'),loanLow=low.findIndex(o=>o.id==='borrow');assert.ok(loanLow<stockLow);
  const loan=low.find(o=>o.id==='borrow')!,next=dispatch(s,p.id,loan.action);assert.equal(loan.fixedAfter,settlementQuote(next,next.players[0]).fixed);
  assert.ok(loan.covered);s.economy.baseRate=.2;const high=rescueOptions(s,p);assert.ok(high.findIndex(o=>o.id==='borrow')>high.findIndex(o=>o.id==='stock-food'));
  assert.equal(high.at(-1)!.id,'restructure');assert.ok(high.at(-1)!.destructive);
});
test('auction, outstanding trades, insufficient limits and off-turn restructuring have visible restrictions',()=> {
  const s=game(),p=s.players[0],a=owned(s);p.cash=-5;p.stocks.food={qty:4,cost:12};
  s.trades=[{id:'t',from:p.id,to:s.players[1].id,giveCash:1,wantCash:0,giveProperty:1,wantProperty:null,giveStock:'food',giveQty:2,wantStock:null,wantQty:0,expires:3}];
  let options=rescueOptions(s,p);for(const id of ['mortgage-1','sell-1','stock-food','restructure'])assert.match(options.find(o=>o.id===id)!.reason,/提案/);
  assert.equal(cashflow(s,p).mortgage,0);
  assert.match(propertyActionReason(s,p,a,'mortgage'),/提案/);s.trades=[];s.turn=1;assert.match(rescueOptions(s,p).at(-1)!.reason,/自己回合/);
  s.turn=0;s.auction={tileId:1,highest:20,bidder:null,passed:[],endsAt:Date.now()+10000,foreclosure:false};options=rescueOptions(s,p);assert.match(options.find(o=>o.id==='mortgage-1')!.reason,/拍卖/);assert.match(options.at(-1)!.reason,/拍卖/);
  p.defaults=1;assert.match(rescueOptions(s,p).find(o=>o.id==='borrow')!.reason,/额度/);p.deposit=.2;assert.match(rescueOptions(s,p).find(o=>o.id==='withdraw')!.reason,/不足 1/);
});
test('turn UI has at most one main CTA in every state, never a fake waiting button, and explains disabled buy',()=> {
  const s=game(),p=s.players[0];
  const render=()=>renderToStaticMarkup(createElement(TurnActionBar,{state:s,me:p,selected:1,clock:Date.now(),blocked:'',shortcut:false,setShortcut:()=>{},act:(_a:Action)=>{},onMore:()=>{},onCashflow:()=>{},onRescue:()=>{},onAssets:()=>{},onRanking:()=>{},onHome:()=>{},sound:false,volume:.5,reduced:true}));
  for(const phase of ['roll','buy','manage','auction'] as const){s.phase=phase;s.pendingTile=1;assert.ok((render().match(/main-cta/g)??[]).length<=1);}
  s.turn=1;assert.equal((render().match(/main-cta/g)??[]).length,0);s.turn=0;s.phase='buy';p.cash=0;assert.match(render(),/现金不足/);assert.match(render(),/disabled/);p.cash=-10;assert.match(render(),/补现金 10 万/);
});
