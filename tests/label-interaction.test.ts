import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hoveredTileFromHits, labelFirstHits, visibleLabelRaycast } from '../src/scene/labelInteraction';

function fixture() {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.z = 10;
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(), camera);
  const material = new THREE.SpriteMaterial();
  const sprite = new THREE.Sprite(material);
  sprite.userData.boardLabel = true;
  sprite.raycast = visibleLabelRaycast;
  const group = new THREE.Group();
  group.userData.tileId = 3;
  group.add(sprite);
  group.updateMatrixWorld(true);
  return { ray, sprite, group, dispose: () => material.dispose() };
}

test('hidden labels cannot intercept pointer events, including a hidden ancestor', () => {
  const { ray, sprite, group, dispose } = fixture();
  assert.equal(ray.intersectObject(group, true).length, 1);
  sprite.visible = false;
  assert.equal(ray.intersectObject(group, true).length, 0);
  sprite.visible = true;
  group.visible = false;
  assert.equal(ray.intersectObject(group, true).length, 0);
  group.visible = true;
  assert.equal(ray.intersectObject(group, true).length, 1);
  dispose();
});

test('pointer-out preserves hover when moving between a label and its own building', () => {
  const { ray, group, dispose } = fixture();
  const labelHits = ray.intersectObject(group, true);
  assert.equal(hoveredTileFromHits(labelHits), 3);
  const building = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  group.add(building);
  group.updateMatrixWorld(true);
  assert.equal(hoveredTileFromHits([{ object: building }]), 3);
  assert.equal(hoveredTileFromHits([]), null);
  building.geometry.dispose();
  (building.material as THREE.Material).dispose();
  dispose();
});

test('a departing label cannot clear the newly hovered tile or revive a hidden hit', () => {
  const { ray, sprite, group, dispose } = fixture();
  const oldHits = ray.intersectObject(group, true);
  const next = new THREE.Group();
  next.userData.tileId = 7;
  const nextMesh = new THREE.Object3D();
  next.add(nextMesh);
  assert.equal(hoveredTileFromHits([{ object: nextMesh }, ...oldHits]), 7);
  sprite.visible = false;
  assert.equal(hoveredTileFromHits([...oldHits, { object: nextMesh }]), 7);
  dispose();
});

test('visible overlay labels receive events before buildings, matching their draw order', () => {
  const { ray, sprite, group, dispose } = fixture();
  const labelHit = ray.intersectObject(group, true)[0];
  const building = new THREE.Object3D();
  const buildingHit = { ...labelHit, object: building, distance: 1 };
  assert.equal(labelFirstHits([buildingHit, labelHit])[0].object, sprite);
  const topLabel = new THREE.Sprite(sprite.material);
  topLabel.userData.boardLabel = true;
  topLabel.renderOrder = 40;
  const topHit = { ...labelHit, object: topLabel, distance: 20 };
  assert.equal(labelFirstHits([labelHit, topHit, buildingHit])[0].object, topLabel);
  sprite.visible = false;
  assert.ok(labelFirstHits([labelHit, topHit, buildingHit]).every(hit => hit.object !== sprite));
  dispose();
});
