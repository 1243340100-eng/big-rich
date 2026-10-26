import {ensureMarketState,revalueSectorForBuilding,stockFundamentals} from '../server/stockMarket';
import {revaluationStep} from '../shared/stockCatalog';
import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {antitrustTax,auctionReserve,bankSaleQuote,money,mortgageAmount,netWorth,propertyPurchaseQuote,propertyRent,propertyRentBreakdown,propertyValue,tradeSettlementQuote,upgradeCost} from '../shared/finance';
import {settleAuction} from '../server/engine';
import {JOBS,TILES} from '../shared/catalog';

function game(){const state=createGame('ECON03');addPlayer(state,'投资人');addPlayer(state,'对手');return dispatch(state,state.hostId,{type:'start'});}
function own(state:ReturnType<typeof game>,ids:number[],owner=state.hostId){for(const id of ids)state.properties.find(p=>p.tileId===id)!.owner=owner;}
const offer=(to:string,giveProperty:number|null,wantProperty:number|null,wantCash=0)=>({type:'offer',to,giveCash:0,wantCash,giveProperty,wantProperty,giveStock:null,wantStock:null,giveQty:0,wantQty:0});

test('P0: every property, index, level and profession loses money on immediate bank liquidation',()=>{
  const state=game(),player=state.players[0];let combinations=0;
  for(const property of state.properties)for(let index=0;index<42;index++)for(let level=0;level<=3;level++)for(const job of JOBS){
    state.economy.propertyIndex=money(.45+index*.05);property.level=level;player.job=job;
    const cost=money(TILES[property.tileId].price*state.economy.propertyIndex+upgradeCost(player,property.tileId)*level);
    const quote=bankSaleQuote(state,property);assert.ok(quote.gross<cost,`${property.tileId}/${index}/${level}/${job}`);assert.ok(quote.gross<=quote.cap&&quote.gross<=quote.marketOffer);combinations++;
  }
  assert.equal(combinations,state.properties.length*42*4*JOBS.length);
});

test('P0: actual purchase, upgrades and bank resale cannot manufacture cash, including realtor discounts',()=>{
  for(const job of JOBS)for(const index of [.45,.7,1,1.5,2,2.5])for(let level=0;level<=3;level++){
    let state=game();const player=state.players[0];player.job=job;player.cash=10000;state.economy.propertyIndex=index;state.phase='buy';state.pendingTile=1;
    state=dispatch(state,player.id,{type:'buy'});
    for(let current=0;current<level;current++)state=dispatch(state,player.id,{type:'upgrade',tileId:1});
    state=dispatch(state,player.id,{type:'sellProperty',tileId:1});
    assert.ok(state.players[0].cash<10000);assert.equal(state.properties.find(p=>p.tileId===1)!.level,0);
  }
});

test('P0: liquidation subtracts mortgage debt and refuses a shortfall atomically',()=>{
  let state=game(),property=state.properties.find(p=>p.tileId===13)!;property.owner=state.hostId;property.level=3;property.mortgage=100;state.economy.propertyIndex=2;
  const before=state.players[0].cash,quote=bankSaleQuote(state,property);assert.equal(quote.gross,281.9);assert.equal(quote.net,181.9);
  state=dispatch(state,state.hostId,{type:'sellProperty',tileId:13});assert.equal(state.players[0].cash,money(before+quote.net));
  property=state.properties.find(p=>p.tileId===13)!;property.owner=state.hostId;property.level=3;property.mortgage=500;state.players[0].cash=1;
  const snapshot=structuredClone(state);assert.throws(()=>dispatch(state,state.hostId,{type:'sellProperty',tileId:13}),/清偿抵押/);assert.deepEqual(state,snapshot);
});

test('P1: convex rents, crisis immunity and district bonuses match the requested table',()=>{
  const state=game(),a=state.properties.find(p=>p.tileId===13)!;a.owner=state.hostId;
  assert.deepEqual([0,1,2,3].map(level=>propertyRent(state,{...a,level})),[10,19,28,42]);
  state.economy.cycle=4;assert.equal(propertyRent(state,{...a,level:2}),18.2);assert.equal(propertyRent(state,{...a,level:3}),42);
  own(state,[8,10,12,13,15]);state.economy.cycle=0;a.level=0;
  assert.equal(propertyRentBreakdown(state,a).districtBonus,.6);assert.equal(propertyRent(state,a),16);
  state.properties.find(p=>p.tileId===15)!.owner=null;assert.equal(propertyRentBreakdown(state,a).districtBonus,.45);
  state.properties.find(p=>p.tileId===12)!.owner=null;assert.equal(propertyRentBreakdown(state,a).districtBonus,.3);
  state.properties.find(p=>p.tileId===10)!.owner=null;assert.equal(propertyRentBreakdown(state,a).districtBonus,.15);
  a.mortgage=1;assert.equal(propertyRent(state,a),0);
});

