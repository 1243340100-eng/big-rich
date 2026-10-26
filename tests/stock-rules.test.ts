import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addPlayer, botAction, createGame, dispatch, marketTick, settleAuction } from '../server/engine';
import { ensureMarketState, GLOBAL_MARKET_EVENTS, refreshMarketInsights, stockFundamentals, STOCK_MODELS, valuationTrade } from '../server/stockMarket';
import { money, propertyRent, upgradeCost } from '../shared/finance';
import { STOCK_CATALOG } from '../shared/stockCatalog';
import { StockChart } from '../src/market/StockChart';
import { quoteWindow } from '../src/market/marketMath';

function game(){const s=createGame('RULES');addPlayer(s,'测试投资人');addPlayer(s,'同行');return dispatch(s,s.hostId,{type:'start'});}

test('six personalities have separate volatility, interest exposure and dividend settings',()=>{
  const s=game();assert.equal(s.stocks.length,6);assert.equal(s.marketVersion,2);
  assert.ok(STOCK_MODELS.food.volatility<STOCK_MODELS.fun.volatility);
  assert.ok(STOCK_MODELS.bank.volatility<STOCK_MODELS.tech.volatility);
  assert.ok(s.stocks.find(st=>st.id==='food')!.dividend>s.stocks.find(st=>st.id==='tech')!.dividend);
  const before=Object.fromEntries(s.stocks.map(st=>[st.id,stockFundamentals(s,st.id).fairValue]));
  s.economy.baseRate=.06;
  assert.ok(stockFundamentals(s,'bank').fairValue>before.bank);
  assert.ok(stockFundamentals(s,'estate').fairValue<before.estate);
  assert.ok(stockFundamentals(s,'tech').fairValue<before.tech);
});

test('city development is city-wide, ownership-independent and capped at ten percent',()=>{
  const s=game(),baseline=Object.fromEntries(s.stocks.map(st=>[st.id,stockFundamentals(s,st.id).fairValue]));
  for(const p of s.properties){p.owner=s.hostId;p.level=3;}
  s.players[0].deposit=1e8;s.players[0].debt=1e8;
  for(const stock of s.stocks){const f=stockFundamentals(s,stock.id);assert.equal(f.development,1);assert.equal(f.developmentBonus,.1);assert.ok(Math.abs(f.fairValue/baseline[stock.id]-1.1)<1e-9);}
  const before=s.stocks.map(st=>stockFundamentals(s,st.id));
  for(const p of s.properties)p.owner=s.players[1].id;
  s.players[1].deposit=s.players[0].deposit;s.players[0].deposit=0;
  assert.deepEqual(s.stocks.map(st=>stockFundamentals(s,st.id)),before);
  const fresh=game();fresh.properties.find(p=>p.tileId===28)!.owner=fresh.hostId;fresh.properties.find(p=>p.tileId===28)!.level=3;
  assert.ok(stockFundamentals(fresh,'tech').development>0);assert.equal(stockFundamentals(fresh,'food').development,0);
});

test('mean reversion uses fundamentals rather than recent prices and changes valuation bands',()=>{
  const s=game(),stock=s.stocks[0],fair=stockFundamentals(s,stock.id).fairValue;
  stock.price=30;stock.history=[100,300];refreshMarketInsights(s);assert.equal(stock.valuation,'high');
  assert.equal(stockFundamentals(s,stock.id).fairValue,fair);
  s.round=2;marketTick(s,{random:()=>.5});assert.equal(stock.price,money(30+.35*(fair-30)));
  stock.price=5;refreshMarketInsights(s);assert.equal(stock.valuation,'low');
  s.round=4;marketTick(s,{random:()=>.5});assert.ok(stock.price>5&&stock.price<fair);
});

test('server-side auction completion immediately refreshes city valuation insights',()=>{
  const s=game(),stock=s.stocks.find(st=>st.id==='estate')!,prop=s.properties[0];stock.price=11.01;prop.level=3;
  refreshMarketInsights(s);assert.equal(stock.valuation,'high');
  s.auction={tileId:prop.tileId,highest:10,bidder:s.hostId,passed:[],endsAt:0,foreclosure:false};
  settleAuction(s);assert.equal(stock.valuation,'fair');assert.equal(stock.price,11.01);
});

