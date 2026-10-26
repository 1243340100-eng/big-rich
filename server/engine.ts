import {auctionStartPrice,landAuctionStartPrice} from '../shared/auctions';
import type {TradeStockQuote} from '../shared/finance';
import { randomInt, randomUUID } from 'node:crypto';
import { advanceStockMarket, applyExhibitionShock, createMarketStocks, ensureMarketState, eventStory, GLOBAL_MARKET_EVENTS, refreshMarketInsights, revalueSectorForBuilding, valuationTrade } from './stockMarket';
import { COLORS, JOBS, TILES, nextTile } from '../shared/catalog';
import { antitrustTax,auctionReserve,restructuringQuote,stockFeeRate,effectiveUpgradeCost,mortgageAmount,propertyPurchaseQuote,tradeSettlementQuote,bankSaleQuote, assets, credit, loanLimit, loanRate, money, netWorth, propertyRent, propertyValue, settlementQuote, totalDebt, upgradeCost } from '../shared/finance';
import { BRIDGE, EXHIBIT, INSIDER, RESERVE, SHORTCUT_ENTRY_TILES, exhibitionLevel, exhibitionWait } from '../shared/shortcuts';
import { stockInfo } from '../shared/stockCatalog';
import type { Action, GameState, InsiderTip, Job, Player, Rules, Trade } from '../shared/types';
import {casinoAction} from './casino';
import {drawCityEvent} from './cityEvents';
import {ensureMatchClock} from '../shared/worldTime';
import {characterFor,isCharacterSkin} from '../shared/characters';

