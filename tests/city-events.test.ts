import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {drawCityEvent,resolveCityEvent} from '../server/cityEvents';
import {CITY_EVENTS,CITY_EVENT_WEIGHTS,isCityEventTile,pickCityEvent,type CityEvent} from '../shared/cityEvents';
import {money,propertyValue} from '../shared/finance';
import {CityEventDraw,newCityEvent} from '../src/game/CityEventDraw';
import type {GameState} from '../shared/types';

function game(){const s=createGame('CITY01');addPlayer(s,'甲');addPlayer(s,'乙');return dispatch(s,s.hostId,{type:'start'});}
function event(tileId:2|16|27,id:string):CityEvent{const found=CITY_EVENTS[tileId].find(item=>item.id===id);assert.ok(found,`${tileId}/${id}`);return found;}
function own(s:GameState,ids:number[],owner=s.hostId){for(const id of ids)s.properties.find(p=>p.tileId===id)!.owner=owner;}
function randoms(...values:number[]){let index=0;return()=>values[index++]??.5;}

test('three city-event pools each have six events with a 60/30/10 rarity mix',()=>{
  for(const tileId of [2,16,27] as const){
    assert.equal(isCityEventTile(tileId),true);
    assert.equal(CITY_EVENTS[tileId].length,6);
    assert.deepEqual(CITY_EVENTS[tileId].map(event=>event.rarity).sort(),['common','common','rare','rare','uncommon','uncommon']);
    assert.equal(new Set(CITY_EVENTS[tileId].map(event=>event.id)).size,6);
  }
  assert.equal(isCityEventTile(1),false);assert.equal(isCityEventTile(19),false);
  assert.equal(pickCityEvent(1,()=>0),undefined);
  assert.equal(pickCityEvent(2,()=>0)?.rarity,'common');
  assert.equal(pickCityEvent(2,()=>.65)?.rarity,'uncommon');
  assert.equal(pickCityEvent(2,()=>.90)?.rarity,'rare');
  assert.equal(CITY_EVENT_WEIGHTS.common/40,.3);
});

test('cash, district and global city events settle once with the existing income tax',()=>{
  const s=game(),p=s.players[0],before=p.cash;
  const subsidy=resolveCityEvent(s,p,event(2,'municipal-subsidy'),()=>0);
  assert.equal(subsidy.amount,10.8);assert.equal(p.cash,money(before+10.8));assert.match(subsidy.effectText,/税后 \+10\.8/);
  const repair=resolveCityEvent(s,p,event(2,'municipal-repair'),()=>0);
  assert.equal(repair.amount,-8);assert.equal(p.cash,money(before+10.8-8));
  own(s,[1,3,5]);const prior=p.cash;
  const redevelop=resolveCityEvent(s,p,event(2,'municipal-redevelop'),()=>0);
  assert.equal(redevelop.amount,16.2);assert.equal(p.cash,money(prior+16.2));assert.match(redevelop.effectText,/3 块/);
  const cash=p.cash,others=s.players.map(player=>player.cash);
  const festival=resolveCityEvent(s,p,event(2,'municipal-festival'),()=>0);
  assert.equal(festival.global,true);assert.equal(festival.amount,7.2);assert.equal(p.cash,money(cash+7.2));
  assert.deepEqual(s.players.slice(1).map(player=>player.cash),others.slice(1).map(value=>money(value+7.2)));
});

test('portfolio tax only fires at four properties and is capped',()=>{
  const s=game(),p=s.players[0];own(s,[1,3,5]);
  const before=p.cash;
  const skipped=resolveCityEvent(s,p,event(2,'municipal-audit'),()=>0);
  assert.equal(skipped.amount,0);assert.equal(p.cash,before);assert.match(skipped.effectText,/未触发/);
  own(s,[7]);const value=[1,3,5,7].reduce((sum,id)=>sum+propertyValue(s,s.properties.find(a=>a.tileId===id)!),0);
  const expected=-money(Math.min(30,value*.008)),cash=p.cash;
  const taxed=resolveCityEvent(s,p,event(2,'municipal-audit'),()=>0);
  assert.equal(taxed.amount,expected);assert.equal(p.cash,money(cash+expected));assert.equal(taxed.global,false);
});

test('market city events move quotes, record a city stock message and stay bounded',()=>{
  const s=game(),p=s.players[0];
  const food=s.stocks.find(stock=>stock.id==='food')!,before=food.price;
  const coupon=resolveCityEvent(s,p,event(27,'market-coupon'),()=>0);
  assert.equal(coupon.amount,0);assert.ok(food.price>before);assert.equal(food.events?.at(-1)?.kind,'city');assert.match(coupon.effectText,/快乐食品 \+5%/);
  const bank=s.stocks.find(stock=>stock.id==='bank')!,bankBefore=bank.price;
  const rumor=resolveCityEvent(s,p,event(27,'market-rumor'),randoms(.1,.9));
  assert.ok(bank.price>bankBefore);assert.match(rumor.effectText,/星海银行 \+6%/);
  const short=resolveCityEvent(s,p,event(27,'market-short'),randoms(.1,.1));
  assert.match(short.effectText,/星海银行 -12%/);
  const merger=resolveCityEvent(s,p,event(27,'market-merger'),randoms(0,0));
  assert.match(merger.effectText,/星海银行 \+10%.*城市地产 -3%/);
  assert.ok(s.stocks.every(stock=>stock.price>=1&&stock.price<=500));
});

test('landing on 2 / 16 / 27 resolves the pool and attaches a structured draw result',()=>{
  let s=game(),p=s.players[0];p.position=1;s.phase='roll';
  const before=p.cash;
  s=dispatch(s,p.id,{type:'roll'},{diceRandom:()=>1,cityRandom:()=>0});
  const result=s.logs.find(entry=>entry.cityEvent)?.cityEvent;
  assert.ok(result);assert.equal(result.tileId,2);assert.equal(result.id,'municipal-subsidy');assert.ok(result.drawId);
  assert.equal(s.players[0].cash,money(before+10.8));
  assert.equal(s.logs.find(entry=>entry.cityEvent)?.text.includes('城市事件'),true);
  assert.equal(newCityEvent(null,s,p.id),undefined);
});

test('card detection is personal, global events reach everyone, and the card renders its result',()=>{
  const s=game(),p=s.players[0],other=s.players[1];
  const before=structuredClone(s);own(s,[18]);
  const result=resolveCityEvent(s,p,event(16,'park-music'),()=>0);
  s.logs.unshift({id:'draw-1',round:s.round,text:'城市事件',kind:'event',cityEvent:result});
  assert.equal(newCityEvent(before,s,p.id)?.id,'park-music');
  assert.equal(newCityEvent(before,s,other.id),undefined);
  const global=resolveCityEvent(s,p,event(2,'municipal-festival'),()=>0);
  s.logs.unshift({id:'draw-2',round:s.round,text:'城市事件',kind:'event',cityEvent:global});
  assert.equal(newCityEvent(before,s,other.id)?.id,'municipal-festival');
  const html=renderToStaticMarkup(createElement(CityEventDraw,{result,reduced:true,onClose:()=>{}}));
  assert.match(html,/城市事件/);assert.match(html,/海湾音乐节/);assert.match(html,/少见/);assert.match(html,/城市公园/);assert.match(html,/税后/);
  const globalHtml=renderToStaticMarkup(createElement(CityEventDraw,{result:global,reduced:true,onClose:()=>{}}));
  assert.match(globalHtml,/全城/);assert.match(globalHtml,/全体玩家各 \+7\.2 万/);
});
