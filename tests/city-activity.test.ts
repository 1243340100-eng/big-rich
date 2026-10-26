import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { TILES } from '../shared/catalog';
import { buildLandmarkModel } from '../src/scene/landmarkGeometry';
import { cityTimeStep, DYNAMIC_MODEL_PARTS, factoryChimneyTop, marqueeBrightness, marqueePositions, PEDESTRIAN_RADIUS, PLAZA_WALK, routeLength, smokePuff, STREET_WALKS, theatreLightHeight, walkingPose, windRotorCentre } from '../src/scene/cityActivity';

const palette={wall:'#ddcfb1',wallAlt:'#cbbb99',roof:'#5e7564',trim:'#a96c4f',accent:'#87ad91',glow:'#ffc378'};
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);

test('all thirty pedestrians stay on their pavements, clear of buildings, cars and the fountain',()=>{
  assert.equal(STREET_WALKS.reduce((sum,r)=>sum+r.count,0)+PLAZA_WALK.count,30);
  for(const route of [...STREET_WALKS,PLAZA_WALK])for(let t=0;t<150;t+=.09)for(let index=0;index<route.count;index++){
    const p=walkingPose(route,t,index);assert.ok(Object.values(p).every(Number.isFinite));
    if(route===PLAZA_WALK){
      assert.ok(Math.abs(p.x)+PEDESTRIAN_RADIUS<1.30);
      assert.ok(p.z-PEDESTRIAN_RADIUS>.87,'walkers intersect bank steps');
      assert.ok(Math.hypot(p.x,p.z-1.85)-PEDESTRIAN_RADIUS>.49,'walkers intersect fountain');
    }else {
      const radius=Math.max(Math.abs(p.x),Math.abs(p.z));
      assert.ok(radius-PEDESTRIAN_RADIUS>10.48,'walker enters the traffic lanes');
      assert.ok(radius+PEDESTRIAN_RADIUS<10.85,'walker leaves the board');
      for(const tile of TILES)assert.ok(Math.abs(tile.x-p.x)>1||Math.abs(tile.z-p.z)>1,'walker intersects a property');
    }
  }
});

test('pedestrians never occupy the same space, including the opposing lanes and rounded U-turns',()=>{
  const routes=[...STREET_WALKS,PLAZA_WALK];
  for(let t=0;t<80;t+=.08){
    const walkers=routes.flatMap(route=>Array.from({length:route.count},(_,i)=>walkingPose(route,t,i)));
    for(let i=0;i<walkers.length;i++)for(let j=i+1;j<walkers.length;j++)assert.ok(distance(walkers[i],walkers[j])>PEDESTRIAN_RADIUS*2,`collision at ${t}: ${i},${j}`);
  }
});

test('closed walking routes have continuous positions and headings at every join and wrap',()=>{
  for(const route of [...STREET_WALKS,PLAZA_WALK]){
    const line=route.b-route.a,arc=Math.PI*route.turn;
    for(const d of [0,line,line+arc,2*line+arc,routeLength(route)]){
      const t=d/route.speed,a=walkingPose(route,t-1e-5,0),b=walkingPose(route,t+1e-5,0);
      assert.ok(distance(a,b)<.0001);assert.ok(Math.cos(a.yaw-b.yaw)>.9999,'sudden turn at a route seam');
    }
  }
});

test('animated replacements remove only moving geometry and retain every static structural part',()=>{
  for(const id of [9,17,20,23,24,33])for(let level=0;level<4;level++){
    const original=buildLandmarkModel(id,level,palette),animated=buildLandmarkModel(id,level,palette,true);
    assert.deepEqual(animated.parts.map(p=>[p.name,p.bounds.min.toArray(),p.bounds.max.toArray()]),original.parts.filter(p=>!DYNAMIC_MODEL_PARTS.has(p.name)).map(p=>[p.name,p.bounds.min.toArray(),p.bounds.max.toArray()]));
    assert.equal(marqueePositions(id,level).length,original.parts.filter(p=>p.name==='theatre-marquee-bulb'||p.name==='cinema-marquee-bulb').length);
    for(const model of [original,animated])model.batches.forEach(b=>b.geometry.dispose());
  }
});

test('chimney emission, wind rotors and theatre fixtures match their actual model supports at every level',()=>{
  for(let level=0;level<4;level++){
    const factory=buildLandmarkModel(23,level,palette),energy=buildLandmarkModel(24,level,palette),theatre=buildLandmarkModel(20,level,palette);
    for(const cap of factory.parts.filter(p=>p.name==='factory-chimney-cap'))assert.ok(Math.abs(cap.bounds.max.y-factoryChimneyTop(level))<1e-6);
    const hub=energy.parts.find(p=>p.name==='energy-rotor-hub')!;assert.ok(hub.bounds.containsPoint(new Vector3(...windRotorCentre(level))));
    const cap=theatre.parts.find(p=>p.name==='theatre-stage-cap')!;assert.ok(Math.abs(cap.bounds.max.y-theatreLightHeight(level))<1e-6);
    for(const model of [factory,energy,theatre])model.batches.forEach(b=>b.geometry.dispose());
  }
});

test('smoke fades at birth and death, rises above the cap and stays a small bounded effect',()=>{
  for(let i=0;i<12;i++)for(let t=0;t<100;t+=.17){const p=smokePuff(t,i);assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.y>=.025&&p.y<=.805);assert.ok(Math.abs(p.x)<.18&&Math.abs(p.z)<.036);assert.ok(p.opacity>=0&&p.opacity<=.31);assert.ok(p.size>=.085&&p.size<=.305);}
  assert.equal(smokePuff(0,0).opacity,0);assert.ok(smokePuff((1-1e-7)/.27,0).opacity<1e-10);
});

test('wind blades remain inside the plot throughout a full rotation at every building level',()=>{
  for(let level=0;level<4;level++)for(let angle=0;angle<Math.PI*2;angle+=.025)for(let blade=0;blade<3;blade++)for(const x of [-.02,.02])for(const y of [-.005,.265]){
    const [cx,,cz]=windRotorCentre(level),a=angle-blade*Math.PI*2/3;
    assert.ok(Math.abs(cx+Math.cos(a)*x-Math.sin(a)*y)<.74);
    assert.ok(Math.abs(cz)+.0125<.74);
  }
});

test('city clock freezes for reduced motion and hidden tabs and caps catch-up after a long stall',()=>{
  assert.equal(cityTimeStep(12,.016,true,true),12.016);assert.equal(cityTimeStep(12,300,false,true),12);assert.equal(cityTimeStep(12,300,true,false),12);
  assert.equal(cityTimeStep(12,300,true,true),12.05);assert.equal(cityTimeStep(12,NaN,true,true),12);assert.equal(cityTimeStep(12,-1,true,true),12);
  for(let t=0;t<20;t+=.11)for(let i=0;i<11;i++){const intensity=marqueeBrightness(t,i);assert.ok(intensity>=.58&&intensity<=1);}
});