export function createGame(code: string, rules: Partial<Rules> = {}): GameState {
  return {code,hostId:'',status:'lobby',players:[],properties:TILES.filter(t=>t.type==='property').map(t=>({tileId:t.id,owner:null,level:0,mortgage:0})),stocks:createMarketStocks(),marketVersion:2,lastMarketRound:1,turn:0,round:1,phase:'roll',dice:[],pendingTile:null,auction:null,auctionQueue:[],trades:[],logs:[],chats:[],rules:{rounds:[15,30,50].includes(rules.rounds??0)?rules.rounds!:30,cash:[150,200,300].includes(rules.cash??0)?rules.cash!:200,eventEvery:[2,3,4].includes(rules.eventEvery??0)?rules.eventEvery!:3},economy:{cycle:0,propertyIndex:1,baseRate:.03,event:'城市复苏',description:'新一轮城市建设开始。保持现金流，寻找第一笔投资。'},version:0,turnStarted:Date.now()};
}
export function addPlayer(s: GameState, name: string, job: Job = '程序员', bot=false,skin?:unknown): Player {
  check(s.status==='lobby','对局已开始'); check(s.players.length<8,'房间已满');check(skin===undefined||isCharacterSkin(skin),'角色皮肤无效');
  const p: Player = {id:randomUUID(),name:clean(name,16)||'城市投资人',color:COLORS[s.players.length],skin:characterFor(skin,s.players.length).id,bridgeLoanUsed:false,job:JOBS.includes(job)?job:'程序员',cash:s.rules.cash,position:0,stocks:{},debt:0,deposit:0,credit:'AAA',lastFlow:0,bot,connected:true,defaults:0,path:[]};
  s.players.push(p); if(!s.hostId)s.hostId=p.id; return p;
}
function check(value: unknown, message: string): asserts value { if(!value)throw new Error(message); }
function clean(v: unknown,max: number) { return typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').trim().slice(0,max):''; }
function num(v: unknown,min=0,max=100000) { check(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,'数值超出范围'); return money(v); }
function integer(v: unknown,min=0,max=100000) { const n=num(v,min,max); check(Number.isInteger(n),'请输入整数'); return n; }
export function log(s: GameState,text: string,kind: 'info'|'trade'|'event'|'alert'='info') { s.logs.unshift({id:randomUUID(),round:s.round,text,kind});s.logs=s.logs.slice(0,100); }
const current = (s: GameState)=>s.players[s.turn];
function own(s: GameState,p: Player,v: unknown) { const prop=s.properties.find(x=>x.tileId===v);check(prop&&prop.owner===p.id,'你不拥有此地产');return prop; }
function reserved(s: GameState,p: Player) { return auctionReserve(s,p.id); }
function spend(s: GameState,p: Player,n: number) { check(p.cash-reserved(s,p)>=n,'可用现金不足（竞拍资金已预留）');p.cash=money(p.cash-n); }
function adjust(p: Player,amount: number) {p.cash=money(p.cash+amount);}
function salary(s: GameState,p: Player) { const gross=p.job==='公务员'?22:(p.job==='程序员'?26:20)*[1,1.1,1.15,.85,.75][s.economy.cycle];const income=money(gross*.9);adjust(p,income);log(s,`${p.name} 经过起点，税后收入 +${income} 万`); }
function beginTurn(s: GameState) {
  const p=current(s);s.phase='roll';s.dice=[];s.pendingTile=null;s.turnStarted=Date.now();
  p.casinoEligible=false;
  if(p.bridgeLoan&&s.round>p.bridgeLoan.dueRound){
    const penalty=money(p.bridgeLoan.principal*BRIDGE.penalty);
    p.debt=money(p.debt+penalty);
    log(s,`${p.name} 的过桥资金逾期，罚息 ${penalty} 万计入负债`,'alert');
  }
  // 预定逾期：定金没收，地块回到市有土地。
  for(const [tileId,held] of Object.entries(s.reservations??{})){
    const missed=held.schedule.filter(d=>s.round>d).length;
    const required=money(held.deposit+held.installment*missed);
    if(held.paid>=required-.005)continue;
    const who=s.players.find(x=>x.id===held.ownerId);
    delete s.reservations![Number(tileId)];
    log(s,`${who?.name??'某玩家'} 对 ${TILES[Number(tileId)].name} 的分期逾期，已付 ${held.paid} 万没收，地块回到市有土地`,'alert');
  }
  const rentIncome=p.rentIncomeSinceSettlement??0,rentPaid=p.rentPaidSinceSettlement??0;
  p.rentIncomeSinceSettlement=0;p.rentPaidSinceSettlement=0;
  const quote=settlementQuote(s,p);
  const {interest,tax,upkeep,depositIncome,operatingIncome}=quote;
  p.deposit=money(p.deposit+depositIncome);
  adjust(p,operatingIncome-interest-tax-upkeep);
  // 账单覆盖“上次结算后”的完整周期：固定结算 + 这期间实际收付的过路租金。
  p.lastFlow=money(quote.total+rentIncome-rentPaid);
  p.lastSettlement={interest,tax,upkeep,depositIncome,operatingIncome,...(rentIncome||rentPaid?{rentIncome,rentPaid}:{}),total:p.lastFlow,id:randomUUID(),round:s.round};
  if(operatingIncome>0)log(s,`${p.name} 地产经营收入 +${operatingIncome} 万（税后）`,'trade');
  if(rentIncome||rentPaid)log(s,`${p.name} 上期租金：收入 ${rentIncome} / 支付 ${rentPaid} 万`,'trade');
  if(interest+tax+upkeep>0)log(s,`${p.name} 结算：利息 ${interest} / 税 ${tax} / 维护 ${upkeep} 万`);
  if(p.cash<0)log(s,`${p.name} 现金不足，请先筹资或重组`,'alert');
}
function land(s: GameState,p: Player,random:()=>number=()=>randomInt(1000000)/1000000) {
  const t=TILES[p.position];s.phase='manage';s.pendingTile=null;
  p.casinoEligible=t.type==='casino'&&!p.bot;
  log(s,`${p.name} 抵达「${t.name}」`);
  if(t.type==='property') {
    const a=s.properties.find(a=>a.tileId===t.id)!;
    if(!a.owner){
      const held=s.reservations?.[t.id];
      if(held&&held.ownerId===p.id){log(s,`这是你预定的地块，可随时付清尾款 ${money(held.total-held.paid)} 万`);s.phase='manage';}
      else {if(held)log(s,`${TILES[t.id].name} 已被 ${s.players.find(x=>x.id===held.ownerId)?.name??'他人'} 预定，可全款截胡`);s.pendingTile=t.id;s.phase='buy';}
    }
    else if(a.owner!==p.id&&!a.mortgage){const rent=propertyRent(s,a),net=money(rent*.9);adjust(p,-rent);const owner=s.players.find(x=>x.id===a.owner)!;adjust(owner,net);p.rentPaidSinceSettlement=money((p.rentPaidSinceSettlement??0)+rent);owner.rentIncomeSinceSettlement=money((owner.rentIncomeSinceSettlement??0)+net);log(s,`${p.name} 向 ${owner.name} 支付租金 ${rent} 万（收款方扣 10% 所得税）`,'trade');s.logs[0].rent={payer:p.id,recipient:owner.id,gross:rent,net,tileId:a.tileId};}
  } else if(t.type==='tax'){const tax=money(Math.max(5,Math.max(0,netWorth(s,p))*.025));adjust(p,-tax);log(s,`${p.name} 缴纳城市特别税 ${tax} 万`,'alert');}
  else if(t.type==='event'){const result=drawCityEvent(s,p,t.id,random);if(result){log(s,`${p.name}：城市事件「${result.title}」— ${result.effectText}`,'event');result.drawId=s.logs[0].id;s.logs[0].cityEvent=result;}}
  else if(t.type==='bank')log(s,t.id===32?'金融服务站：每局可申请一笔无抵押过桥资金，每个个人回合利息 2%，6 回合内归还。':'银行服务可随时使用：存款、贷款及地产抵押');
  else if(t.type==='exchange')log(s,t.id===33?'创投交易所：可购买下一回合的内幕（15 万，每局 2 次）。':'证券市场已开放，其他玩家回合也可以交易');
}
function startAuction(s: GameState,tileId: number,foreclosure=false) {
  s.phase='auction';s.pendingTile=null;s.auction={tileId,highest:auctionStartPrice(s,s.properties.find(a=>a.tileId===tileId)!,foreclosure),bidder:null,passed:[],endsAt:Date.now()+25000,foreclosure};
  log(s,`「${TILES[tileId].name}」公开拍卖开始，${s.auction.highest} 万起拍`,'trade');
}
export function settleAuction(s: GameState) {
  const a=s.auction;if(!a)return;
  const prop=s.properties.find(p=>p.tileId===a.tileId)!;
  const winner=s.players.find(p=>p.id===a.bidder);
  const tax=winner?antitrustTax(s,winner.id,a.tileId):0,total=money(a.highest+tax);
  if(winner&&winner.cash>=total){adjust(winner,-total);prop.owner=winner.id;log(s,`${winner.name} 以 ${a.highest} 万拍得 ${TILES[a.tileId].name}${tax?`，另缴反垄断税 ${tax} 万`:''}`,'trade');}
  else {prop.owner=null;log(s,`${TILES[a.tileId].name} 流拍，回归市有资产`);}
  prop.mortgage=0;s.auction=null;
  if(s.auctionQueue.length)startAuction(s,s.auctionQueue.shift()!,true);else s.phase='manage';
  refreshMarketInsights(s);for(const pl of s.players)pl.credit=credit(s,pl);s.version++;
}
export function marketTick(s: GameState,options?:Parameters<typeof advanceStockMarket>[1]) {
  for(const entry of advanceStockMarket(s,options)??[])log(s,entry.text,entry.kind);
}
function validateLeg(s: GameState,p: Player,cash: number,propId: number|null,stockId: string|null,qty: number) {
  check(!p.casino,'交易方正在赌场，请先离场');
  check(p.cash-reserved(s,p)>=cash,'交易方现金不足');
  if(propId!==null){const prop=own(s,p,propId);check(!prop.mortgage,'抵押地产须先赎回');check(s.auction?.tileId!==propId,'地产正在拍卖');}
  if(qty>0)check(stockId&&s.stocks.some(st=>st.id===stockId)&&(p.stocks[stockId]?.qty??0)>=qty,'交易方持股不足');
}
/** The exhibition host is locked out of the featured sectors for the whole round,
 *  including both sides of a bilateral trade. */
function validateTradeExhibition(s: GameState,t: Trade) {
  const legs:[string,string|null,number][]=[
    [t.from,t.giveStock,t.giveQty],
    [t.from,t.wantStock,t.wantQty],
    [t.to,t.wantStock,t.wantQty],
    [t.to,t.giveStock,t.giveQty],
  ];
  for(const [id,stockId,qty] of legs) {
    if(qty<=0||!stockId)continue;
    const ex=s.exhibition;
    if(ex&&ex.ownerId===id&&ex.round===s.round&&(ex.boostId===stockId||ex.diluteId===stockId))
      throw new Error('展会当回合，主办方不得交易相关板块（含玩家交易）');
  }
}
function transferLeg(s: GameState,from: Player,to: Player,cash: number,propId: number|null,stockId: string|null,qty: number,tax=0,quote?:TradeStockQuote) {
  adjust(from,-cash);adjust(to,cash);
  if(propId!==null){own(s,from,propId).owner=to.id;if(tax){adjust(to,-tax);log(s,`${to.name} 受让 ${TILES[propId].name}，缴纳反垄断税 ${tax} 万`,'trade');}}
  if(stockId&&qty&&quote){
    const holding=from.stocks[stockId];holding.qty-=qty;holding.cost=money(holding.cost-quote.basis);
    to.stocks[stockId]??={qty:0,cost:0};to.stocks[stockId].qty+=qty;to.stocks[stockId].cost=money(to.stocks[stockId].cost+quote.recipientBasis);
    adjust(from,-money(quote.fee+quote.tax));adjust(to,-quote.recipientFee);
    log(s,`${from.name} 转出 ${qty} 股 ${s.stocks.find(st=>st.id===stockId)!.name}，按市值 ${quote.gross} 万结算，手续费 ${quote.fee} 万、盈利税 ${quote.tax} 万；${to.name} 接收手续费 ${quote.recipientFee} 万`,'trade');
  }
}

function validateTradeSettlement(s:GameState,t:Trade){
  const quote=tradeSettlementQuote(s,t);
  check(quote.fromCash>=quote.fromReserved&&quote.toCash>=quote.toReserved,'受让方现金不足以支付税费或保留竞拍资金');
  return quote;
}

/** Atomic reducer: reject malformed or unauthorized requests without mutating input. */
export function dispatch(original: GameState,playerId: string,action: Action,options:{casinoRandom?:()=>number;diceRandom?:()=>number;cityRandom?:()=>number}={}): GameState {
  const s=structuredClone(original);ensureMarketState(s);ensureMatchClock(s);const p=s.players.find(p=>p.id===playerId);check(p,'玩家不存在');check(action&&typeof action.type==='string','无效操作');
  check(!p.casino||['casinoSpin','casinoCashout','casinoLeave','skin'].includes(action.type),'请先离开赌场，再进行其他操作');
  if(action.type==='skin'){check(isCharacterSkin(action.skin),'角色皮肤无效');p.skin=action.skin;s.version++;return s;}
  if(action.type==='chat'){
    const text=clean(action.text,240);check(text,'消息不能为空');const to=typeof action.to==='string'?action.to:null;check(!to||s.players.some(x=>x.id===to&&x.id!==p.id),'收件人不存在');
    s.chats.push({id:randomUUID(),from:p.id,to,text,name:p.name});s.chats=s.chats.slice(-80);s.version++;return s;
  }
  if(action.type==='addBot'){check(s.status==='lobby'&&s.hostId===p.id,'仅房主可添加机器人');addPlayer(s,`城市顾问 ${s.players.length}`,JOBS[s.players.length%JOBS.length],true);}
  else if(action.type==='rules'){check(s.status==='lobby'&&s.hostId===p.id,'仅房主可设置规则');check([15,30,50].includes(Number(action.rounds))&&[150,200,300].includes(Number(action.cash))&&[2,3,4].includes(Number(action.eventEvery)),'房间规则无效');s.rules={rounds:Number(action.rounds),cash:Number(action.cash),eventEvery:Number(action.eventEvery)};for(const pl of s.players)pl.cash=s.rules.cash;}
  else if(action.type==='start'){check(s.status==='lobby'&&s.hostId===p.id,'仅房主可开始');check(s.players.length>=2,'至少需要两名玩家');s.status='playing';s.startedAt=Date.now();delete s.finishedAt;log(s,'欢迎来到资本之城。对局开始！');beginTurn(s);}
  else {
    check(s.status==='playing','当前不在对局中');
    const offTurn=['stock','borrow','repay','deposit','withdraw','mortgage','redeem','sellProperty','offer','accept','reject','bid','pass','restructure','exhibit','settleReserve'];
    if(!offTurn.includes(action.type))check(current(s).id===p.id,'还没轮到你');
    switch(action.type) {
      case 'casinoEnter':case 'casinoSpin':case 'casinoCashout':case 'casinoLeave':casinoAction(s,p,action,options.casinoRandom);break;
      case 'roll': {
        check(s.phase==='roll','本回合已掷骰');check(p.cash>=0,'请先处理现金缺口');
        const shortcut=action.shortcut===true;check(!shortcut||(SHORTCUT_ENTRY_TILES as readonly number[]).includes(p.position),'当前位置不能拐入内街');
        const die=options.diceRandom?.()??randomInt(1,7);check(Number.isInteger(die)&&die>=1&&die<=6,'骰子随机源无效');
        s.dice=[die];p.path=[p.position];
        for(let i=0;i<die;i++){const prev=p.position;p.position=nextTile(prev,shortcut&&i===0);p.path.push(p.position);if(prev===31&&p.position===0)salary(s,p);}
        log(s,`${p.name} 掷出 ${die}${shortcut?'，拐入内街':''}`);land(s,p,options.cityRandom);break;
      }
      case 'bridgeLoan': {
        check(s.phase==='manage'&&p.position===32,'只有在金融服务站才能申请过桥资金');
        check(!p.bridgeLoan&&!p.bridgeLoanUsed,'过桥资金每局只能申请一次');
        const amount=money(Math.max(BRIDGE.minAmount,netWorth(s,p)*BRIDGE.ratio));
        p.bridgeLoanUsed=true;p.bridgeLoan={principal:amount,dueRound:s.round+BRIDGE.rounds};
        adjust(p,amount);
        log(s,`${p.name} 在金融服务站获得过桥资金 ${amount} 万，每个个人回合利息 ${BRIDGE.rate*100}%，须在第 ${p.bridgeLoan.dueRound} 回合内归还`,'trade');break;
      }
      case 'bridgeRepay': {
        check(p.bridgeLoan,'没有待归还的过桥资金');
        spend(s,p,p.bridgeLoan.principal);
        log(s,`${p.name} 归还过桥资金 ${p.bridgeLoan.principal} 万`,'trade');
        delete p.bridgeLoan;break;
      }
      case 'insider': {
        check(s.phase==='manage'&&p.position===33,'只有在创投交易所才能购买内幕');
        check((p.insiderUsed??0)<INSIDER.uses,'内幕窗口已用完');
        check(s.round<s.rules.rounds,'对局将在本回合结束，无法预知下一回合');
        spend(s,p,INSIDER.fee);
        p.insiderUsed=(p.insiderUsed??0)+1;
        const nextRound=s.round+1;
        let tip:InsiderTip;
        if(nextRound%s.rules.eventEvery===0){
          // 同一回合内多名玩家买内幕时，必须复用已锁定的事件，否则先买的人看到的情报会被改写。
          const pinned=s.nextEventId?GLOBAL_MARKET_EVENTS.find(e=>e.id===s.nextEventId):undefined;
          const event=pinned??GLOBAL_MARKET_EVENTS[randomInt(GLOBAL_MARKET_EVENTS.length)];
          const story=eventStory(event.id,nextRound,s.rules.eventEvery);
          s.nextEventId=event.id;
          tip={round:nextRound,title:`第 ${nextRound} 回合 · ${story?.headline??event.title}`,description:`${event.title}：${event.description}`,eventId:event.id};
        }else{
          tip={round:nextRound,title:`第 ${nextRound} 回合 · 无全球事件`,description:'下一次全球事件不在下一回合发生，可放心持有或加仓。',eventId:null};
        }
        s.insider={...(s.insider??{}),[p.id]:tip};
        log(s,`${p.name} 在创投交易所获得了内幕`,'trade');
        s.logs.unshift({id:randomUUID(),round:s.round,text:`内幕：${tip.title} — ${tip.description}`,kind:'event',privateTo:p.id});
        s.logs=s.logs.slice(0,100);break;
      }
      case 'exhibit': {
        const level=exhibitionLevel(s,p.id);
        check(level>=1,'你需要拥有一座未抵押的商务会展（Lv.1 以上）才能办展');
        const wait=exhibitionWait(s,p.id);check(wait<=0,`展会冷却中，还需 ${wait} 回合`);
        const boostId=String(action.boostId??''),diluteId=String(action.diluteId??'');
        check(Boolean(boostId)&&Boolean(diluteId)&&boostId!==diluteId,'主角板块与配角板块必须是两个不同的板块');
        check(s.stocks.some(a=>a.id===boostId)&&s.stocks.some(a=>a.id===diluteId),'板块不存在');
        check(s.phase==='manage','请先完成移动、购买或拍卖');
        const fee=money(EXHIBIT.fee[level]);
        spend(s,p,fee);
        const boost=EXHIBIT.boost[level],dilute=EXHIBIT.dilute[level];
        const shock=applyExhibitionShock(s,boostId,diluteId,boost,dilute);
        s.exhibition={ownerId:p.id,boostId,diluteId,boost,dilute,round:s.round,boostPrice:shock.boostPrice,dilutePrice:shock.dilutePrice};
        s.exhibitionCooldown={...(s.exhibitionCooldown??{}),[p.id]:s.round};
        log(s,`${p.name} 在商务会展举办主题展：${stockInfo(boostId)?.name??boostId} 利好 +${(boost*100).toFixed(0)}%，${stockInfo(diluteId)?.name??diluteId} 受分流 −${(dilute*100).toFixed(0)}%（花费 ${fee} 万）`,'event');
        break;
      }
      case 'buy': {
        check(s.phase==='buy'&&s.pendingTile!==null,'没有可购买地产');
        const a=s.properties.find(a=>a.tileId===s.pendingTile)!;check(!a.owner,'地产已有业主');
        const quote=propertyPurchaseQuote(s,p.id,a);
        const held=s.reservations?.[a.tileId];
        check(!(held&&held.ownerId===p.id),'这是你自己的预定，请用「付清尾款」完成交易');
        spend(s,p,quote.total);a.owner=p.id;
        if(held){
          // 截胡：全款买下，原预定的定金转给新业主（预定人损失定金）。
          const prev=s.players.find(x=>x.id===held.ownerId);
          adjust(p,held.paid);
          delete s.reservations![a.tileId];
          log(s,`${p.name} 截胡 ${TILES[a.tileId].name}，全款 ${quote.total} 万，原定金 ${held.paid} 万归新业主${prev?`（${prev.name} 损失定金）`:''}`,'trade');
        } else {
          log(s,`${p.name} 以 ${quote.price} 万购入 ${TILES[a.tileId].name}${quote.tax?`，另缴反垄断税 ${quote.tax} 万`:''}`,'trade');
        }
        s.pendingTile=null;s.phase='manage';break;
      }
      case 'reserve': {
        check(s.phase==='buy'&&s.pendingTile!==null,'没有可预定的地产');
        check([34,35].includes(s.pendingTile),'只有总部商厦与商务会展接受预定');
        const a=s.properties.find(a=>a.tileId===s.pendingTile)!;check(!a.owner,'地产已有业主');
        check(!s.reservations?.[a.tileId],'此地块已经被预定');
        const quote=propertyPurchaseQuote(s,p.id,a),deposit=money(quote.total*RESERVE.deposit);
        const installment=money((quote.total-deposit)/RESERVE.installments);
        const schedule=Array.from({length:RESERVE.installments},(_,i)=>s.round+Math.ceil(RESERVE.rounds*(i+1)/RESERVE.installments));
        spend(s,p,deposit);
        s.reservations={...(s.reservations??{}),[a.tileId]:{ownerId:p.id,paid:deposit,total:quote.total,deposit,installment,dueRound:s.round+RESERVE.rounds,schedule}};
        log(s,`${p.name} 支付定金 ${deposit} 万预定 ${TILES[a.tileId].name}；尾款分 ${RESERVE.installments} 期、每期约 ${installment} 万，须在第 ${schedule.join(' / ')} 回合前付清`,'trade');
        s.pendingTile=null;s.phase='manage';break;
      }
      case 'settleReserve': {
        const tile=Number(action.tileId);
        const held=s.reservations?.[tile];check(held&&held.ownerId===p.id,'没有属于你的预定');
        const a=s.properties.find(x=>x.tileId===tile)!;check(!a.owner,'地产已有业主');
        const dueNow=Math.min(held.installment,money(held.total-held.paid));
        spend(s,p,dueNow);
        held.paid=money(held.paid+dueNow);
        if(held.paid>=money(held.total)-.005){a.owner=p.id;delete s.reservations![tile];log(s,`${p.name} 付清全部尾款，正式取得 ${TILES[tile].name}`,'trade');}
        else log(s,`${p.name} 支付 ${TILES[tile].name} 分期 ${dueNow} 万，累计 ${held.paid} / ${held.total} 万`,'trade');
        break;
      }
      case 'decline': {check(s.phase==='buy'&&s.pendingTile!==null,'没有待处理的地产');log(s,`${p.name} 跳过购买 ${TILES[s.pendingTile].name}，本次不发起拍卖`);s.pendingTile=null;s.phase='manage';break;}
      case 'auction': check(s.phase==='buy'&&s.pendingTile!==null,'没有待拍卖土地');check(!s.reservations?.[s.pendingTile],'该地块已被预定，只能全款截胡或放弃');startAuction(s,s.pendingTile);break;
      case 'bid': {const a=s.auction;check(a,'没有正在进行的拍卖');check(Date.now()<a.endsAt,'拍卖已到期');check(!a.passed.includes(p.id),'你已退出本场竞拍');const bid=num(action.amount,a.highest+(a.bidder?1:0));check(p.cash>=money(bid+antitrustTax(s,p.id,a.tileId)),'竞拍现金不足（含反垄断税）');a.highest=bid;a.bidder=p.id;a.endsAt=Date.now()+15000;log(s,`${p.name} 出价 ${bid} 万`,'trade');break;}
      case 'pass': {const a=s.auction;check(a,'没有正在进行的拍卖');check(a.bidder!==p.id,'最高出价不能撤销');if(!a.passed.includes(p.id))a.passed.push(p.id);if(s.players.every(pl=>a.passed.includes(pl.id)||a.bidder===pl.id))settleAuction(s);break;}
      case 'upgrade': {check(s.phase==='manage','请先完成移动及落地事件');const a=own(s,p,action.tileId);check(!a.mortgage&&a.level<3,'已达最高等级或地产被抵押');spend(s,p,effectiveUpgradeCost(s,p,a.tileId));a.level++;if(a.level===3)for(const message of revalueSectorForBuilding(s,a.tileId))log(s,message,'event');log(s,`${p.name} 升级 ${TILES[a.tileId].name} 至 Lv.${a.level}`,'trade');break;}
      case 'mortgage': {const a=own(s,p,action.tileId);check(!a.mortgage,'此地产已经抵押');check(s.auction?.tileId!==a.tileId,'地产正在拍卖');a.mortgage=mortgageAmount(s,a);adjust(p,a.mortgage);log(s,`${p.name} 抵押 ${TILES[a.tileId].name}，获得 ${a.mortgage} 万`,'trade');break;}
      case 'redeem': {const a=own(s,p,action.tileId);check(a.mortgage>0,'此地产未被抵押');spend(s,p,money(a.mortgage*1.05));a.mortgage=0;log(s,`${p.name} 赎回 ${TILES[a.tileId].name}`);break;}
      case 'sellProperty': {const a=own(s,p,action.tileId);check(s.auction?.tileId!==a.tileId,'地产正在拍卖');const proceeds=bankSaleQuote(s,a).net;check(p.cash+proceeds>=reserved(s,p),'出售款不足清偿抵押');adjust(p,proceeds);a.owner=null;a.level=0;a.mortgage=0;log(s,`${p.name} 向银行出售 ${TILES[a.tileId].name}，净得 ${proceeds} 万`,'trade');break;}
      case 'borrow': {const amount=num(action.amount,1);check(amount<=loanLimit(s,p),'超过信用贷款额度');p.debt=money(p.debt+amount);adjust(p,amount);log(s,`${p.name} 申请信用贷款 ${amount} 万`,'trade');break;}
      case 'repay': {const amount=num(action.amount,1,p.debt);spend(s,p,amount);p.debt=money(p.debt-amount);break;}
      case 'deposit': {const amount=num(action.amount,1);spend(s,p,amount);p.deposit=money(p.deposit+amount);break;}
      case 'withdraw': {const amount=num(action.amount,1,p.deposit);p.deposit=money(p.deposit-amount);adjust(p,amount);break;}
      case 'stock': {
        const st=s.stocks.find(a=>a.id===action.stockId);check(st,'股票不存在');
        const ex=s.exhibition;check(!(ex&&ex.ownerId===p.id&&ex.round===s.round&&(ex.boostId===st.id||ex.diluteId===st.id)),'展会当回合，主办方不得交易相关板块');
        const qty=integer(action.qty,1,1000);check(action.side==='buy'||action.side==='sell','交易方向无效');
        const fee=stockFeeRate(p,st.id);
        const h=p.stocks[st.id]??{qty:0,cost:0};
        const impact=Math.min(.025,qty*.001);
        // Average execution price includes slippage in the direction of the order.
        // Paying the old quote and then moving it would permit profitable wash trades.
        const gross=money(qty*st.price*(1+(action.side==='buy'?1:-1)*impact));
        if(action.side==='buy'){const cost=money(gross*(1+fee));spend(s,p,cost);h.qty+=qty;h.cost=money(h.cost+cost);}
        else{check(h.qty>=qty,'持股数量不足');const basis=money(h.cost/h.qty*qty);const tax=money(Math.max(0,gross-basis)*.1);adjust(p,money(gross*(1-fee)-tax));h.qty-=qty;h.cost=money(h.cost-basis);}
        p.lastStockTradeRound=s.round;p.stocks[st.id]=h;log(s,`${p.name} ${action.side==='buy'?'买入':'卖出'} ${st.name} ${qty} 股 @ ${st.price} 万`,'trade');
        st.price=money(Math.max(1,Math.min(500,st.price*(1+(action.side==='buy'?1:-1)*impact))));break;
      }
      case 'offer': {
        check(s.trades.filter(t=>t.from===p.id).length<5,'最多同时发出 5 笔交易');const target=s.players.find(x=>x.id===action.to&&x.id!==p.id);check(target,'请选择交易对象');
        const t: Trade={id:randomUUID(),from:p.id,to:target.id,giveCash:num(action.giveCash),wantCash:num(action.wantCash),giveProperty:action.giveProperty===null?null:integer(action.giveProperty,0,35),wantProperty:action.wantProperty===null?null:integer(action.wantProperty,0,35),giveStock:typeof action.giveStock==='string'?action.giveStock:null,wantStock:typeof action.wantStock==='string'?action.wantStock:null,giveQty:integer(action.giveQty??0,0,1000),wantQty:integer(action.wantQty??0,0,1000),expires:s.round+2};
        check(t.giveCash+t.wantCash+t.giveQty+t.wantQty>0||t.giveProperty!==null||t.wantProperty!==null,'交易不能为空');
        validateLeg(s,p,t.giveCash,t.giveProperty,t.giveStock,t.giveQty);validateLeg(s,target,t.wantCash,t.wantProperty,t.wantStock,t.wantQty);validateTradeExhibition(s,t);validateTradeSettlement(s,t);s.trades.push(t);log(s,`${p.name} 向 ${target.name} 发出交易提案`,'trade');break;
      }
      case 'accept': {
        const t=s.trades.find(t=>t.id===action.tradeId);check(t&&t.to===p.id,'交易不存在或你不是收件人');check(t.expires>=s.round,'交易已过期');const from=s.players.find(a=>a.id===t.from)!;
        validateLeg(s,from,t.giveCash,t.giveProperty,t.giveStock,t.giveQty);validateLeg(s,p,t.wantCash,t.wantProperty,t.wantStock,t.wantQty);validateTradeExhibition(s,t);
        const taxes=validateTradeSettlement(s,t);
        transferLeg(s,from,p,t.giveCash,t.giveProperty,t.giveStock,t.giveQty,taxes.toTax,taxes.giveStockQuote);transferLeg(s,p,from,t.wantCash,t.wantProperty,t.wantStock,t.wantQty,taxes.fromTax,taxes.wantStockQuote);
        s.trades=s.trades.filter(a=>a.id!==t.id);log(s,`${from.name} 与 ${p.name} 完成资产交换`,'trade');break;
      }
      case 'reject': {const t=s.trades.find(t=>t.id===action.tradeId);check(t&&(t.to===p.id||t.from===p.id),'无权处理此交易');s.trades=s.trades.filter(a=>a.id!==t.id);break;}
      case 'restructure': {
        check(current(s).id===p.id,'请在自己回合申请重组');
        check(p.cash<0,'仅现金不足时可以申请重组');check(!s.auction,'请等待当前拍卖结束');
        const quote=restructuringQuote(s,p),seized=s.properties.filter(a=>a.owner===p.id);
        for(const a of seized){a.owner=null;a.mortgage=0;}
        if(p.bridgeLoan)p.bridgeLoanUsed=true;delete p.bridgeLoan;
        for(const id of quote.cancelledReservations)delete s.reservations![id];
        p.debt=quote.debtAfter;p.cash=30;p.deposit=0;p.stocks={};p.defaults++;s.trades=s.trades.filter(t=>t.to!==p.id&&t.from!==p.id);
        if(quote.cancelledReservations.length)log(s,`${p.name} 重组取消本人 ${quote.cancelledReservations.length} 份预定，已付 ${quote.forfeited} 万没收`,'alert');
        log(s,`${p.name} 进入破产重组：资产清算，过桥本金并入债务，剩余债务减免 80%，获得 30 万重启资金`,'alert');
        // A reserved plot is not the current player's asset and cannot be
        // forced into a foreclosure auction by their restructuring.
        s.auctionQueue=seized.map(a=>a.tileId);if(s.pendingTile!==null&&!s.reservations?.[s.pendingTile])s.auctionQueue.push(s.pendingTile);s.pendingTile=null;s.phase='manage';if(s.auctionQueue.length)startAuction(s,s.auctionQueue.shift()!,true);break;
      }
      case 'end': {
        check(s.phase==='manage','请先完成掷骰、购买或拍卖');check(p.cash>=0,'请先解决现金缺口');p.casinoEligible=false;s.turn++;
        if(s.turn>=s.players.length){s.turn=0;if(s.round>=s.rules.rounds){s.status='finished';s.finishedAt=Date.now();log(s,'对局结束，按净资产结算排名！','event');break;}s.round++;marketTick(s);s.trades=s.trades.filter(t=>t.expires>=s.round);}
        beginTurn(s);break;
      }
      default: throw new Error('不支持的操作');
    }
  }
  refreshMarketInsights(s);for(const pl of s.players)pl.credit=credit(s,pl);s.version++;return s;
}

export function botAction(s: GameState,id: string): Action|null {
  const p=s.players.find(p=>p.id===id)!;
  if(p.casino)return null;
  if(s.auction){const a=s.auction;if(a.bidder===id||a.passed.includes(id))return null;const value=propertyValue(s,s.properties.find(p=>p.tileId===a.tileId)!);const amount=money(a.highest+(a.bidder?5:0));return amount+antitrustTax(s,p.id,a.tileId)<value*.85&&p.cash-amount-antitrustTax(s,p.id,a.tileId)>25?{type:'bid',amount}:{type:'pass'};}
  const proposal=s.trades.find(t=>t.to===id);
  if(proposal){const q=tradeSettlementQuote(s,proposal);if(q.fromCash<q.fromReserved||q.toCash<q.toReserved)return {type:'reject',tradeId:proposal.id};const value=(cash:number,tile:number|null,stock:string|null,qty:number)=>cash+(tile!==null?propertyValue(s,s.properties.find(a=>a.tileId===tile)!):0)+(s.stocks.find(st=>st.id===stock)?.price??0)*qty;return {type:value(proposal.giveCash,proposal.giveProperty,proposal.giveStock,proposal.giveQty)-q.toTax-q.toStockCharge>=value(proposal.wantCash,proposal.wantProperty,proposal.wantStock,proposal.wantQty)*1.05?'accept':'reject',tradeId:proposal.id};}
  if(current(s).id!==id)return null;
  if(p.cash<0){if(p.deposit>0)return {type:'withdraw',amount:p.deposit};const held=Object.entries(p.stocks).find(([,h])=>h.qty>0);if(held)return {type:'stock',stockId:held[0],qty:Math.min(1000,held[1].qty),side:'sell'};const prop=s.properties.find(a=>a.owner===id&&!a.mortgage);if(prop)return {type:'mortgage',tileId:prop.tileId};if(loanLimit(s,p)>=-p.cash+10)return {type:'borrow',amount:money(-p.cash+10)};return {type:'restructure'};}
  if(s.phase==='roll')return {type:'roll',shortcut:(SHORTCUT_ENTRY_TILES as readonly number[]).includes(p.position)&&p.cash>60};
  if(s.phase==='buy'){
    const a=s.properties.find(a=>a.tileId===s.pendingTile)!;
    const quote=propertyPurchaseQuote(s,p.id,a),held=s.reservations?.[a.tileId];
    if(held)return {type:p.cash-quote.total>20?'buy':'decline'};
    if(p.cash-quote.total>20)return {type:'buy'};
    if([34,35].includes(a.tileId)&&p.cash-quote.total*.3>20)return {type:'reserve'};
    return {type:p.cash-landAuctionStartPrice(a.tileId)-antitrustTax(s,p.id,a.tileId)>20?'auction':'decline'};
  }
  if(s.phase==='manage') {
    const reserved=Object.entries(s.reservations??{}).find(([,r])=>r.ownerId===id);
    if(reserved){const due=Math.min(reserved[1].installment,reserved[1].total-reserved[1].paid);if(p.cash-due>40)return {type:'settleReserve',tileId:Number(reserved[0])};}
    const prop=s.properties.find(a=>a.owner===id&&!a.mortgage&&a.level<3&&p.cash>effectiveUpgradeCost(s,p,a.tileId)+100);
    if(prop)return {type:'upgrade',tileId:prop.tileId};
    if(p.debt>0&&p.cash>p.debt+80)return {type:'repay',amount:p.debt};
    const trade=valuationTrade(s,p);if(trade)return trade;
    return {type:'end'};
  }
  return null;
}
