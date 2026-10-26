import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {TILES} from '../shared/catalog';
import {propertyRent,propertyValue} from '../shared/finance';
import {tileInfo} from '../src/game/tileInfo';

function game(){const state=createGame('BRIEF1');addPlayer(state,'小猫');addPlayer(state,'小猪');return dispatch(state,state.hostId,{type:'start'});}
const format=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);

test('all 42 tiles have a short purpose, ownership and landing explanation without mutating the match',()=>{
  const state=game(),before=JSON.stringify(state);
  for(const tile of TILES){const info=tileInfo(state,tile.id,state.hostId)!;assert.equal(info.tile.id,tile.id);for(const text of [info.owner,info.purpose,info.arrival])assert.ok(text.length>0&&text.length<85);}
  assert.equal(JSON.stringify(state),before);assert.equal(tileInfo(state,-1),null);assert.equal(tileInfo(state,999),null);
});

test('vacant property previews use the current purchase quote and match the actual buy charge',()=>{
  let state=game();state.economy.propertyIndex=1.2;const property=state.properties.find(p=>p.tileId===1)!,cost=propertyValue(state,property),cash=state.players[0].cash;
  assert.match(tileInfo(state,1,state.hostId)!.owner,/无人持有/);assert.ok(tileInfo(state,1,state.hostId)!.arrival.includes(`${format(cost)} 万`));assert.match(tileInfo(state,1,state.hostId)!.arrival,/买入后经营 \+/);
  state=dispatch(state,state.hostId,{type:'roll'},{diceRandom:()=>1});state=dispatch(state,state.hostId,{type:'buy'});
  assert.equal(state.players[0].cash,cash-cost);assert.match(tileInfo(state,1,state.hostId)!.owner,/小猫（你）/);assert.match(tileInfo(state,1,state.hostId)!.arrival,/不付租金/);assert.match(tileInfo(state,1,state.hostId)!.tags.join(' '),/经营 \+/);
});

test('opponent rent previews match actual gross payment and update with the market cycle',()=>{
  let state=game();const property=state.properties.find(p=>p.tileId===1)!;property.owner=state.players[1].id;property.level=2;state.economy.cycle=1;
  const rent=propertyRent(state,property),cash=state.players[0].cash;
  assert.equal(tileInfo(state,1,state.hostId)!.owner,'小猪');assert.ok(tileInfo(state,1,state.hostId)!.arrival.includes(`${format(rent)} 万`));
  state=dispatch(state,state.hostId,{type:'roll'},{diceRandom:()=>1});assert.equal(state.players[0].cash,cash-rent);
  state.economy.cycle=4;assert.ok(tileInfo(state,1,state.hostId)!.arrival.includes(`${format(propertyRent(state,state.properties.find(p=>p.tileId===1)!))} 万`));
});

test('mortgaged and self-owned property explicitly explain why no rent is paid',()=>{
  const state=game(),property=state.properties.find(p=>p.tileId===3)!;property.owner=state.players[1].id;property.mortgage=30;
  assert.equal(tileInfo(state,3,state.hostId)!.rent,0);assert.match(tileInfo(state,3,state.hostId)!.arrival,/已抵押.*不收取租金/);
  property.owner=state.hostId;assert.match(tileInfo(state,3,state.hostId)!.arrival,/你的地产.*不付租金/);
});

test('public tiles distinguish entrance fees, exit behaviour, automatic tax and optional services',()=>{
  const state=game();
  for(const id of [6,22])assert.match(tileInfo(state,id)!.arrival,/拐入内街.*免费.*6 格/);
  for(const id of [14,30]){assert.match(tileInfo(state,id)!.purpose,/出口/);assert.doesNotMatch(tileInfo(state,id)!.arrival,/支付 5 万/);}
  for(const id of [4,9,25]){assert.match(tileInfo(state,id)!.owner,/城市公有/);assert.match(tileInfo(state,id)!.arrival,/不会自动|无额外/);}
  assert.match(tileInfo(state,32)!.arrival,/过桥资金.*6 回合/);
  assert.match(tileInfo(state,33)!.arrival,/15 万.*全球事件.*每局 2 次/);
  assert.match(tileInfo(state,11)!.arrival,/2.5%.*最低支付 5 万/);
  assert.match(tileInfo(state,0)!.arrival,/经过或停留.*税后工资/);
  assert.match(tileInfo(state,2)!.arrival,/奖励.*支付/);
  assert.match(tileInfo(state,19)!.arrival,/25%.*不入场不扣费/);
});
