import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BuildingUpgradeTimeline, UPGRADE_TIMING as K, constructionFrame, scaffoldRingProgress } from '../src/scene/upgradeAnimation';
import { CONSTRUCTION, constructionDimensions, buildConstructionCurtain, buildScaffoldTier } from '../src/scene/constructionGeometry';
import { DISTINCT_PROPERTIES, buildLandmarkModel, landmarkModelHeight } from '../src/scene/landmarkGeometry';

const palette={wall:'#ddcfb1',wallAlt:'#cbbb99',roof:'#5e7564',trim:'#a96c4f',accent:'#87ad91',glow:'#ffc378'};

test('buying a vacant plot constructs level zero once and reveals it under the curtain',()=>{
  const t=new BuildingUpgradeTimeline(-1,'room');
  t.sync(0,'room',true,'buyer');
  assert.equal(t.run!.from,-1);assert.equal(t.run!.to,0);
  t.advance(.6);const run={...t.run!};
  t.sync(0,'room',true,'buyer');assert.deepEqual(t.run,run);
  t.advance(K.commit-.6-.001);assert.equal(t.displayLevel,-1);
  t.advance(.002);assert.equal(t.displayLevel,0);
  assert.equal(constructionFrame(t.run!.elapsed).coverDrop,1);
  t.sync(1,'room',true,'buyer');t.advance(K.duration);
  assert.equal(t.run!.from,0);assert.equal(t.run!.to,1);
  t.advance(100);assert.equal(t.displayLevel,1);assert.equal(t.run,null);
});

test('initial purchase respects reduced motion, room changes, transfers and reloads',()=>{
  const reduced=new BuildingUpgradeTimeline(-1,'room');reduced.sync(0,'room',false,'buyer');
  assert.equal(reduced.displayLevel,0);assert.equal(reduced.run,null);
  const otherRoom=new BuildingUpgradeTimeline(-1,'old');otherRoom.sync(0,'new',true,'buyer');
  assert.equal(otherRoom.run,null);assert.equal(otherRoom.displayLevel,0);
  const loaded=new BuildingUpgradeTimeline(0,'room','buyer');loaded.sync(0,'room',true,'buyer');
  assert.equal(loaded.run,null);
  const transfer=new BuildingUpgradeTimeline(-1,'room');transfer.sync(0,'room',true,'buyer');
  transfer.advance(.5);transfer.sync(0,'room',true,'recipient');assert.equal(transfer.run,null);
  transfer.sync(-1,'room',true);assert.equal(transfer.displayLevel,-1);
  transfer.sync(0,'room',true,'new-buyer');assert.equal(transfer.run!.from,-1);
});

test('opening an existing building never replays construction; unchanged snapshots are idempotent',()=>{
  for(const id of DISTINCT_PROPERTIES)for(let level=0;level<=3;level++) {
    const timeline=new BuildingUpgradeTimeline(level,`room:owner:${id}`);
    timeline.sync(level,timeline.identity);timeline.advance(30);
    assert.equal(timeline.run,null);assert.equal(timeline.displayLevel,level);
  }
  const timeline=new BuildingUpgradeTimeline(0,'a');timeline.sync(1,'a');timeline.advance(.4);
  const before={...timeline.run!};timeline.sync(1,'a');
  assert.deepEqual(timeline.run,before);
});

test('all 60 property upgrades switch geometry only behind a fully closed, opaque curtain',()=>{
  for(const id of DISTINCT_PROPERTIES)for(let level=1;level<=3;level++) {
    const timeline=new BuildingUpgradeTimeline(level-1,`${id}`);timeline.sync(level,`${id}`);
    timeline.advance(K.commit-.0001);assert.equal(timeline.displayLevel,level-1);
    timeline.advance(.0002);
    assert.equal(timeline.displayLevel,level);
    const frame=constructionFrame(timeline.run!.elapsed);
    assert.equal(frame.coverDrop,1);assert.equal(frame.coverOpacity,1);assert.equal(frame.phase,'covered');
    timeline.advance(K.duration);assert.equal(timeline.run,null);assert.equal(timeline.displayLevel,level);
  }
});

test('scaffold perimeters appear strictly from bottom to top and finish before covering',()=>{
  for(const id of DISTINCT_PROPERTIES)for(let level=1;level<=3;level++) {
    const {rings}=constructionDimensions(landmarkModelHeight(id,level));
    for(let t=0;t<=K.scaffoldEnd;t+=.01)for(let i=0;i<rings;i++) {
      const p=scaffoldRingProgress(t,i,rings);
      assert.ok(p>=0&&p<=1.11);
      if(i>0&&p>0)assert.ok(scaffoldRingProgress(t,i-1,rings)>.85,'unsupported upper ring');
      assert.equal(constructionFrame(t).coverDrop,0);
    }
    for(let i=0;i<rings;i++)assert.equal(scaffoldRingProgress(K.scaffoldEnd,i,rings),1);
  }
});

