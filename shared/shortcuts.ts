import type { GameState, Property, PropertyArchetype } from './types';
import { TILES } from './catalog';

/**
 * 内区街道的拓扑。内区已经从"两步捷径"扩成 6 格街道，所以不再需要排队规则：
 * 玩家像走主环一样走，走完 6 格汇入 14 / 30。
 */
export const SHORTCUT_ENTRIES = [6, 22] as const;
export const SHORTCUT_INSIDE = [32, 33, 34, 35, 36, 37, 38, 39, 40, 41] as const;
export const SHORTCUT_EXIT: Record<number, number> = {
  32: 14, 33: 14, 36: 14, 37: 14, 38: 14,
  34: 30, 35: 30, 39: 30, 40: 30, 41: 30,
};
export const isShortcutInside = (position: number) => (SHORTCUT_INSIDE as readonly number[]).includes(position);

/** 金融捷径：过桥资金（无抵押、6 回合到期、每个人回合 2% 利息、逾期 20% 罚息）。 */
export const BRIDGE = { ratio: .4, rounds: 6, rate: .02, penalty: .2, minAmount: 10 } as const;

/** 金融捷径：内幕窗口。 */
export const INSIDER = { fee: 15, uses: 2 } as const;

/** 商业捷径：34/35 的预售定金。30% 定金 + 尾款分 2 期，总期限 10 回合。 */
export const RESERVE = { deposit: .3, rounds: 10, installments: 2 } as const;

/** 可以拐入内街的格子：入口及其前后各一格。 */
export const SHORTCUT_ENTRY_TILES: readonly number[] = [5, 6, 7, 21, 22, 23];

/** 商业捷径：34 总部商厦的等级特权（Lv.3 覆盖低等级，不累加）。 */
export const HQ_TAX_RELIEF = [0, .20, .20, .35] as const;
export const HQ_RENT_BONUS = [0, 0, .25, .45] as const;
export const HQ_UPGRADE_RELIEF = [0, 0, 0, .20] as const;
export const BUSINESS_DISTRICTS = ['中央商区', '商业捷径', '金融捷径'] as const;

/** 商业捷径：35 商务会展的办展参数。 */
export const EXHIBIT = {
  fee: [0, 10, 15, 15],
  boost: [0, .08, .13, .20],
  dilute: [0, .03, .05, .08],
  cooldown: [0, 3, 3, 2],
} as const;

/**
 * 地产原型：只改数值曲线，不改结算流程。
 * speculative = 高租金、难抵押、不抗跌；anchor = 低租金、估值厚、升级便宜。
 */
export const ARCHETYPE = {
  standard: { rent: 1, value: 1, mortgage: .6, shield: true, upgrade: 1 },
  speculative: { rent: 1.4, value: 1, mortgage: .4, shield: false, upgrade: 1 },
  anchor: { rent: .8, value: 1.3, mortgage: .6, shield: true, upgrade: .8 },
} as const;

export function archetypeOf(tileId: number): PropertyArchetype {
  return TILES[tileId]?.archetype ?? 'standard';
}
export function archetypeProfile(tileId: number) {
  return ARCHETYPE[archetypeOf(tileId)];
}

export function headquartersLevel(s: GameState, ownerId: string | null | undefined) {
  if (!ownerId) return -1;
  const hq = s.properties.find(a => a.tileId === 34);
  return hq && hq.owner === ownerId && !hq.mortgage ? Math.min(3, Math.max(0, hq.level)) : -1;
}

export function exhibitionLevel(s: GameState, ownerId: string | null | undefined) {
  if (!ownerId) return -1;
  const hall = s.properties.find(a => a.tileId === 35);
  return hall && hall.owner === ownerId && !hall.mortgage ? Math.min(3, Math.max(0, hall.level)) : -1;
}

/** 办展冷却：返回还需等待的回合数，0 表示可以办，Infinity 表示没有资格。 */
export function exhibitionWait(s: GameState, ownerId: string) {
  const level = exhibitionLevel(s, ownerId);
  if (level < 1) return Infinity;
  const last = s.exhibitionCooldown?.[ownerId];
  if (last === undefined) return 0;
  return Math.max(0, last + EXHIBIT.cooldown[level] - s.round);
}

/** 34 的商务租金加成：只作用于中央商区 / 商业捷径 / 金融捷径，且与垄断加成加法叠加。 */
export function businessRentBonus(s: GameState, ownerId: string | null | undefined, property: Property) {
  const level = headquartersLevel(s, ownerId);
  if (level < 2) return 0;
  return (BUSINESS_DISTRICTS as readonly string[]).includes(TILES[property.tileId]?.district) ? HQ_RENT_BONUS[level] : 0;
}
