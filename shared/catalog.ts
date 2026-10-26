import type { Tile, Job } from './types';
export const JOBS: Job[] = ['程序员', '银行家', '房地产商', '投资经理', '企业家', '公务员'];
export const JOB_DESCRIPTIONS = ['过起点工资 26 万，科技股手续费减半', '贷款利率降低 1 个百分点', '地产升级费用减少 15%', '全部股票交易手续费减半', '每轮地产维护费减少 20%（MVP 特性）', '工资 22 万，不受经济衰退影响'];
export const COLORS = ['#66d9bc', '#c3a5ff', '#ffb678', '#77b9ff', '#f291b1', '#d5da79', '#f17f69', '#a6bac6'];
const names = ['城市起点','梧桐里','市政消息','银杏公寓','城市银行','湖畔住宅','金融入口','花园洋房','滨河商街','证券交易所','创意工坊','城市税务','中央广场','时代写字楼','金融出口','天际中心','城市公园','星光影院','海湾酒店','星港赌场','艺术剧院','滨海度假村','商业入口','未来工场','绿色能源','城市银行','物流仓库','市场消息','科技园区','城市税务','商业出口','云端总部'];
const specials: Record<number, Tile['type']> = {0:'start',2:'event',4:'bank',6:'transport',9:'exchange',11:'tax',14:'transport',16:'event',19:'casino',22:'transport',25:'bank',27:'event',29:'tax',30:'transport'};
export const TILES: Tile[] = names.map((name,id) => {
  const side = Math.floor(id/8), step=id%8;
  const x=side===0 ? -8+step*2 : side===1 ? 8 : side===2 ? 8-step*2 : -8;
  const z=side===0 ? 8 : side===1 ? 8-step*2 : side===2 ? -8 : -8+step*2;
  const district=['花园住区','中央商区','海湾文旅','未来产业'][side];
  return {id,name,type:specials[id] ?? 'property',district,price:45+side*24+step*6,rent:5+side*3+Math.floor(step/2),color:['#7caf91','#d8ae71','#ac9cc6','#7aa9c1'][side],x,z};
});
TILES.push(
  {id:32,name:'金融服务站',type:'bank',district:'金融捷径',price:0,rent:0,color:'#79b9af',x:4,z:3},
  {id:33,name:'创投交易所',type:'exchange',district:'金融捷径',price:0,rent:0,color:'#79b9af',x:4,z:-1},
  {id:34,name:'总部商厦',type:'property',district:'商业捷径',price:120,rent:22,color:'#d5af7a',x:-4,z:-3},
  {id:35,name:'商务会展',type:'property',district:'商业捷径',price:110,rent:20,color:'#d5af7a',x:-4,z:1},
  // 内区街区化：两条内街各补 3 块可买地产，路线从 3 步拉长到 6 步（主环 6→14 是 8 步）。
  {id:36,name:'交易大厅',type:'property',district:'金融捷径',price:70,rent:8,color:'#79b9af',x:4,z:5},
  {id:37,name:'量化工坊',type:'property',district:'金融捷径',price:95,rent:13,color:'#79b9af',x:4,z:1,archetype:'speculative'},
  {id:38,name:'保管库',type:'property',district:'金融捷径',price:60,rent:6,color:'#79b9af',x:4,z:-3},
  {id:39,name:'采购中心',type:'property',district:'商业捷径',price:80,rent:8,color:'#d5af7a',x:-4,z:-5},
  {id:40,name:'品牌旗舰',type:'property',district:'商业捷径',price:120,rent:11,color:'#d5af7a',x:-4,z:-1,archetype:'anchor'},
  {id:41,name:'仓储档口',type:'property',district:'商业捷径',price:65,rent:6,color:'#d5af7a',x:-4,z:3},
);
export const CYCLES = ['复苏', '繁荣', '过热', '衰退', '危机'];
/** 内区街道的固定后继：入口进来先走内街，走完才汇入主环。 */
const INNER_NEXT: Record<number, number> = {36:32,32:37,37:33,33:38,38:14,39:34,34:40,40:35,35:41,41:30};
/** 入口及其前后各一格都可以拐进内街。 */
export const SHORTCUT_MOUTH: Record<number, number> = {5:36,6:36,7:36,21:39,22:39,23:39};
export const nextTile = (position: number, shortcut=false): number => {
  const inner = INNER_NEXT[position];
  if (inner !== undefined) return inner;
  const mouth = shortcut ? SHORTCUT_MOUTH[position] : undefined;
  return mouth !== undefined ? mouth : (position + 1) % 32;
};
