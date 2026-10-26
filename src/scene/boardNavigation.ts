import { TILES } from '../../shared/catalog';

export type RoadPoint = [number, number]; // x, z
export const ROAD_INNER = 8.9;
export const ROAD_OUTER = 10.48;
export const DRIVE_RADIUS = 9.98;
export const SLOT_SPACING = 0.5;
export const SHORTCUT_LANES: RoadPoint[][] = [
  [[5, ROAD_INNER], [5, 6.5], [6.25, 6.5], [6.25, -5], [ROAD_INNER, -5]],
  [[-5, -ROAD_INNER], [-5, -6.5], [-6.25, -6.5], [-6.25, 5], [-ROAD_INNER, 5]],
];
export const SHORTCUT_LANE_WIDTH=.92;
export const SHORTCUT_WALK_WIDTH=.08;
export const shortcutNeck=(a:RoadPoint,b:RoadPoint)=>Math.abs(a[1])===ROAD_INNER||Math.abs(b[0])===ROAD_INNER;


// The two internal streets run beside the buildings, never through their plots.
// Their narrow entrances use the gaps between neighbouring outer-ring plots.
export const SHORTCUT_EDGES: Record<string, RoadPoint[]> = {
  // 金融内街：入口 6 -> 36 -> 32 -> 37 -> 33 -> 38 -> 14
  '6:36': [[4, DRIVE_RADIUS], [5, DRIVE_RADIUS], [5, 6.5], [6.25, 6.5], [6.25, 5]],
  '36:32': [[6.25, 5], [6.25, 3]],
  '32:37': [[6.25, 3], [6.25, 1]],
  '37:33': [[6.25, 1], [6.25, -1]],
  '33:38': [[6.25, -1], [6.25, -3]],
  '38:14': [[6.25, -3], [6.25, -5], [DRIVE_RADIUS, -5], [DRIVE_RADIUS, -4]],
  // 商业内街：入口 22 -> 39 -> 34 -> 40 -> 35 -> 41 -> 30
  '22:39': [[-4, -DRIVE_RADIUS], [-5, -DRIVE_RADIUS], [-5, -6.5], [-6.25, -6.5], [-6.25, -5]],
  '39:34': [[-6.25, -5], [-6.25, -3]],
  '34:40': [[-6.25, -3], [-6.25, -1]],
  '40:35': [[-6.25, -1], [-6.25, 1]],
  '35:41': [[-6.25, 1], [-6.25, 3]],
  '41:30': [[-6.25, 3], [-6.25, 5], [-DRIVE_RADIUS, 5], [-DRIVE_RADIUS, 4]],
};

export function roadAnchor(id: number): RoadPoint {
  const t = TILES[id];
  if (id >= 32) return [t.x >= 0 ? 6.25 : -6.25, t.z];
  switch (Math.floor(id / 8)) {
    case 0: return [t.x, DRIVE_RADIUS];
    case 1: return [DRIVE_RADIUS, t.z];
    case 2: return [t.x, -DRIVE_RADIUS];
    default: return [-DRIVE_RADIUS, t.z];
  }
}

export function parkingPose(id: number, index: number) {
  const column=index%3,row=Math.floor(index/3);
  const slot = (column-1)*SLOT_SPACING;
  const aisle = column===0 ? -SLOT_SPACING/2 : SLOT_SPACING/2;
  const anchor = roadAnchor(id);
  const normal: RoadPoint = id >= 32 ? [TILES[id].x >= 0 ? 1 : -1, 0]
    : [[0, 1], [1, 0], [0, -1], [-1, 0]][Math.floor(id / 8)] as RoadPoint;
  const tangent: RoadPoint = [normal[1], -normal[0]];
  // Three compact rows leave the shortcut entrances open. Half-column aisles
  // let an inner pawn walk past the outer rows without touching a neighbour.
  const inset=.92-row*.32;
  const merge: RoadPoint = [anchor[0] + tangent[0] * aisle, anchor[1] + tangent[1] * aisle];
  const parked: RoadPoint = [anchor[0]+tangent[0]*slot-normal[0]*inset,anchor[1]+tangent[1]*slot-normal[1]*inset];
  const exit:RoadPoint=[merge[0]-normal[0]*inset,merge[1]-normal[1]*inset];
  return { parked, exit, merge, yaw: Math.atan2(-normal[0], -normal[1]) };
}

export function roadEdge(from: number, to: number): RoadPoint[] {
  const shortcut = SHORTCUT_EDGES[`${from}:${to}`];
  if (shortcut) return shortcut;
  const a = roadAnchor(from), b = roadAnchor(to);
  // Explicit corner waypoints keep every turn on the asphalt.
  if (from < 32 && to === (from + 1) % 32 && from % 8 === 7) {
    const corners: RoadPoint[] = [[DRIVE_RADIUS, DRIVE_RADIUS], [DRIVE_RADIUS, -DRIVE_RADIUS], [-DRIVE_RADIUS, -DRIVE_RADIUS], [-DRIVE_RADIUS, DRIVE_RADIUS]];
    return [a, corners[Math.floor(from / 8)], b];
  }
  return [a, b];
}

export function pawnRoute(path: number[], index: number): RoadPoint[] {
  const start = parkingPose(path[0], index), end = parkingPose(path[path.length - 1], index);
  const points: RoadPoint[] = [start.parked, start.exit, start.merge, roadAnchor(path[0])];
  for (let i = 1; i < path.length; i++) points.push(...roadEdge(path[i - 1], path[i]).slice(1));
  points.push(end.merge, end.exit, end.parked);
  return points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.00001);
}

export interface LabelCandidate { id: number; x: number; y: number; width: number; height: number; priority: number; distance: number; centrality: number; }
export function chooseLabels(candidates: LabelCandidate[], limit: number): number[] {
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || (a.distance + a.centrality * 7) - (b.distance + b.centrality * 7) || a.id - b.id);
  const accepted: LabelCandidate[] = [];
  for (const item of ordered) {
    if (accepted.length >= limit) break;
    if (accepted.some(other => Math.abs(item.x - other.x) < (item.width + other.width) / 2 + 8 && Math.abs(item.y - other.y) < (item.height + other.height) / 2 + 6)) continue;
    accepted.push(item);
  }
  return accepted.map(item => item.id);
}
