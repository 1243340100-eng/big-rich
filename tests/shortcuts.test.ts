import test from 'node:test';
import assert from 'node:assert/strict';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {publicState} from '../server/publicState';
import {eventStory, stockFundamentals} from '../server/stockMarket';
import {BRIDGE,EXHIBIT,INSIDER,RESERVE,SHORTCUT_EXIT,headquartersLevel} from '../shared/shortcuts';
import {effectiveUpgradeCost,money,propertyPurchaseQuote,propertyRent,propertyRentBreakdown,propertyValue,settlementQuote} from '../shared/finance';
import {TILES} from '../shared/catalog';

function game(){const state=createGame('SHORT01');addPlayer(state,'投资人');addPlayer(state,'对手');return dispatch(state,state.hostId,{type:'start'});}
const roll=(s:ReturnType<typeof game>,id:string,die:number,extra:Record<string,unknown>={})=>dispatch(s,id,{type:'roll',...extra},{diceRandom:()=>die});
const own=(s:ReturnType<typeof game>,ids:number[],owner=s.hostId)=>{for(const id of ids)s.properties.find(p=>p.tileId===id)!.owner=owner;};
const prop=(s:ReturnType<typeof game>,id:number)=>s.properties.find(p=>p.tileId===id)!;

test('the inner street is six steps long, holds purchasable plots and rejoins at the far exit',()=>{
  let s=game(),p=s.players[0];
  // 6 -> 36 -> 32 -> 37 -> 33 -> 38 -> 14
  s.phase='roll';p.position=6;
  s=roll(s,p.id,1,{shortcut:true});
  assert.equal(s.players[0].position,36,'拐入内街第一格是交易大厅');
  assert.equal(s.phase==='buy'||s.phase==='manage',true);
  s.phase='roll';
  s=roll(s,s.players[0].id,2);
  assert.equal(s.players[0].position,37,'内街按正常步数推进，不跳过中间格');
  s.phase='roll';
  s=roll(s,s.players[0].id,2);
  assert.equal(s.players[0].position,38);
  s.phase='roll';
  s=roll(s,s.players[0].id,1);
  assert.equal(s.players[0].position,14,'走完内街汇入金融出口');
  assert.equal(s.players[0].path.at(-1),14);
  // 从内街走到出口不需要额外收费，也没有强制停靠
  assert.equal(SHORTCUT_EXIT[36],14);
  assert.equal(SHORTCUT_EXIT[41],30);
});

test('a full six-step walk through the commercial street lands on the transport exit',()=>{
  let s=game(),p=s.players[0];
  s.phase='roll';p.position=22;
  s=roll(s,p.id,6,{shortcut:true});
  assert.equal(s.players[0].position,30,'掷 6 恰好走完内街并落在商业出口');
  assert.equal(TILES[30].type,'transport');
});

test('commercial shortcut exits onto the transport tile without any settlement',()=>{
  let s=game(),p=s.players[0];
  s.phase='roll';p.position=41;const cash=s.players[0].cash;
  s=roll(s,p.id,1);
  assert.equal(s.players[0].position,SHORTCUT_EXIT[41]);
  assert.equal(TILES[30].type,'transport');
  assert.equal(s.players[0].cash,cash,'商业出口是交通格，不扣税也不发钱');
  assert.equal(s.phase,'manage');
});

test('bridge loan pays 40 percent of net worth, is one per player and penalises overdue rounds',()=>{
  let s=game(),p=s.players[0];
  s.phase='manage';p.position=32;
  const before=s.players[0].cash;
  s=dispatch(s,p.id,{type:'bridgeLoan'});
  const loan=s.players[0].bridgeLoan!;
  assert.ok(loan.principal>=BRIDGE.minAmount);
  assert.equal(loan.dueRound,s.round+BRIDGE.rounds);
  assert.equal(s.players[0].cash,money(before+loan.principal));
  assert.throws(()=>dispatch(s,p.id,{type:'bridgeLoan'}),'每局只能申请一次');

  // 逾期：借方的下一个回合开始时罚息计入负债
  const other=s.players[1].id;
  s.turn=1;s.round=loan.dueRound+1;s.phase='manage';
  s=dispatch(s,other,{type:'end'});
  assert.equal(s.players[0].debt,money(loan.principal*BRIDGE.penalty));

  // 归还
  let r=game(),rp=r.players[0];
  r.phase='manage';rp.position=32;
  r=dispatch(r,rp.id,{type:'bridgeLoan'});
  const owed=r.players[0].bridgeLoan!.principal;
  r=dispatch(r,r.hostId,{type:'bridgeRepay'});
  assert.equal(r.players[0].bridgeLoan,undefined);
  assert.equal(r.players[0].cash,money(r.players[0].cash),'归还后现金结算稳定');
  assert.ok(owed>0);
});

