export const STOCK_CATALOG = [
  {id:'bank',name:'星海银行',sector:'金融',base:12,dividend:.03,profile:'防守金融 · 低波动',factors:['基准利率','贷款、抵押与存款规模','金融事件']},
  {id:'estate',name:'城市地产',sector:'地产',base:10,dividend:.02,profile:'周期地产 · 中波动',factors:['房产指数','全城地产开发','基准利率']},
  {id:'energy',name:'新能集团',sector:'能源',base:15,dividend:.025,profile:'能源资源 · 高波动',factors:['能源事件','未来产业开发','经济周期']},
  {id:'tech',name:'NEO 科技',sector:'科技',base:20,dividend:.01,profile:'科技成长 · 高波动',factors:['AI 行业事件','科技园区与总部开发','基准利率']},
  {id:'food',name:'快乐食品',sector:'消费',base:8,dividend:.04,profile:'防守消费 · 低波动',factors:['全城消费与文旅开发','稳定股息','经济周期']},
  {id:'fun',name:'PIXEL 娱乐',sector:'文旅',base:9,dividend:.02,profile:'文旅情绪 · 中高波动',factors:['影院、酒店与度假村开发','消费景气','行业事件']},
] as const;
export type StockId=typeof STOCK_CATALOG[number]['id'];
export const stockInfo=(id:string)=>STOCK_CATALOG.find(stock=>stock.id===id);
export const valuationText={low:'偏低',fair:'合理',high:'偏高'} as const;
export const developmentText={early:'起步',growing:'发展',mature:'成熟'} as const;

export const STOCK_DEVELOPMENT_TILES:Record<StockId,readonly number[]|null>={bank:null,estate:[],energy:[23,24,26,28,31],tech:[10,28,31],food:[8,12,17,18,20,21,35],fun:[17,18,20,21]};
export const linkedStockSectors=(tileId:number)=>STOCK_CATALOG.filter(stock=>STOCK_DEVELOPMENT_TILES[stock.id]?.includes(tileId));
export const revaluationStep=(rank:number)=>({premium:[.15,.08,.04,.02][Math.min(3,Math.max(0,rank-1))],shock:[.08,.04,.02,.01][Math.min(3,Math.max(0,rank-1))]});
export const premiumText=(value:number)=>`${value>=0?'+':''}${Number((value*100).toFixed(2))}%`;