test('each global event sets a coherent cycle, rents, rates and salaries',()=>{
  for(const event of GLOBAL_MARKET_EVENTS){
    const s=game();s.round=3;marketTick(s,{random:()=>.5,eventId:event.id});
    assert.equal(s.economy.cycle,event.cycle);assert.equal(s.economy.event,event.title);
    assert.equal(s.economy.baseRate,money(.03+event.rate));assert.equal(s.economy.propertyIndex,event.property);
    assert.ok(s.stocks.every(stock=>stock.events?.some(e=>e.round===3&&e.title===event.title)));
    const prop=s.properties[0];prop.owner=s.hostId;
    const calm=structuredClone(s);calm.economy.cycle=0;
    assert.ok(Math.abs(propertyRent(s,prop)-money(propertyRent(calm,prop)*[1,1.2,1.3,.85,.65][event.cycle]))<=.02);
    s.players[0].position=31;const rolled=dispatch(s,s.hostId,{type:'roll'});
    const expected=money(26*[1,1.1,1.15,.85,.75][event.cycle]*.9);
    assert.ok(rolled.logs.some(l=>l.text.includes(`税后收入 +${expected} 万`)));
    s.players[0].job='公务员';assert.ok(dispatch(s,s.hostId,{type:'roll'}).logs.some(l=>l.text.includes('税后收入 +19.8 万')));
  }
});

test('event exposure favours technology during AI news and energy during supply shocks',()=>{
  for(const [event,id] of [['ai','tech'],['energy','energy']] as const){
    const s=game(),before=s.stocks.map(st=>st.price);s.round=3;marketTick(s,{random:()=>.5,eventId:event});
    const returns=s.stocks.map((st,i)=>({id:st.id,return:st.price/before[i]-1})).sort((a,b)=>b.return-a.return);
    assert.equal(returns[0].id,id);
  }
});

test('financial report, taxed cash distribution and ex-dividend quote settle once in the same round',()=>{
  const s=game(),p=s.players[0];p.stocks.tech={qty:10,cost:200};const oldCash=p.cash;s.round=5;
  marketTick(s,{random:()=>.5});const stock=s.stocks.find(st=>st.id==='tech')!;
  assert.equal(stock.price,19.8);assert.equal(p.cash,oldCash+1.8);
  assert.equal(money(p.cash+10*stock.price-oldCash),199.8);
  assert.equal(stock.report?.verdict,'inline');assert.equal(stock.report?.round,5);
  assert.deepEqual(stock.events?.map(e=>e.kind),['report','dividend']);
  assert.equal(stock.events?.find(e=>e.kind==='dividend')?.amount,.18);
  const settled=structuredClone(s);marketTick(s,{random:()=>1});assert.deepEqual(s,settled);
  s.round=6;marketTick(s,{random:()=>.5,eventId:'boom'});assert.equal(p.cash,oldCash+1.8);
});

test('reports can beat or miss expectations, with both directions marked on the chart',()=>{
  for(const [random,verdict] of [[0,'miss'],[1,'beat']] as const){const s=game();s.round=5;marketTick(s,{random:()=>random});assert.equal(s.stocks[0].report?.verdict,verdict);}
  const s=game();for(let round=2;round<=30;round++){s.round=round;marketTick(s,{random:()=>.5,eventId:'crisis'});}
  const stock=s.stocks[0],svg=renderToStaticMarkup(createElement(StockChart,{stock,round:30,detail:true,range:10}));
  assert.ok(svg.includes('金融危机'));assert.ok(svg.includes('派息 / 除息'));assert.ok(svg.includes('财报'));
  assert.ok(svg.includes('第 21 轮'));assert.ok(!svg.includes('第 20 轮'));assert.ok(!/NaN|Infinity/.test(svg));
});

