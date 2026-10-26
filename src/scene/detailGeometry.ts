import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];
export type Finish = 'stone' | 'metal' | 'glass' | 'leaf' | 'light';
export type DetailBatch = { finish: Finish; geometry: THREE.BufferGeometry; parts: number };
export type ArchitecturalPalette = { wall: string; wallAlt: string; roof: string; trim: string; accent: string; glow: string };
const up = new THREE.Vector3(0, 1, 0);
const q = new THREE.Quaternion();
const m = new THREE.Matrix4();
const color = new THREE.Color();

/** Tiny components are baked into five vertex-coloured meshes, not hundreds of draw calls. */
export class DetailBuilder {
  private bins = new Map<Finish, THREE.BufferGeometry[]>();
  pieces = 0;
  add(geometry: THREE.BufferGeometry, paint: string, pos: V3, rotation: V3 = [0, 0, 0], finish: Finish = 'stone') {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    g.deleteAttribute('uv');
    m.compose(new THREE.Vector3(...pos), q.setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    color.set(paint);
    const colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!this.bins.has(finish)) this.bins.set(finish, []);
    this.bins.get(finish)!.push(g);
    this.pieces++;
  }
  box(size: V3, pos: V3, paint: string, rotation: V3 = [0, 0, 0], finish: Finish = 'stone') {
    this.add(new THREE.BoxGeometry(...size), paint, pos, rotation, finish);
  }
  cylinder(radius: number, height: number, pos: V3, paint: string, finish: Finish = 'metal', segments = 10, rotation: V3 = [0, 0, 0]) {
    this.add(new THREE.CylinderGeometry(radius, radius, height, segments), paint, pos, rotation, finish);
  }
  ball(radius: number, pos: V3, paint: string, finish: Finish = 'leaf') {
    this.add(new THREE.IcosahedronGeometry(radius, 0), paint, pos, [0, 0, 0], finish);
  }
  rod(a: V3, b: V3, radius: number, paint: string, finish: Finish = 'metal') {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const g = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, delta.normalize()));
    this.add(g, paint, from.add(to).multiplyScalar(.5).toArray() as V3, [0, 0, 0], finish);
  }
  ring(radius: number, tube: number, pos: V3, paint: string, rotation: V3 = [Math.PI / 2, 0, 0], finish: Finish = 'metal') {
    this.add(new THREE.TorusGeometry(radius, tube, 5, 24), paint, pos, rotation, finish);
  }
  finish(): DetailBatch[] {
    const batches: DetailBatch[] = [];
    for (const [finish, list] of this.bins) {
      const geometry = mergeGeometries(list, false)!;
      geometry.computeBoundingSphere();
      batches.push({finish, geometry, parts: list.length});
      list.forEach(g => g.dispose());
    }
    this.bins.clear();
    return batches;
  }
}

const C = { brass:'#b88d4e', iron:'#34443e', stone:'#c8b99a', dark:'#293b36', wood:'#78634b', green:'#647f64', pale:'#e7d7b6', glass:'#507b79', amber:'#ffd39c' };

function window(b: DetailBuilder, x: number, y: number, z: number, w: number, h: number, paint: ArchitecturalPalette, side = false, lit = true) {
  const place = (size: V3, position: V3, color: string, finish: Finish = 'stone') => {
    if(side)b.box([size[2],size[1],size[0]],[position[2],position[1],position[0]],color,[0,0,0],finish);
    else b.box(size,position,color,[0,0,0],finish);
  };
  const face=z<0?-1:1;
  place([w+.04,h+.04,.018],[x,y,z],paint.wallAlt);
  place([w,h,.022],[x,y,z+face*.012],lit?paint.glow:C.glass,lit?'light':'glass');
  place([.012,h,.031],[x,y,z+face*.025],paint.roof,'metal');
  place([w,.012,.031],[x,y,z+face*.025],paint.roof,'metal');
  place([w+.06,.022,.065],[x,y-h/2-.02,z+face*.02],paint.wallAlt);
}