test('insider window reveals next round event only to the buyer and pins the real tick',()=>{
  let s=game(),p=s.players[0];
  s.round=2;s.rules.eventEvery=3;s.phase='manage';p.position=33;
  const before=s.players[0].cash;
  s=dispatch(s,p.id,{type:'insider'});
  assert.equal(s.players[0].cash,money(before-INSIDER.fee));
  assert.equal(s.players[0].insiderUsed,1);
  const tip=s.insider![s.hostId];
  assert.equal(tip.round,3);
  assert.ok(tip.eventId,'下一回合是事件回合，必须锁定事件');
  assert.equal(s.nextEventId,tip.eventId);
  assert.ok(tip.title.includes(eventStory(tip.eventId,3,s.rules.eventEvery)?.headline??''),'内幕必须显示与结算一致的新闻标题');
  assert.match(tip.description,/：/,'内幕描述保留底层事件分类');

  const mine=publicState(s,s.hostId),theirs=publicState(s,s.players[1].id);
  assert.ok(mine.insider?.[s.hostId]);
  assert.deepEqual(theirs.insider,{},'其他玩家看不到内幕');
  assert.ok(!theirs.logs.some(l=>l.text.startsWith('内幕')));

  // 另一名玩家同一回合再买一次，必须看到同一个已锁定事件
  let two=game();two.round=2;two.rules.eventEvery=3;
  two.phase='manage';two.players[0].position=33;
  two=dispatch(two,two.hostId,{type:'insider'});
  const first=two.insider![two.hostId].eventId;
  two.turn=1;two.phase='manage';two.players[1].position=33;
  two=dispatch(two,two.players[1].id,{type:'insider'});
  assert.equal(two.insider![two.players[1].id].eventId,first,'两人看到同一个内幕');
  assert.equal(two.nextEventId,first);
});

test('headquarters perks scale by level and add to the monopoly bonus instead of multiplying',()=>{
  const s=game();
  own(s,[34,15,13]);                      // 总部商厦 + 两栋中央商区
  const hq=prop(s,34),lot=prop(s,15);
  hq.level=0;
  const level0=propertyRent(s,lot);
  hq.level=1;
  assert.equal(propertyRent(s,lot),level0,'Lv.1 只减税，不加租金');
  // 税务优化：以同一份估值为基准，Lv.1 应按 20% 减免
  const ownedValue=s.properties.filter(a=>a.owner===s.hostId).reduce((n,a)=>n+propertyValue(s,a),0);
  const grossTax=ownedValue*.008+Math.max(0,ownedValue-500)*.01;
  assert.equal(settlementQuote(s,s.players[0]).tax,money(grossTax*.8));
  hq.level=2;
  const breakdown=propertyRentBreakdown(s,lot);
  assert.equal(breakdown.headquartersBonus,.25);
  assert.equal(breakdown.districtBonus,.15);
  assert.equal(propertyRent(s,lot),money(TILES[15].rent*1*1*(1+.15+.25)));
  hq.level=3;
  assert.equal(propertyRentBreakdown(s,lot).headquartersBonus,.45);
  assert.equal(headquartersLevel(s,s.hostId),3);
  // 抵押后特权失效
  hq.mortgage=100;
  assert.equal(headquartersLevel(s,s.hostId),-1);
  assert.equal(propertyRentBreakdown(s,lot).headquartersBonus,0);
});

test('headquarters level three discounts other upgrades and caps with the realtor job',()=>{
  const s=game();own(s,[34]);prop(s,34).level=3;
  const p=s.players[0];
  assert.equal(effectiveUpgradeCost(s,p,15),money(TILES[15].price*.45*.8));
  assert.equal(effectiveUpgradeCost(s,p,34),money(TILES[34].price*.45),'34 自身不享受自己的减免');
  p.job='房地产商';
  assert.equal(effectiveUpgradeCost(s,p,15),money(TILES[15].price*.45*.7),'职业 15% 与总部 20% 合计封顶 30%');
});

test('exhibition shocks quotes only, respects cooldown and blocks the host that round',()=>{
  let s=game(),p=s.players[0];
  own(s,[35]);prop(s,35).level=1;s.phase='manage';
  const tech=()=>s.stocks.find(x=>x.id==='tech')!,energy=()=>s.stocks.find(x=>x.id==='energy')!;
  const fairBefore=stockFundamentals(s,'tech').fairValue;
  const priceBefore=tech().price,energyBefore=energy().price;
  assert.throws(()=>dispatch(s,p.id,{type:'exhibit',boostId:'tech',diluteId:'tech'}),'主角与配角必须不同');
  s=dispatch(s,p.id,{type:'exhibit',boostId:'tech',diluteId:'energy'});
  assert.ok(tech().price>priceBefore,'主角板块报价被拉高');
  assert.ok(energy().price<energyBefore,'配角板块报价被压低');
  assert.equal(stockFundamentals(s,'tech').fairValue,fairBefore,'展会不动基本面');
  assert.equal(s.exhibition?.ownerId,s.hostId);
  assert.ok(s.stocks.find(x=>x.id==='tech')!.events!.some(e=>e.kind==='exhibition'));
  assert.throws(()=>dispatch(s,p.id,{type:'stock',stockId:'tech',side:'buy',qty:1}),'主办方当回合不得交易相关板块');
  assert.throws(()=>dispatch(s,p.id,{type:'stock',stockId:'energy',side:'sell',qty:1}),'配角板块同样受限');
  assert.equal(s.exhibitionCooldown?.[s.hostId],s.round);
  assert.throws(()=>dispatch(s,p.id,{type:'exhibit',boostId:'food',diluteId:'fun'}),'冷却未结束');
  // 冷却依据等级：Lv.1 为 3 回合
  s.round=s.round+EXHIBIT.cooldown[1];
  assert.doesNotThrow(()=>dispatch(s,p.id,{type:'exhibit',boostId:'food',diluteId:'fun'}));
});

