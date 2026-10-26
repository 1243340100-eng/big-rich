import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addPlayer, createGame, dispatch, settleAuction } from '../server/engine';
import { credit, effectiveUpgradeCost, money, netWorth, totalDebt, upgradeCost } from '../shared/finance';
import { upgradeReason } from '../src/game/cashflow';
import { PropertyUpgrade } from '../src/game/PropertyUpgrade';
import type { GameState } from '../shared/types';

function game(count = 2): GameState {
  const s = createGame('REG001');
  for (let i = 0; i < count; i++) addPlayer(s, `玩家${i}`, '银行家');
  return dispatch(s, s.hostId, { type: 'start' });
}
const prop = (s: GameState, id: number) => s.properties.find(p => p.tileId === id)!;
const own = (s: GameState, id: number, owner: string, level = 0) => { const p = prop(s, id); p.owner = owner; p.level = level; return p; };

test('bridge loan is a real liability: it cannot inflate net worth or the final score', () => {
  let s = game(); const p = s.players[0]; s.phase = 'manage'; p.position = 32;
  const before = netWorth(s, p), beforeCredit = credit(s, p);
  s = dispatch(s, p.id, { type: 'bridgeLoan' });
  const q = s.players[0];
  assert.equal(q.bridgeLoan?.principal, 80);
  assert.equal(netWorth(s, q), before, '借入过桥资金不能直接抬高净资产');
  assert.equal(totalDebt(s, q), 80, '过桥本金必须计入总负债');
  assert.notEqual(credit(s, q), beforeCredit, '负债变化必须反映到信用评级');
  const repaid = dispatch(s, q.id, { type: 'bridgeRepay' });
  assert.equal(repaid.players[0].bridgeLoan, undefined);
  assert.equal(netWorth(repaid, repaid.players[0]), before);
});

test('bridge debt is included when the final round is scored', () => {
  const s = game(); const p = s.players[0]; s.phase = 'manage'; p.position = 32; s.round = s.rules.rounds;
  const before = netWorth(s, p);
  const after = dispatch(s, p.id, { type: 'bridgeLoan' });
  assert.equal(netWorth(after, after.players[0]), before);
});

test('exhibition trade lock covers both sides of a bilateral stock trade', () => {
  let s = game(); const host = s.players[0], other = s.players[1];
  own(s, 35, host.id, 1); s.phase = 'manage'; host.position = 35;
  s = dispatch(s, host.id, { type: 'exhibit', boostId: 'tech', diluteId: 'energy' });
  s.players[0].stocks.tech = { qty: 10, cost: 100 };
  s.players[1].stocks.tech = { qty: 10, cost: 100 };
  const h = s.players[0], o = s.players[1];

  assert.throws(() => dispatch(s, h.id, {
    type: 'offer', to: o.id, giveCash: 0, wantCash: 10, giveProperty: null, wantProperty: null,
    giveStock: 'tech', giveQty: 1, wantStock: null, wantQty: 0,
  }), /展会当回合/);
  assert.throws(() => dispatch(s, o.id, {
    type: 'offer', to: h.id, giveCash: 0, wantCash: 10, giveProperty: null, wantProperty: null,
    giveStock: 'tech', giveQty: 1, wantStock: null, wantQty: 0,
  }), /展会当回合/);

  // A trade created before the exhibition must also fail at acceptance time.
  let prior = game(); const ph = prior.players[0], po = prior.players[1];
  prior.players[0].stocks.tech = { qty: 10, cost: 100 };
  prior.players[1].stocks.tech = { qty: 10, cost: 100 };
  own(prior, 35, ph.id, 1);
  prior = dispatch(prior, po.id, {
    type: 'offer', to: ph.id, giveCash: 0, wantCash: 10, giveProperty: null, wantProperty: null,
    giveStock: 'tech', giveQty: 1, wantStock: null, wantQty: 0,
  });
  prior.phase = 'manage'; prior.players[0].position = 35;
  prior = dispatch(prior, ph.id, { type: 'exhibit', boostId: 'tech', diluteId: 'energy' });
  assert.throws(() => dispatch(prior, ph.id, { type: 'accept', tradeId: prior.trades[0].id }), /展会当回合/);

  // Unrelated sectors remain tradable.
  s.players[0].stocks.food = { qty: 1, cost: 8 };
  const unrelated = dispatch(s, h.id, {
    type: 'offer', to: o.id, giveCash: 0, wantCash: 10, giveProperty: null, wantProperty: null,
    giveStock: 'food', giveQty: 1, wantStock: null, wantQty: 0,
  });
  assert.equal(unrelated.trades.length, 1, '非主角/配角板块不应被误伤');
});