export function planter(b: DetailBuilder, x: number, y: number, z: number, width=.2, seed=0) {
  b.box([width,.075,.13],[x,y+.04,z],C.wood);
  b.box([width-.025,.012,.1],[x,y+.081,z],'#384a36');
  for(let i=0;i<5;i++){
    const px=x-width*.36+i*width*.18;
    b.ball(.035,[px,y+.105,z],i%2? '#7e946a':'#536e51');
    b.ball(.015,[px,y+.133,z+.01],['#c99c6a','#dfc385','#b98771'][(i+seed)%3]);
  }
}

export function bench(b: DetailBuilder, x: number, y: number, z: number, angle=0) {
  const at=(px:number,py:number,pz:number):V3=>[x+Math.cos(angle)*px+Math.sin(angle)*pz,y+py,z-Math.sin(angle)*px+Math.cos(angle)*pz];
  for(let i=0;i<4;i++)b.box([.46,.025,.035],at(0,.16,-.07+i*.045),C.wood,[0,angle,0]);
  for(let i=0;i<3;i++)b.box([.46,.03,.024],at(0,.25+i*.045,-.1),C.wood,[0,angle,0]);
  for(const sx of [-.17,.17]){
    b.rod(at(sx,.02,-.07),at(sx,.35,-.1),.014,C.iron);
    b.rod(at(sx,.02,.07),at(sx,.18,.07),.014,C.iron);
    b.rod(at(sx,.25,-.1),at(sx,.25,.1),.011,C.iron);
  }
}

export function person(b: DetailBuilder,x:number,y:number,z:number,seed=0,angle=0) {
  const coat=['#85735d','#637e70','#957663','#48666e','#a38e6b'][seed%5];
  const at=(a:number,h:number,c:number):V3=>[x+Math.cos(angle)*a+Math.sin(angle)*c,y+h,z-Math.sin(angle)*a+Math.cos(angle)*c];
  b.box([.065,.12,.05],at(0,.16,0),coat,[0,angle,0]);
  b.ball(.038,at(0,.26,0),'#c7a58b','stone');
  b.ball(.034,at(0,.279,-.006),'#443c31','stone');
  b.rod(at(-.019,.12,0),at(-.029,.025,.02),.012,C.iron);
  b.rod(at(.019,.12,0),at(.029,.025,-.02),.012,C.iron);
  b.rod(at(-.04,.205,0),at(-.055,.115,.015),.012,coat,'stone');
  b.rod(at(.04,.205,0),at(.055,.12,-.01),.012,coat,'stone');
  if(seed%3===0)b.box([.04,.055,.055],at(.075,.09,0),C.wood,[0,angle,0]);
}

function railing(b:DetailBuilder,a:V3,end:V3,height=.15) {
  const length=Math.hypot(end[0]-a[0],end[2]-a[2]);
  const n=Math.ceil(length/.075);
  for(let i=0;i<=n;i++){
    const t=i/n;const x=a[0]+(end[0]-a[0])*t,z=a[2]+(end[2]-a[2])*t;
    b.rod([x,a[1],z],[x,a[1]+height,z],.006,C.iron);
  }
  b.rod([a[0],a[1]+height,a[2]],[end[0],end[1]+height,end[2]],.009,C.brass);
}

