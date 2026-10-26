import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CITY,allowedHeight,cityBuildings,cityFogRanges,cityGroundGeometry,cityRoofGeometry,cityRoofFixtures,cityStreetGeometry,cityTriangleCount,cityOverviewFov,farVisibility,noCityRaycast} from '../src/scene/distantCity';
import {neighborhoodGeometry} from '../src/scene/neighborhoodGeometry';
import {overviewCameraDistance} from '../src/scene/cameraFraming';

test('fixed seed produces exactly 220 stable non-overlapping buildings and 42 near roofs',()=>{
  const buildings=cityBuildings();
  assert.equal(JSON.stringify(buildings),JSON.stringify(cityBuildings()));
  assert.notEqual(JSON.stringify(buildings),JSON.stringify(cityBuildings(CITY.seed+1)));
  assert.deepEqual(['near','mid','far'].map(band=>buildings.filter(b=>b.band===band).length),[70,60,90]);
  assert.equal(buildings.filter(b=>b.roofHeight>0).length,42);
  for(let i=0;i<buildings.length;i++){
    const a=buildings[i];
    assert.ok([a.x,a.z,a.width,a.depth,a.height,a.roofHeight,a.rotation,...a.color].every(Number.isFinite));
    assert.ok(a.height<=allowedHeight(a.radius)&&a.height<=allowedHeight(a.nearestRadius));
    assert.ok(Math.abs(a.x)-a.halfX>=CITY.streetOuter||Math.abs(a.z)-a.halfZ>=CITY.streetOuter,'body extends into the square street or board corner');
    assert.ok(Math.abs(a.x)-a.halfX>=CITY.streetHalfWidth&&Math.abs(a.z)-a.halfZ>=CITY.streetHalfWidth,'avenue blocked');
    assert.ok(a.band!=='far'||a.height<=18);
    assert.ok(a.band==='far'?a.nearestRadius>=55:Math.hypot(Math.abs(a.x)+a.halfX,Math.abs(a.z)+a.halfZ)<=38);
    for(let j=0;j<i;j++){const b=buildings[j];assert.ok(Math.abs(a.x-b.x)>=a.halfX+b.halfX+CITY.gap||Math.abs(a.z-b.z)>=a.halfZ+b.halfZ+CITY.gap,'building footprints overlap');}
  }
});

test('city bodies and roofs never intercept a default-camera ray to any board edge through 360 degrees',()=>{
  const core=cityBuildings(),fixtures=cityRoofFixtures(core);
  const buildings=[...core.filter(b=>b.band!=='far'),...fixtures.map(f=>({...f,height:f.baseHeight+f.height,halfX:f.width/2,halfZ:f.depth/2}))];
  const boxes=buildings.map(b=>new THREE.Box3(new THREE.Vector3(b.x-b.halfX,CITY.groundY,b.z-b.halfZ),new THREE.Vector3(b.x+b.halfX,CITY.groundY+b.height,b.z+b.halfZ)));
  const hit=new THREE.Vector3(),target=new THREE.Vector3(),ray=new THREE.Ray();
  for(const [width,height] of [[1440,936],[390,786]]){
    const base=new THREE.Vector3(24,26,29).normalize().multiplyScalar(overviewCameraDistance(width,height,true));
    for(let degrees=0;degrees<360;degrees+=10){
      const origin=base.clone().applyAxisAngle(new THREE.Vector3(0,1,0),degrees*Math.PI/180);
      for(let edge=0;edge<4;edge++)for(let step=0;step<=24;step++){
        const offset=-CITY.boardHalf+step*CITY.boardHalf/12;
        target.set(edge<2?offset:(edge===2?-CITY.boardHalf:CITY.boardHalf),.04,edge<2?(edge===0?-CITY.boardHalf:CITY.boardHalf):offset);
        ray.set(origin,target.clone().sub(origin).normalize());const length=origin.distanceTo(target);
        for(let i=0;i<boxes.length;i++)if(ray.intersectBox(boxes[i],hit))assert.ok(origin.distanceTo(hit)>=length-1e-5,`board edge occluded at ${degrees} degrees by ${buildings[i].id}`);
      }
    }
  }
});

