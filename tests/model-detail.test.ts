import test from 'node:test';
import assert from 'node:assert/strict';
import {buildArchitecture,buildPlotDetails,buildPlaza,buildStreets,type DetailBatch} from '../src/scene/detailGeometry';
import {TILES} from '../shared/catalog';
import {buildCentralLandmark} from '../src/scene/centralPlazaGeometry';
import {CITY,cityBuildings,cityTriangleCount} from '../src/scene/distantCity';
const palette={wall:'#ddcfb1',wallAlt:'#cbbb99',roof:'#5e7564',trim:'#a96c4f',accent:'#87ad91',glow:'#ffc378'};
function verify(batches:DetailBatch[],horizontalLimit:number){
  assert.ok(batches.length<=5,'detail draw-call budget exceeded');
  let triangles=0,parts=0;
  for(const b of batches){
    const g=b.geometry;const positions=g.getAttribute('position');
    assert.ok([...positions.array].every(Number.isFinite),'non-finite vertex');
    assert.equal(positions.count,g.getAttribute('normal').count);
    assert.equal(positions.count,g.getAttribute('color').count);
    g.computeBoundingBox();
    const bounds=g.boundingBox!;
    assert.ok(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x),Math.abs(bounds.min.z),Math.abs(bounds.max.z))<=horizontalLimit,'detail extends beyond its allocated footprint');
    assert.ok(bounds.min.y>=-.02,'detail submerged under plot');
    triangles+=positions.count/3;parts+=b.parts;g.dispose();
  }
  return {triangles,parts};
}
test('all property levels produce finite, bounded, colour-complete detail meshes',()=>{
  for(const tile of TILES.filter(t=>t.type==='property'))for(let level=0;level<=3;level++){
    const result=verify(buildArchitecture(tile.id,level,palette),.8);
    assert.ok(result.triangles<18000,'single-building triangle budget exceeded');
    assert.ok(result.parts>80,'missing architectural layer');
  }
});
test('plot details stay inside tile edges, including vacant construction parcels',()=>{
  for(const vacant of [false,true])for(const tile of TILES)verify(buildPlotDetails(tile.id,vacant),.85);
});
test('fully developed city detail layer stays within geometric and batching budgets',()=>{
  let triangles=0,parts=0,batches=0;
  for(const tile of TILES){
    const plot=buildPlotDetails(tile.id,false);batches+=plot.length;let r=verify(plot,.85);triangles+=r.triangles;parts+=r.parts;
    if(tile.type==='property'){const building=buildArchitecture(tile.id,3,palette);batches+=building.length;r=verify(building,.8);triangles+=r.triangles;parts+=r.parts;}
  }
  for(const city of [buildPlaza(),buildStreets(),buildCentralLandmark().batches]){batches+=city.length;const r=verify(city,11);triangles+=r.triangles;parts+=r.parts;}
  const outskirts=cityBuildings();triangles+=cityTriangleCount(outskirts);batches+=CITY.maxDrawCalls;parts+=outskirts.length+outskirts.filter(b=>b.roofHeight>0).length;
  assert.ok(triangles<400000,`new detail layer too dense: ${triangles}`);
  // 地产从 20 增至 26（内区街区化），预算按比例放宽到 240。
  assert.ok(batches<240,`new draw calls exceeded budget: ${batches}`);
  console.log(`Detail geometry: ${parts} components, ${triangles} triangles, ${batches} batched meshes at Lv.3`);
});