export function buildArchitecture(tileId: number, level: number, p: ArchitecturalPalette): DetailBatch[] {
  const b=new DetailBuilder();
  const garden=[1,3,5,7].includes(tileId), coast=[17,18,20,21].includes(tileId), industry=[23,24,26,28].includes(tileId);
  const w=garden?.78+level*.025:industry?.84+level*.018:coast?.8:.72+level*.025;
  const d=garden?.6+level*.015:industry?.68:coast?.58:.64;
  const h=garden?.42+level*.17:industry?.4+level*.16:coast?.42+level*.19:.55+level*.28;

  // Quoins, plinths and mortar lines continue around the back and side walls.
  for(let row=0;row<Math.floor(h/.08);row++){
    const y=.04+row*.08;
    for(const sx of [-1,1])b.box([.068,.032,.025],[sx*(w/2-.025),y,-d/2-.014],row%2?p.wallAlt:p.wall);
    b.box([w-.12,.004,.008],[0,y,-d/2-.007],p.wallAlt);
  }
  for(const sy of [-1,1]){
    b.box([w+.045,.035,.038],[0,.025,sy*(d/2+.009)],p.wallAlt);
    b.box([.035,.035,d+.04],[sy*(w/2+.009),.025,0],p.wallAlt);
    b.box([.022,h,.022],[sy*(w/2+.018),h/2,-d/2-.02],C.brass,[0,0,0],'metal');
    for(let k=0;k<3;k++)b.box([.04,.012,.04],[sy*(w/2+.018),h*(.2+k*.3),-d/2-.02],C.iron,[0,0,0],'metal');
  }
  for(let row=0;row<Math.max(1,level+1);row++){
    const y=.2+row*(h-.28)/Math.max(1,level);
    if(y+.07<h){
      for(const x of [-w*.24,w*.24])window(b,x,y,-d/2-.02,.12,.10,p,false,(tileId+row)%3!==0);
      window(b,-.12,y,-w/2-.03,.13,.09,p,true,row%2===0);
    }
  }
  if(garden){
    // Individual hip-roof courses, raised ridge seams and gutter brackets.
    const rw=w+.18,rd=d+.16,rh=.3+level*.025,base=h+.01-rh/2;
    for(let row=1;row<=7;row++){
      const t=row/8, halfW=rw/2*(1-t),halfD=rd/2*(1-t),y=base+rh*t+.005;
      for(const sign of [-1,1]){
        b.box([halfW*2,.009,.012],[0,y,sign*halfD],row%2?p.roof:'#728074');
        b.box([.012,.009,halfD*2],[sign*halfW,y,0],row%2?p.roof:'#728074');
        const n=Math.max(1,Math.floor(halfW*2/.1));
        for(let j=0;j<n;j++)b.box([.006,.01,.025],[-halfW+(j+.5)*halfW*2/n,y,sign*halfD],p.wallAlt);
      }
    }
    for(const sx of [-1,1])for(const sz of [-1,1])b.rod([sx*rw/2,base,sz*rd/2],[0,base+rh,0],.009,C.brass);
    for(const sign of [-1,1])b.box([rw+.035,.02,.025],[0,base-.016,sign*rd/2],C.iron,[0,0,0],'metal');
    for(const sign of [-1,1])railing(b,[sign*.66,.02,-.55],[sign*.66,.02,.28],.18);
    for(let k=0;k<4;k++)b.box([.21,.012,.075],[-.22,.018,.4+k*.084],k%2?C.pale:C.stone);
    planter(b,.3,.02,.51,.26,tileId);
    b.box([.08,.09,.07],[-.53,.2,.55],p.roof,[0,0,0],'metal');
    b.rod([-.53,.01,.55],[-.53,.18,.55],.012,C.iron);
    if(level>=1){railing(b,[-.29,h*.65+.035,.53],[.29,h*.65+.035,.53],.12);}
  }else if(industry){
    // External service duct, real ladder rungs, pipe collars and loading-yard markings.
    b.rod([-.46,.1,-.37],[-.46,h+.16,-.37],.028,p.roof);
    b.rod([-.46,h+.16,-.37],[.25,h+.16,-.37],.028,p.roof);
    for(let i=0;i<5;i++)b.ring(.034,.008,[-.46,.12+i*h/5,-.37],C.brass);
    for(const x of [-.22,-.11])b.rod([x,.05,-.39],[x,h+.13,-.39],.01,C.iron);
    for(let i=0;i<Math.ceil(h/.075);i++)b.rod([-.22,.05+i*.075,-.39],[-.11,.05+i*.075,-.39],.008,C.brass);
    for(let i=0;i<10;i++)b.box([.018,.013,.57],[-w/2+.04+i*(w-.08)/9,h+.02,0],p.wallAlt);
    for(let i=0;i<5;i++)b.box([.055,.007,.20],[-.28+i*.13,.012,.57],i%2?C.brass:C.iron,[0,.45,0]);
    for(let i=0;i<4;i++){
      const x=.51+(i%2)*.1,z=-.43+Math.floor(i/2)*.13;
      b.box([.09,.1,.11],[x,.055,z],p.trim);
      b.box([.092,.008,.014],[x,.08,z+.056],C.brass);
    }
    b.box([.25,.12,.23],[.13,h+.09,-.08],'#829086',[0,0,0],'metal');
    for(let j=0;j<7;j++)b.box([.2,.008,.01],[.13,h+.055+j*.012,.04],C.iron,[0,0,0],'metal');
    b.cylinder(.085,.016,[.13,h+.159,-.08],C.iron);
    for(let j=0;j<5;j++)b.box([.14,.009,.01],[.13,h+.17,-.08],C.brass,[0,j*Math.PI/5,0],'metal');
  }else{
    // Art-deco side pilasters, back balconies and a roof access penthouse service rail.
    for(let row=0;row<=level;row++){
      const y=.33+row*.24;
      if(y<h){
        b.box([w+.06,.018,.036],[0,y,-d/2-.025],p.wallAlt);
        for(const x of [-w*.3,w*.3])b.box([.028,.045,.04],[x,y-.025,-d/2-.025],C.brass,[0,0,0],'metal');
      }
    }
    for(let i=0;i<9;i++)b.box([.025,.035,.035],[-w/2+i*w/8,h-.035,-d/2-.025],C.brass,[0,0,0],'metal');
    railing(b,[-w/2,h+.012,-d/2-.025],[w/2,h+.012,-d/2-.025],.1);
    for(const x of [-w*.32,w*.32]){
      b.box([.025,h*.74,.04],[x,h*.5,-d/2-.024],p.wallAlt);
    }
    if(coast){
      // Café furniture and striped sunshade with separate ribs.
      b.cylinder(.095,.018,[-.57,.18,-.29],C.pale,'stone');
      b.rod([-.57,.01,-.29],[-.57,.39,-.29],.008,C.brass);
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4;
        const next=a+Math.PI/4;
        const fabric=new THREE.BufferGeometry();
        fabric.setAttribute('position',new THREE.Float32BufferAttribute([
          0,.07,0, Math.cos(next)*.15,0,Math.sin(next)*.15, Math.cos(a)*.15,0,Math.sin(a)*.15,
          0,.065,0, Math.cos(a)*.15,-.005,Math.sin(a)*.15, Math.cos(next)*.15,-.005,Math.sin(next)*.15,
        ],3));
        fabric.computeVertexNormals();
        b.add(fabric,i%2?p.accent:C.pale,[-.57,.32,-.29]);
        b.rod([-.57,.39,-.29],[-.57+Math.cos(a)*.15,.32,-.29+Math.sin(a)*.15],.007,i%2?p.accent:C.pale,'stone');
      }
      for(const z of [-.45,-.13]){
        b.box([.1,.025,.09],[-.57,.1,z],p.roof);
        b.box([.1,.09,.018],[-.57,.16,z+(z<-.2?-.045:.045)],p.roof);
      }
      planter(b,-.45,.01,.55,.27,tileId);
    }else{
      b.box([.16,.22,.09],[.53,.12,.25],p.roof,[0,0,0],'metal');
      b.box([.115,.08,.01],[.53,.17,.30],C.glass,[0,0,0],'glass');
      for(let j=0;j<3;j++)b.box([.08,.006,.01],[.53,.1-j*.02,.30],C.brass);
      planter(b,.48,.02,-.4,.22,tileId);
    }
  }
  // Discrete exterior fixtures, feet and grille details visible from the street.
  b.box([.14,.09,.04],[w/2+.026,.19,.13],'#889084',[0,Math.PI/2,0],'metal');
  for(let i=0;i<5;i++)b.box([.009,.008,.11],[w/2+.051,.16+i*.013,.13],C.iron,[0,0,0],'metal');
  person(b,-.60,.02,.48,tileId,.4);
  return b.finish();
}

