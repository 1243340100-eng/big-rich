import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { buildCentralLandmark, CENTRAL_LANDMARK } from '../src/scene/centralPlazaGeometry';
import { PEDESTRIAN_RADIUS, PLAZA_WALK, walkingPose } from '../src/scene/cityActivity';

test('grand central landmark has finite, batched and bounded geometry and a complete four-sided clock tower',()=>{
  const model=buildCentralLandmark();assert.ok(model.batches.length<=5);
  let triangles=0;const bounds=new Box3();
  for(const batch of model.batches){
    const geometry=batch.geometry,positions=geometry.getAttribute('position');
    assert.ok([...positions.array].every(Number.isFinite));assert.equal(positions.count,geometry.getAttribute('normal').count);assert.equal(positions.count,geometry.getAttribute('color').count);
    geometry.computeBoundingBox();bounds.union(geometry.boundingBox!);triangles+=positions.count/3;geometry.dispose();
  }
  assert.ok(triangles<45000,`central landmark exceeded its triangle budget: ${triangles}`);
  assert.ok(bounds.min.x>=-2.80&&bounds.max.x<=2.80);assert.ok(bounds.min.z>=CENTRAL_LANDMARK.rear-.01&&bounds.max.z<=CENTRAL_LANDMARK.front+.01);
  assert.ok(Math.abs(bounds.max.y-CENTRAL_LANDMARK.height)<.005);assert.ok(bounds.min.y>=.104);
  assert.equal(model.parts.filter(p=>p.name==='portico-fluted-column').length,6);assert.equal(model.parts.filter(p=>p.name==='clock-dial').length,4);
  assert.ok(model.parts.some(p=>p.name==='clock-copper-dome'));assert.ok(model.parts.some(p=>p.name==='portico-pediment'));
});

test('all major columns, roofs, clock tower, terraces and ornaments have continuous physical support',()=>{
  const model=buildCentralLandmark(),solids=model.parts.filter(p=>p.structural),reached=new Set(solids.filter(p=>p.bounds.min.y<=.107));
  let changed=true;
  while(changed){changed=false;for(const part of solids){if(reached.has(part))continue;if([...reached].some(other=>other.bounds.clone().expandByScalar(.006).intersectsBox(part.bounds))){reached.add(part);changed=true;}}}
  assert.deepEqual(solids.filter(p=>!reached.has(p)).map(p=>p.name),[]);
  model.batches.forEach(b=>b.geometry.dispose());
});

test('larger steps, foundations and railings leave all six plaza pedestrians clear throughout their route',()=>{
  const model=buildCentralLandmark(),body=new Box3(),r=PEDESTRIAN_RADIUS;
  for(let t=0;t<60;t+=.07)for(let i=0;i<PLAZA_WALK.count;i++){
    const p=walkingPose(PLAZA_WALK,t,i);body.set(new Vector3(p.x-r,p.y+.006,p.z-r),new Vector3(p.x+r,p.y+.29,p.z+r));
    for(const part of model.parts)assert.ok(!body.intersectsBox(part.bounds),`pedestrian intersects ${part.name}`);
  }
  model.batches.forEach(b=>b.geometry.dispose());
});

test('arched front and rear surrounds are attached to their parent halls and wings',()=>{
  const model=buildCentralLandmark(),walls=model.parts.filter(p=>['bank-main-hall','bank-side-wing'].includes(p.name));
  for(const part of model.parts.filter(p=>p.name.endsWith('-stone-surround')))assert.ok(walls.some(wall=>wall.bounds.clone().expandByScalar(.003).intersectsBox(part.bounds)),`floating surround ${part.name}`);
  model.batches.forEach(b=>b.geometry.dispose());
});