test('migration preserves money, debt, holding cost and quotes without inventing historical events',()=>{
  const s=game();s.round=12;s.players[0].stocks.bank={qty:8,cost:85.31};s.players[0].cash=123.45;s.players[0].debt=12;
  delete s.marketVersion;delete s.lastMarketRound;
  for(const stock of s.stocks){delete stock.closes;delete stock.events;delete stock.valuation;delete stock.development;stock.history=[10,11,12];stock.price=12.1;}
  const players=structuredClone(s.players),quotes=s.stocks.map(st=>[st.price,st.previous,st.history]);ensureMarketState(s);
  assert.deepEqual(s.players,players);assert.deepEqual(s.stocks.map(st=>[st.price,st.previous,st.history]),quotes);
  assert.deepEqual(s.stocks[0].closes,[{round:10,price:10},{round:11,price:11},{round:12,price:12}]);
  assert.deepEqual(s.stocks[0].events,[]);assert.equal(s.lastMarketRound,12);
  const before=structuredClone(s);assert.throws(()=>dispatch(s,s.hostId,{type:'stock',stockId:'bank',side:'buy',qty:1000}));assert.deepEqual(s,before);
  s.round=13;marketTick(s,{random:()=>.5});assert.equal(s.stocks[0].closes?.at(-1)?.round,13);
});

test('canonical close rounds survive missing rounds and live updates across five, ten and thirty-round windows',()=>{
  const stock=game().stocks[0];stock.closes=[{round:1,price:10},{round:8,price:11},{round:11,price:12},{round:12,price:13}];stock.price=13.5;
  assert.deepEqual(quoteWindow(stock,12,720,240,5).points.map(p=>p.round),[8,11,12,12]);
  assert.deepEqual(quoteWindow(stock,12,720,240,10).points.map(p=>p.round),[8,11,12,12]);
  assert.deepEqual(quoteWindow(stock,12,720,240,30).points.map(p=>p.round),[1,8,11,12,12]);
});

test('AI buys discounted stocks within reserves, avoids debt-funded purchases and trades once a round',()=>{
  let s=game();s.phase='manage';s.stocks[0].price=7;const p=s.players[0];
  const order=valuationTrade(s,p)!;assert.equal(order.type,'stock');assert.equal(order.side,'buy');assert.ok(Number(order.qty)<=3);
  s=dispatch(s,p.id,order);assert.ok(s.players[0].cash>=80);assert.equal(valuationTrade(s,s.players[0]),null);assert.equal(botAction(s,p.id)?.type,'end');
  const fresh=game();fresh.stocks[0].price=7;fresh.players[0].debt=1;assert.equal(valuationTrade(fresh,fresh.players[0]),null);
  fresh.players[0].debt=0;fresh.players[0].cash=95;assert.equal(valuationTrade(fresh,fresh.players[0]),null);
});

test('AI prefers property upgrades, sells overvaluation, and emergency liquidation bypasses cooldown',()=>{
  const s=game(),p=s.players[0];s.phase='manage';s.stocks[0].price=20;p.stocks.bank={qty:5,cost:50};
  assert.equal(valuationTrade(s,p)?.side,'sell');assert.equal(valuationTrade(s,p)?.qty,3);
  const prop=s.properties[0];prop.owner=p.id;p.cash=upgradeCost(p,prop.tileId)+101;assert.equal(botAction(s,p.id)?.type,'upgrade');
  p.cash=-20;p.lastStockTradeRound=s.round;assert.equal(botAction(s,p.id)?.side,'sell');
  s.turn=1;assert.equal(botAction(s,p.id),null);
});

test('a thousand settlements keep prices finite, capped, bounded histories and finite cash',()=>{
  const s=game();s.players[0].stocks=Object.fromEntries(STOCK_CATALOG.map(st=>[st.id,{qty:3,cost:st.base*3}]));
  for(let round=2;round<=1001;round++){s.round=round;marketTick(s,{random:()=>round%2?0:1});}
  for(const stock of s.stocks){assert.ok(stock.price>=1&&stock.price<=500);assert.equal(stock.history.length,30);assert.equal(stock.closes?.length,30);assert.ok(stock.events!.length<=90);assert.ok(stock.events!.every(e=>e.round>=972));}
  assert.ok(Number.isFinite(s.players[0].cash));
});