export function buildPlotDetails(tileId:number,vacant:boolean):DetailBatch[]{
  const b=new DetailBuilder();
  // Outer sidewalk only: central footprints and ownership stripe remain unobstructed.
  for(let i=0;i<12;i++){
    const x=-.735+i*.132;
    b.box([.124,.008,.11],[x,.175,.655],i%3===0?'#c7b899':'#d8c9aa');
    for(const side of [-1,1])b.box([.09,.008,.124],[side*.755,.175,x],i%3===0?'#c7b899':'#d8c9aa');
  }
  for(const side of [-1,1]){
    b.box([.10,.012,.19],[side*.74,.177,-.56],C.iron,[0,0,0],'metal');
    for(let j=0;j<5;j++)b.box([.08,.005,.012],[side*.74,.187,-.63+j*.034],C.stone,[0,0,0],'metal');
    b.cylinder(.019,.12,[side*.69,.235,.62],C.iron);
    b.cylinder(.022,.018,[side*.69,.29,.62],C.brass);
  }
  if(vacant){
    // Surveyed construction parcel: rebar cages, stacked masonry, safety fencing.
    for(let i=0;i<4;i++)for(let j=0;j<2;j++)b.box([.08,.035,.09],[.37+i*.085,.20+j*.036,-.45],j?'#b99e75':'#927e5b');
    for(const x of [-.51,.51]){
      b.rod([x,.18,-.51],[x,.47,-.51],.009,C.brass);
      for(let i=0;i<4;i++)b.ring(.04,.006,[x,.22+i*.06,-.51],C.iron);
    }
    for(let i=0;i<7;i++)b.box([.06,.07,.015],[-.42+i*.14,.40,-.60],i%2?C.iron:C.brass,[0,0,.3]);
  }
  return b.finish();
}

