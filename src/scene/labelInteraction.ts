import * as THREE from 'three';

export function isVisibleInScene(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

// Visibility alone does not exclude a sprite from Three.js raycasting.
export function visibleLabelRaycast(this: THREE.Sprite, raycaster: THREE.Raycaster, hits: THREE.Intersection[]) {
  if (isVisibleInScene(this)) THREE.Sprite.prototype.raycast.call(this, raycaster, hits);
}

export function labelFirstHits<T extends THREE.Intersection>(hits: T[]): T[] {
  return hits.filter(hit => isVisibleInScene(hit.object)).sort((a, b) => {
    const aLabel = a.object.userData.boardLabel === true;
    const bLabel = b.object.userData.boardLabel === true;
    return Number(bLabel) - Number(aLabel) || (aLabel && bLabel ? b.object.renderOrder - a.object.renderOrder : 0) || a.distance - b.distance;
  });
}

// A previous object's pointer-out must preserve the newly hovered tile.
export function hoveredTileFromHits(hits: readonly Pick<THREE.Intersection, 'object'>[]): number | null {
  for (const hit of hits) {
    if (!isVisibleInScene(hit.object)) continue;
    for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
      if (typeof object.userData.tileId === 'number') return object.userData.tileId;
    }
  }
  return null;
}

export const LABEL_WIDTH = 84;
export const ACTIVE_LABEL_WIDTH = 104;
export const LABEL_ASPECT = 120 / 512;
