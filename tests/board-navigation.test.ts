import test from 'node:test';
import assert from 'node:assert/strict';
import { TILES, nextTile } from '../shared/catalog';
import { ROAD_INNER, ROAD_OUTER, SHORTCUT_EDGES, pawnRoute, chooseLabels, parkingPose, roadEdge, type RoadPoint } from '../src/scene/boardNavigation';

import {PAWN_RADIUS} from '../shared/characters';

const halfWidth = PAWN_RADIUS;
const halfLength = PAWN_RADIUS;

function sample(points: RoadPoint[]) {
  const result: { x: number; z: number; hx: number; hz: number }[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const hx = (Math.abs(dx) * halfLength + Math.abs(dz) * halfWidth) / len;
    const hz = (Math.abs(dz) * halfLength + Math.abs(dx) * halfWidth) / len;
    for (let j = 0; j <= Math.ceil(len / 0.05); j++) {
      const t = j / Math.ceil(len / 0.05);
      result.push({ x: a[0] + dx * t, z: a[1] + dz * t, hx, hz });
    }
  }
  return result;
}

test('every main-ring edge, including all four corners, keeps the character body on the road', () => {
  for (let id = 0; id < 32; id++) for (const p of sample(roadEdge(id, nextTile(id)))) {
    assert.ok(Math.abs(p.x) + p.hx < ROAD_OUTER && Math.abs(p.z) + p.hz < ROAD_OUTER, `outside road at ${id}`);
    assert.ok(Math.abs(p.x) - p.hx > ROAD_INNER || Math.abs(p.z) - p.hz > ROAD_INNER, `cuts inner corner at ${id}`);
  }
});

test('both shortcut routes and all 42 parking areas clear the full plot footprints', () => {
  const paths = Object.values(SHORTCUT_EDGES);
  for (const tile of TILES) for (let index = 0; index < 8; index++) {
    const { parked, exit, merge } = parkingPose(tile.id, index);
    paths.push([parked, exit, merge]);
  }
  for (const path of paths) for (const p of sample(path)) for (const tile of TILES) {
    assert.ok(Math.abs(p.x - tile.x) >= 0.85 + p.hx || Math.abs(p.z - tile.z) >= 0.85 + p.hz, `character intersects plot ${tile.id} at ${p.x},${p.z}`);
  }
});

test('eight players can park at any tile; every departure and arrival clears the seven neighbours', () => {
  for (const tile of TILES) for (let index = 0; index < 8; index++) {
    const pose = parkingPose(tile.id, index);
    for (const p of sample([pose.parked, pose.exit, pose.merge])) for (let other = 0; other < 8; other++) {
      if (other === index) continue;
      const parked = parkingPose(tile.id, other);
      const hx = Math.abs(Math.sin(parked.yaw)) * halfLength + Math.abs(Math.cos(parked.yaw)) * halfWidth;
      const hz = Math.abs(Math.cos(parked.yaw)) * halfLength + Math.abs(Math.sin(parked.yaw)) * halfWidth;
      assert.ok(Math.abs(p.x - parked.parked[0]) >= p.hx + hx || Math.abs(p.z - parked.parked[1]) >= p.hz + hz, `player ${index} collides with ${other} at ${tile.id}`);
    }
  }
});

test('full movement routes start and end at the assigned bay, including shortcut exits and start wrap', () => {
  for (const path of [[29,30,31,0,1], [6,32,33,14,15,16], [22,34,35,30,31,0]]) for (let i = 0; i < 8; i++) {
    const route = pawnRoute(path, i);
    assert.deepEqual(route[0], parkingPose(path[0], i).parked);
    assert.deepEqual(route.at(-1), parkingPose(path.at(-1)!, i).parked);
    assert.ok(route.every(p => p.every(Number.isFinite)));
  }
});

test('moving characters clear parked characters at every tile, including occupied shortcut entrances', () => {
  const edges = [...TILES.slice(0, 32).map(t => [t.id, nextTile(t.id)]), ...Object.keys(SHORTCUT_EDGES).map(key => key.split(':').map(Number))];
  const parked = TILES.flatMap(t => Array.from({length:8}, (_, index) => {
    const pose = parkingPose(t.id, index);
    return { index, x: pose.parked[0], z: pose.parked[1], hx: Math.abs(Math.sin(pose.yaw)) * halfLength + Math.abs(Math.cos(pose.yaw)) * halfWidth, hz: Math.abs(Math.cos(pose.yaw)) * halfLength + Math.abs(Math.sin(pose.yaw)) * halfWidth };
  }));
  for (let index = 0; index < 8; index++) for (const [from, to] of edges) for (const p of sample(pawnRoute([from, to], index))) {
    for (const other of parked) {
      if (other.index === index) continue;
      assert.ok(Math.abs(p.x - other.x) >= p.hx + other.hx || Math.abs(p.z - other.z) >= p.hz + other.hz, `moving player ${index} intersects parked player ${other.index} on ${from}:${to} at ${p.x},${p.z}`);
    }
  }
});

test('automatic labels prioritise selection, then nearby front-facing labels and reject overlaps', () => {
  const base = { width: 84, height: 20, priority: 0, distance: 40, centrality: 0 };
  assert.deepEqual(chooseLabels([
    { ...base, id: 1, x: 100, y: 100 },
    { ...base, id: 2, x: 100, y: 100, priority: 300 },
    { ...base, id: 3, x: 300, y: 100, distance: 30 },
    { ...base, id: 4, x: 500, y: 100, distance: 50 },
    { ...base, id: 5, x: 700, y: 100, centrality: 2 },
  ], 3), [2, 3, 4]);
});