test('P1: level-3 valuation halves the decline, but bank liquidation always uses the raw index',()=>{
  const state=game(),a=state.properties.find(p=>p.tileId===13)!;a.level=3;state.economy.propertyIndex=.7;
  assert.equal(propertyValue(state,a),235.62);assert.equal(bankSaleQuote(state,a).rawValue,194.04);assert.equal(bankSaleQuote(state,a).gross,135.83);
  a.level=2;assert.equal(propertyValue(state,a),152.46);
});

test('P1: mortgage pays 75% at level 3 and 60% otherwise without manufacturing net worth',()=>{
  for(let level=0;level<=3;level++){
    const state=game(),a=state.properties[0];a.owner=state.hostId;a.level=level;state.economy.propertyIndex=.7;
    const worth=netWorth(state,state.players[0]),expected=money(propertyValue(state,a)*(level===3?.75:.6));
    assert.equal(mortgageAmount(state,a),expected);const next=dispatch(state,state.hostId,{type:'mortgage',tileId:a.tileId});
    assert.equal(next.players[0].cash,money(state.players[0].cash+expected));assert.equal(next.properties[0].mortgage,expected);assert.equal(netWorth(next,next.players[0]),worth);
  }
});

test('P1: direct buy charges district tax, uses base land price and rejects insufficient cash atomically',()=>{
  let state=game();own(state,[1,3]);state.phase='buy';state.pendingTile=5;state.economy.propertyIndex=2;
  const a=state.properties.find(p=>p.tileId===5)!,quote=propertyPurchaseQuote(state,state.hostId,a);assert.deepEqual(quote,{price:150,tax:18.75,total:168.75});
  state.players[0].cash=168.74;const before=structuredClone(state);assert.throws(()=>dispatch(state,state.hostId,{type:'buy'}),/现金不足/);assert.deepEqual(state,before);
  state.players[0].cash=200;state=dispatch(state,state.hostId,{type:'buy'});assert.equal(state.players[0].cash,31.25);assert.equal(antitrustTax(state,state.hostId,7),43.5);
});

test('P1: auction reserves the bid plus tax and settlement charges both exactly once',()=>{
  let state=game();own(state,[1,3]);state.phase='auction';state.auction={tileId:5,highest:50,bidder:null,passed:[],endsAt:Date.now()+10000,foreclosure:false};state.players[0].cash=60;
  assert.throws(()=>dispatch(state,state.hostId,{type:'bid',amount:50}),/含反垄断税/);
  state.players[0].cash=90;state=dispatch(state,state.hostId,{type:'bid',amount:50});assert.equal(auctionReserve(state,state.hostId),68.75);
  assert.throws(()=>dispatch(state,state.hostId,{type:'deposit',amount:22}),/预留/);state=dispatch(state,state.hostId,{type:'deposit',amount:21.25});
  settleAuction(state);assert.equal(state.players[0].cash,0);assert.equal(state.properties.find(p=>p.tileId===5)!.owner,state.hostId);
});

test('P1: trade tax goes to the bank and cash is revalidated at acceptance',()=>{
  let state=game();own(state,[1,3]);own(state,[5],state.players[1].id);state.players[0].cash=18.74;
  assert.throws(()=>dispatch(state,state.players[1].id,offer(state.hostId,5,null)),/受让方现金不足/);
  state.players[0].cash=100;state=dispatch(state,state.players[1].id,offer(state.hostId,5,null,20));
  const proposal=state.trades[0],quote=tradeSettlementQuote(state,proposal);assert.equal(quote.toTax,18.75);assert.equal(quote.toCash,61.25);
  state.players[0].cash=38.74;const before=structuredClone(state);assert.throws(()=>dispatch(state,state.hostId,{type:'accept',tradeId:proposal.id}),/受让方现金不足/);assert.deepEqual(state,before);
  state.players[0].cash=38.75;const total=state.players.reduce((sum,p)=>sum+p.cash,0);state=dispatch(state,state.hostId,{type:'accept',tradeId:proposal.id});
  assert.equal(state.players[0].cash,0);assert.equal(state.players.reduce((sum,p)=>sum+p.cash,0),money(total-18.75));
});