test('the exhibition action is only available after movement in the manage phase', () => {
  const s = game(); const p = s.players[0]; own(s, 35, p.id, 1); p.position = 35; s.phase = 'roll';
  const before = s.players[0].cash;
  assert.throws(() => dispatch(s, p.id, { type: 'exhibit', boostId: 'tech', diluteId: 'energy' }), /完成移动/);
  assert.equal(s.players[0].cash, before);
});

test('the upgrade panel and its disabled reason use the same headquarters discount as the reducer', () => {
  const s = game(); const p = s.players[0]; own(s, 34, p.id, 3); own(s, 15, p.id, 0);
  s.phase = 'manage';
  const target = prop(s, 15), low = effectiveUpgradeCost(s, p, target.tileId), high = upgradeCost(p, target.tileId);
  assert.ok(low < high);
  p.cash = low + 1;
  assert.equal(upgradeReason(s, p, target), '');
  const html = renderToStaticMarkup(createElement(PropertyUpgrade, {
    state: s, me: p, property: target, act: () => {}, blocked: '',
  }));
  assert.ok(html.includes(`立即升级 ${money(low)} 万`), '按钮应显示服务器实际收取的升级费');
  assert.ok(!html.includes('现金不足'), '按实际升级费付款时不应被错误禁用');
  const paid = dispatch(s, p.id, { type: 'upgrade', tileId: target.tileId });
  assert.equal(paid.players[0].cash, money(p.cash - low));
});

test('restructuring cannot force a plot that another player has reserved into auction', () => {
  let s = game(); const [p0, p1] = s.players;
  s.turn = 1; s.phase = 'buy'; s.pendingTile = 34;
  s = dispatch(s, p1.id, { type: 'reserve' });
  assert.ok(s.reservations?.[34]);
  s.turn = 0; s.phase = 'buy'; s.pendingTile = 34; s.players[0].cash = -20;
  s = dispatch(s, p0.id, { type: 'restructure' });
  assert.equal(s.auction, null);
  assert.equal(s.phase, 'manage');
  assert.equal(s.reservations?.[34]?.ownerId, p1.id);
  assert.equal(prop(s, 34).owner, null);
});

test('the final round cannot sell an insider tip for a round that will never happen', () => {
  const s = game(); const p = s.players[0]; p.position = 33; s.phase = 'manage'; s.round = s.rules.rounds;
  const before = s.players[0].cash;
  assert.throws(() => dispatch(s, p.id, { type: 'insider' }), /本回合结束/);
  assert.equal(s.players[0].cash, before);
});

test('auction settlement refreshes every credit rating, not just ownership', () => {
  let s = game(); const bidder = s.players[1]; s.phase = 'buy'; s.pendingTile = 1;
  bidder.cash = 200; bidder.debt = 100; bidder.credit = 'AAA';
  s = dispatch(s, s.hostId, { type: 'auction' });
  s = dispatch(s, bidder.id, { type: 'bid', amount: 100 });
  settleAuction(s);
  assert.equal(prop(s, 1).owner, bidder.id);
  assert.equal(s.players[1].credit, credit(s, s.players[1]));
});
