import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame, addPlayer, dispatch, marketTick } from '../server/engine';
import { JOBS } from '../shared/catalog';
import { money } from '../shared/finance';
import { changeLabel, estimateStockOrder, marketTone, maximumStockQuantity, nextDividend, quoteWindow } from '../src/market/marketMath';
import { StockChart } from '../src/market/StockChart';
import { Market } from '../src/market/Market';

function game() {const s=createGame('QUOTES');addPlayer(s,'行情测试');addPlayer(s,'同行');return dispatch(s,s.hostId,{type:'start'});}

test('stock colours distinguish up, down and flat without relying on colour alone',()=>{
  assert.equal(marketTone(2),'market-up');assert.equal(marketTone(-2),'market-down');assert.equal(marketTone(0),'market-flat');
  assert.equal(changeLabel(12,10),'▲ +20.00%');assert.equal(changeLabel(8,10),'▼ -20.00%');assert.equal(changeLabel(10,10),'— 0.00%');
});
test('quote windows show live trade endpoints and keep original round labels for thirty historical rounds',()=>{
  const stock=game().stocks[0];delete stock.closes;stock.history=Array.from({length:30},(_,i)=>10+i*.1);stock.price=13.2;stock.previous=12.4;
  const chart=quoteWindow(stock,45);
  assert.equal(chart.points.length,31);assert.equal(chart.points[0].round,16);assert.equal(chart.points.at(-1)!.round,45);
  assert.equal(chart.points.at(-1)!.price,13.2);assert.ok(chart.points.at(-1)!.current);assert.equal(chart.high,13.2);assert.equal(chart.low,10);
  stock.price=stock.history.at(-1)!;assert.equal(quoteWindow(stock,45).points.length,30);
});
test('single-point detail shows one round label and an empty-history hint',()=>{
  const stock=game().stocks[0];
  Object.assign(stock,{history:[12],closes:[{round:1,price:12}],price:12,previous:12});
  const svg=renderToStaticMarkup(createElement(StockChart,{stock,round:1,detail:true}));
  assert.equal((svg.match(/第 1 轮/g)??[]).length,1);
  assert.ok(svg.includes('仅有一个行情点'));
  assert.ok(!svg.includes('第 1 轮</span><span>第 1 轮'));
});
test('market card surfaces the latest earnings verdict and impact',()=>{
  const s=game();s.round=5;marketTick(s,{random:()=>.5});
  const html=renderToStaticMarkup(createElement(Market,{state:s,me:s.players[0],act:()=>{},busy:false}));
  assert.ok(html.includes('最新财报'));
  assert.match(html,/超预期|不及预期|符合预期/);
});
test('empty, one-point, flat and boundary histories produce finite SVG with a baseline and one latest endpoint',()=>{
  const stock=game().stocks[0];delete stock.closes;
  for(const [history,price,previous] of [[[],12,12],[[1],1,1],[[500],500,500],[[12,12,12],12,12],[[1,500,1],500,1]] as [number[],number,number][]) {
    Object.assign(stock,{history,price,previous});const chart=quoteWindow(stock,30);
    for(const point of chart.points)assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.y>=0&&point.y<=64);
    assert.ok(Number.isFinite(chart.baselineY));assert.equal(chart.points.filter(p=>p.current).length,1);
    const svg=renderToStaticMarkup(createElement(StockChart,{stock,round:30}));
    assert.ok(!/NaN|Infinity/.test(svg));assert.equal((svg.match(/class="market-gridline"/g)??[]).length,4);
    assert.ok(svg.includes('market-baseline'));assert.ok(svg.includes('quote-latest'));assert.ok(svg.includes('最近 30 轮'));
  }
});
test('all occupations and all six stocks use exactly the authoritative buy and sell rounding, fees, tax and quote impact',()=>{
  for(const job of JOBS)for(const stockId of game().stocks.map(s=>s.id))for(const side of ['buy','sell'] as const)for(const qty of [1,5,25,1000]) {
    const s=game(),player=s.players[0],stock=s.stocks.find(st=>st.id===stockId)!;
    player.job=job;player.cash=1000000;player.stocks[stockId]={qty:1000,cost:qty%2?7111.11:21000};stock.price=12.37;
    const estimate=estimateStockOrder(stock,player,qty,side)!;
    const result=dispatch(s,player.id,{type:'stock',stockId,qty,side});
    assert.equal(result.players[0].cash,estimate.cashAfter,`${job} ${stockId} ${side} ${qty}`);
    assert.equal(result.stocks.find(st=>st.id===stockId)!.price,estimate.nextQuote);
    assert.equal(money(estimate.gross+(side==='buy'?estimate.fee:-estimate.fee-estimate.tax)),estimate.amount);
  }
});
test('maximum quantities include fees, slippage, the 1000-share limit and reserved auction funds',()=>{
  const s=game(),p=s.players[0],stock=s.stocks[0];
  for(const cash of [0,.99,12,12.14,100,200,1000000]) {
    p.cash=cash;const max=maximumStockQuantity(stock,p,'buy');
    if(max>0)assert.ok(estimateStockOrder(stock,p,max,'buy')!.amount<=cash);
    if(max<1000)assert.ok(estimateStockOrder(stock,p,max+1,'buy')!.amount>cash);
  }
  p.cash=200;const reserved=150,available=p.cash-reserved,max=maximumStockQuantity(stock,p,'buy',available);
  s.auction={tileId:1,highest:reserved,bidder:p.id,passed:[],endsAt:Date.now()+10000,foreclosure:false};
  assert.doesNotThrow(()=>dispatch(s,p.id,{type:'stock',stockId:stock.id,qty:max,side:'buy'}));
  assert.throws(()=>dispatch(s,p.id,{type:'stock',stockId:stock.id,qty:max+1,side:'buy'}),/现金不足/);
  p.stocks.bank={qty:1001,cost:3000};assert.equal(maximumStockQuantity(stock,p,'sell'),1000);
});
test('invalid quantities and insufficient holdings have no estimate, while a sale can partially cover negative cash',()=>{
  const s=game(),p=s.players[0],stock=s.stocks[0];
  for(const qty of [0,-1,NaN,Infinity,1.5,1001])assert.equal(estimateStockOrder(stock,p,qty,'buy'),null);
  assert.equal(estimateStockOrder(stock,p,1,'sell'),null);
  p.cash=-100;p.stocks.bank={qty:5,cost:40};const estimate=estimateStockOrder(stock,p,1,'sell')!;
  assert.ok(estimate.cashAfter<0);assert.ok(estimate.cashAfter>p.cash);
  assert.equal(dispatch(s,p.id,{type:'stock',stockId:stock.id,qty:1,side:'sell'}).players[0].cash,estimate.cashAfter);
});
test('dividend countdown points to the next payment after the current round and stops at the game limit',()=>{
  assert.deepEqual(nextDividend(1,30),{round:5,remaining:4});assert.deepEqual(nextDividend(5,30),{round:10,remaining:5});
  assert.deepEqual(nextDividend(29,30),{round:30,remaining:1});assert.equal(nextDividend(30,30),null);
});
