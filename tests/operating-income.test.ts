import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {money,propertyOperatingIncome,propertyOperatingIncomeBreakdown,settlementQuote} from '../shared/finance';
import {TILES} from '../shared/catalog';
import {DISTRICT_CYCLES,districtCycleMultiplier,districtEventHeat,eventHeatText} from '../shared/districts';
import {cashflow} from '../src/game/cashflow';
import {CashflowPanel,SettlementDetails} from '../src/game/CashflowPanel';
import type {GameState,Settlement} from '../shared/types';

function game(){const s=createGame('INCOME');addPlayer(s,'甲');addPlayer(s,'乙');return dispatch(s,s.hostId,{type:'start'});}
function own(s:GameState,tileId:number,level=0,owner=s.hostId){const a=s.properties.find(p=>p.tileId===tileId)!;a.owner=owner;a.level=level;return a;}

test('four districts have distinct cycle personalities and shortcut districts borrow the commercial profile',()=>{
  assert.deepEqual(DISTRICT_CYCLES['花园住区'],[1,.88,.82,1.18,1.35]);
  assert.deepEqual(DISTRICT_CYCLES['海湾文旅'],[1,1.12,1.15,.88,.75]);
  assert.equal(districtCycleMultiplier('花园住区',4),1.35);
  assert.equal(districtCycleMultiplier('金融捷径',4),DISTRICT_CYCLES['中央商区'][4]);
  assert.equal(districtCycleMultiplier('商业捷径',1),DISTRICT_CYCLES['中央商区'][1]);
  assert.equal(districtCycleMultiplier('未知街区',2),DISTRICT_CYCLES['中央商区'][2]);
});

test('event hotspots add and remove operating income by district and are readable in the economy card',()=>{
  assert.equal(districtEventHeat('AI 技术革命','未来产业'),.20);
  assert.equal(districtEventHeat('AI 技术革命','花园住区'),0);
  assert.equal(districtEventHeat('金融危机','花园住区'),.20);
  assert.equal(districtEventHeat('金融危机','海湾文旅'),-.10);
  assert.equal(districtEventHeat('城市复苏','花园住区'),0);
  assert.match(eventHeatText('AI 技术革命'),/未来产业 \+20%/);
  assert.match(eventHeatText('金融危机'),/花园住区 \+20%.*中央商区.*-10%/);
});

test('operating income uses base rent, level, cycle, district and event heat without monopoly or headquarters bonuses',()=>{
  const s=game(),p=s.players[0];
  const garden=own(s,1);
  assert.equal(propertyOperatingIncome(s,garden),.9);
  assert.equal(propertyOperatingIncome(s,garden,true),.9,'unowned preview still quotes the income');
  garden.mortgage=10;
  assert.equal(propertyOperatingIncome(s,garden),0,'mortgaged property suspends income');
  assert.equal(propertyOperatingIncome(s,garden,true),.9,'preview ignores the suspension');
  garden.mortgage=0;
  garden.level=1;
  assert.equal(propertyOperatingIncome(s,garden),1.57);
  garden.level=3;s.economy.cycle=4;
  assert.equal(propertyOperatingIncomeBreakdown(s,garden).cycle,1,'level three keeps the cycle floor at 1.0');
  assert.equal(propertyOperatingIncome(s,garden),5.83);

  s.economy.cycle=0;const future=own(s,31);
  const normal=propertyOperatingIncome(s,future);
  s.economy.event='AI 技术革命';
  assert.equal(propertyOperatingIncome(s,future),3.67);
  assert.ok(propertyOperatingIncome(s,future)>normal,'AI hotspot must raise future-industry income');
  assert.equal(propertyOperatingIncomeBreakdown(s,future).heat,.20);
});

test('upgrade cost included: every level shortens gross payback and level three is a clear spike',()=>{
  const s=game(),p=s.players[0],prop=own(s,13);
  const base=TILES[13].price,upgradeCost=.45*base;
  let previous=Infinity;
  for(let level=0;level<=3;level++){
    prop.level=level;
    const invest=money(base+upgradeCost*level),payback=invest/propertyOperatingIncome(s,prop);
    assert.ok(payback<previous,`Lv${level} payback ${payback} must beat Lv${level-1} ${previous}`);
    previous=payback;
  }
  prop.level=2;const level2=propertyOperatingIncome(s,prop);
  prop.level=3;const level3=propertyOperatingIncome(s,prop);
  assert.ok(level3/level2>1.5,'level three must be visibly stronger than level two');
});

test('begin-turn settlement pays the net operating income exactly once and records it in the receipt',()=>{
  const s=game(),p=s.players[0];
  s.round=1;s.rules.eventEvery=4;own(s,13);p.cash=100;p.deposit=0;
  const income=propertyOperatingIncome(s,s.properties.find(a=>a.tileId===13)!);
  const quote=settlementQuote(s,p),before=p.cash,previousReceipt=p.lastSettlement?.id;
  assert.ok(income>0);
  s.phase='manage';s.turn=1;
  const next=dispatch(s,s.players[1].id,{type:'end'}),after=next.players[0];
  assert.equal(after.cash,money(before+income-quote.interest-quote.tax-quote.upkeep));
  assert.equal(after.lastSettlement?.operatingIncome,income);
  assert.equal(after.lastSettlement?.total,after.lastFlow);
  assert.notEqual(after.lastSettlement?.id,previousReceipt);
  assert.ok(next.logs.some(l=>l.text.includes('地产经营收入')));
  assert.equal(after.lastSettlement?.depositIncome,0);
});

test('cashflow runway and gap use fixed costs net of operating income',()=>{
  const s=game(),p=s.players[0];own(s,13);
  const f=cashflow(s,p);
  assert.ok(f.operatingIncome>0);
  assert.equal(f.netFixed,money(f.fixed-f.operatingIncome));
  assert.equal(f.gap,money(Math.max(0,f.netFixed-f.available)));
  p.debt=100;p.cash=1;const g=cashflow(s,p);
  assert.equal(g.runway,g.netFixed<=0?'现金流为正':g.available<g.netFixed?'不足 1 回合':`约可撑 ${Math.floor(g.available/g.netFixed)} 回合`);
});

test('receipt and cashflow panel expose the new operating income line',()=>{
  const s=game(),p=s.players[0];own(s,13);
  const value:Settlement={interest:0,tax:1,upkeep:0,depositIncome:2,operatingIncome:3.5,total:4.5,id:'receipt',round:2};
  const receipt=renderToStaticMarkup(createElement(SettlementDetails,{value}));
  assert.match(receipt,/地产经营收入（税后）/);assert.match(receipt,/\+3.5 万/);
  const panel=renderToStaticMarkup(createElement(CashflowPanel,{state:s,me:p,onRescue:()=>{}}));
  assert.match(panel,/预计经营收入/);assert.match(panel,/预计净支出/);
});
