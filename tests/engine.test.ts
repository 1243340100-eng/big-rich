import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayer, botAction, createGame, dispatch, marketTick, settleAuction } from '../server/engine';
import { loanLimit, netWorth, propertyRent, propertyValue, totalDebt } from '../shared/finance';
import { nextTile, TILES } from '../shared/catalog';
import type { Action, GameState } from '../shared/types';
function game(count=2){const s=createGame('TEST01');for(let i=0;i<count;i++)addPlayer(s,`玩家${i}`,'银行家');return dispatch(s,s.hostId,{type:'start'});}
function action(s:GameState,a:Action,id=s.players[s.turn].id){return dispatch(s,id,a);}
test('server rejects wrong turn, unknown player, repeated roll and client-supplied money/dice',()=>{
  let s=game();assert.throws(()=>action(s,{type:'roll'},s.players[1].id),/轮到/);assert.throws(()=>action(s,{type:'roll'},'attacker'),/不存在/);
  s=action(s,{type:'roll',dice:[100,100],cash:999999});assert.equal(s.dice.length,1);assert.ok(s.dice.every(d=>d>=1&&d<=6));assert.ok(s.players[0].position<=6);assert.throws(()=>action(s,{type:'roll'}),/已掷骰/);
});
test('rejected actions are atomic and bad inputs cannot corrupt balances',()=>{
  const s=game();const before=structuredClone(s);for(const amount of [NaN,Infinity,-2,'20',null])assert.throws(()=>action(s,{type:'borrow',amount}));assert.deepEqual(s,before);assert.throws(()=>action(s,{type:'borrow',amount:loanLimit(s,s.players[0])+1}));
});
test('purchase, upgrade, mortgage, redeem and net worth follow authoritative math',()=>{
  let s=game();s.phase='buy';s.pendingTile=1;s.players[0].position=1;const id=s.hostId;const start=netWorth(s,s.players[0]);
  s=action(s,{type:'buy'});assert.equal(s.properties.find(p=>p.tileId===1)!.owner,id);assert.equal(netWorth(s,s.players[0]),start);
  s=action(s,{type:'upgrade',tileId:1});assert.equal(s.properties.find(p=>p.tileId===1)!.level,1);
  const before=netWorth(s,s.players[0]);s=action(s,{type:'mortgage',tileId:1});const prop=s.properties.find(p=>p.tileId===1)!;assert.equal(propertyRent(s,prop),0);assert.equal(netWorth(s,s.players[0]),before);assert.ok(totalDebt(s,s.players[0])>0);
  s=action(s,{type:'redeem',tileId:1});assert.equal(s.properties.find(p=>p.tileId===1)!.mortgage,0);assert.ok(netWorth(s,s.players[0])<before);
});
test('auctions reserve cash, accept off-turn bids and settle once',()=>{
  let s=game(3);s.phase='buy';s.pendingTile=1;s=action(s,{type:'auction'});const id=s.players[1].id;
  s=action(s,{type:'bid',amount:190},id);assert.throws(()=>action(s,{type:'deposit',amount:11},id),/现金不足/);assert.throws(()=>action(s,{type:'pass'},id),/不能撤销/);
  s=action(s,{type:'pass'},s.players[0].id);s=action(s,{type:'pass'},s.players[2].id);assert.equal(s.auction,null);assert.equal(s.players[1].cash,10);assert.equal(s.properties.find(p=>p.tileId===1)!.owner,id);settleAuction(s);assert.equal(s.players[1].cash,10);
});
test('stale, invalid and expired bids are rejected',()=>{
  let s=game();s.phase='buy';s.pendingTile=1;s=action(s,{type:'auction'});assert.throws(()=>action(s,{type:'bid',amount:0}));s.auction!.endsAt=Date.now()-1;assert.throws(()=>action(s,{type:'bid',amount:50}),/到期/);
});
test('stock round trips lose fees and slippage instead of producing wash-trade profit',()=>{
  for(const qty of [1,10,25,100]) {let s=game();s.players[0].cash=10000;const start=s.players[0].cash;s=action(s,{type:'stock',stockId:'food',side:'buy',qty});s=action(s,{type:'stock',stockId:'food',side:'sell',qty});assert.ok(s.players[0].cash<start);assert.equal(s.players[0].stocks.food.qty,0);assert.equal(s.players[0].stocks.food.cost,0);}
});
test('stock trading is available out of turn and cannot short sell',()=>{
  let s=game();const id=s.players[1].id;s=action(s,{type:'stock',stockId:'tech',side:'buy',qty:2},id);assert.equal(s.players[1].stocks.tech.qty,2);assert.throws(()=>action(s,{type:'stock',stockId:'tech',side:'sell',qty:3},id),/不足/);assert.throws(()=>action(s,{type:'stock',stockId:'tech',side:'buy',qty:1.5}),/整数/);
});
test('bilateral trade atomically transfers cash, land and stocks; cannot accept twice',()=>{
  let s=game();const [a,b]=s.players;s.properties.find(p=>p.tileId===1)!.owner=b.id;a.stocks.food={qty:5,cost:30};
  s=action(s,{type:'offer',to:b.id,giveCash:30,wantCash:0,giveProperty:null,wantProperty:1,giveStock:'food',giveQty:2,wantStock:null,wantQty:0});const id=s.trades[0].id;
  assert.throws(()=>action(s,{type:'accept',tradeId:id},a.id),/收件人/);s=action(s,{type:'accept',tradeId:id},b.id);assert.equal(s.players[0].cash,169.44);assert.equal(s.players[1].cash,229.84);assert.equal(s.properties.find(p=>p.tileId===1)!.owner,a.id);assert.equal(s.players[1].stocks.food.cost,16.16);assert.throws(()=>action(s,{type:'accept',tradeId:id},b.id));
});
test('trade acceptance revalidates holdings and preserves original state on stale offer',()=>{
  let s=game();s.properties.find(p=>p.tileId===1)!.owner=s.players[1].id;s=action(s,{type:'offer',to:s.players[1].id,giveCash:30,wantCash:0,giveProperty:null,wantProperty:1});s=action(s,{type:'mortgage',tileId:1},s.players[1].id);const before=structuredClone(s);assert.throws(()=>action(s,{type:'accept',tradeId:s.trades[0].id},s.players[1].id),/赎回/);assert.deepEqual(s,before);
});
test('restructuring seizes assets, auctions them, cuts debt and does not eliminate player',()=>{
  let s=game();s.players[0].cash=-50;s.players[0].debt=100;s.players[0].stocks.food={qty:2,cost:16};s.properties.find(p=>p.tileId===1)!.owner=s.hostId;
  s=action(s,{type:'restructure'});assert.equal(s.players[0].cash,30);assert.equal(s.players[0].credit,'D');assert.equal(s.players[0].debt,27.12);assert.equal(s.auction?.tileId,1);settleAuction(s);assert.equal(s.phase,'manage');s=action(s,{type:'end'});assert.equal(s.turn,1);
});
test('other players cannot restructure into the active turn',()=>{const s=game();s.players[1].cash=-10;assert.throws(()=>action(s,{type:'restructure'},s.players[1].id),/自己回合/);});
test('deposits and loans preserve net worth at issuance; interest debits start of turn',()=>{let s=game();const before=netWorth(s,s.players[0]);s=action(s,{type:'borrow',amount:30});s=action(s,{type:'deposit',amount:50});assert.equal(netWorth(s,s.players[0]),before);assert.equal(s.players[0].deposit,50);s.phase='manage';s=action(s,{type:'end'});s.phase='manage';s=action(s,{type:'end'});assert.equal(s.players[0].deposit,50.5);assert.ok(s.players[0].cash<180);});
test('shortcuts reconnect to ring and only ring boundary passes start',()=>{assert.equal(nextTile(5,true),36);assert.equal(nextTile(7,true),36);assert.equal(nextTile(21,true),39);assert.equal(nextTile(23,true),39);assert.equal(nextTile(6,true),36);assert.equal(nextTile(36),32);assert.equal(nextTile(32),37);assert.equal(nextTile(37),33);assert.equal(nextTile(33),38);assert.equal(nextTile(38),14);assert.equal(nextTile(22,true),39);assert.equal(nextTile(39),34);assert.equal(nextTile(34),40);assert.equal(nextTile(40),35);assert.equal(nextTile(35),41);assert.equal(nextTile(41),30);assert.equal(nextTile(31),0);assert.equal(nextTile(6),7);});
test('market events remain bounded and pay dividends every five rounds',()=>{let s=game();s.players[0].stocks.food={qty:10,cost:80};const before=s.players[0].cash;s.round=5;marketTick(s);assert.ok(s.players[0].cash>before);for(let i=0;i<1000;i++){s.round++;marketTick(s);}assert.ok(s.economy.propertyIndex>=.45&&s.economy.propertyIndex<=2.5);assert.ok(s.stocks.every(st=>st.price>=1&&st.price<=500&&st.history.length<=30));});
test('full 30-round four-player bot game terminates with finite, unique, consistent holdings',()=>{
  for(let run=0;run<5;run++){
    let s=game(4),steps=0;
    while(s.status==='playing'&&steps++<8000){let advanced=false;for(const p of s.players){const a=botAction(s,p.id);if(a){s=dispatch(s,p.id,a);advanced=true;break;}}if(!advanced&&s.auction){settleAuction(s);advanced=true;}assert.ok(advanced,'game deadlocked');for(const p of s.players){assert.ok(Number.isFinite(netWorth(s,p)));assert.ok(p.debt>=0);for(const h of Object.values(p.stocks)){assert.ok(h.qty>=0);assert.ok(h.cost>=-.01);}}}
    assert.equal(s.status,'finished');assert.equal(s.round,30);assert.ok(steps<8000);assert.equal(s.properties.length,new Set(s.properties.map(p=>p.tileId)).size);assert.equal(s.properties.length,TILES.filter(t=>t.type==='property').length);
  }
});
test('completed games reject financial mutations but retain chat',()=>{let s=game();s.status='finished';assert.throws(()=>action(s,{type:'borrow',amount:10}),/不在对局/);s=action(s,{type:'chat',text:'下次再来！'});assert.equal(s.chats.at(-1)?.text,'下次再来！');});
