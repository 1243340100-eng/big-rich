import {landAuctionStartPrice} from '../../shared/auctions';
import {TILES} from '../../shared/catalog';
import {propertyRent,propertyRentBreakdown,propertyPurchaseQuote,propertyValue,propertyOperatingIncomeBreakdown} from '../../shared/finance';
import {DISTRICT_PROFILES,districtOf} from '../../shared/districts';
import type {GameState} from '../../shared/types';

const amount=(value:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value);

/** Read-only landing preview, derived from the latest public room state. */
export function tileInfo(state:GameState,tileId:number,viewerId?:string){
  const tile=TILES[tileId];if(!tile)return null;
  const property=state.properties.find(item=>item.tileId===tileId);
  const owner=state.players.find(player=>player.id===property?.owner);
  const mine=!!viewerId&&property?.owner===viewerId;
  const operating=property?propertyOperatingIncomeBreakdown(state,property,!property.owner):null;
  const result={tile,owner:property?.owner?(owner?`${owner.name}${mine?'（你）':''}`:'其他玩家'):tile.type==='property'?'市有土地 · 无人持有':'城市公有 · 不可购买',purpose:'',arrival:'',value:property?propertyValue(state,property):null,rent:property?propertyRent(state,property):null,level:property?.level??null,mortgaged:!!property?.mortgage,operatingIncome:operating?.net??0,operatingGross:operating?.gross??0,operatingHeat:operating?.heat??0,operatingDistrict:operating?.district??1,tags:[] as string[]};
  switch(tile.type){
    case 'property':
      result.purpose='买入后可升级，向其他玩家收取租金，并每回合获得经营收益。';
      if(property){
        if(property.mortgage)result.tags.push('抵押中：经营收益暂停');
        else result.tags.push(`经营 +${amount(result.operatingIncome)} 万/回合`);
        result.tags.push(`${DISTRICT_PROFILES[districtOf(tile.district)].label}街区`);
        const rent=propertyRentBreakdown(state,property);result.tags.push(`垄断 +${Math.round(rent.districtBonus*100)}%`,`租金周期 ×${rent.rawCycle}`);if(rent.headquartersBonus>0)result.tags.push(`总部商务 +${Math.round(rent.headquartersBonus*100)}%`);if(property.level>=3){result.tags.push('三级抗周期：不受折价','抵押率 75%');if(state.economy.propertyIndex<1)result.tags.push('三级估值：跌幅减半');}
        if(result.operatingDistrict!==1)result.tags.push(`经营街区 ×${result.operatingDistrict.toFixed(2)}`);
        if(result.operatingHeat>0)result.tags.push('经营风口 +20%');
        else if(result.operatingHeat<0)result.tags.push('经营风口 -10%');
      }

      if(!property?.owner){
        const quote=property&&viewerId?propertyPurchaseQuote(state,viewerId,property):null,held=state.reservations?.[tileId];
        if(held)result.arrival=held.ownerId===viewerId?'这是你预定的地块，可支付分期尾款，付清后取得地产。':`此地块已被预定，可全款 ${amount(quote?.total??result.value??tile.price)} 万截胡或跳过，不参与拍卖。`;
        else result.arrival=`可以 ${amount(quote?.total??result.value??tile.price)} 万买入${quote?`（含反垄断税 ${amount(quote.tax)} 万）`:''}；买入后经营 +${amount(result.operatingIncome)} 万/回合；可 ${amount(landAuctionStartPrice(tileId))} 万起拍或跳过不买。`;
      }
      else if(mine)result.arrival=property.mortgage?'这是你的地产，抵押期间不付租金，但暂停收租与经营收益。':`这是你的地产，停留不付租金；每回合经营 +${amount(result.operatingIncome)} 万已入账。`;
      else if(property.mortgage)result.arrival='此地产已抵押，停留不收取租金，业主经营收益也暂停。';
      else result.arrival=viewerId?`需向${owner?.name??'业主'}支付 ${amount(result.rent??0)} 万租金；业主另有经营收益。`:`非业主停留需支付 ${amount(result.rent??0)} 万租金。`;
      break;
    case 'start':result.purpose='城市起点 · 领取职业工资。';result.arrival='经过或停留都会领取税后工资，金额取决于职业和当前经济周期。';break;
    case 'bank':result.purpose=tile.id===32?'捷径内的金融服务站 · 可申请过桥资金。':'办理存款、取款、贷款和还款。';result.arrival=tile.id===32?'停留可申请一笔无抵押过桥资金：净资产的 40%，每个人回合利息 2%，6 回合内归还，逾期另罚 20%（每局一次）。':'停留不会自动扣费或发钱；银行服务可在资产面板主动办理。';break;
    case 'exchange':result.purpose=tile.id===33?'捷径内的创投交易所 · 可购买内幕。':'查看行情，买卖股票。';result.arrival=tile.id===33?'停留可花 15 万提前看到下一回合的全球事件，每局 2 次。':'停留无额外收费；股票交易可在其他玩家回合主动操作。';break;
    case 'tax':result.purpose='缴纳城市特别税。';result.arrival='停留扣除净资产的 2.5%，最低支付 5 万。';break;
    case 'event':result.purpose='触发一项随机城市事件。';result.arrival='可能获得税后奖励，也可能支付维修或建设费用。';break;
    case 'transport':
      result.purpose=[5,6,7,21,22,23].includes(tile.id)?'内街入口 · 从这里起步时可以选择拐进内街。':'捷径出口 · 汇入主环道路。';
      result.arrival=[5,6,7,21,22,23].includes(tile.id)?'从此地（以及入口前后各一格）出发时可选择拐入内街：免费，沿 6 格街道正常前进，走完汇入出口。':'停留无额外收费，下一次移动沿主环继续。';break;
    case 'casino':result.purpose='星港赌场 · 可选牛熊轮盘玩法。';result.arrival='本回合停留后可选择入场；每转有 25% 筹码归零风险，不入场不扣费。';break;
  }
  return result;
}
