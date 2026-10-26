import * as THREE from 'three';
import { DetailBuilder, type ArchitecturalPalette, type Finish, type V3 } from './detailGeometry';

export interface ModelPart { name: string; bounds: THREE.Box3; structural: boolean; }

export class Model extends DetailBuilder {
  parts: ModelPart[] = [];
  constructor(private excluded:ReadonlySet<string>=new Set()) {super();}
  part(name: string, geometry: THREE.BufferGeometry, pos: V3, paint: string, structural = false, rotation: V3 = [0, 0, 0], finish: Finish = 'stone') {
    if(this.excluded.has(name)){geometry.dispose();return;}
    geometry.computeBoundingBox();
    const transform = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rotation)).setPosition(...pos);
    this.parts.push({ name, structural, bounds: geometry.boundingBox!.clone().applyMatrix4(transform) });
    this.add(geometry, paint, pos, rotation, finish);
  }
  block(name: string, size: V3, pos: V3, paint: string, structural = true, finish: Finish = 'stone') {
    this.part(name, new THREE.BoxGeometry(...size), pos, paint, structural, [0, 0, 0], finish);
  }
  post(name: string, radius: number, bottom: number, top: number, x: number, z: number, paint: string) {
    this.part(name, new THREE.CylinderGeometry(radius, radius, top - bottom, 10), [x, (bottom + top) / 2, z], paint, true);
  }
}

export function prism(points: [number, number][], depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(...points[0]);
  points.slice(1).forEach(p => shape.lineTo(...p));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 16 });
}
export function hipRoof(width: number, depth: number, height: number) {
  const x = width / 2, z = depth / 2;
  const vertices = [[-x,0,-z],[x,0,-z],[x,0,z],[-x,0,z],[0,height,0]];
  const faces = [[0,4,1],[1,4,2],[2,4,3],[3,4,0],[0,1,2],[0,2,3]];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces.flatMap(f => f.flatMap(i => vertices[i])), 3));
  geometry.computeVertexNormals();
  return geometry;
}
export function base(b: Model, p: ArchitecturalPalette) { b.block('ground-plinth', [1.4,.06,1.3], [0,.03,0], p.wallAlt); }
export function frontWindows(b: Model, p: ArchitecturalPalette, xs: number[], ys: number[], z: number, width=.16) {
  for (const x of xs) for (const y of ys) {
    b.block('window-frame', [width+.025,.12,.025], [x,y,z], p.roof, false, 'metal');
    b.block('window-glass', [width,.09,.012], [x,y,z+.018], p.glow, false, 'light');
    b.block('window-mullion', [.012,.095,.017], [x,y,z+.027], p.wallAlt, false);
  }
}
export function rows(level: number, bottom=.25, step=.22) { return Array.from({length:level+3},(_,i)=>bottom+i*step); }

