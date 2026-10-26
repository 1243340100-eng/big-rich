import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,botAction,createGame,dispatch} from '../server/engine';
import {expireCasino,recoverCasinos} from '../server/casino';
import {publicState} from '../server/publicState';
import {casinoEntryReason,casinoLimits,CASINO_GRACE_MS,SECTORS,spinResult} from '../shared/casino';
import {money} from '../shared/finance';
import {nextTile,TILES} from '../shared/catalog';
import {primaryAction} from '../src/game/primaryAction';
import type {Action,GameState} from '../shared/types';

function game(cash=300) {let s=createGame('CASINO');addPlayer(s,'甲');addPlayer(s,'乙');s=dispatch(s,s.hostId,{type:'start'});s.players[0].cash=cash;s.players[0].position=18;return dispatch(s,s.hostId,{type:'roll'},{diceRandom:()=>1});}
const act=(s:GameState,a:Action,sector=1,id=s.hostId)=>dispatch(s,id,a,{casinoRandom:()=>sector});
const request=(s:GameState,type:string):Action=>({type,sessionId:s.players[0].casino?.id,spins:s.players[0].casino?.spins});
test('casino replaces only tile 19, retains the ring and all twenty purchasable plots, and only landing grants eligibility',()=> {
  assert.equal(TILES[19].type,'casino');assert.equal(TILES[19].name,'星港赌场');assert.equal(TILES.filter(t=>t.type==='property').length,26);assert.equal(TILES.filter(t=>t.type==='event').length,3);
  for(let i=0;i<32;i++)assert.equal(nextTile(i),(i+1)%32);
  const s=game();assert.equal(s.phase,'manage');assert.equal(s.players[0].casinoEligible,true);assert.equal(primaryAction(s,s.players[0],19).kind,'end');
  s.phase='roll';s.players[0].position=18;const past=dispatch(s,s.hostId,{type:'roll'},{diceRandom:()=>2});assert.equal(past.players[0].position,20);assert.equal(past.players[0].casinoEligible,false);
});
test('entry enforces turn, location, phase, cash, protected reserve, auction, eligibility, AI and trade commitments',()=> {
  const base=game(300);assert.deepEqual(casinoLimits(base,base.players[0]),{max:60,reserve:30,commitments:0});
  for(const cash of [0,-1,30,69.99]){const s=structuredClone(base);s.players[0].cash=cash;assert.throws(()=>act(s,{type:'casinoEnter',stake:10}));}
  assert.throws(()=>act(base,{type:'casinoEnter',stake:70}));
  for(const stake of [NaN,Infinity,0,-10,10.01,15,201,'10',null])assert.throws(()=>act(base,{type:'casinoEnter',stake}));
  for(const mutate of [(s:GameState)=>s.turn=1,(s:GameState)=>s.phase='roll',(s:GameState)=>s.players[0].position=18,(s:GameState)=>s.players[0].casinoEligible=false,(s:GameState)=>s.players[0].bot=true,(s:GameState)=>{s.auction={tileId:1,highest:20,bidder:null,passed:[],endsAt:Date.now()+1000,foreclosure:false};}]){const s=structuredClone(base);mutate(s);assert.throws(()=>act(s,{type:'casinoEnter',stake:10}));}
  const s=structuredClone(base);s.trades=[{id:'t',from:s.hostId,to:s.players[1].id,giveCash:10,wantCash:0,giveProperty:null,wantProperty:null,giveStock:null,giveQty:0,wantStock:null,wantQty:0,expires:3}];assert.match(casinoEntryReason(s,s.players[0]),/提案/);assert.throws(()=>act(s,{type:'casinoEnter',stake:10}));
  s.trades=[];s.players[0].debt=2000;assert.ok(casinoLimits(s,s.players[0]).reserve>30);assert.throws(()=>act(s,{type:'casinoEnter',stake:10}));
});
test('entry debits once, hides chips from cash and duplicate entry or invalid random rolls leave the original untouched',()=> {
  const s=game(),before=structuredClone(s);assert.throws(()=>act(s,{type:'casinoEnter',stake:10,spin:true},99));assert.deepEqual(s,before);
  const entered=act(s,{type:'casinoEnter',stake:20});assert.equal(entered.players[0].cash,280);assert.equal(entered.players[0].casino!.pot,20);assert.equal(entered.players[0].casino!.spins,0);assert.equal(entered.players[0].casinoEligible,false);
  assert.throws(()=>act(entered,{type:'casinoEnter',stake:20}));assert.throws(()=>act(entered,request(entered,'casinoCashout')),/第一次/);
  const left=act(entered,request(entered,'casinoLeave'));assert.equal(left.players[0].cash,300);assert.equal(left.players[0].casinoEligible,false);
});
test('all twenty server outcomes have exact payouts and supplied client sectors or money are ignored',()=> {
  for(let sector=0;sector<20;sector++) {
    let s=act(game(),{type:'casinoEnter',stake:20});s=act(s,{...request(s,'casinoSpin'),sector:(sector+1)%20,pot:999999,cash:999999},sector);
    assert.equal(s.players[0].lastCasino!.lastSector,sector);assert.equal(s.players[0].lastCasino!.pot,money(20*SECTORS[sector]));assert.equal(s.players[0].cash,280);
    if(SECTORS[sector]===0){assert.equal(s.players[0].casino,undefined);assert.throws(()=>act(s,{type:'casinoEnter',stake:10}));}
    else {s=act(s,request(s,'casinoCashout'));assert.equal(s.players[0].cash,money(280+20*SECTORS[sector]));assert.equal(s.players[0].casino,undefined);assert.throws(()=>act(s,request(s,'casinoCashout')));}
  }
});
test('explicit initial spin is atomic; continuing requires fresh revision and never runs by itself',()=> {
  let s=act(game(),{type:'casinoEnter',stake:20,spin:true});assert.equal(s.players[0].casino!.spins,1);const stale=request(s,'casinoSpin');s=act(s,stale,3);const snapshot=structuredClone(s);assert.throws(()=>act(s,stale),/已更新/);assert.deepEqual(s,snapshot);assert.equal(s.players[0].casino!.spins,2);
  assert.throws(()=>act(s,{type:'casinoSpin',sessionId:'another',spins:2}));assert.throws(()=>act(s,request(s,'casinoSpin'),1,s.players[1].id));
});
test('a live session blocks every ordinary action and counterpart asset transfers, while opponents can still manage their own bank',()=> {
  const s=act(game(),{type:'casinoEnter',stake:20,spin:true});
  for(const type of ['end','roll','buy','upgrade','stock','borrow','withdraw','deposit','repay','mortgage','redeem','sellProperty','offer','accept','reject','restructure','bid','pass','chat'])assert.throws(()=>act(s,{type}),/先离开赌场/);
  assert.equal(primaryAction(s,s.players[0],1).reason,'请先离开赌场');assert.equal(botAction(s,s.hostId),null);
  const other=s.players[1].id;assert.equal(act(s,{type:'borrow',amount:10},1,other).players[1].cash,210);
  assert.throws(()=>act(s,{type:'offer',to:s.hostId,giveCash:10,wantCash:0,giveProperty:null,wantProperty:null},1,other),/赌场/);
});
test('the tenth safe spin and the 10x cap auto-cashout exactly once without changing property or stock quotes',()=> {
  let s=act(game(1000),{type:'casinoEnter',stake:200});const stocks=structuredClone(s.stocks),props=structuredClone(s.properties);
  for(let i=0;i<4;i++)s=act(s,request(s,'casinoSpin'),5);
  assert.equal(s.players[0].casino,undefined);assert.equal(s.players[0].lastCasino!.payout,2000);assert.equal(s.players[0].cash,2800);assert.equal(s.players[0].lastCasino!.spins,4);assert.deepEqual(s.stocks,stocks);assert.deepEqual(s.properties,props);
  s=act(game(),{type:'casinoEnter',stake:10});for(let i=0;i<10;i++)s=act(s,request(s,'casinoSpin'),1);assert.equal(s.players[0].casino,undefined);assert.equal(s.players[0].lastCasino!.spins,10);assert.equal(s.players[0].cash,315.93);
});
test('short disconnects retain exact session state; 45-second timeout and restart cashout once, legacy eligibility stays absent',()=> {
  let s=act(game(),{type:'casinoEnter',stake:20,spin:true},5);const p=s.players[0],pot=p.casino!.pot;p.connected=false;p.casinoDisconnectedAt=100;
  assert.equal(expireCasino(s,100+CASINO_GRACE_MS-1),false);assert.equal(p.casino!.pot,pot);assert.equal(expireCasino(s,100+CASINO_GRACE_MS),true);assert.equal(p.cash,316);assert.equal(p.casino,undefined);assert.equal(expireCasino(s,999999),false);
  s=act(game(),{type:'casinoEnter',stake:20,spin:true},5);assert.equal(recoverCasinos(s),true);assert.equal(s.players[0].cash,316);assert.equal(recoverCasinos(s),false);
  const legacy=game();delete legacy.players[0].casinoEligible;const cash=legacy.players[0].cash;recoverCasinos(legacy);assert.equal(legacy.players[0].cash,cash);assert.equal(legacy.players[0].casinoEligible,undefined);
});
test('casino results and detailed logs are personal; others only see a session-active indicator',()=> {
  const s=act(game(),{type:'casinoEnter',stake:20,spin:true},5),own=publicState(s,s.hostId),other=publicState(s,s.players[1].id);
  assert.equal(own.players[0].casino!.pot,36);assert.equal(other.players[0].casino,undefined);assert.equal(other.players[0].lastCasino,undefined);assert.equal(other.players[0].casinoActive,true);assert.ok(own.logs.some(l=>l.privateTo===s.hostId));assert.ok(!other.logs.some(l=>l.privateTo));
});
test('one million seeded single spins approach 0.96; optional stopping strategies remain below principal',()=> {
  let seed=0x5eed1234;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  let sum=0;for(let i=0;i<1000000;i++)sum+=SECTORS[Math.floor(random()*20)];assert.ok(Math.abs(sum/1000000-.96)<.003);
  for(const strategy of ['always','1.2','2','random']) {
    let payout=0,max=0,spins=0,bust=0;
    for(let i=0;i<100000;i++){let pot=100,count=0;while(count<10&&pot>0&&pot<1000){const r=spinResult(100,pot,count,Math.floor(random()*20));pot=r.pot;count=r.spins;if(r.ended||strategy==='1.2'&&pot>=120||strategy==='2'&&pot>=200||strategy==='random'&&random()<.5)break;}payout+=pot;max=Math.max(max,pot);spins+=count;if(!pot)bust++;}
    assert.ok(payout/100000<99,`${strategy} has non-negative return`);assert.ok(max<=1000);console.log(`Casino strategy ${strategy}: payout ${(payout/100000).toFixed(2)}/100, spins ${(spins/100000).toFixed(2)}, bust ${(bust/1000).toFixed(1)}%`);
  }
});
