import { randomInt } from 'node:crypto';
import { TILES, CYCLES } from '../shared/catalog';
import { assets, ensureFinanceState, money } from '../shared/finance';
import { STOCK_CATALOG, STOCK_DEVELOPMENT_TILES, linkedStockSectors, revaluationStep, premiumText, stockInfo, type StockId } from '../shared/stockCatalog';
import type { Action, GameState, Player, Stock, StockEvent } from '../shared/types';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const price=(v:number)=>money(clamp(v,1,500));
export const STOCK_MODELS:Record<StockId,{volatility:number;cycle:readonly number[];interest:number;property:number;development:readonly number[]|null}>={
  bank:{volatility:.025,cycle:[0,.03,.04,-.02,-.055],interest:.8,property:.05,development:STOCK_DEVELOPMENT_TILES.bank},
  estate:{volatility:.045,cycle:[0,.10,.15,-.10,-.16],interest:-2.5,property:.35,development:STOCK_DEVELOPMENT_TILES.estate},
  energy:{volatility:.075,cycle:[0,.04,.08,-.025,-.05],interest:-.6,property:.03,development:STOCK_DEVELOPMENT_TILES.energy},
  tech:{volatility:.085,cycle:[0,.08,.11,-.06,-.11],interest:-1.8,property:.02,development:STOCK_DEVELOPMENT_TILES.tech},
  food:{volatility:.020,cycle:[.01,.025,.01,0,-.02],interest:-.4,property:.02,development:STOCK_DEVELOPMENT_TILES.food},
  fun:{volatility:.055,cycle:[0,.075,.10,-.065,-.10],interest:-1,property:.03,development:STOCK_DEVELOPMENT_TILES.fun},
};
export const GLOBAL_MARKET_EVENTS = [
  {id:'boom',title:'经济繁荣',cycle:1,property:1.08,rate:0,description:'企业信心回升，地产与消费行业受益，房价 +8%。',shocks:[.03,.07,.04,.07,.025,.07]},
  {id:'crisis',title:'金融危机',cycle:4,property:.85,rate:.01,description:'风险偏好回落，成长股承压，防守消费相对抗跌，房价 -15%。',shocks:[-.12,-.18,-.12,-.20,-.07,-.16]},
  {id:'bubble',title:'房地产泡沫',cycle:2,property:1.30,rate:0,description:'信贷涌入地产，金融与地产走强，房价 +30%。',shocks:[.05,.12,.01,.025,.01,.04]},
  {id:'correction',title:'房地产调整',cycle:3,property:.70,rate:0,description:'房价 -30%，银行与地产股额外承压。',shocks:[-.12,-.18,-.025,-.035,-.01,-.045]},
  {id:'ai',title:'AI 技术革命',cycle:1,property:1,rate:0,description:'AI 需求扩张，科技行业受益，传统能源短期承压。',shocks:[.01,.015,-.03,.22,.005,.04]},
  {id:'energy',title:'能源危机',cycle:2,property:.98,rate:.01,description:'能源价格抬升，能源企业受益，其他行业成本承压。',shocks:[-.025,-.035,.18,-.045,-.015,-.045]},
  {id:'rate-cut',title:'央行降息',cycle:0,property:1.05,rate:-.01,description:'基准利率降低 1 个百分点，房价 +5%，地产与成长行业融资环境改善。',shocks:[-.015,.06,.025,.055,.015,.035]},
] as const;

type GlobalEventId = typeof GLOBAL_MARKET_EVENTS[number]['id'];
interface EventStory { headline: string; }
/**
 * 底层仍是七类事件，界面显示具体的“新闻标题”。
 * 每个事件类配 3 条叙事；按“事件轮次 / eventEvery”确定序号，
 * 因此内幕预览和真正结算能看到同一条新闻，且同类事件连续发生时会轮换。
 */
