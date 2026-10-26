import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,botAction,createGame,dispatch} from '../server/engine';
import {TILES} from '../shared/catalog';
import {money,propertyValue} from '../shared/finance';
import {landAuctionStartPrice} from '../shared/auctions';
import {TurnActionBar} from '../src/game/TurnActionBar';
import {tileInfo} from '../src/game/tileInfo';
import type {GameState} from '../shared/types';

function game(tileId=1){let s=createGame('LAND03');addPlayer(s,'甲');addPlayer(s,'乙');s=dispatch(s,s.hostId,{type:'start'});s.phase='buy';s.pendingTile=tileId;s.players[0].position=tileId;return s;}
function bar(s:GameState){const noop=()=>{};return renderToStaticMarkup(createElement(TurnActionBar,{state:s,me:s.players[0],selected:null,clock:Date.now(),blocked:'',shortcut:false,setShortcut:noop,act:noop,onMore:noop,onCashflow:noop,onRescue:noop,onAssets:noop,onRanking:noop,onHome:noop,sound:false,volume:.5,reduced:true}));}

test('every vacant lot auctions at 70% of its base price, independent of the current property index',()=>{
  for(const tile of TILES.filter(t=>t.type==='property'))for(const index of [.45,.7,1,2,2.5]){
    let s=game(tile.id);s.economy.propertyIndex=index;s=dispatch(s,s.hostId,{type:'auction'});
    assert.equal(s.auction!.highest,money(tile.price*.7));assert.equal(s.auction!.bidder,null);assert.equal(s.auction!.foreclosure,false);assert.equal(s.players[0].cash,200);
  }
});

test('skipping a vacant lot neither pays nor auctions it and allows normal turn management',()=>{
  let s=game();s.players[0].cash=0;const stocks=structuredClone(s.stocks),properties=structuredClone(s.properties);
  s=dispatch(s,s.hostId,{type:'decline'});assert.equal(s.phase,'manage');assert.equal(s.pendingTile,null);assert.equal(s.auction,null);assert.equal(s.players[0].cash,0);assert.equal(s.turn,0);assert.deepEqual(s.properties,properties);assert.deepEqual(s.stocks,stocks);assert.match(s.logs[0].text,/跳过购买/);
  assert.throws(()=>dispatch(s,s.hostId,{type:'decline'}),/没有待处理/);s=dispatch(s,s.hostId,{type:'end'});assert.equal(s.turn,1);
});

test('buy still uses the full current market quote while the auction option uses base land price',()=>{
  const s=game();s.economy.propertyIndex=2;const expected=propertyValue(s,s.properties.find(p=>p.tileId===1)!);
  const bought=dispatch(s,s.hostId,{type:'buy'});assert.equal(bought.players[0].cash,money(200-expected));assert.equal(bought.properties.find(p=>p.tileId===1)!.owner,s.hostId);assert.equal(bought.auction,null);
  assert.equal(landAuctionStartPrice(1),35.7);
});

test('only the active player can choose auction or skip, and choices fail outside the buy phase',()=>{
  const s=game(),before=structuredClone(s);for(const type of ['auction','decline'])assert.throws(()=>dispatch(s,s.players[1].id,{type}),/还没轮到/);assert.deepEqual(s,before);
  s.phase='manage';for(const type of ['auction','decline'])assert.throws(()=>dispatch(s,s.hostId,{type}));
});

test('the opening bid includes antitrust tax and later bids must increase by at least one wan',()=>{
  let s=game(5);for(const id of [1,3])s.properties.find(p=>p.tileId===id)!.owner=s.hostId;s.players[0].cash=71.24;
  s=dispatch(s,s.hostId,{type:'auction'});assert.equal(s.auction!.highest,52.5);assert.throws(()=>dispatch(s,s.hostId,{type:'bid',amount:52.5}),/现金不足/);
  s.players[0].cash=71.25;s=dispatch(s,s.hostId,{type:'bid',amount:52.5});assert.throws(()=>dispatch(s,s.players[1].id,{type:'bid',amount:53.49}));
  s=dispatch(s,s.players[1].id,{type:'pass'});assert.equal(s.players[0].cash,0);assert.equal(s.properties.find(p=>p.tileId===5)!.owner,s.hostId);
});

test('an auction with no bids returns to management without charging or assigning the land',()=>{
  let s=game();s=dispatch(s,s.hostId,{type:'auction'});s=dispatch(s,s.hostId,{type:'pass'});s=dispatch(s,s.players[1].id,{type:'pass'});
  assert.equal(s.phase,'manage');assert.equal(s.auction,null);assert.ok(s.players.every(p=>p.cash===200));assert.equal(s.properties.find(p=>p.tileId===1)!.owner,null);
});

test('reserved land can be skipped without changing its reservation and cannot be auctioned',()=>{
  let s=game(34);s=dispatch(s,s.hostId,{type:'reserve'});const held=structuredClone(s.reservations![34]);s.turn=1;s.phase='buy';s.pendingTile=34;
  assert.throws(()=>dispatch(s,s.players[1].id,{type:'auction'}),/已被预定/);s=dispatch(s,s.players[1].id,{type:'decline'});assert.deepEqual(s.reservations![34],held);assert.equal(s.players[1].cash,200);assert.equal(s.auction,null);
  assert.match(tileInfo(s,34,s.players[1].id)!.arrival,/不参与拍卖/);
});

test('foreclosure auctions retain their existing half-valuation opening rule',()=>{
  let s=game();s.phase='manage';const p=s.properties.find(p=>p.tileId===1)!;p.owner=s.hostId;p.level=2;s.economy.propertyIndex=2;s.players[0].cash=-10;
  const expected=money(propertyValue(s,p)*.5);s=dispatch(s,s.hostId,{type:'restructure'});assert.equal(s.auction!.foreclosure,true);assert.equal(s.auction!.highest,expected);
});

test('the action bar exposes buy, priced auction and skip, including when cash cannot cover purchase',()=>{
  const s=game();s.players[0].cash=0;const html=bar(s);assert.match(html,/买入 51 万/);assert.match(html,/低价拍卖，35.7 万起拍/);assert.match(html,/跳过不买/);assert.doesNotMatch(html,/放弃并拍卖/);assert.match(tileInfo(s,1,s.hostId)!.arrival,/35.7 万起拍或跳过不买/);
  const commercial=bar(game(34));assert.doesNotMatch(commercial,/付 30% 定金锁定/);
});

test('bots can skip when they cannot fund an auction, and still auction when their cash buffer allows it',()=>{
  const s=game();s.players[0].cash=20;assert.equal(botAction(s,s.hostId)!.type,'decline');s.players[0].cash=60;assert.equal(botAction(s,s.hostId)!.type,'auction');
});
