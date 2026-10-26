import type { GameState, Player, Property,Trade } from './types';
import { TILES } from './catalog';
import { BRIDGE, archetypeProfile, businessRentBonus, headquartersLevel, HQ_TAX_RELIEF, HQ_UPGRADE_RELIEF } from './shortcuts';
import { districtCycleMultiplier, districtEventHeat } from './districts';
export const money = (n: number) => Math.round(n*100)/100;
export const RENT_LEVELS=[1,1.9,2.8,4.2] as const;
export const RENT_CYCLES=[1,1.2,1.3,.85,.65] as const;
export function propertyValue(s:GameState,p:Property){
  const prof=archetypeProfile(p.tileId);
  const index=s.economy.propertyIndex;
  const shielded=p.level>=3&&prof.shield&&index<1?1+(index-1)*.5:index;
  return money(TILES[p.tileId].price*(1+p.level*.6)*shielded*prof.value);
}
export function districtHoldingCount(s:GameState,ownerId:string,tileId:number){return s.properties.filter(p=>p.owner===ownerId&&TILES[p.tileId].district===TILES[tileId].district).length;}
export function propertyRentBreakdown(s:GameState,p:Property){
  const actual=s.properties.find(a=>a.tileId===p.tileId);
  const ownerId=p.owner??null;
  const held=ownerId?districtHoldingCount(s,ownerId,p.tileId)+(actual?.owner===ownerId?0:1):0;
  const districtBonus=money(Math.min(4,Math.max(0,held-1))*.15);
  // 34 总部商厦的商务租金加成与垄断加成加法叠加，不乘算。
  const headquartersBonus=businessRentBonus(s,ownerId,p);
  const rawCycle=RENT_CYCLES[s.economy.cycle]??1,cycle=p.level>=3?Math.max(1,rawCycle):rawCycle;
  const level=RENT_LEVELS[p.level]??RENT_LEVELS[3];
  const prof=archetypeProfile(p.tileId);
  const rent=p.mortgage?0:money(TILES[p.tileId].rent*level*cycle*(1+districtBonus+headquartersBonus)*prof.rent);
  return {rent,held,districtBonus,headquartersBonus,rawCycle,cycle,level,protected:p.level>=3&&rawCycle<1&&prof.shield,archetypeRent:prof.rent};
}
export const propertyRent=(s:GameState,p:Property)=>propertyRentBreakdown(s,p).rent;

/**
 * 地产经营收益：只要持有且未抵押，每个自己的回合开始时自动入账。
 * 与“过路租金”分开：
 * - 经营收益按基础租金、等级、全局周期、街区性格和事件风口计算；
 * - 不再叠加垄断、总部商务加成，避免和租金乘算爆炸；
 * - 税后 90% 进入现金，10% 作为经营所得税。
 */
