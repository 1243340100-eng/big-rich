import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildCasinoModel,CASINO_HEIGHT,CASINO_WHEEL_Y} from '../src/scene/casinoGeometry';
import {buildCentralLandmark} from '../src/scene/centralPlazaGeometry';
test('casino has a supported three-storey Deco silhouette, twenty wheel sectors, safe bounds and a small geometry budget',()=> {
  const model=buildCasinoModel();assert.equal(model.parts.filter(p=>p.name.startsWith('casino-wheel-sector-')).length,20);assert.equal(model.parts.filter(p=>p.name==='casino-wing-window').length,6);
  assert.ok(model.batches.length<=5);let triangles=0,height=0;
  for(const b of model.batches){const g=b.geometry;g.computeBoundingBox();assert.ok([...g.getAttribute('position').array].every(Number.isFinite));const box=g.boundingBox!;assert.ok(Math.max(...[box.min.x,box.max.x,box.min.z,box.max.z].map(Math.abs))<.74);height=Math.max(height,box.max.y);triangles+=g.getAttribute('position').count/3;g.dispose();}
  assert.ok(Math.abs(height-CASINO_HEIGHT)<.001);assert.ok(triangles<12000);assert.ok(CASINO_WHEEL_Y>.24);
  const solid=model.parts.filter(p=>p.structural),reached=new Set(solid.filter(p=>p.bounds.min.y<=.006));let progress=true;while(progress){progress=false;for(const p of solid)if(!reached.has(p)&&[...reached].some(a=>a.bounds.clone().expandByScalar(.006).intersectsBox(p.bounds))){reached.add(p);progress=true;}}
  assert.deepEqual(solid.filter(p=>!reached.has(p)).map(p=>p.name),[]);
  for(const key of ['casino-entrance-arch','casino-canopy','casino-wheel-mast','casino-dome','casino-title-panel','casino-palm-planter','casino-small-fountain-basin'])assert.ok(model.parts.some(p=>p.name===key));
  const central=buildCentralLandmark();const box=new THREE.Box3();central.batches.forEach(b=>{b.geometry.computeBoundingBox();box.union(b.geometry.boundingBox!);b.geometry.dispose();});assert.ok(CASINO_HEIGHT<box.max.y);
  console.log(`Casino geometry: ${triangles} triangles, ${model.batches.length} static batches`);
});