function bicycle(b:DetailBuilder,x:number,y:number,z:number) {
  for(const wheel of [-.14,.14]){
    b.ring(.08,.012,[x+wheel,y+.09,z],C.iron,[0,0,0]);
    for(let i=0;i<6;i++){const a=i*Math.PI/3;b.rod([x+wheel,y+.09,z],[x+wheel+.073*Math.cos(a),y+.09+.073*Math.sin(a),z],.0025,C.stone);}
  }
  const a:V3=[x-.14,y+.09,z],c:V3=[x+.14,y+.09,z],mid:V3=[x,y+.09,z],top:V3=[x-.04,y+.23,z],handle:V3=[x+.1,y+.24,z];
  for(const [u,v] of [[a,top],[a,mid],[top,mid],[top,handle],[handle,mid],[handle,c]] as [V3,V3][])b.rod(u,v,.008,C.brass);
  b.box([.07,.016,.04],[x-.04,y+.25,z],C.wood);
  b.rod(handle,[x+.11,y+.28,z+.05],.007,C.iron);
}

export function buildStreets():DetailBatch[]{
  const b=new DetailBuilder();
  for(let side=0;side<4;side++){
    const angle=side*Math.PI/2;
    const at=(x:number,y:number,z:number):V3=>[Math.cos(angle)*x+Math.sin(angle)*z,y,-Math.sin(angle)*x+Math.cos(angle)*z];
    for(let i=0;i<72;i++)b.box([.24,.055,.12],at(-9.92+i*.28,.06,10.54),i%5===0?'#a99a7f':'#bdb294',[0,angle,0]);
    for(const cx of [-5,5]){
      for(let k=0;k<8;k++)b.box([.085,.008,.9],at(cx-.35+k*.1,.058,9.62),'#c9c1a8',[0,angle,0]);
      for(const dir of [-1,1]){
        const [x,y,z]=at(cx+dir*.55,.06,10.65);
        b.cylinder(.025,.6,[x,y+.3,z],C.iron);
        b.box([.09,.2,.065],[x,y+.56,z],C.iron,[0,angle,0],'metal');
        b.ball(.024,[x,y+.61,z],dir<0?'#ca7f68':'#a5c28f','light');
      }
    }
    for(const cx of [-7.2,0,7.2]){
      const p=at(cx,.06,9.18);b.cylinder(.13,.012,p,C.iron);
      b.ring(.11,.008,[p[0],.07,p[2]],C.stone);
      for(let j=0;j<4;j++)b.box([.15,.006,.012],at(cx,.075,9.12+j*.04),C.stone,[0,angle,0],'metal');
    }
    for(const cx of [-3.0,3.1]){
      const p=at(cx,.05,10.72);bench(b,p[0],p[1],p[2],angle);
      const hyd=at(cx+.5,.05,10.72);
      b.cylinder(.045,.17,[hyd[0],.135,hyd[2]],'#986a48');
      b.ball(.05,[hyd[0],.23,hyd[2]],C.brass,'metal');
      b.box([.14,.035,.04],[hyd[0],.17,hyd[2]],'#986a48',[0,angle,0],'metal');
      const bin=at(cx-.5,.05,10.72);
      b.cylinder(.07,.18,[bin[0],.14,bin[2]],C.iron);
      b.cylinder(.08,.025,[bin[0],.24,bin[2]],C.brass);
    }
  }
  for(let i=0;i<3;i++)bicycle(b,-1.1+i*.4,.05,10.68);
  // Brass inlay corner brackets and fasteners in the model's display base.
  for(const x of [-10.7,10.7])for(const z of [-10.7,10.7]){
    b.box([.45,.035,.10],[x,.035,z],C.brass,[0,0,0],'metal');
    b.box([.10,.035,.45],[x,.035,z],C.brass,[0,0,0],'metal');
    b.cylinder(.025,.012,[x,.06,z],C.iron);
  }
  return b.finish();
}