export const OPERATING_INCOME_RATE = .20 as const;
export const OPERATING_INCOME_LEVEL = [1, 1.75, 2.9, 4.8] as const;
export const OPERATING_INCOME_TAX = .10 as const;
export interface OperatingIncomeBreakdown {
  gross:number; tax:number; net:number; level:number; cycle:number; district:number; heat:number;
}
export function propertyOperatingIncomeBreakdown(s:GameState,p:Property,preview=false):OperatingIncomeBreakdown {
  const level=Math.max(0,Math.min(3,Math.trunc(p.level)));
  const rawCycle=RENT_CYCLES[s.economy.cycle]??1;
  const cycle=level>=3?Math.max(1,rawCycle):rawCycle;
  const district=districtCycleMultiplier(TILES[p.tileId].district,s.economy.cycle);
  const heat=districtEventHeat(s.economy.event,TILES[p.tileId].district);
  const base=TILES[p.tileId].rent*archetypeProfile(p.tileId).rent*OPERATING_INCOME_RATE;
  // preview 用于空地预览：尚未过户或已抵押时也展示“买入后”的收益。
  const suspended=!preview&&(p.mortgage>0||!p.owner);
  const gross=suspended?0:money(base*(OPERATING_INCOME_LEVEL[level]??1)*cycle*district*(1+heat));
  const tax=money(gross*OPERATING_INCOME_TAX);
  return {gross,tax,net:money(gross-tax),level,cycle,district,heat};
}
export const propertyOperatingIncome=(s:GameState,p:Property,preview=false)=>propertyOperatingIncomeBreakdown(s,p,preview).net;
export function operatingIncomeForPlayer(s:GameState,p:Player) {
  return money(s.properties.filter(a=>a.owner===p.id).reduce((n,a)=>n+propertyOperatingIncome(s,a),0));
}
export const mortgageRate=(p:Property)=>{const prof=archetypeProfile(p.tileId);return Math.round(prof.mortgage*(p.level>=3?1.25:1)*100)/100;};
export const mortgageAmount=(s:GameState,p:Property)=>money(propertyValue(s,p)*mortgageRate(p));
export function antitrustTax(s:GameState,buyerId:string,tileId:number){
  if(!buyerId||TILES[tileId]?.type!=='property'||s.properties.find(p=>p.tileId===tileId)?.owner===buyerId)return 0;
  const held=districtHoldingCount(s,buyerId,tileId);
  return held>=2?money(TILES[tileId].price*(held-1)*.25):0;
}
export function propertyPurchaseQuote(s:GameState,buyerId:string,p:Property){const price=propertyValue(s,p),tax=antitrustTax(s,buyerId,p.tileId);return {price,tax,total:money(price+tax)};}
export function auctionReserve(s:GameState,playerId:string){return s.auction?.bidder===playerId?money(s.auction.highest+antitrustTax(s,playerId,s.auction.tileId)):0;}
export const stockFeeRate=(p:Player,stockId:string)=>(p.job==='投资经理'||p.job==='程序员'&&stockId==='tech') ? .005 : .01;
/** Settle all stock legs at the public quote, including gifts and barter, to prevent price-based tax avoidance. */
export function stockTransferQuote(s:GameState,fromId:string,toId:string,stockId:string|null|undefined,qty=0){
  const stock=s.stocks.find(st=>st.id===stockId),from=s.players.find(p=>p.id===fromId),to=s.players.find(p=>p.id===toId);
  const holding=from?.stocks[stockId??''];
  if(!stock||!from||!to||!Number.isInteger(qty)||qty<=0)return {stockId:null,qty:0,gross:0,basis:0,fee:0,tax:0,recipientFee:0,recipientBasis:0};
  const gross=money(stock.price*qty),basis=holding?.qty?money(holding.cost/holding.qty*qty):0;
  const fee=money(gross*stockFeeRate(from,stock.id)),tax=money(Math.max(0,gross-basis)*.1),recipientFee=money(gross*stockFeeRate(to,stock.id));
  return {stockId:stock.id,qty,gross,basis,fee,tax,recipientFee,recipientBasis:money(gross+recipientFee)};
}
export type TradeStockQuote=ReturnType<typeof stockTransferQuote>;
type TradeLegs=Pick<Trade,'from'|'to'|'giveCash'|'wantCash'|'giveProperty'|'wantProperty'>&Partial<Pick<Trade,'giveStock'|'wantStock'|'giveQty'|'wantQty'>>;
/** Freeze both tax bases before any transfer, then reserve against final property holdings. */
export function tradeSettlementQuote(s:GameState,t:TradeLegs){
  const fromTax=t.wantProperty===null?0:antitrustTax(s,t.from,t.wantProperty),toTax=t.giveProperty===null?0:antitrustTax(s,t.to,t.giveProperty);
  const giveStockQuote=stockTransferQuote(s,t.from,t.to,t.giveStock,t.giveQty),wantStockQuote=stockTransferQuote(s,t.to,t.from,t.wantStock,t.wantQty);
  const fromStockFee=money(giveStockQuote.fee+wantStockQuote.recipientFee),toStockFee=money(wantStockQuote.fee+giveStockQuote.recipientFee);
  const fromStockTax=giveStockQuote.tax,toStockTax=wantStockQuote.tax,fromStockCharge=money(fromStockFee+fromStockTax),toStockCharge=money(toStockFee+toStockTax);
  const next={...s,properties:s.properties.map(p=>p.tileId===t.giveProperty?{...p,owner:t.to}:p.tileId===t.wantProperty?{...p,owner:t.from}:p)};
  return {fromTax,toTax,fromStockFee,toStockFee,fromStockTax,toStockTax,fromStockCharge,toStockCharge,giveStockQuote,wantStockQuote,fromCash:money((s.players.find(p=>p.id===t.from)?.cash??0)-t.giveCash+t.wantCash-fromTax-fromStockCharge),toCash:money((s.players.find(p=>p.id===t.to)?.cash??0)+t.giveCash-t.wantCash-toTax-toStockCharge),fromReserved:auctionReserve(next,t.from),toReserved:auctionReserve(next,t.to)};
}
/** Additive migration; active legacy loans have consumed their one-shot benefit. */
export function ensureFinanceState(s:GameState){
  let changed=false;
  for(const p of s.players)if(p.bridgeLoanUsed===undefined||p.bridgeLoan&&!p.bridgeLoanUsed){p.bridgeLoanUsed=!!p.bridgeLoan;changed=true;}
  return changed;
}
export function restructuringQuote(s:GameState,p:Player){
  const liquid=money(s.stocks.reduce((n,st)=>n+(p.stocks[st.id]?.qty??0)*st.price*.9,0)+p.deposit);
  const cancelledReservations=Object.entries(s.reservations??{}).filter(([,r])=>r.ownerId===p.id).map(([id])=>Number(id));
  const forfeited=money(cancelledReservations.reduce((sum,id)=>sum+s.reservations![id].paid,0));
  return {debtAfter:money(Math.max(0,totalDebt(s,p)-p.cash-liquid)*.2),liquid,cancelledReservations,forfeited};
}
export const assets = (s: GameState,p: Player) => money(p.cash+p.deposit+s.properties.filter(a=>a.owner===p.id).reduce((n,a)=>n+propertyValue(s,a),0)+s.stocks.reduce((n,a)=>n+(p.stocks[a.id]?.qty??0)*a.price,0));
export const totalDebt = (s: GameState,p: Player) => money(p.debt+(p.bridgeLoan?.principal??0)+s.properties.filter(a=>a.owner===p.id).reduce((n,a)=>n+a.mortgage,0));
export const netWorth = (s: GameState,p: Player) => money(assets(s,p)-totalDebt(s,p));
export const credit = (s: GameState,p: Player) => { if(p.defaults>0) return 'D'; const ratio=totalDebt(s,p)/Math.max(1,assets(s,p)); return ratio<.15?'AAA':ratio<.3?'AA':ratio<.45?'A':ratio<.6?'B':'C'; };
export const loanRate = (s: GameState,p: Player) => Math.max(.01,({AAA:.03,AA:.05,A:.07,B:.1,C:.15,D:.2}[credit(s,p)]??.2)+s.economy.baseRate-.03-(p.job==='银行家'?.01:0));
export const loanLimit = (s: GameState,p: Player) => credit(s,p)==='D'?0: Math.max(0,money(60+(assets(s,p)-p.cash)*.35-p.debt));
export const upgradeCost = (p: Player,tileId: number) => money(TILES[tileId].price*.45*(p.job==='房地产商'?.85:1)*archetypeProfile(tileId).upgrade);