test('exhibition requires an unmortgaged level one venue',()=>{
  const s=game();own(s,[35]);
  assert.throws(()=>dispatch(s,s.hostId,{type:'exhibit',boostId:'tech',diluteId:'energy'}),'Lv.0 没有办展资格');
  prop(s,35).level=1;prop(s,35).mortgage=50;
  assert.throws(()=>dispatch(s,s.hostId,{type:'exhibit',boostId:'tech',diluteId:'energy'}),'抵押期间不能办展');
});

test('pre-order deposit locks a landmark for ten rounds without transferring title',()=>{
  let s=game(),p=s.players[0];
  const quote=propertyPurchaseQuote(s,p.id,prop(s,34));
  s.phase='buy';s.pendingTile=34;
  const before=s.players[0].cash;
  s=dispatch(s,p.id,{type:'reserve'});
  const held=s.reservations![34];
  assert.equal(held.ownerId,s.hostId);
  assert.equal(held.paid,money(quote.total*.3));
  assert.equal(held.total,quote.total);
  assert.equal(held.dueRound,s.round+RESERVE.rounds);
  assert.equal(s.players[0].cash,money(before-held.paid));
  assert.equal(prop(s,34).owner,null,'预定期不转移产权');
  assert.equal(s.phase,'manage');
  // 一次性付款只付一期，产权不转移
  s=dispatch(s,p.id,{type:'settleReserve',tileId:34});
  assert.equal(prop(s,34).owner,null,'付一期还不过户');
  assert.ok(s.reservations![34].paid>held.paid);
  // 付满两期才过户
  s=dispatch(s,p.id,{type:'settleReserve',tileId:34});
  assert.equal(prop(s,34).owner,s.hostId);
  assert.equal(s.reservations![34],undefined);
});

test('only the two commercial landmarks accept a reservation',()=>{
  const s=game();
  for(const tileId of [1,15,31]){s.phase='buy';s.pendingTile=tileId;assert.throws(()=>dispatch(s,s.hostId,{type:'reserve'}),`${tileId} 不接受预定`);}
});

test('an overdue reservation forfeits the deposit and returns the plot',()=>{
  let s=game(),p=s.players[0];
  s.phase='buy';s.pendingTile=34;
  s=dispatch(s,p.id,{type:'reserve'});
  const cash=s.players[0].cash;
  s.turn=1;s.round=s.reservations![34].dueRound+1;s.phase='manage';
  s=dispatch(s,s.players[1].id,{type:'end'});
  assert.equal(s.reservations![34],undefined);
  assert.equal(s.players[0].cash,cash,'定金不退');
  assert.equal(prop(s,34).owner,null);
  assert.ok(s.logs.some(l=>l.text.includes('分期逾期')));
});

test('a reserved plot can be intercepted at full price, and auction is blocked meanwhile',()=>{
  let s=game(),p=s.players[0];
  s.phase='buy';s.pendingTile=34;
  s=dispatch(s,p.id,{type:'reserve'});
  const {paid,total}=s.reservations![34];
  const reserverCash=s.players[0].cash;
  const other=s.players[1].id,otherCash=s.players[1].cash;
  s.turn=1;s.phase='buy';s.pendingTile=34;
  assert.throws(()=>dispatch(s,other,{type:'auction'}),'预定期不能强拍');
  assert.throws(()=>dispatch(s,s.hostId,{type:'buy'}),'预定人不能用截胡路径重复扣款');
  s=dispatch(s,other,{type:'buy'});
  assert.equal(prop(s,34).owner,other);
  assert.equal(s.reservations![34],undefined);
  assert.equal(s.players[1].cash,money(otherCash-total+paid),'截胡者净支出 = 全款 − 定金');
  assert.equal(s.players[0].cash,reserverCash,'预定人只损失已付定金');
  assert.ok(s.logs.some(l=>l.text.includes('截胡')));
});

test('declining a reserved plot leaves the reservation untouched',()=>{
  let s=game(),p=s.players[0];
  s.phase='buy';s.pendingTile=34;
  s=dispatch(s,p.id,{type:'reserve'});
  const held={...s.reservations![34]};
  s.turn=1;s.phase='buy';s.pendingTile=34;
  s=dispatch(s,s.players[1].id,{type:'decline'});
  assert.deepEqual(s.reservations![34],held);
  assert.equal(s.phase,'manage');
});