test('rapid upgrades finish the active cycle, coalesce the next target, and never restore an old level',()=>{
  const timeline=new BuildingUpgradeTimeline(0,'a');timeline.sync(1,'a');timeline.advance(.5);
  timeline.sync(2,'a');timeline.sync(3,'a');assert.equal(timeline.run!.to,1);
  timeline.advance(K.duration-.5);
  assert.equal(timeline.displayLevel,1);assert.equal(timeline.run!.from,1);assert.equal(timeline.run!.to,3);
  timeline.advance(K.commit);assert.equal(timeline.displayLevel,3);
  timeline.advance(K.duration);assert.equal(timeline.run,null);assert.equal(timeline.displayLevel,3);
});

test('owner changes, downgrades and reduced-motion preference cancel construction immediately',()=>{
  for(const cancel of ['owner','downgrade','reduced']) {
    const timeline=new BuildingUpgradeTimeline(1,'a');timeline.sync(3,'a');timeline.advance(.5);
    if(cancel==='owner')timeline.sync(2,'b');
    if(cancel==='downgrade')timeline.sync(0,'a');
    if(cancel==='reduced')timeline.sync(3,'a',false);
    assert.equal(timeline.run,null);assert.equal(timeline.displayLevel,cancel==='owner'?2:cancel==='downgrade'?0:3);
    timeline.advance(100);assert.equal(timeline.run,null);
  }
});

test('frame skips and replay do not leave scaffolds or stale buildings behind',()=>{
  const timeline=new BuildingUpgradeTimeline(0,'a');timeline.sync(1,'a');timeline.sync(3,'a');timeline.advance(100);
  assert.equal(timeline.displayLevel,3);assert.equal(timeline.run,null);
  timeline.replay(3);assert.equal(timeline.displayLevel,2);assert.equal(timeline.run!.to,3);
  timeline.advance(100);assert.equal(timeline.displayLevel,3);assert.equal(timeline.run,null);
  timeline.replay(0);assert.equal(timeline.run,null);assert.equal(timeline.displayLevel,0);
});

test('spring motion has a bounded squash and overshoot and settles exactly to the original transform',()=>{
  let stretched=false,squashed=false;
  for(let t=0;t<=K.duration+.1;t+=.004) {
    const f=constructionFrame(t);
    for(const value of Object.values(f).filter(v=>typeof v==='number'))assert.ok(Number.isFinite(value));
    assert.ok(f.buildingY>=.869&&f.buildingY<1.14);assert.ok(f.buildingXZ>.94&&f.buildingXZ<=1.056);
    if(f.buildingY>1.01)stretched=true;if(f.buildingY<.95)squashed=true;
  }
  assert.ok(stretched&&squashed);
  const end=constructionFrame(K.duration);
  assert.equal(end.buildingY,1);assert.equal(end.buildingXZ,1);
  assert.equal(end.scaffoldOpacity,0);assert.equal(end.coverDrop,0);assert.equal(end.coverOpacity,0);
});

test('batched construction geometry surrounds every upgraded model and fits inside the owned plot',()=>{
  for(const id of DISTINCT_PROPERTIES)for(let level=1;level<=3;level++) {
    const h=Math.max(landmarkModelHeight(id,level-1),landmarkModelHeight(id,level));
    const dimensions=constructionDimensions(h),tier=buildScaffoldTier(dimensions.tierHeight);
    const curtain=buildConstructionCurtain(dimensions.clothTop-.02,palette.accent);
    assert.ok(dimensions.rings<=9);
    for(const g of [tier,curtain]) {
      const positions=g.getAttribute('position');assert.ok([...positions.array].every(Number.isFinite));
      assert.equal(positions.count,g.getAttribute('normal').count);assert.equal(positions.count,g.getAttribute('color').count);
      assert.ok(positions.count/3<2500);g.computeBoundingBox();
    }
    assert.ok(Math.abs(tier.boundingBox!.min.y+CONSTRUCTION.bottom)<.000001,'scaffold feet must meet the plot surface');
    const clothBounds=curtain.boundingBox!.clone().translate(new THREE.Vector3(0,dimensions.clothTop,0));
    assert.ok(Math.max(Math.abs(clothBounds.min.x),Math.abs(clothBounds.max.x))*1.01*1.08<.89);
    assert.ok(Math.max(Math.abs(clothBounds.min.z),Math.abs(clothBounds.max.z))*1.01*1.08+.1<.89);
    for(const l of [level-1,level]) {
      const model=buildLandmarkModel(id,l,palette);
      for(const part of model.parts) {
        assert.ok(part.bounds.min.x>-CONSTRUCTION.clothX&&part.bounds.max.x<CONSTRUCTION.clothX);
        assert.ok(part.bounds.min.z>-CONSTRUCTION.clothZ&&part.bounds.max.z<CONSTRUCTION.clothZ);
        assert.ok(part.bounds.max.y<clothBounds.max.y-.02);
      }
      model.batches.forEach(b=>b.geometry.dispose());
    }
    tier.dispose();curtain.dispose();
  }
});