test('P1: accepting property cannot silently consume the extra tax reserved for a leading auction bid',()=>{
  let state=game();own(state,[1]);own(state,[3],state.players[1].id);state.players[0].cash=50;state.phase='auction';state.auction={tileId:5,highest:50,bidder:state.hostId,passed:[],endsAt:Date.now()+10000,foreclosure:false};
  assert.throws(()=>dispatch(state,state.players[1].id,offer(state.hostId,3,null)),/竞拍资金/);
  state.players[0].cash=68.75;state=dispatch(state,state.players[1].id,offer(state.hostId,3,null));state=dispatch(state,state.hostId,{type:'accept',tradeId:state.trades[0].id});
  assert.equal(auctionReserve(state,state.hostId),68.75);assert.throws(()=>dispatch(state,state.hostId,{type:'deposit',amount:1}),/预留/);
});


test('P2: diminishing steps are 15/8/4/2 and every rotation is neutral',()=>{
  assert.deepEqual([1,2,3,4,8].map(n=>revaluationStep(n).premium),[.15,.08,.04,.02,.02]);
  assert.deepEqual([1,2,3,4,8].map(n=>revaluationStep(n).shock),[.08,.04,.02,.01,.01]);
  const s=game();own(s,[23,24,26,28,31]);
  for(const id of [23,24,26,28,31]){
    s.properties.find(p=>p.tileId===id)!.level=3;
    const before=s.stocks.map(st=>st.price),oldPremium={...s.sectorPremium};
    const messages=revalueSectorForBuilding(s,id);assert.ok(messages.length);
    const premiumTotal=Object.values(s.sectorPremium!).reduce((a,b)=>a+b,0);
    assert.ok(Math.abs(premiumTotal)<1e-10);
    const stock=s.stocks.find(st=>st.id==='energy')!;
    // Cross-listed tech buildings independently pull energy outflow, too.
    const techRank=s.properties.filter(p=>[10,28,31].includes(p.tileId)&&p.level===3).length;
    const rank=[23,24,26,28,31].indexOf(id)+1;
    const expected=revaluationStep(rank).premium-([28,31].includes(id)?revaluationStep(techRank).premium/5:0);
    assert.ok(Math.abs(s.sectorPremium!.energy-(oldPremium.energy??0)-expected)<1e-10);
    assert.equal(stock.events!.at(-1)!.kind,'revaluation');
    assert.ok(Math.abs(s.stocks.reduce((sum,st)=>sum+(st.events!.at(-1)!.impact??0),0))<1e-10);
    assert.ok(s.stocks.some((st,i)=>st.price<before[i]));
    assert.ok(s.stocks.every(st=>st.closes!.filter(c=>c.round===s.round).length===1));
  }
});

test('P2: dual-linked lot rotates both sectors together and cannot trigger after resale and rebuilding',()=>{
  let s=game();own(s,[31]);s.phase='manage';s.players[0].cash=10000;s.properties.find(p=>p.tileId===31)!.level=2;
  const old=s.stocks.map(st=>st.price);s=dispatch(s,s.hostId,{type:'upgrade',tileId:31});
  assert.equal(s.sectorPremium!.energy,.12);assert.equal(s.sectorPremium!.tech,.12);
  for(const id of ['bank','estate','food','fun'])assert.equal(s.sectorPremium![id],-.06);
  s.stocks.forEach((st,i)=>assert.equal(st.price,money(old[i]*(['energy','tech'].includes(st.id)?1.064:.968))));
  assert.equal(s.logs.filter(l=>l.text.includes('板块重估')).length,2);
  assert.deepEqual(s.sectorRevaluationTiles,[31]);
  const premiums={...s.sectorPremium},prices=s.stocks.map(st=>st.price),eventCount=s.stocks[0].events!.length;
  s=dispatch(s,s.hostId,{type:'sellProperty',tileId:31});s.phase='buy';s.pendingTile=31;
  s=dispatch(s,s.hostId,{type:'buy'});for(let i=0;i<3;i++)s=dispatch(s,s.hostId,{type:'upgrade',tileId:31});
  assert.deepEqual(s.sectorPremium,premiums);assert.deepEqual(s.stocks.map(st=>st.price),prices);assert.equal(s.stocks[0].events!.length,eventCount);
});