export const EVENT_STORIES: Record<GlobalEventId, readonly EventStory[]> = {
  boom: [
    {headline: '新能源订单爆发，港口昼夜运转'},
    {headline: '消费复苏超预期，零售与文旅同步回暖'},
    {headline: '多国基建计划落地，设备订单激增'},
  ],
  crisis: [
    {headline: 'A、B 两国开战，全球运输链中断'},
    {headline: '大型影子银行违约，短期融资市场冻结'},
    {headline: '主要央行激进加息，全球流动性骤然收紧'},
  ],
  bubble: [
    {headline: '滨海新区地王频出，房价一个月跳涨三成'},
    {headline: '低息贷款涌入楼市，排队购房重现'},
    {headline: '海外资本集中扫楼，核心区空置率反降'},
  ],
  correction: [
    {headline: '调控新政落地，二手房挂牌量激增'},
    {headline: '多家房企债务展期，工地停工'},
    {headline: '人口流出叠加高库存，租金回报率跌破底线'},
  ],
  ai: [
    {headline: '大模型突破引爆算力抢购潮'},
    {headline: 'AI 芯片量产良率跃升，数据中心加速扩建'},
    {headline: '自动驾驶商业化落地，科技板块重新定价'},
  ],
  energy: [
    {headline: '主要产油区冲突升级，国际油价跳涨'},
    {headline: '极寒天气击穿电网，天然气库存告急'},
    {headline: '关键矿产出口受限，新能源产业链成本飙升'},
  ],
  'rate-cut': [
    {headline: '央行意外降息，按揭利率同步下调'},
    {headline: '通胀回落打开宽松窗口，市场押注降息周期'},
    {headline: '经济数据走弱，央行提前释放流动性'},
  ],
};

