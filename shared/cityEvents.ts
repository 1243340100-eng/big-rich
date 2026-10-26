import type {StockId} from './stockCatalog';

export type CityEventTile = 2 | 16 | 27;
export type CityEventRarity = 'common' | 'uncommon' | 'rare';

export type CityEventEffect =
  | {kind: 'cash'; amount: number}
  | {kind: 'districtCash'; district: string; perTile: number; cap: number}
  | {kind: 'globalCash'; amount: number}
  | {kind: 'portfolioTax'; minProperties: number; rate: number; cap: number}
  | {kind: 'stockShock'; impacts: Partial<Record<StockId, number>>}
  | {kind: 'randomStockShock'; magnitude: number; direction: 'up' | 'down' | 'either'}
  | {kind: 'mergerShock'; up: number; down: number};

export interface CityEvent {
  id: string;
  tileId: CityEventTile;
  title: string;
  description: string;
  rarity: CityEventRarity;
  effect: CityEventEffect;
}

/** 普通 60% / 少见 30% / 稀有 10%（每池 2+2+2 条）。 */
export const CITY_EVENT_WEIGHTS: Record<CityEventRarity, number> = {common: 12, uncommon: 6, rare: 2};

export const CITY_EVENTS: Record<CityEventTile, readonly CityEvent[]> = {
  2: [
    {id: 'municipal-subsidy', tileId: 2, title: '市政补贴到账', description: '市财政拨付街区更新补贴，款项直接打到你的账户。', rarity: 'common', effect: {kind: 'cash', amount: 12}},
    {id: 'municipal-repair', tileId: 2, title: '地下管网抢修', description: '老街管网爆裂，市政要求沿线业主分摊抢修费用。', rarity: 'common', effect: {kind: 'cash', amount: -8}},
    {id: 'municipal-redevelop', tileId: 2, title: '旧城改造启动', description: '花园住区列入旧改名单，按你持有的地块发放补偿，每块 6 万。', rarity: 'uncommon', effect: {kind: 'districtCash', district: '花园住区', perTile: 6, cap: 30}},
    {id: 'municipal-infra', tileId: 2, title: '新区基建招标', description: '未来产业区启动道路与数据中心招标，持有地块按每块 8 万获得工程补偿。', rarity: 'uncommon', effect: {kind: 'districtCash', district: '未来产业', perTile: 8, cap: 40}},
    {id: 'municipal-audit', tileId: 2, title: '税务稽查突袭', description: '税务部门抽查多套持有物业；持有 4 块以上需按地产总值 0.8% 补税，上限 30 万。', rarity: 'rare', effect: {kind: 'portfolioTax', minProperties: 4, rate: .008, cap: 30}},
    {id: 'municipal-festival', tileId: 2, title: '建城纪念日', description: '全城庆典，市政向每位投资人发放 8 万消费红包。', rarity: 'rare', effect: {kind: 'globalCash', amount: 8}},
  ],
  16: [
    {id: 'park-market', tileId: 16, title: '公园周末市集', description: '摊位租金与客流分成到账，城市公园迎来久违的热闹。', rarity: 'common', effect: {kind: 'cash', amount: 8}},
    {id: 'park-lawn', tileId: 16, title: '草坪维护分摊', description: '公园草坪被踩秃，养护费用由周边业主分摊。', rarity: 'common', effect: {kind: 'cash', amount: -6}},
    {id: 'park-music', tileId: 16, title: '海湾音乐节', description: '音乐节带来客流，按你持有的海湾文旅地块每块补贴 6 万，上限 30 万。', rarity: 'uncommon', effect: {kind: 'districtCash', district: '海湾文旅', perTile: 6, cap: 30}},
    {id: 'park-escape', tileId: 16, title: '动物园逃脱', description: '猛兽出笼封锁街区，你的生意停摆一天，损失 10 万。', rarity: 'uncommon', effect: {kind: 'cash', amount: -10}},
    {id: 'park-lottery', tileId: 16, title: '公园彩票亭', description: '你随手买的彩票中了头奖，税前 35 万，扣 10% 后到账。', rarity: 'rare', effect: {kind: 'cash', amount: 35}},
    {id: 'park-tree', tileId: 16, title: '古树倒伏', description: '暴雨吹倒古树砸中车辆，赔偿与清理费共 15 万。', rarity: 'rare', effect: {kind: 'cash', amount: -15}},
  ],
  27: [
    {id: 'market-coupon', tileId: 27, title: '消费券发放', description: '新一轮消费券投放，快乐食品领涨 5%。', rarity: 'common', effect: {kind: 'stockShock', impacts: {food: .05}}},
    {id: 'market-rumor', tileId: 27, title: '市场传闻', description: '一则未经证实的行业传闻扰动盘面，随机一只股票波动 6%。', rarity: 'common', effect: {kind: 'randomStockShock', magnitude: .06, direction: 'either'}},
    {id: 'market-supply', tileId: 27, title: '供应链中断', description: '关键零部件供应中断，新能集团 +8%，NEO 科技 -4%。', rarity: 'uncommon', effect: {kind: 'stockShock', impacts: {energy: .08, tech: -.04}}},
    {id: 'market-merger', tileId: 27, title: '并购传闻', description: '一桩跨界并购传闻点燃市场：随机一只股票 +10%，另一只 -3%。', rarity: 'uncommon', effect: {kind: 'mergerShock', up: .10, down: .03}},
    {id: 'market-short', tileId: 27, title: '做空报告', description: '匿名做空报告点名一家公司，随机一只股票 -12%。', rarity: 'rare', effect: {kind: 'randomStockShock', magnitude: .12, direction: 'down'}},
    {id: 'market-upgrade', tileId: 27, title: '消费升级', description: '消费与文旅数据超预期，快乐食品、PIXEL 娱乐各 +8%。', rarity: 'rare', effect: {kind: 'stockShock', impacts: {food: .08, fun: .08}}},
  ],
};

export function isCityEventTile(tileId: number): tileId is CityEventTile {
  return tileId === 2 || tileId === 16 || tileId === 27;
}

export function pickCityEvent(tileId: number, random: () => number): CityEvent | undefined {
  if (!isCityEventTile(tileId)) return undefined;
  const pool = CITY_EVENTS[tileId];
  const total = pool.reduce((sum, event) => sum + CITY_EVENT_WEIGHTS[event.rarity], 0);
  const roll = Math.max(0, Math.min(.999999, Number(random()) || 0)) * total;
  let cursor = roll;
  for (const event of pool) {
    cursor -= CITY_EVENT_WEIGHTS[event.rarity];
    if (cursor < 0) return event;
  }
  return pool[pool.length - 1];
}
