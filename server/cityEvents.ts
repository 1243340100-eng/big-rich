import {TILES} from '../shared/catalog';
import {money,propertyValue} from '../shared/finance';
import {pickCityEvent, type CityEvent} from '../shared/cityEvents';
import {STOCK_CATALOG} from '../shared/stockCatalog';
import type {CityEventResult, GameState, Player} from '../shared/types';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const roll=(random:()=>number)=>Math.max(0,Math.min(.999999,Number(random())||0));
const tax=(amount:number)=>amount>0?money(amount*.9):amount;
const addCash=(player:Player,amount:number)=>{player.cash=money(player.cash+amount);};
const pct=(value:number)=>`${value>=0?'+':''}${Math.round(value*100)}%`;
const stockName=(id:string)=>STOCK_CATALOG.find(stock=>stock.id===id)?.name??id;

/** 城市事件里的股价消息只改报价和消息记录，不改基本面；dispatch 末尾会刷新估值。 */
function applyStockNews(s:GameState,event:CityEvent,impacts:Record<string,number>) {
  for(const [stockId,impact] of Object.entries(impacts)) {
    if(!Number.isFinite(impact)||impact===0)continue;
    const stock=s.stocks.find(item=>item.id===stockId);if(!stock)continue;
    const before=stock.price;
    stock.previous=before;
    stock.price=money(clamp(before*(1+impact),1,500));
    stock.history=[...stock.history,stock.price].slice(-30);
    stock.closes=[...(stock.closes??[]).filter(point=>point.round<s.round),{round:s.round,price:stock.price}].slice(-30);
    stock.events=[...(stock.events??[]),{
      round:s.round,kind:'city' as const,title:event.title,
      description:`${event.description}（${stock.name} ${pct(impact)}）`,
      price:stock.price,impact,
    }].filter(entry=>entry.round>=s.round-29).slice(-90);
  }
}

export function resolveCityEvent(s:GameState,p:Player,event:CityEvent,random:()=>number):CityEventResult {
  let amount=0,effectText='',global=false;
  let impacts:Record<string,number>={};
  const effect=event.effect;
  switch(effect.kind) {
    case 'cash': {
      amount=tax(effect.amount);
      addCash(p,amount);
      effectText=amount>=0?`税后 +${amount} 万`:`支付 ${-amount} 万`;
      break;
    }
    case 'districtCash': {
      const owned=s.properties.filter(a=>a.owner===p.id&&TILES[a.tileId].district===effect.district);
      const gross=money(Math.min(effect.cap,owned.length*effect.perTile));
      amount=tax(gross);
      addCash(p,amount);
      effectText=owned.length
        ?`${effect.district} ${owned.length} 块，税后 +${amount} 万（上限 ${effect.cap} 万）`
        :`没有持有${effect.district}地块，未获得补偿`;
      break;
    }
    case 'globalCash': {
      const perPlayer=tax(effect.amount);
      for(const player of s.players)addCash(player,perPlayer);
      amount=perPlayer;global=true;
      effectText=`全体玩家各 ${perPlayer>=0?'+':''}${perPlayer} 万（税后）`;
      break;
    }
    case 'portfolioTax': {
      const owned=s.properties.filter(a=>a.owner===p.id);
      if(owned.length<effect.minProperties) {
        effectText=`持有 ${owned.length} 块地产，未达到 ${effect.minProperties} 块，未触发稽查`;
      } else {
        const value=money(owned.reduce((sum,a)=>sum+propertyValue(s,a),0));
        const fee=money(Math.min(effect.cap,value*effect.rate));
        addCash(p,-fee);amount=-fee;
        effectText=`按地产总值 ${value} 万的 ${(effect.rate*100).toFixed(1)}% 缴税 ${fee} 万`;
      }
      break;
    }
    case 'stockShock': {
      impacts={...effect.impacts};
      applyStockNews(s,event,impacts);
      effectText=Object.entries(impacts).map(([id,value])=>`${stockName(id)} ${pct(value)}`).join('，');
      break;
    }
    case 'randomStockShock': {
      const stock=STOCK_CATALOG[Math.floor(roll(random)*STOCK_CATALOG.length)];
      const direction=effect.direction==='either'?(roll(random)<.5?-1:1):effect.direction==='up'?1:-1;
      const impact=direction*effect.magnitude;
      impacts={[stock.id]:impact};
      applyStockNews(s,event,impacts);
      effectText=`${stock.name} ${pct(impact)}`;
      break;
    }
    case 'mergerShock': {
      const upIndex=Math.floor(roll(random)*STOCK_CATALOG.length);
      const downIndex=(upIndex+1+Math.floor(roll(random)*(STOCK_CATALOG.length-1)))%STOCK_CATALOG.length;
      const up=STOCK_CATALOG[upIndex],down=STOCK_CATALOG[downIndex];
      impacts={[up.id]:effect.up,[down.id]:-effect.down};
      applyStockNews(s,event,impacts);
      effectText=`${up.name} ${pct(effect.up)}，${down.name} ${pct(-effect.down)}`;
      break;
    }
  }
  return {id:event.id,tileId:event.tileId,playerId:p.id,title:event.title,description:event.description,rarity:event.rarity,amount,effectText,global,impacts};
}

export function drawCityEvent(s:GameState,p:Player,tileId:number,random:()=>number):CityEventResult|undefined {
  const event=pickCityEvent(tileId,random);
  return event?resolveCityEvent(s,p,event,random):undefined;
}