/** 同一事件、同一轮次必须得到同一条叙事，供内幕和真实结算共用。 */
export function eventStory(eventId: string, round: number, eventEvery: number): EventStory | undefined {
  const stories = EVENT_STORIES[eventId as GlobalEventId];
  if (!stories?.length) return undefined;
  const every = Math.max(1, Math.trunc(eventEvery) || 1);
  const occurrence = Math.max(1, Math.floor(Math.max(0, round) / every));
  const categorySeed = [...eventId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return stories[(occurrence + categorySeed) % stories.length];
}

/** Public city data only, normalized and capped: no player's unlimited multiplier. */
export function stockFundamentals(s:GameState,id:string) {
  const info=stockInfo(id),model=STOCK_MODELS[id as StockId];
  if(!info||!model)return {fairValue:1,development:0,developmentBonus:0};
  let development:number;
  if(model.development===null) {
    const finance=s.players.reduce((sum,p)=>sum+Math.max(0,p.debt)+Math.max(0,p.deposit),0)+s.properties.reduce((sum,p)=>sum+Math.max(0,p.mortgage),0);
    development=clamp(finance/Math.max(1,s.players.length*300),0,1);
  }else {
    const properties=s.properties.filter(p=>model.development!.length===0||model.development!.includes(p.tileId));
    development=properties.length?properties.reduce((sum,p)=>sum+(p.owner?.length?(.25+.75*clamp(p.level,0,3)/3):0),0)/properties.length:0;
  }
  const developmentBonus=clamp(development*.10,0,.10);
  const cycle=model.cycle[s.economy.cycle]??0;
  const rate=clamp(model.interest*(s.economy.baseRate-.03),-.18,.12);
  const property=clamp(model.property*(s.economy.propertyIndex-1),-.22,.28);
  const fairValue=clamp(info.base*(1+cycle)*(1+rate)*(1+property)*(1+developmentBonus)*(1+(s.sectorPremium?.[id]??0)),info.base*.60,info.base*2.20);
  return {fairValue,development,developmentBonus};
}
export function refreshMarketInsights(s:GameState) {
  for(const stock of s.stocks) {
    const f=stockFundamentals(s,stock.id),ratio=stock.price/f.fairValue;
    stock.valuation=ratio<.9?'low':ratio>1.1?'high':'fair';
    stock.development=f.development<.25?'early':f.development<.65?'growing':'mature';
  }
}

/** Additive migration: quotes, balances, holdings and their cost basis are preserved. */
export function ensureMarketState(s:GameState) {
  ensureFinanceState(s);
  s.sectorPremium??={};
  s.sectorRevaluationTiles??=s.properties.filter(p=>p.level>=3).map(p=>p.tileId);
  const old=s.marketVersion!==2;
  for(const stock of s.stocks) {
    if(!stock.closes) {
      const history=stock.history.slice(-30),first=Math.max(1,s.round-history.length+1);
      stock.closes=history.map((value,i)=>({round:first+i,price:value}));
    }
    stock.events??=[];
  }
  if(old){s.marketVersion=2;s.lastMarketRound=s.round;}
  s.lastMarketRound??=s.round;
  // 旧存档只有底层分类；从最近一条全球事件日志补出同一轮的新闻标题。
  if(!s.economy.headline&&s.economy.event){
    const category=GLOBAL_MARKET_EVENTS.find(event=>event.title===s.economy.event);
    const lastGlobal=s.logs.find(entry=>entry.kind==='event'&&entry.text.startsWith('全球事件'));
    if(category&&lastGlobal)s.economy.headline=eventStory(category.id,lastGlobal.round,s.rules.eventEvery)?.headline;
  }
  refreshMarketInsights(s);
}
export function createMarketStocks():Stock[] {
  return STOCK_CATALOG.map(info=>({id:info.id,name:info.name,sector:info.sector,price:info.base,previous:info.base,history:[info.base],dividend:info.dividend,closes:[{round:1,price:info.base}],events:[],valuation:'fair',development:'early'}));
}
type MarketOptions={random?:()=>number;eventId?:typeof GLOBAL_MARKET_EVENTS[number]['id']};
export function advanceStockMarket(s:GameState,options:MarketOptions={}) {
  ensureMarketState(s);
  if(s.lastMarketRound!>=s.round)return;
  const random=options.random??(()=>randomInt(1000000)/1000000);
  const logs:{text:string;kind:'event'|'trade'}[]=[];
  let event:typeof GLOBAL_MARKET_EVENTS[number]|undefined;
  // 内幕窗口会提前锁定下一回合的全球事件，这里优先消费它，保证揭示内容与实际结算一致。
  const pinned=s.nextEventId?GLOBAL_MARKET_EVENTS.find(e=>e.id===s.nextEventId):undefined;
  if(s.round%s.rules.eventEvery===0) {
    event=options.eventId?GLOBAL_MARKET_EVENTS.find(e=>e.id===options.eventId):(pinned??GLOBAL_MARKET_EVENTS[Math.min(GLOBAL_MARKET_EVENTS.length-1,Math.floor(random()*GLOBAL_MARKET_EVENTS.length))]);
    if(event){
      const story=eventStory(event.id,s.round,s.rules.eventEvery);
      const headline=story?.headline??event.title;
      s.economy.cycle=event.cycle;s.economy.event=event.title;s.economy.headline=headline;s.economy.description=event.description;
      s.economy.baseRate=money(clamp(s.economy.baseRate+event.rate,.01,.09));
      s.economy.propertyIndex=money(clamp(s.economy.propertyIndex*event.property,.45,2.5));
      logs.push({text:`全球事件 · ${headline}（${event.title}）：${event.description} 当前周期：${CYCLES[event.cycle]}`,kind:'event'});
    }
  }
  const dividends=new Map<string,number>();
  for(const stock of s.stocks) {
    const model=STOCK_MODELS[stock.id as StockId];if(!model)continue;
    const old=stock.price,f=stockFundamentals(s,stock.id),events:Omit<StockEvent,'round'|'price'>[]=[];
    stock.previous=old;
    const noise=(random()*2-1)*model.volatility*f.fairValue;
    const shock=event?event.shocks[STOCK_CATALOG.findIndex(i=>i.id===stock.id)]:0;
    let next=price(old+.35*(f.fairValue-old)+noise+old*shock);
    if(event)events.push({kind:'global',title:event.title,description:event.description,impact:shock});
    if(s.round%5===0) {
      const surprise=clamp((random()*2-1)*.045+(f.fairValue/(stockInfo(stock.id)?.base??f.fairValue)-1)*.12,-.07,.07);
      const verdict=surprise>.012?'beat':surprise<-.012?'miss':'inline';
      const label=verdict==='beat'?'财报超预期':verdict==='miss'?'财报不及预期':'财报符合预期';
      const summary=`${label}：结合行业景气和全城经营表现，财报价格影响 ${surprise>=0?'+':''}${(surprise*100).toFixed(1)}%。`;
      next=price(next*(1+surprise));stock.report={round:s.round,verdict,summary,impact:surprise};
      events.push({kind:'report',title:label,description:summary,impact:surprise});
      // Pay on the pre-ex-dividend quote, then deduct the same gross distribution from price.
      const grossPerShare=next*stock.dividend;dividends.set(stock.id,grossPerShare);
      const net=money(grossPerShare*.9);
      next=price(next-grossPerShare);
      events.push({kind:'dividend',title:'派息 / 除息',description:`每股税后约 ${net.toFixed(2)} 万；报价同步除息，股息税率 10%。`,amount:net});
    }
    stock.price=next;
    stock.history=[...stock.history,next].slice(-30);
    stock.closes=[...(stock.closes??[]).filter(p=>p.round<s.round),{round:s.round,price:next}].slice(-30);
    stock.events=[...(stock.events??[]),...events.map(e=>({...e,round:s.round,price:next}))].filter(e=>e.round>=s.round-29).slice(-90);
  }
  if(dividends.size)for(const player of s.players) {
    const income=money(s.stocks.reduce((sum,stock)=>sum+(player.stocks[stock.id]?.qty??0)*(dividends.get(stock.id)??0),0)*.9);
    if(income){player.cash=money(player.cash+income);logs.push({text:`${player.name} 收到税后股息 ${income} 万（报价已除息）`,kind:'trade'});}
  }
  s.lastMarketRound=s.round;s.nextEventId=undefined;refreshMarketInsights(s);
  return logs;
}

/**
 * 商务会展（35 号）的办展冲击：直接改报价，不改基本面。
 * 因为价格每回合向 fairValue 回归 35%，涨幅会在数回合内自然衰减，
 * 所以主办方只能"提前持有"或"高位出货"，不能无限刷。
 */
export function applyExhibitionShock(s:GameState,boostId:string,diluteId:string,boost:number,dilute:number){
  const apply=(id:string,impact:number)=>{
    const stock=s.stocks.find(a=>a.id===id);if(!stock)return 0;
    const before=stock.price;
    stock.previous=before;
    stock.price=money(clamp(stock.price*(1+impact),1,500));
    return stock.price;
  };
  const boostPrice=apply(boostId,boost),dilutePrice=apply(diluteId,-dilute);
  for(const [id,impact] of [[boostId,boost],[diluteId,-dilute]] as const){
    const stock=s.stocks.find(a=>a.id===id);if(!stock)continue;
    const label=id===boostId?'主题利好':'受分流利空';
    stock.events=[...(stock.events??[]),{round:s.round,kind:'exhibition' as const,title:`商务会展 · ${label}`,description:`${stockInfo(id)?.name} 因会展主题${impact>=0?'走强':'走弱'} ${(Math.abs(impact)*100).toFixed(0)}%；只影响报价，基本面不变，随后逐步回归。`,price:stock.price,impact}].filter(e=>e.round>=s.round-29).slice(-90);
  }
  return {boostPrice,dilutePrice};
}

/** One small rebalance per own round, after property management, with an 80-wan cash reserve. */
export function valuationTrade(s:GameState,p:Player):Action|null {
  if(p.lastStockTradeRound===s.round)return null;
  const total=assets(s,p),stockValue=s.stocks.reduce((sum,st)=>sum+(p.stocks[st.id]?.qty??0)*st.price,0);
  const expensive=s.stocks.filter(st=>(p.stocks[st.id]?.qty??0)>0&&(st.price/stockFundamentals(s,st.id).fairValue>1.14||stockValue>total*.25||p.cash<50)).sort((a,b)=>b.price/stockFundamentals(s,b.id).fairValue-a.price/stockFundamentals(s,a.id).fairValue)[0];
  if(expensive)return {type:'stock',stockId:expensive.id,side:'sell',qty:Math.min(3,p.stocks[expensive.id].qty)};
  if(p.cash<100||p.debt>0||stockValue>=total*.2)return null;
  const cheap=s.stocks.filter(st=>st.price/stockFundamentals(s,st.id).fairValue<.92).sort((a,b)=>a.price/stockFundamentals(s,a.id).fairValue-b.price/stockFundamentals(s,b.id).fairValue);
  for(const stock of cheap) {
    const budget=Math.min(35,p.cash*.12,p.cash-80,total*.2-stockValue,total*.12-(p.stocks[stock.id]?.qty??0)*stock.price);
    const qty=Math.min(3,Math.floor(budget/(stock.price*1.04)));
    if(qty>0)return {type:'stock',stockId:stock.id,side:'buy',qty};
  }
  return null;
}

/** Each lot can trigger once across all owners and rebuilds. Aggregate overlapping links before rotation. */
export function revalueSectorForBuilding(s:GameState,tileId:number):string[] {
  if(s.sectorRevaluationTiles?.includes(tileId))return [];
  s.sectorRevaluationTiles??=[];s.sectorRevaluationTiles.push(tileId);s.sectorPremium??={};
  const links=linkedStockSectors(tileId);if(!links.length)return [];
  const premium=new Map<string,number>(),shock=new Map<string,number>();
  const messages=links.map(info=>{
    const tiles=STOCK_MODELS[info.id].development!;
    const rank=s.properties.filter(p=>p.level>=3&&tiles.includes(p.tileId)).length;
    const step=revaluationStep(rank);
    for(const stock of STOCK_CATALOG){
      premium.set(stock.id,(premium.get(stock.id)??0)+(stock.id===info.id?step.premium:-step.premium/5));
      shock.set(stock.id,(shock.get(stock.id)??0)+(stock.id===info.id?step.shock:-step.shock/5));
    }
    return `「${TILES[tileId].name}」封顶 · ${info.name} 第 ${rank} 栋三级建筑，板块重估 ${premiumText(step.premium)}、即时冲击 ${premiumText(step.shock)}，其余五板块均摊资金流出`;
  });
  for(const stock of s.stocks){
    const delta=premium.get(stock.id)??0,impact=shock.get(stock.id)??0;
    s.sectorPremium[stock.id]=Math.round(((s.sectorPremium[stock.id]??0)+delta)*1e12)/1e12;
    stock.price=price(stock.price*(1+impact));
    stock.history=stock.history.length?[...stock.history.slice(0,-1),stock.price]:[stock.price];
    stock.closes=[...(stock.closes??[]).filter(point=>point.round!==s.round),{round:s.round,price:stock.price}].slice(-30);
    stock.events=[...(stock.events??[]),{round:s.round,kind:'revaluation' as const,title:`${TILES[tileId].name} · 板块重估`,description:`${messages.join('；')}。本板块合计基本面 ${premiumText(delta)}、即时价格 ${premiumText(impact)}；累计重估 ${premiumText(s.sectorPremium[stock.id])}。同一地块不重复触发。`,price:stock.price,impact}].filter(e=>e.round>=s.round-29).slice(-90);
  }
  refreshMarketInsights(s);return messages;
}