test('P2: legacy saves migrate additively, consume old level-three lots and preserve quotes and holdings',()=>{
  const s=game();own(s,[10]);s.properties.find(p=>p.tileId===10)!.level=3;s.players[0].stocks.tech={qty:10,cost:200};
  delete s.sectorPremium;delete s.sectorRevaluationTiles;
  const players=structuredClone(s.players),prices=s.stocks.map(st=>[st.price,st.previous,st.history]);
  ensureMarketState(s);ensureMarketState(s);
  assert.deepEqual(s.sectorPremium,{});assert.deepEqual(s.sectorRevaluationTiles,[10]);assert.deepEqual(s.players,players);
  assert.deepEqual(s.stocks.map(st=>[st.price,st.previous,st.history]),prices);assert.deepEqual(revalueSectorForBuilding(s,10),[]);
});

test('P2: premium affects fair value and respects the new 2.2 base cap',()=>{
  const s=game(),base=stockFundamentals(s,'tech').fairValue;
  s.sectorPremium={tech:.15};assert.ok(Math.abs(stockFundamentals(s,'tech').fairValue-base*1.15)<1e-10);
  s.sectorPremium.tech=100;assert.equal(stockFundamentals(s,'tech').fairValue,44);
});

test('P2: ten tech shares gain less than upgrading either a single-linked lot or the documented headquarters',()=>{
  for(const tileId of [10,31]){
    let s=game();own(s,[tileId]);s.phase='manage';s.players[0].cash=1000;s.players[0].stocks.tech={qty:10,cost:200};s.properties.find(p=>p.tileId===tileId)!.level=2;
    const fee=upgradeCost(s.players[0],tileId),before=s.stocks.find(st=>st.id==='tech')!.price;
    s=dispatch(s,s.hostId,{type:'upgrade',tileId});
    const gain=money((s.stocks.find(st=>st.id==='tech')!.price-before)*10);
    assert.equal(fee,tileId===31?71.55:36.45);assert.equal(gain,tileId===31?12.8:16);assert.ok(gain<fee);
    const without={...s,sectorPremium:{...s.sectorPremium,tech:0}};
    assert.ok((stockFundamentals(s,'tech').fairValue-stockFundamentals(without,'tech').fairValue)*10<fee);
    assert.equal(s.players[0].cash,money(1000-fee));assert.deepEqual(s.players[0].stocks.tech,{qty:10,cost:200});
  }
  assert.ok(20*.15*10<71.55); // The document's simplified gross fundamental example.
});


test('P2: fixed shocks are independent of holdings and unlinked buildings do not rotate prices',()=>{
  const run=(qty:number,tileId=10)=>{let s=game();own(s,[tileId]);s.phase='manage';s.players[0].cash=1000;s.players[0].stocks.tech={qty,cost:qty*20};s.properties.find(p=>p.tileId===tileId)!.level=2;return dispatch(s,s.hostId,{type:'upgrade',tileId});};
  const small=run(10),large=run(1000);assert.deepEqual(small.sectorPremium,large.sectorPremium);assert.deepEqual(small.stocks,large.stocks);
  const unlinked=run(10,1);assert.deepEqual(unlinked.sectorPremium,{});assert.ok(unlinked.stocks.every(st=>st.price===st.previous&&st.events!.length===0));
});

test('P1: both recipients in a property swap pay taxes based on the same pre-trade state',()=>{
  let s=game();own(s,[8,10]);own(s,[12,13],s.players[1].id);s.players.forEach(p=>p.cash=200);
  s=dispatch(s,s.hostId,offer(s.players[1].id,10,12));const t=s.trades[0],quote=tradeSettlementQuote(s,t);
  assert.equal(quote.fromTax,23.25);assert.equal(quote.toTax,20.25);
  s=dispatch(s,s.players[1].id,{type:'accept',tradeId:t.id});assert.equal(s.players[0].cash,176.75);assert.equal(s.players[1].cash,179.75);
});
