import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SettlementReceipt} from '../src/game/SettlementReceipt';
import type {Settlement} from '../shared/types';

const positive:Settlement={interest:1.25,tax:2.4,upkeep:.6,depositIncome:.3,operatingIncome:10.8,total:6.85,id:'ab12cd34-0000-0000-0000-000000000000',round:7};

test('settlement bill renders a serif receipt, itemized paper bill and a paid stamp',()=>{
  const html=renderToStaticMarkup(createElement(SettlementReceipt,{settlement:positive,playerName:'甲',round:7,cash:206.85,deposit:30.3,reduced:true,onClose:()=>{}}));
  assert.match(html,/回合结算单/);assert.match(html,/第 7 轮 · 甲/);assert.match(html,/利息支出/);assert.match(html,/地产税/);assert.match(html,/维护费/);assert.match(html,/地产经营收入/);assert.match(html,/存款利息/);assert.match(html,/本期净变化/);assert.match(html,/\+6\.85/);assert.match(html,/盈余入账/);assert.match(html,/NO\. AB12CD34/);assert.match(html,/现金余额 <b>206\.85 万/);assert.doesNotMatch(html,/money-note/,'reduced motion must not render falling notes');assert.doesNotMatch(html,/debt-note/);
});

test('full settlement bill renders falling banknotes once from a stable seed',()=>{
  const a=renderToStaticMarkup(createElement(SettlementReceipt,{settlement:positive,playerName:'甲',round:7,cash:206.85,deposit:30.3,reduced:false,onClose:()=>{}}));
  const b=renderToStaticMarkup(createElement(SettlementReceipt,{settlement:positive,playerName:'甲',round:7,cash:206.85,deposit:30.3,reduced:false,onClose:()=>{}}));
  assert.equal((a.match(/money-note/g)??[]).length,24);
  assert.equal(a,b,'the note field must be deterministic for the same receipt');
  assert.match(a,/aria-hidden="true"/);
});

test('a negative settlement is stamped as an expense and keeps the red total',()=>{
  const negative:Settlement={interest:2,tax:1,upkeep:1.2,depositIncome:.1,operatingIncome:0,total:-4.1,id:'neg-1',round:3};
  const html=renderToStaticMarkup(createElement(SettlementReceipt,{settlement:negative,playerName:'乙',round:3,cash:10,deposit:1,reduced:true,onClose:()=>{}}));
  assert.match(html,/支出结算/);assert.match(html,/is-negative/);assert.match(html,/-4\.1/);
});

test('a negative settlement rains red -￥ marks instead of banknotes',()=>{
  const negative:Settlement={interest:2,tax:1,upkeep:1.2,depositIncome:.1,operatingIncome:0,total:-4.1,id:'neg-1',round:3};
  const html=renderToStaticMarkup(createElement(SettlementReceipt,{settlement:negative,playerName:'乙',round:3,cash:10,deposit:1,reduced:false,onClose:()=>{}}));
  assert.equal((html.match(/debt-note/g)??[]).length,24);
  assert.equal((html.match(/money-note/g)??[]).length,0);
  assert.match(html,/-￥/);assert.match(html,/is-negative/);
  assert.match(html,/支出结算/);
});
