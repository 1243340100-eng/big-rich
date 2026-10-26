import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DetailBuilder } from './detailGeometry';

export const CONSTRUCTION = { x:.728, z:.682, clothX:.765, clothZ:.713, bottom:0 } as const;
export function constructionDimensions(height:number) {
  const scaffoldTop=height+.15;
  const rings=Math.max(3,Math.ceil((scaffoldTop-CONSTRUCTION.bottom)/.28));
  return {rings,tierHeight:(scaffoldTop-CONSTRUCTION.bottom)/rings,clothTop:height+.16};
}

/** One batched tier is instanced for every floor of the construction cage. */
export function buildScaffoldTier(h:number) {
  const b=new DetailBuilder(), {x,z}=CONSTRUCTION;
  const steel='#769a9a', joint='#c8aa70', wood='#b98e57';
  for(const sx of [-x,x])for(const sz of [-z,z]) {
    b.cylinder(.011,h,[sx,h/2,sz],steel,'metal',6);
    b.box([.042,.020,.042],[sx,.01,sz],joint,[0,0,0],'metal');
    b.box([.031,.025,.031],[sx,h-.022,sz],joint,[0,0,0],'metal');
  }
  for(const sz of [-z,z]) {
    for(const y of [h*.45,h-.02])b.rod([-x,y,sz],[x,y,sz],.008,steel);
    b.rod([-x,.015,sz],[x,h-.035,sz],.0055,joint);
    b.rod([x,.015,sz],[-x,h-.035,sz],.0055,joint);
    b.box([1.49,.023,.065],[0,h*.66,Math.sign(sz)*.667],wood,[0,0,0],'metal');
  }
  for(const sx of [-x,x]) {
    for(const y of [h*.45,h-.02])b.rod([sx,y,-z],[sx,y,z],.008,steel);
    b.rod([sx,.015,-z],[sx,h-.035,z],.0055,joint);
    b.rod([sx,.015,z],[sx,h-.035,-z],.0055,joint);
    b.box([.065,.023,1.30],[Math.sign(sx)*.714,h*.66,0],wood,[0,0,0],'metal');
  }
  return b.finish()[0].geometry;
}

export function buildConstructionCurtain(height:number, accent:string) {
  const {clothX:x,clothZ:z}=CONSTRUCTION;
  const pieces:THREE.BufferGeometry[]=[];
  const paint=new THREE.Color(accent).lerp(new THREE.Color('#44898e'),.72);
  const hem=new THREE.Color('#e2cf99');
  for(const [width,angle] of [[2*x,0],[2*x,Math.PI],[2*z,Math.PI/2],[2*z,-Math.PI/2]]) {
    const g=new THREE.PlaneGeometry(width,height,48,6);
    const pos=g.getAttribute('position'),uv=g.getAttribute('uv');
    const colors=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++) {
      const u=uv.getX(i),v=uv.getY(i);
      // Folds taper to zero at both edges so the four curtain corners stay closed.
      pos.setZ(i,.011*(.5+.5*Math.cos(u*Math.PI*24))*Math.sin(v*Math.PI)*Math.sin(u*Math.PI));
      const seam=Math.min(u,1-u)<.018||v<.035||v>.975;
      const tint=seam?hem:paint;
      const shade=seam?1:.91+.09*Math.cos(u*Math.PI*24);
      colors[i*3]=tint.r*shade;colors[i*3+1]=tint.g*shade;colors[i*3+2]=tint.b*shade;
    }
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    g.translate(0,-height/2,Math.abs(Math.sin(angle))>.5?x:z);
    g.rotateY(angle);g.computeVertexNormals();g.deleteAttribute('uv');
    const flat=g.toNonIndexed();g.dispose();pieces.push(flat);
  }
  const capSource=new THREE.BoxGeometry(x*2,.02,z*2),cap=capSource.toNonIndexed();capSource.dispose();
  const colors=new Float32Array(cap.getAttribute('position').count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=paint.r;colors[i+1]=paint.g;colors[i+2]=paint.b;}
  cap.setAttribute('color',new THREE.BufferAttribute(colors,3));cap.deleteAttribute('uv');pieces.push(cap);
  const geometry=mergeGeometries(pieces,false)!;pieces.forEach(g=>g.dispose());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
