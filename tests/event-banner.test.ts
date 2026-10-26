import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch,log,marketTick} from '../server/engine';
import {ensureMarketState, eventStory} from '../server/stockMarket';
import {EventBanner,latestGlobalEvent,newGlobalEvent} from '../src/game/EventBanner';
import type {GameState,Log} from '../shared/types';

function game(){const s=createGame('EVENT1');addPlayer(s,'甲');addPlayer(s,'乙');return dispatch(s,s.hostId,{type:'start'});}

test('only a newly arriving public global-event log becomes a banner',()=>{
  const s=game(),before=structuredClone(s);
  assert.equal(latestGlobalEvent(s),undefined,'a fresh room has no global-event log');
  log(s,'全球事件 · AI 技术革命：AI 需求扩张，科技行业受益。 当前周期：繁荣','event');
  const latest=latestGlobalEvent(s);assert.ok(latest);assert.equal(latest.round,s.round);
  assert.equal(newGlobalEvent(null,s),undefined,'initial snapshots must not replay historical events');
  assert.equal(newGlobalEvent(before,s)?.id,latest.id,'the first snapshot containing the log triggers it');
  assert.equal(newGlobalEvent(s,s),undefined,'later state pushes must not repeat the same banner');
  const other=structuredClone(s);other.code='OTHER1';
  assert.equal(newGlobalEvent(s,other),undefined,'switching rooms must not replay the previous room event');
});

test('server market tick emits the public global-event log consumed by the banner',()=>{
  const s=game(),before=structuredClone(s);s.round=3;s.rules.eventEvery=3;
  marketTick(s,{eventId:'ai'});
  const latest=latestGlobalEvent(s);assert.ok(latest);assert.match(latest.text,/AI 技术革命/);assert.match(latest.text,/全球事件/);
  assert.equal(s.economy.event,'AI 技术革命');assert.equal(s.economy.headline,eventStory('ai',3,3)?.headline);
  assert.ok(latest.text.includes(s.economy.headline!));
  assert.equal(newGlobalEvent(before,s)?.id,latest.id);
});

test('legacy saves backfill the current narrative from the latest global-event log',()=>{
  const s=game();s.round=3;s.rules.eventEvery=3;marketTick(s,{eventId:'crisis'});
  const headline=s.economy.headline;assert.ok(headline);
  delete s.economy.headline;ensureMarketState(s);
  assert.equal(s.economy.headline,headline);
});

test('each event category rotates its narrative by occurrence and remains deterministic',()=>{
  const first=eventStory('crisis',3,3),second=eventStory('crisis',6,3),third=eventStory('crisis',9,3);
  assert.ok(first&&second&&third);
  assert.equal(first.headline,eventStory('crisis',3,3)?.headline,'same occurrence must reveal the same story to insider and settlement');
  assert.notEqual(first.headline,second.headline);
  assert.notEqual(second.headline,third.headline);
  assert.ok(eventStory('crisis',4,2));
  assert.equal(eventStory('unknown',3,3),undefined);
});

test('a newer non-event log does not hide the global event or retrigger it',()=>{
  const s=game(),before=structuredClone(s);
  log(s,'全球事件 · 金融危机：风险偏好回落。 当前周期：危机','event');
  const global=latestGlobalEvent(s)!;
  log(s,'城市地产 · 板块重估','event');
  assert.equal(latestGlobalEvent(s)?.id,global.id);
  assert.equal(newGlobalEvent(before,s)?.id,global.id);
  assert.equal(newGlobalEvent(s,s),undefined);
});

test('banner renders round, category, narrative headline, effect, cycle, index and hotspot',()=>{
  const s=game();s.economy.event='AI 技术革命';s.economy.headline='大模型突破引爆算力抢购潮';s.economy.description='AI 需求扩张，科技行业受益。';s.economy.cycle=1;s.economy.propertyIndex=1.23;
  const event:Log={id:'event-1',round:7,text:'全球事件 · 大模型突破引爆算力抢购潮（AI 技术革命）：AI 需求扩张，科技行业受益。 当前周期：繁荣',kind:'event'};
  const html=renderToStaticMarkup(createElement(EventBanner,{state:s,event,onClose:()=>{}}));
  assert.match(html,/全球事件播报/);assert.match(html,/第 7 轮 · AI 技术革命 · 全球事件/);assert.match(html,/大模型突破引爆算力抢购潮/);assert.match(html,/AI 需求扩张/);assert.match(html,/繁荣/);assert.match(html,/房产指数 ×1\.23/);assert.match(html,/未来产业 \+20%/);assert.match(html,/data-event-id="event-1"/);
});
