import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TILES } from '../shared/catalog';
import { buildLandmarkModel, hasLandmarkModel, landmarkModelHeight, DISTINCT_PROPERTIES } from '../src/scene/landmarkGeometry';
import { PROPERTY_DESCRIPTIONS } from '../src/scene/propertyDescriptions';

const palette={wall:'#ddcfb1',wallAlt:'#cbbb99',roof:'#5e7564',trim:'#a96c4f',accent:'#87ad91',glow:'#ffc378'};

test('rebuilt landmarks stay inside their plots and have finite, bounded, batched geometry at all levels',()=>{
  for(const tile of TILES.filter(t=>hasLandmarkModel(t.id)))for(let level=0;level<=3;level++){
    const model=buildLandmarkModel(tile.id,level,palette);
    assert.ok(model.batches.length<=5);
    let highest=0;
    for(const batch of model.batches){
      const g=batch.geometry, vertices=g.getAttribute('position');
      assert.ok([...vertices.array].every(Number.isFinite));
      assert.equal(vertices.count,g.getAttribute('normal').count);
      assert.equal(vertices.count,g.getAttribute('color').count);
      g.computeBoundingBox();const box=g.boundingBox!;
      highest=Math.max(highest,box.max.y);
      assert.ok(Math.max(Math.abs(box.min.x),Math.abs(box.max.x),Math.abs(box.min.z),Math.abs(box.max.z))<=.74,`plot spill: ${tile.name}, Lv.${level}`);
      assert.ok(box.min.y>=-.0001);
      assert.ok(vertices.count/3<20000);
      g.dispose();
    }
    assert.ok(Math.abs(highest-landmarkModelHeight(tile.id,level))<.015,`label height mismatch: ${tile.name}, Lv.${level}`);
  }
});

test('all primary roofs, columns, balconies, signs and equipment connect to the ground through solid supports',()=>{
  for(const tile of TILES.filter(t=>hasLandmarkModel(t.id)))for(let level=0;level<=3;level++){
    const model=buildLandmarkModel(tile.id,level,palette);
    const solids=model.parts.filter(p=>p.structural);
    const reached=new Set(solids.filter(p=>p.bounds.min.y<=.006));
    let changed=true;
    while(changed){changed=false;for(const part of solids){
      if(reached.has(part))continue;
      if([...reached].some(other=>other.bounds.clone().expandByScalar(.006).intersectsBox(part.bounds))){reached.add(part);changed=true;}
    }}
    const disconnected=solids.filter(p=>!reached.has(p));
    assert.deepEqual(disconnected.map(p=>p.name),[],`${tile.name}, Lv.${level}: disconnected structure`);
    model.batches.forEach(b=>b.geometry.dispose());
  }
});

test('every purchasable property has its own model family and structural silhouette at every level',()=>{
  assert.deepEqual([...DISTINCT_PROPERTIES],TILES.filter(t=>t.type==='property').map(t=>t.id));
  assert.deepEqual(Object.keys(PROPERTY_DESCRIPTIONS).map(Number),[...DISTINCT_PROPERTIES]);
  for(const description of Object.values(PROPERTY_DESCRIPTIONS)) assert.equal(new Set(description.growth).size,4);
  const expected:Record<number,string>={1:'courtyard-rear-house',3:'apartment-stair-core',5:'lakeside-reflecting-pool',7:'villa-steep-gable',8:'shops-corner-clocktower',10:'workshop-tall-studio',12:'plaza-glass-dome',13:'office-glazed-slab',15:'skyline-setback-tier',17:'cinema-art-deco-pylon',18:'hotel-guest-wing',20:'theatre-barrel-roof',21:'resort-swimming-pool',23:'factory-sawtooth-roof',24:'energy-turbine-mast',26:'warehouse-dock-frame',28:'campus-atrium-glass-roof',31:'cloud-rounded-tower',34:'headquarters-corner-rotunda',35:'exhibition-pyramid-skylight',36:'trading-hall-main-hall',37:'quant-workshop-main-hall',38:'vault-main-hall',39:'procurement-main-hall',40:'flagship-main-hall',41:'warehouse-bay-main-hall'};
  for(let level=0;level<=3;level++){
    const fingerprints=new Set<string>();
    const families=new Set<string>();
    for(const id of DISTINCT_PROPERTIES){
      const m=buildLandmarkModel(id,level,palette);
      assert.ok(m.parts.some(p=>p.name===expected[id]));
      families.add(m.family);
      fingerprints.add(JSON.stringify(m.parts.filter(p=>p.structural).map(p=>[p.bounds.min.toArray(),p.bounds.max.toArray()])));
      m.batches.forEach(b=>b.geometry.dispose());
    }
    assert.equal(fingerprints.size,DISTINCT_PROPERTIES.length);
    assert.equal(families.size,DISTINCT_PROPERTIES.length);
  }
});

test('every purchasable property gains its architectural prestige details only at Level 3',()=>{
  for(const id of DISTINCT_PROPERTIES) for(let level=0;level<=3;level++){
    const m=buildLandmarkModel(id,level,palette);
    const signature=m.parts.filter(p=>p.name.startsWith('prestige-l3-'));
    assert.equal(signature.length>0,level===3,`${TILES[id].name}, Lv.${level}: unexpected prestige signature`);
    if(level===3)assert.ok(signature.length>=20,`${TILES[id].name}: incomplete luxury detailing`);
    m.batches.forEach(b=>b.geometry.dispose());
  }
});
test('each upgrade adds supported facilities beyond the change in building height',()=>{
  for(const id of DISTINCT_PROPERTIES) for(let level=0;level<=3;level++) {
    const m=buildLandmarkModel(id,level,palette);
    for(let stage=1;stage<=3;stage++) {
      const additions=m.parts.filter(p=>p.name.startsWith(`upgrade-${stage}-`)&&p.structural);
      assert.equal(additions.length>0,level>=stage,`${TILES[id].name}, Lv.${level}: missing or premature Lv.${stage} facility`);
    }
    m.batches.forEach(b=>b.geometry.dispose());
  }
});
