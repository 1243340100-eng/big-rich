import test from 'node:test';
import assert from 'node:assert/strict';
import {TILES} from '../shared/catalog';
import {SHORTCUT_LANES,SHORTCUT_LANE_WIDTH,SHORTCUT_WALK_WIDTH,shortcutNeck,SHORTCUT_EDGES} from '../src/scene/boardNavigation';

test('shortcut paving and turning circles clear all owned plot bases, including the six new properties',()=>{
  const halfPlot=.89;
  for(const points of SHORTCUT_LANES){
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],narrow=shortcutNeck(a,b);
      const half=narrow?.095:SHORTCUT_LANE_WIDTH/2+SHORTCUT_WALK_WIDTH;
      const vertical=a[0]===b[0],hx=vertical?half:Math.abs(a[0]-b[0])/2+.018,hz=vertical?Math.abs(a[1]-b[1])/2+.018:half;
      for(const tile of TILES)assert.ok(Math.abs(tile.x-(a[0]+b[0])/2)>=halfPlot+hx||Math.abs(tile.z-(a[1]+b[1])/2)>=halfPlot+hz,`paving overlaps ${tile.name}`);
    }
    const r=SHORTCUT_LANE_WIDTH/2+SHORTCUT_WALK_WIDTH+.012;
    for(const [x,z] of points.slice(1,-1))for(const tile of TILES){
      const dx=Math.max(0,Math.abs(tile.x-x)-halfPlot),dz=Math.max(0,Math.abs(tile.z-z)-halfPlot);
      assert.ok(Math.hypot(dx,dz)>r,`turn overlaps ${tile.name}`);
    }
  }
  for(const tile of TILES.filter(t=>t.id>=32))assert.ok(5.48-1.05/2>Math.abs(tile.x)+halfPlot,'parking intrudes on building base');
});

test('shortcut movement uses the same repaired entrance bends as the visible road',()=>{
  assert.deepEqual(SHORTCUT_EDGES['6:36'].slice(2,4),SHORTCUT_LANES[0].slice(1,3));
  assert.deepEqual(SHORTCUT_EDGES['22:39'].slice(2,4),SHORTCUT_LANES[1].slice(1,3));
});