test('the complete city layer stays under 30000 triangles, five draw calls and four MB of mesh data',()=>{
  const buildings=cityBuildings();assert.ok(cityTriangleCount(buildings)<=CITY.maxTriangles);
  const ground=cityGroundGeometry(),street=cityStreetGeometry(),roof=cityRoofGeometry(),body=new THREE.BoxGeometry(1,1,1);
  let bytes=0;
  for(const geometry of [ground,street,roof,body,neighborhoodGeometry(buildings)]){
    for(const attribute of Object.values(geometry.attributes)){bytes+=attribute.array.byteLength;assert.ok([...attribute.array].every(Number.isFinite));}
    bytes+=geometry.index?.array.byteLength??0;geometry.dispose();
  }
  bytes+=(buildings.length+42)*(16+3)*4;
  assert.ok(bytes<4*1024*1024);assert.equal(CITY.maxDrawCalls,5);
  assert.equal(cityBuildings(CITY.seed,0).length,70);assert.equal(cityBuildings(CITY.seed,0).filter(b=>b.roofHeight>0).length,0);
  assert.deepEqual([0,1,2].map(stage=>cityTriangleCount(cityBuildings(CITY.seed,stage),stage)),[1112,2084,3164]);
});

test('default fog is unchanged and zooming to 140 no longer erases the board itself',()=>{
  const distance=overviewCameraDistance(1440,936,true),normal=cityFogRanges(distance,distance),wide=cityFogRanges(140,distance);
  assert.deepEqual([normal.sceneNear,normal.sceneFar],[65,135]);
  assert.ok(wide.sceneFar>140&&wide.far>140&&normal.far<normal.sceneFar);
  const fixtures=cityRoofFixtures(cityBuildings());assert.equal(fixtures.length,2);
  for(const fixture of fixtures)assert.ok(fixture.baseHeight+fixture.height<=allowedHeight(fixture.nearestRadius));
});

test('far skyline appears only after zooming out and does not change the original framing',()=>{
  for(const [width,height] of [[1440,936],[390,786],[320,642]]){
    const distance=overviewCameraDistance(width,height,true);
    assert.equal(farVisibility(distance,distance),0);assert.equal(farVisibility(140,distance),1);
  }
  const distance=overviewCameraDistance(1440,936,true);
  assert.ok(Math.abs(distance-15.2/Math.sin(19*Math.PI/180))<1e-9);
  let previous=0;for(let current=distance;current<=140;current+=.1){const value=farVisibility(current,distance);assert.ok(value>=previous&&value<=1);previous=value;}
});

test('every city surface can be excluded from pointer raycasting',()=>{
  const geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshBasicMaterial();
  const mesh=new THREE.Mesh(geometry,material),instances=new THREE.InstancedMesh(geometry,material,1);
  const raycaster=new THREE.Raycaster(new THREE.Vector3(0,0,5),new THREE.Vector3(0,0,-1));
  for(const object of [mesh,instances]){object.raycast=noCityRaycast;object.updateMatrixWorld();assert.deepEqual(raycaster.intersectObject(object),[]);}
  geometry.dispose();material.dispose();
});

test('maximum zoom frames the whole city bowl while the default field of view remains 38 degrees',()=>{
  const reference=overviewCameraDistance(1440,936,true);assert.equal(cityOverviewFov(reference,reference),38);
  const camera=new THREE.PerspectiveCamera(cityOverviewFov(140,reference),1440/936,.1,1000);
  camera.position.set(24,26,29).normalize().multiplyScalar(140);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  for(const building of cityBuildings())for(const x of [-1,1])for(const z of [-1,1])for(const y of [CITY.groundY,CITY.groundY+building.height]){
    const point=new THREE.Vector3(building.x+x*building.halfX,y,building.z+z*building.halfZ).project(camera);
    assert.ok(Math.abs(point.x)<1&&Math.abs(point.y)<1,`city building clipped at maximum zoom: ${building.id}`);
  }
});