/** 集团总部（34 号 Lv.3）为其他地块的升级费再减免 20%，与职业折扣合计封顶 30%。 */
export function effectiveUpgradeCost(s:GameState,p:Player,tileId:number){
  const hq=headquartersLevel(s,p.id);
  const jobRelief=p.job==='房地产商'?.15:0;
  const hqRelief=tileId===34?0:(hq>=3?HQ_UPGRADE_RELIEF[3]:0);
  return money(TILES[tileId].price*.45*(1-Math.min(.30,jobRelief+hqRelief))*archetypeProfile(tileId).upgrade);
}

/** Bank liquidation never uses the level-3 valuation shield or district rent bonus. */
export function bankSaleQuote(s:GameState,p:Property){
  const price=TILES[p.tileId].price;
  const rawValue=money(price*(1+p.level*.6)*s.economy.propertyIndex);
  const invested=money(price*s.economy.propertyIndex+price*.45*archetypeProfile(p.tileId).upgrade*p.level);
  const marketOffer=money(rawValue*.7),cap=money(invested*.85);
  const gross=Math.min(marketOffer,cap);
  return {rawValue,invested,marketOffer,cap,gross,mortgage:p.mortgage,net:money(gross-p.mortgage),capped:cap<marketOffer};
}

// Shared by the authoritative settlement and the conservative client preview.
// Deposit interest stays in the deposit; it does not pay the cash expenses.
export function settlementQuote(s:GameState,p:Player) {
  const owned=s.properties.filter(a=>a.owner===p.id);
  const value=owned.reduce((n,a)=>n+propertyValue(s,a),0);
  const interest=money(p.debt*loanRate(s,p)+(p.bridgeLoan?.principal??0)*BRIDGE.rate+owned.reduce((n,a)=>n+a.mortgage*(s.economy.baseRate+.02),0));
  // 34 总部商厦的税务优化：只作用于本人，Lv.3 覆盖 Lv.1 不累加。
  const hq=headquartersLevel(s,p.id),relief=hq>=0?HQ_TAX_RELIEF[hq]:0;
  const grossTax=value*.008+Math.max(0,value-500)*.01;
  const tax=money(grossTax*(1-relief));
  const upkeep=money(owned.reduce((n,a)=>n+a.level*.6,0)*(p.job==='企业家'?.8:1));
  const depositIncome=money(p.deposit*.01);
  const operatingIncome=operatingIncomeForPlayer(s,p);
  const fixed=money(interest+tax+upkeep);
  return {interest,tax,upkeep,depositIncome,operatingIncome,fixed,total:money(depositIncome+operatingIncome-fixed)};
}
