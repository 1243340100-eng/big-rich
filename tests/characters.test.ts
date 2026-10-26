import test from 'node:test';
import assert from 'node:assert/strict';
import {CHARACTER_SKINS,characterFor,PAWN_RADIUS,PAWN_SCALE} from '../shared/characters';
import {buildCharacter} from '../src/scene/characterGeometry';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {Vector3} from 'three';

test('cat and wolf retain undistorted facial volumes after surface attachment',()=>{
  for(const skin of ['lucky-cat','wall-street-wolf'] as const){
    const model=buildCharacter(skin);
    for(const eye of model.parts.filter(p=>p.name==='eye')){
      const size=eye.bounds.getSize(new Vector3());
      assert.ok(Math.abs(size.x-.074)<1e-5&&Math.abs(size.y-.10)<1e-5&&Math.abs(size.z-.05)<1e-5,'eye must translate without shearing');
    }
    if(skin==='lucky-cat')assert.ok(!model.parts.some(p=>['forehead-patch','forehead-stripe'].includes(p.name)),'fur colour belongs on the head surface');
    else for(const cheek of model.parts.filter(p=>p.name==='wolf-cheek')){
      const size=cheek.bounds.getSize(new Vector3());
      assert.ok(Math.abs(size.x-.24)<1e-5&&Math.abs(size.y-.26)<1e-5&&Math.abs(size.z-.32)<1e-5,'wolf cheeks must keep their original volume');
    }
    model.batches.forEach(b=>b.geometry.dispose());
  }
});

test('eight distinct low-poly characters have valid bounded geometry and fit the larger pawn footprint',()=>{
  assert.equal(new Set(CHARACTER_SKINS.map(s=>s.id)).size,8);
  const signatures=new Set<string>();
  for(const skin of CHARACTER_SKINS){
    const model=buildCharacter(skin.id),{bounds}=model;
    assert.ok(model.batches.length<=3);assert.ok(model.parts.length>=25,skin.id);
    assert.ok(bounds.min.y>=-.001&&bounds.max.y*PAWN_SCALE>.33,`${skin.id} should be taller than the previous car`);
    let vertices=0;
    for(const batch of model.batches){
      const positions=batch.geometry.getAttribute('position');vertices+=positions.count;
      for(let i=0;i<positions.count;i++){
        const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
        assert.ok([x,y,z].every(Number.isFinite));
        // Include the slight walking sway at the model's highest point.
        assert.ok((Math.hypot(x,z)+Math.abs(y)*.018)*PAWN_SCALE<=PAWN_RADIUS,`${skin.id} exceeds movement clearance`);
      }
    }
    assert.ok(vertices<24000,`${skin.id} exceeds the 8000-triangle low-poly budget`);
    signatures.add(JSON.stringify(model.parts.map(p=>[p.name,p.bounds.min.toArray(),p.bounds.max.toArray()])));
    model.batches.forEach(batch=>batch.geometry.dispose());
  }
  assert.equal(signatures.size,8);
});

test('required mascots carry their distinct props and old saves receive a deterministic character',()=>{
  for(const [skin,parts] of [['lucky-cat',['lucky-paw','gold-coin','bell']],['piggy-bank',['coin-slot','nostril','curly-tail']],['wall-street-wolf',['briefcase','tie','wolf-tail']]] as const){
    const model=buildCharacter(skin);for(const part of parts)assert.ok(model.parts.some(p=>p.name===part));model.batches.forEach(batch=>batch.geometry.dispose());
  }
  assert.equal(characterFor(undefined,0).id,'lucky-cat');assert.equal(characterFor(undefined,1).id,'piggy-bank');assert.equal(characterFor('invalid',2).id,'wall-street-wolf');
});

test('skin choices are cosmetic, server validated, personal and independent of the current turn',()=>{
  const original=createGame('SKINS1');addPlayer(original,'甲','程序员',false,'piggy-bank');addPlayer(original,'乙','银行家');
  assert.equal(original.players[0].skin,'piggy-bank');assert.throws(()=>addPlayer(original,'无效','程序员',false,'hacked'),/皮肤无效/);
  const state=dispatch(original,original.hostId,{type:'start'}),other=state.players[1];
  const changed=dispatch(state,other.id,{type:'skin',skin:'abacus-fox',playerId:state.hostId,cash:999999,position:31});
  assert.deepEqual(changed,{...state,version:state.version+1,players:state.players.map(p=>p.id===other.id?{...p,skin:'abacus-fox'}:p)});
  assert.throws(()=>dispatch(state,other.id,{type:'skin',skin:'hacked'}),/皮肤无效/);
  assert.equal(state.players[1].skin,'piggy-bank');
  const recovered=JSON.parse(JSON.stringify(changed));assert.equal(recovered.players[1].skin,'abacus-fox');
  changed.status='finished';assert.equal(dispatch(changed,other.id,{type:'skin',skin:'fortune-panda'}).players[1].skin,'fortune-panda');
});
