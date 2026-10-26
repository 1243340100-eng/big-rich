import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {ensureFinanceState,money,netWorth,restructuringQuote,settlementQuote,totalDebt,tradeSettlementQuote} from '../shared/finance';
import {rescueOptions} from '../src/game/rescue';
import type {GameState,Trade} from '../shared/types';

function game(){const s=createGame('FIX001');addPlayer(s,'甲','公务员');addPlayer(s,'乙','公务员');return dispatch(s,s.hostId,{type:'start'});}
function bridge(){let s=game();s.phase='manage';s.players[0].position=32;return dispatch(s,s.hostId,{type:'bridgeLoan'});}
function stocks(){const s=game();s.phase='manage';s.players[0].stocks.tech={qty:10,cost:100};s.players[1].cash=500;return s;}
function offer(s:GameState,cash=200,extra:Partial<Trade>={}){return dispatch(s,s.hostId,{type:'offer',to:s.players[1].id,giveCash:0,wantCash:cash,giveProperty:null,wantProperty:null,giveStock:'tech',giveQty:10,wantStock:null,wantQty:0,...extra});}
function accept(s:GameState){return dispatch(s,s.players[1].id,{type:'accept',tradeId:s.trades[0].id});}
function nextRound(s:GameState){s.phase='manage';s=dispatch(s,s.hostId,{type:'end'});s.phase='manage';return dispatch(s,s.players[1].id,{type:'end'});}

test('bridge principal now bears 2% interest and cannot earn a positive six-turn deposit spread',()=>{
  let s=bridge();const before=200,principal=s.players[0].bridgeLoan!.principal,due=s.players[0].bridgeLoan!.dueRound;
  assert.equal(principal,80);assert.equal(settlementQuote(s,s.players[0]).interest,1.6);
  s=dispatch(s,s.hostId,{type:'deposit',amount:principal});for(let i=0;i<6;i++)s=nextRound(s);
  assert.equal(s.round,due);assert.equal(s.players[0].deposit,84.92);assert.equal(s.players[0].lastSettlement!.interest,1.6);
  assert.equal(s.players[0].debt,0);s=dispatch(s,s.hostId,{type:'withdraw',amount:s.players[0].deposit});s=dispatch(s,s.hostId,{type:'bridgeRepay'});
  assert.equal(totalDebt(s,s.players[0]),0);assert.equal(netWorth(s,s.players[0]),195.32);assert.ok(netWorth(s,s.players[0])<before);
});

test('repaying a bridge loan never reopens the per-game loan allowance',()=>{
  let s=bridge();s=dispatch(s,s.hostId,{type:'bridgeRepay'});assert.equal(s.players[0].bridgeLoanUsed,true);
  const before=structuredClone(s);assert.throws(()=>dispatch(s,s.hostId,{type:'bridgeLoan'}),/每局只能/);assert.deepEqual(s,before);
});

test('legacy active bridge loans migrate to a durable used flag without changing money',()=>{
  let s=bridge();delete s.players[0].bridgeLoanUsed;const cash=s.players[0].cash,loan=structuredClone(s.players[0].bridgeLoan);
  assert.ok(ensureFinanceState(s));assert.equal(s.players[0].bridgeLoanUsed,true);assert.equal(s.players[0].cash,cash);assert.deepEqual(s.players[0].bridgeLoan,loan);
  assert.equal(ensureFinanceState(s),false);s=dispatch(s,s.hostId,{type:'bridgeRepay'});assert.throws(()=>dispatch(s,s.hostId,{type:'bridgeLoan'}),/每局只能/);
});

test('legacy players without an active loan keep their unused allowance and balances',()=>{
  const s=game();delete s.players[0].bridgeLoanUsed;s.players[0].defaults=1;const cash=s.players[0].cash;
  ensureFinanceState(s);assert.equal(s.players[0].bridgeLoanUsed,false);assert.equal(s.players[0].cash,cash);
});

test('restructuring consolidates bridge debt, clears own reservations and preserves other players reservations',()=>{
  let s=bridge();s.phase='buy';s.pendingTile=34;s=dispatch(s,s.hostId,{type:'reserve'});
  s.turn=1;s.phase='buy';s.pendingTile=35;s=dispatch(s,s.players[1].id,{type:'reserve'});const other=structuredClone(s.reservations![35]);
  s.turn=0;s.phase='manage';Object.assign(s.players[0],{cash:-10,debt:100,deposit:20,stocks:{food:{qty:2,cost:16}}});
  Object.assign(s.properties.find(p=>p.tileId===1)!,{owner:s.hostId,level:1,mortgage:5});
  const quote=restructuringQuote(s,s.players[0]);assert.equal(quote.debtAfter,32.12);assert.equal(quote.forfeited,36);
  const rescue=rescueOptions(s,s.players[0]).find(o=>o.id==='restructure')!;assert.match(rescue.detail,/取消本人 1 份预定/);
  s=dispatch(s,s.hostId,{type:'restructure'});assert.equal(s.players[0].debt,quote.debtAfter);assert.equal(s.players[0].bridgeLoan,undefined);assert.equal(s.players[0].bridgeLoanUsed,true);
  assert.equal(totalDebt(s,s.players[0]),32.12);assert.equal(s.reservations![34],undefined);assert.deepEqual(s.reservations![35],other);assert.equal(s.players[0].deposit,0);assert.deepEqual(s.players[0].stocks,{});
  assert.equal(rescue.fixedAfter,settlementQuote(s,s.players[0]).fixed);
});

