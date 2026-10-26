/**
 * 街区性格与事件风口。
 *
 * 这里的系数是“相对全局经济周期”的乘数：全局 RENT_CYCLES 仍然决定大方向，
 * 街区系数只决定同一周期里哪个街区更强、哪个更抗跌。按主环地块数量
 * （花园 4 / 中央 5 / 海湾 5 / 未来 4）加权后，五个周期的均值都接近 1.0，
 * 避免街区系统把全盘租金或经营收益整体推高。
 */
export const DISTRICTS = ['花园住区', '中央商区', '海湾文旅', '未来产业'] as const;
export type District = typeof DISTRICTS[number];

export const DISTRICT_CYCLES: Record<District, readonly [number, number, number, number, number]> = {
  花园住区: [1, .88, .82, 1.18, 1.35],
  中央商区: [1, 1.05, 1.08, .94, .88],
  海湾文旅: [1, 1.12, 1.15, .88, .75],
  未来产业: [1, 1.02, 1, 1.02, 1.08],
};

export const DISTRICT_PROFILES: Record<District, { label: string; note: string }> = {
  花园住区: {label: '防守型', note: '衰退与危机期抗跌，繁荣期偏弱'},
  中央商区: {label: '顺周期', note: '繁荣与过热期走强，危机期承压'},
  海湾文旅: {label: '高弹性', note: '繁荣期爆发，危机期回撤最大'},
  未来产业: {label: '事件驱动', note: '平时平稳，AI / 降息 / 能源事件时成为风口'},
};

/** 事件热点：每个全球事件给一个或多个街区加热，也会让部分街区降温。 */
export const EVENT_DISTRICT_HEAT: Record<string, { hot: readonly District[]; cold: readonly District[] }> = {
  经济繁荣: {hot: ['中央商区', '海湾文旅'], cold: ['花园住区']},
  金融危机: {hot: ['花园住区'], cold: ['中央商区', '海湾文旅']},
  房地产泡沫: {hot: ['中央商区', '花园住区'], cold: ['未来产业']},
  房地产调整: {hot: ['花园住区'], cold: ['中央商区', '海湾文旅']},
  'AI 技术革命': {hot: ['未来产业'], cold: []},
  能源危机: {hot: ['未来产业'], cold: ['海湾文旅', '中央商区']},
  央行降息: {hot: ['中央商区', '花园住区'], cold: []},
};

export const DISTRICT_HEAT_BONUS = .20;
export const DISTRICT_HEAT_PENALTY = -.10;

/** 两条内街没有独立的周期表，借用中央商区的商务性格。 */
export function districtOf(value: string): District {
  if ((DISTRICTS as readonly string[]).includes(value)) return value as District;
  return '中央商区';
}

export function districtCycleMultiplier(district: string, cycle: number): number {
  const key = districtOf(district);
  const index = Math.max(0, Math.min(4, Math.trunc(cycle)));
  return DISTRICT_CYCLES[key][index] ?? 1;
}

export function districtEventHeat(event: string, district: string): number {
  const heat = EVENT_DISTRICT_HEAT[event];
  if (!heat) return 0;
  const key = districtOf(district);
  if (heat.hot.includes(key)) return DISTRICT_HEAT_BONUS;
  if (heat.cold.includes(key)) return DISTRICT_HEAT_PENALTY;
  return 0;
}

export function eventDistrictHeat(event: string) {
  return EVENT_DISTRICT_HEAT[event];
}

export function eventHeatText(event: string): string {
  const heat = EVENT_DISTRICT_HEAT[event];
  if (!heat) return '';
  const parts: string[] = [];
  if (heat.hot.length) parts.push(`${heat.hot.join('、')} +${Math.round(DISTRICT_HEAT_BONUS * 100)}%`);
  if (heat.cold.length) parts.push(`${heat.cold.join('、')} ${Math.round(DISTRICT_HEAT_PENALTY * 100)}%`);
  return parts.join(' · ');
}