export function buildPlaza():DetailBatch[]{
  const b=new DetailBuilder();
  // Radial pavers around the fountain and inset plaza paving with expansion joints.
  for(let ring=0;ring<3;ring++)for(let i=0;i<36;i++){
    const a=i*Math.PI/18,r=.57+ring*.105;
    b.box([.08,.016,.08],[Math.cos(a)*r,.13,1.85+Math.sin(a)*r],(i+ring)%3===0?'#a5906c':'#d3c1a1',[0,-a,0]);
  }
  for(let i=0;i<22;i++)for(let j=0;j<2;j++){
    const x=-2.75+i*.26;
    // The second row must stop at the lawns, rather than sit just below them.
    if(j===1&&Math.abs(x)+.115>1.4)continue;
    b.box([.23,.01,.2],[x,.123,.73+j*.23],i%3?'#cbbd9d':'#a79575');
  }
  for(const sign of [-1,1]){
    bench(b,sign*1.4,.12,1.5,sign*Math.PI/2);
    planter(b,sign*2.2,.12,2.65,.65,sign+2);
  }
  // Brass inlays, mosaic paving and heraldic banners frame the enlarged bank.
  for(const side of [-1,1]) {
    for(let i=0;i<14;i++)b.box([.014,.004,.115],[side*(1.96+i*.072),.129,.76],C.brass,[0,0,0],'metal');
    const x=side*2.94;
    b.box([.22,.07,.22],[x,.14,.19],C.stone);
    b.cylinder(.022,1.40,[x,.875,.19],C.brass);
    b.ball(.045,[x,1.61,.19],C.brass,'metal');
    b.rod([x,1.50,.19],[x+side*.32,1.50,.19],.012,C.brass);
    b.box([.27,.48,.015],[x+side*.16,1.26,.19],side<0?'#5c7c68':'#80574f');
    b.box([.25,.025,.022],[x+side*.16,1.0375,.20],C.brass,[0,0,0],'metal');
    b.ball(.048,[x+side*.16,1.30,.206],C.brass,'metal');
  }
  for(let i=0;i<32;i++) {
    const a=i*Math.PI/16,r=.91;
    b.box([.065,.009,.10],[Math.cos(a)*r,.128,1.85+Math.sin(a)*r],i%4===0?C.brass:C.stone,[0,-a,0]);
  }
  for(const radius of [.405,.452])b.ring(radius,.008,[0,.228,1.85],C.brass,[Math.PI/2,0,0],'metal');
  // Six directed streams, with tubes discretised along a parabola.
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    for(let j=0;j<10;j++){
      const t=j/10,t2=(j+1)/10;
      const at=(u:number):V3=>[Math.cos(a)*(.05+u*.27),.48+.45*4*u*(1-u)-u*.23,1.85+Math.sin(a)*(.05+u*.27)];
      b.rod(at(t),at(t2),.009,'#9bd0c1','glass');
    }
  }
  b.ring(.29,.008,[0,.246,1.85],'#d4e6d4',[Math.PI/2,0,0],'glass');
  return b.finish();
}