test('a restructuring player cannot claim the one-time bridge benefit a second time',()=>{
  let s=bridge();s.players[0].cash=-10;s=dispatch(s,s.hostId,{type:'restructure'});
  assert.throws(()=>dispatch(s,s.hostId,{type:'bridgeLoan'}),/每局只能/);
});

test('bilateral stock sales pay both fees and the sellers realised gain tax, and update the buyer basis',()=>{
  let s=offer(stocks()),q=tradeSettlementQuote(s,s.trades[0]);
  assert.equal(q.fromStockFee,2);assert.equal(q.fromStockTax,10);assert.equal(q.toStockFee,2);assert.equal(q.toStockTax,0);
  s=accept(s);assert.equal(s.players[0].cash,388);assert.equal(s.players[1].cash,298);assert.deepEqual(s.players[0].stocks.tech,{qty:0,cost:0});assert.deepEqual(s.players[1].stocks.tech,{qty:10,cost:202});
  assert.equal(money(s.players.reduce((sum,p)=>sum+p.cash,0)),686);
  s=dispatch(s,s.players[1].id,{type:'stock',stockId:'tech',side:'sell',qty:10});assert.equal(s.players[1].cash,494.02,'Old seller gain must not be taxed a second time');
});

test('gifts and token-price stock deals cannot suppress the market-value tax base',()=>{
  for(const cash of [0,1]){const s=accept(offer(stocks(),cash));assert.equal(s.players[0].cash,188+cash);assert.equal(s.players[1].cash,498-cash);assert.equal(s.players[1].stocks.tech.cost,202);}
});

test('insufficient fees reject both an offer and a stale acceptance atomically',()=>{
  let s=stocks();s.players[1].cash=1;const before=structuredClone(s);assert.throws(()=>offer(s,0),/现金不足/);assert.deepEqual(s,before);
  s=offer(stocks(),0);s.players[0].cash=11.99;const stale=structuredClone(s);assert.throws(()=>accept(s),/现金不足/);assert.deepEqual(s,stale);
});

test('trade taxes are requoted against the live price at acceptance',()=>{
  let s=offer(stocks());s.stocks.find(st=>st.id==='tech')!.price=30;
  const q=tradeSettlementQuote(s,s.trades[0]);assert.equal(q.fromStockFee,3);assert.equal(q.fromStockTax,20);assert.equal(q.toStockFee,3);
  s=accept(s);assert.equal(s.players[0].cash,377);assert.equal(s.players[1].cash,297);assert.equal(s.players[1].stocks.tech.cost,303);
});

test('stock transfer fees cannot consume cash reserved for a leading auction bid',()=>{
  const s=stocks();s.phase='auction';s.auction={tileId:5,highest:190,bidder:s.hostId,passed:[],endsAt:Date.now()+10000,foreclosure:false};
  const before=structuredClone(s);assert.throws(()=>offer(s,0),/竞拍资金/);assert.deepEqual(s,before);
});

test('swapping the same stock freezes both original cost bases before either leg transfers',()=>{
  let s=stocks();s.players[1].stocks.tech={qty:10,cost:150};s=offer(s,0,{giveQty:4,wantStock:'tech',wantQty:3});s=accept(s);
  assert.deepEqual(s.players[0].stocks.tech,{qty:9,cost:120.6});assert.deepEqual(s.players[1].stocks.tech,{qty:11,cost:185.8});assert.equal(s.players[0].cash,194.6);assert.equal(s.players[1].cash,497.1);
});

test('bilateral stock fee discounts follow the same professions as the public market',()=>{
  let s=stocks();s.players[0].job='程序员';s.players[1].job='投资经理';s=offer(s,100,{giveQty:5});
  const q=tradeSettlementQuote(s,s.trades[0]);assert.equal(q.fromStockFee,.5);assert.equal(q.toStockFee,.5);assert.equal(q.fromStockTax,5);
  s=accept(s);assert.equal(s.players[0].cash,294.5);assert.equal(s.players[1].cash,399.5);assert.equal(s.players[1].stocks.tech.cost,100.5);
});
