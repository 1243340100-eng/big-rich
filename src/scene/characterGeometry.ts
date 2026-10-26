import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {CharacterSkin} from '../../shared/characters';

type V3=[number,number,number];
type Finish='toy'|'gold'|'gloss';
export interface CharacterPart {name:string;bounds:THREE.Box3;}
export interface CharacterBatch {finish:Finish;geometry:THREE.BufferGeometry;}
const C={cream:'#fff0d9',white:'#fff8eb',ink:'#283448',pink:'#ef9ba7',red:'#be494c',gold:'#dfac42',goldDark:'#916025',mint:'#438b77',navy:'#283c55',honey:'#c98d50'};

class Toy {
  constructor(private skin:CharacterSkin){}
  parts:CharacterPart[]=[];
  groups=new Map<Finish,THREE.BufferGeometry[]>();
  pieces:{name:string;geometry:THREE.BufferGeometry}[]=[];
  add(name:string,geometry:THREE.BufferGeometry,color:string,pos:V3,scale:V3=[1,1,1],rotation:V3=[0,0,0],finish:Finish='toy'){
    const source=geometry;geometry=source.index?source.toNonIndexed():source;
    if(source!==geometry)source.dispose();
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...pos),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);
    if(finish!=='gloss')geometry.computeVertexNormals();
    geometry.computeBoundingBox();this.parts.push({name,bounds:geometry.boundingBox!.clone()});
    this.pieces.push({name,geometry});
    const paint=new THREE.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=paint.r;colors[i+1]=paint.g;colors[i+2]=paint.b;}
    if(this.skin==='lucky-cat'&&name==='head'){
      const vertices=geometry.getAttribute('position'),patch=new THREE.Color('#c89460');
      for(let i=0;i<vertices.count;i+=3){
        const x=(vertices.getX(i)+vertices.getX(i+1)+vertices.getX(i+2))/3;
        const y=(vertices.getY(i)+vertices.getY(i+1)+vertices.getY(i+2))/3;
        const z=(vertices.getZ(i)+vertices.getZ(i+1)+vertices.getZ(i+2))/3;
        if(x>.025&&x<.16&&y>1.20&&z>.10)for(let j=i;j<i+3;j++)colors.set([patch.r,patch.g,patch.b],j*3);
      }
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    // All batches need the same attributes; none of these toy materials use UVs.
    geometry.deleteAttribute('uv');geometry.deleteAttribute('uv1');
    const group=this.groups.get(finish)??[];group.push(geometry);this.groups.set(finish,group);
  }
  ball(name:string,pos:V3,scale:V3,color:string,finish:Finish='toy',rotation:V3=[0,0,0]){this.add(name,new THREE.SphereGeometry(1,12,8),color,pos,scale,rotation,finish);}
  box(name:string,pos:V3,size:V3,color:string,rotation:V3=[0,0,0],finish:Finish='toy'){
    const shape=new THREE.Shape(),[w,h,d]=size,r=Math.min(w,h)*.2;
    shape.moveTo(-w/2+r,-h/2);shape.lineTo(w/2-r,-h/2);shape.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);shape.lineTo(w/2,h/2-r);shape.quadraticCurveTo(w/2,h/2,w/2-r,h/2);shape.lineTo(-w/2+r,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);shape.lineTo(-w/2,-h/2+r);shape.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    const g=new THREE.ExtrudeGeometry(shape,{depth:d*.65,bevelEnabled:true,bevelSize:d*.175,bevelThickness:d*.175,bevelSegments:1,steps:1,curveSegments:1});g.translate(0,0,-d*.325);
    this.add(name,g,color,pos,[1,1,1],rotation,finish);
  }
  curve(name:string,points:V3[],radius:number,color:string,finish:Finish='toy'){
    this.add(name,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),10,radius,5,false),color,[0,0,0],[1,1,1],[0,0,0],finish);
  }
  ring(name:string,pos:V3,radius:number,tube:number,color:string,rotation:V3=[0,0,0],finish:Finish='gold'){
    this.add(name,new THREE.TorusGeometry(radius,tube,5,16),color,pos,[1,1,1],rotation,finish);
  }
  finish(){
    this.fitFace();
    const batches=[...this.groups].map(([finish,geometries])=>{const geometry=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());geometry.computeBoundingBox();return {finish,geometry};});
    const bounds=new THREE.Box3();batches.forEach(batch=>bounds.union(batch.geometry.boundingBox!));
    return {batches,parts:this.parts,bounds};
  }
  private fitFace(){
    const heads=this.pieces.filter(p=>['head','penguin-head'].includes(p.name));
    const skinNames=['wolf-cheek','muzzle','bear-muzzle','fox-cheek','face-patch','snout'];
    const face=[...heads,...this.pieces.filter(p=>skinNames.includes(p.name))];
    const patches=this.pieces.filter(p=>p.name==='eye-patch');
    const eyes=this.pieces.filter(p=>p.name==='eye');
    // Project onto the actual triangulated surface, not an ideal smooth sphere.
    // The feature straddles that surface, leaving a small visible relief without a gap.
    const fit=(piece:typeof this.pieces[number],surfaces:typeof this.pieces,offset:number)=>{
      const positions=piece.geometry.getAttribute('position');
      const centre=piece.geometry.boundingBox!.getCenter(new THREE.Vector3()),mid=centre.z;
      const geometry=surfaces.map(p=>p.geometry);
      for(let i=0;i<positions.count;i++){
        let x=positions.getX(i),y=positions.getY(i),z=frontSurface(geometry,x,y);
        // Trim broad cheek/forehead patches at the silhouette instead of leaving
        // their outer vertices at the old floating depth beyond the face.
        for(let attempt=0;z===undefined&&attempt<8;attempt++){
          x=(x+centre.x)/2;y=(y+centre.y)/2;z=frontSurface(geometry,x,y);
        }
        positions.setX(i,x);positions.setY(i,y);
        if(z!==undefined)positions.setZ(i,z+positions.getZ(i)-mid+offset);
      }
      positions.needsUpdate=true;piece.geometry.computeVertexNormals();piece.geometry.computeBoundingBox();
      this.parts[this.pieces.indexOf(piece)].bounds.copy(piece.geometry.boundingBox!);
    };
    const rigidFace=this.skin==='lucky-cat'||this.skin==='wall-street-wolf';
    // Volumetric cheeks and muzzles must retain their shape. Shearing their
    // individual vertices onto the head produces stretched, overlapping facets.
    const seat=(piece:typeof this.pieces[number],surfaces:typeof this.pieces,offset:number)=>{
      const centre=piece.geometry.boundingBox!.getCenter(new THREE.Vector3());
      const z=frontSurface(surfaces.map(p=>p.geometry),centre.x,centre.y);
      if(z===undefined)return;
      piece.geometry.translate(0,0,z-centre.z+offset);
      piece.geometry.computeBoundingBox();
      this.parts[this.pieces.indexOf(piece)].bounds.copy(piece.geometry.boundingBox!);
    };
    const detail=rigidFace?seat:fit;
    if(!rigidFace)this.pieces.filter(p=>skinNames.includes(p.name)).forEach(p=>fit(p,heads,-.004));
    patches.forEach(p=>fit(p,heads,-.006));
    eyes.forEach(p=>detail(p,[...face,...patches],rigidFace?-.004:.002));
    for(const p of this.pieces){
      if(p.name==='eye-spark')detail(p,eyes,-.002);
      else if(['smile-left','smile-right','whisker'].includes(p.name))fit(p,face,.001);
      else if(['blush','nose','wolf-nose','panda-nose','bear-nose','fox-nose','beak','nostril','forehead-patch','forehead-stripe','brow'].includes(p.name))detail(p,face,-.003);
    }
  }
}

/** Frontmost triangle intersection along -Z, used during model construction only. */
export function frontSurface(surfaces:THREE.BufferGeometry[],x:number,y:number):number|undefined{
  let front=-Infinity;
  for(const geometry of surfaces){
    const box=geometry.boundingBox!;
    if(x<box.min.x||x>box.max.x||y<box.min.y||y>box.max.y)continue;
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i+=3){
      const ax=p.getX(i),ay=p.getY(i),bx=p.getX(i+1),by=p.getY(i+1),cx=p.getX(i+2),cy=p.getY(i+2);
      const denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
      if(Math.abs(denominator)<1e-12)continue;
      const a=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/denominator,b=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/denominator,c=1-a-b;
      if(a>=-1e-6&&b>=-1e-6&&c>=-1e-6)front=Math.max(front,a*p.getZ(i)+b*p.getZ(i+1)+c*p.getZ(i+2));
    }
  }
  return Number.isFinite(front)?front:undefined;
}

function ear(b:Toy,x:number,y:number,color:string,inner:string,tilt:number){
  const triangle=new THREE.Shape();triangle.moveTo(-.115,0);triangle.lineTo(-.025,.245);triangle.lineTo(.025,.245);triangle.lineTo(.115,0);triangle.closePath();
  const g=new THREE.ExtrudeGeometry(triangle,{depth:.07,bevelEnabled:true,bevelSize:.014,bevelThickness:.014,bevelSegments:1,curveSegments:1});g.translate(0,0,-.04);
  b.add('pointed-ear',g,color,[x,y,0],[1,1,1],[0,0,tilt]);
  const inset=new THREE.Shape();inset.moveTo(-.063,.035);inset.lineTo(0,.20);inset.lineTo(.063,.035);inset.closePath();
  b.add('inner-ear',new THREE.ShapeGeometry(inset),inner,[x,y,.047],[1,1,1],[0,0,tilt]);
}
function eyes(b:Toy,y=1.07,z=.275,spacing=.115){
  for(const sign of [-1,1]){
    b.ball('eye',[sign*spacing,y,z],[.037,.05,.025],C.ink,'gloss');
    b.ball('eye-spark',[sign*spacing-.011,y+.018,z+.021],[.011,.014,.006],C.white,'gloss');
  }
}
function cheeks(b:Toy,y=1.0,z=.249){for(const sign of [-1,1])b.ball('blush',[sign*.206,y,z],[.058,.028,.018],C.pink);}
function smile(b:Toy,y=1.005,z=.303){
  b.curve('smile-left',[[0,y+.012,z],[-.02,y-.018,z+.002],[-.045,y-.012,z]],.008,C.ink);
  b.curve('smile-right',[[0,y+.012,z],[.02,y-.018,z+.002],[.045,y-.012,z]],.008,C.ink);
}
function feet(b:Toy,color:string){for(const s of [-1,1])b.ball('foot',[s*.155,.09,.095],[.125,.09,.16],color);}
function paws(b:Toy,color:string,y=.57){for(const s of [-1,1])b.ball('paw',[s*.245,y,.19],[.09,.14,.10],color,'toy',[0,0,s*.34]);}
function coin(b:Toy,pos:V3,r=.13){
  b.add('gold-coin',new THREE.CylinderGeometry(r,r,.04,16),C.gold,pos,[1,1,1],[Math.PI/2,0,0],'gold');
  b.ring('coin-rim',[pos[0],pos[1],pos[2]+.024],r*.79,.009,'#ffe2a1');
  b.box('coin-stamp',[pos[0],pos[1],pos[2]+.027],[r*.42,r*.60,.014],C.goldDark);
  b.box('coin-stamp-inset',[pos[0],pos[1],pos[2]+.038],[r*.19,r*.32,.009],C.gold);
}
function collar(b:Toy,color:string,y=.79){b.ring('collar',[0,y,0],.195,.037,color,[Math.PI/2,0,0],'toy');}
function head(b:Toy,color:string){b.ball('head',[0,1.045,0],[.31,.29,.265],color);}
function body(b:Toy,color:string){b.ball('body',[0,.48,0],[.255,.37,.225],color);}
function heart(b:Toy,pos:V3,color:string,size=.07){
  const shape=new THREE.Shape();shape.moveTo(0,-size);shape.bezierCurveTo(-size*1.8,0,-size,-size*-.9,0,size*.32);shape.bezierCurveTo(size,size*.9,size*1.8,0,0,-size);
  b.add('heart',new THREE.ExtrudeGeometry(shape,{depth:.012,bevelEnabled:true,bevelSize:.008,bevelThickness:.005,bevelSegments:2,curveSegments:10}),color,pos);
}

export function buildCharacter(skin:CharacterSkin,playerColor='#6ec7ad'){
  const b=new Toy(skin);
  b.add('player-base',new THREE.CylinderGeometry(.29,.32,.055,12),playerColor,[0,.0275,0]);
  b.ring('base-gold-trim',[0,.053,0],.285,.012,C.gold,[Math.PI/2,0,0]);
  if(skin==='lucky-cat'){
    body(b,C.cream);feet(b,C.white);head(b,C.cream);
    ear(b,-.21,1.22,C.cream,C.pink,-.13);ear(b,.21,1.22,C.cream,C.pink,.13);
    eyes(b);cheeks(b);smile(b);
    b.ball('nose',[0,1.035,.287],[.027,.019,.016],C.pink);
    collar(b,C.red);b.ball('bell',[0,.765,.211],[.058,.059,.046],C.gold,'gold');b.box('bell-slit',[0,.75,.258],[.008,.033,.008],C.goldDark);
    coin(b,[.055,.47,.258],.165);b.ball('holding-paw',[.225,.55,.235],[.09,.13,.09],C.white);
    b.ball('raised-arm',[-.295,.87,.025],[.085,.235,.085],C.cream,'toy',[0,0,-.2]);b.ball('lucky-paw',[-.322,1.075,.07],[.104,.115,.08],C.white);
    b.ball('paw-pad',[-.323,1.058,.144],[.044,.04,.01],C.pink);
    for(const x of [-.36,-.325,-.29])b.ball('toe-pad',[x,1.11,.14],[.012,.017,.012],C.pink);
    b.curve('curled-tail',[[.16,.28,-.13],[.30,.35,-.14],[.36,.49,-.16],[.32,.61,-.16]],.046,'#d7a26d');
    for(const s of [-1,1])for(const y of [1.01,1.045])b.curve('whisker',[[s*.205,y,.265],[s*.269,y+.012,.237]],.005,'#9b7969');
  }else if(skin==='piggy-bank'){
    body(b,'#edb0bc');feet(b,'#ce879b');head(b,'#f4bdc6');ear(b,-.22,1.22,'#edb0bc','#da8da3',-.23);ear(b,.22,1.22,'#edb0bc','#da8da3',.23);
    eyes(b,1.105,.272,.128);cheeks(b,1.035,.254);b.ball('snout',[0,1.015,.28],[.14,.085,.07],'#e995a9');
    for(const s of [-1,1])b.ball('nostril',[s*.044,1.019,.345],[.017,.024,.009],'#a96079');
    collar(b,'#90b9ad');paws(b,'#f4bdc6');heart(b,[0,.5,.229],C.white,.09);
    b.box('coin-slot',[0,1.326,-.015],[.20,.018,.065],'#9e6379');coin(b,[0,1.367,-.015],.108);
    b.curve('curly-tail',[[.18,.41,-.13],[.29,.43,-.22],[.33,.51,-.21],[.27,.54,-.23],[.25,.49,-.26]],.024,'#e995a9');
  }else if(skin==='wall-street-wolf'){
    body(b,C.navy);feet(b,'#253447');head(b,'#9daebd');ear(b,-.22,1.23,'#91a4b5','#d7c1c2',-.15);ear(b,.22,1.23,'#91a4b5','#d7c1c2',.15);
    for(const s of [-1,1])b.ball('wolf-cheek',[s*.20,.976,.12],[.12,.13,.16],'#dce0df');
    b.ball('muzzle',[0,.993,.25],[.14,.08,.075],'#e8e8de');eyes(b,1.10,.267);cheeks(b,.998,.25);smile(b,.966,.327);b.ball('wolf-nose',[0,1.017,.324],[.048,.032,.024],C.ink,'gloss');
    b.box('shirt',[0,.665,.191],[.15,.25,.042],C.white);b.box('lapel-left',[-.10,.65,.20],[.09,.29,.04],'#567087',[0,0,.32]);b.box('lapel-right',[.10,.65,.20],[.09,.29,.04],'#567087',[0,0,-.32]);
    b.ball('tie-knot',[0,.746,.228],[.034,.031,.023],C.red);b.box('tie',[0,.626,.231],[.042,.18,.025],C.red,[0,0,.04]);
    for(const y of [.42,.32])b.ball('suit-button',[.035,y,.226],[.013,.013,.008],C.gold,'gold');
    b.ball('left-arm',[-.29,.51,.02],[.085,.23,.09],C.navy);b.ball('right-paw',[.29,.58,.05],[.085,.15,.09],'#9daebd');
    b.box('briefcase',[-.27,.34,.145],[.22,.20,.10],'#865b48');b.ring('case-handle',[-.27,.466,.145],.046,.012,'#a27d58');b.box('case-clasp',[-.27,.35,.205],[.035,.04,.018],C.gold);
    b.curve('wolf-tail',[[.11,.35,-.15],[.23,.38,-.23],[.28,.54,-.25]],.068,'#91a4b5');
  }else if(skin==='compound-bunny'){
    body(b,C.cream);feet(b,C.cream);head(b,C.cream);
    for(const s of [-1,1]){b.ball('long-ear',[s*.15,1.49,-.015],[.095,.32,.085],C.cream,'toy',[0,0,-s*.12]);b.ball('pink-ear',[s*.154,1.51,.06],[.047,.23,.016],'#dfabb4','toy',[0,0,-s*.12]);}
    eyes(b);cheeks(b);smile(b);b.ball('nose',[0,1.034,.282],[.024,.017,.015],C.pink);
    b.ball('apron',[0,.48,.107],[.226,.29,.15],'#74ac98');b.box('apron-pocket',[0,.37,.254],[.17,.095,.018],'#bdd5b3');
    b.add('flowerpot',new THREE.CylinderGeometry(.12,.085,.16,10),'#be8262',[0,.57,.285]);b.ring('pot-rim',[0,.648,.285],.116,.016,'#e0a483',[Math.PI/2,0,0],'toy');
    b.curve('sprout-stem',[[0,.65,.285],[.01,.75,.285],[0,.84,.285]],.012,'#638b62');
    b.ball('sprout-leaf',[-.045,.77,.285],[.065,.026,.02],'#9abb71','toy',[0,0,-.45]);coin(b,[.035,.85,.29],.062);paws(b,C.cream,.59);b.ball('cotton-tail',[0,.34,-.22],[.11,.11,.10],C.white);
  }else if(skin==='fortune-panda'){
    body(b,C.white);feet(b,C.ink);head(b,C.white);
    for(const s of [-1,1]){b.ball('round-ear',[s*.23,1.27,0],[.105,.11,.08],C.ink);b.ball('eye-patch',[s*.12,1.075,.245],[.081,.094,.035],C.ink,'toy',[0,0,-s*.18]);}
    eyes(b,1.08,.278);cheeks(b,.995,.246);smile(b,1.0,.296);b.ball('panda-nose',[0,1.032,.284],[.035,.023,.017],C.ink,'gloss');
    garment(b,'red-vest',C.red,.35,.78);b.box('vest-front',[0,.59,.244],[.018,.28,.014],C.gold);
    b.ball('ingot-bowl',[0,.45,.28],[.19,.08,.10],C.gold,'gold');for(const s of [-1,1])b.ball('ingot-tip',[s*.16,.50,.28],[.075,.07,.095],C.gold,'gold');b.ball('ingot-centre',[0,.51,.28],[.10,.075,.086],'#ffdb80','gold');paws(b,C.ink,.52);
    b.ball('panda-tail',[0,.30,-.21],[.08,.08,.075],C.white);
  }else if(skin==='vault-bear'){
    body(b,C.honey);feet(b,C.honey);head(b,C.honey);
    for(const s of [-1,1]){b.ball('round-ear',[s*.23,1.27,0],[.105,.11,.08],C.honey);b.ball('ear-centre',[s*.23,1.285,.065],[.058,.058,.018],'#b88353');}
    eyes(b);cheeks(b);b.ball('bear-muzzle',[0,1.0,.245],[.13,.086,.05],'#ffe0b4');smile(b,.986,.296);b.ball('bear-nose',[0,1.034,.288],[.04,.027,.02],'#6a493d','gloss');
    garment(b,'overalls','#528793',.16,.55);for(const s of [-1,1]){b.box('overall-strap',[s*.16,.62,.185],[.06,.28,.035],'#6a99a4');b.ball('strap-button',[s*.16,.61,.215],[.022,.022,.012],C.gold,'gold');}
    b.ball('soft-cap',[0,1.32,-.025],[.23,.10,.20],'#749c8a');b.ball('cap-brim',[0,1.296,.16],[.22,.025,.12],'#749c8a');
    b.ring('key-head',[.045,.67,.275],.074,.018,C.gold);b.box('key-stem',[.045,.51,.275],[.032,.23,.03],C.gold,[0,0,0],'gold');b.box('key-tooth',[.082,.421,.275],[.09,.035,.03],C.gold,[0,0,0],'gold');paws(b,C.honey,.56);b.ball('bear-tail',[0,.3,-.22],[.07,.07,.06],C.honey);
  }else if(skin==='abacus-fox'){
    body(b,'#dc985d');feet(b,'#8e6351');head(b,'#e7a367');ear(b,-.21,1.23,'#dc985d',C.cream,-.15);ear(b,.21,1.23,'#dc985d',C.cream,.15);
    for(const s of [-1,1])b.ball('fox-cheek',[s*.14,.99,.21],[.15,.105,.08],C.cream,'toy',[0,0,s*.28]);
    eyes(b,1.095,.265);cheeks(b,.985,.257);smile(b,.975,.30);b.ball('fox-nose',[0,1.014,.293],[.037,.025,.023],C.ink,'gloss');
    collar(b,C.mint,.79);b.box('scarf-tip',[-.10,.665,.205],[.09,.18,.035],C.mint,[0,0,-.28]);
    b.box('abacus-frame',[0,.48,.27],[.34,.255,.055],'#8d6050');b.box('abacus-inset',[0,.48,.306],[.285,.198,.015],'#ebd2a5');
    for(let column=0;column<4;column++){const x=-.105+column*.07;b.box('abacus-rod',[x,.48,.321],[.008,.18,.008],C.gold);for(let bead=0;bead<3;bead++)b.ball('abacus-bead',[x,.42+bead*.052,.332],[.025,.018,.016],column%2?C.red:C.mint);}
    paws(b,'#dc985d',.55);b.ball('fox-tail',[.17,.36,-.20],[.14,.21,.13],'#dc985d','toy',[.3,0,-.4]);b.ball('tail-tip',[.22,.51,-.23],[.10,.10,.09],C.cream);
  }else{
    b.ball('penguin-body',[0,.60,0],[.30,.48,.255],'#3e6577');feet(b,'#d8a363');b.ball('penguin-head',[0,1.045,0],[.29,.28,.25],'#3e6577');
    b.ball('white-belly',[0,.55,.139],[.24,.36,.13],C.cream);
    for(const s of [-1,1]){b.ball('face-patch',[s*.108,1.055,.19],[.15,.20,.087],C.cream);b.ball('flipper',[s*.285,.58,.025],[.075,.24,.085],'#3e6577','toy',[0,0,s*.23]);}
    eyes(b,1.09,.276,.105);cheeks(b,.997,.253);b.ball('beak',[0,1.005,.285],[.062,.042,.055],'#e1ab64');
    b.ball('apron',[0,.42,.235],[.22,.22,.085],'#ac735a');b.box('apron-badge',[0,.4,.326],[.10,.06,.012],C.cream);
    b.add('hat',new THREE.CylinderGeometry(.185,.19,.12,12),'#b17e57',[0,1.31,0]);b.add('hat-brim',new THREE.CylinderGeometry(.25,.25,.025,12),'#b17e57',[0,1.26,0]);b.ring('hat-ribbon',[0,1.29,0],.188,.014,C.navy,[Math.PI/2,0,0],'toy');
    b.box('ledger',[0,.64,.34],[.27,.19,.06],'#6c9c8a');b.box('ledger-spine',[-.105,.64,.379],[.022,.18,.018],'#bcd6ad');b.box('ledger-label',[.02,.65,.378],[.11,.07,.01],C.cream);
  }
  tailoredDetails(b,skin);
  return b.finish();
}

/** A fitted partial shell follows the torso; intersecting full ellipsoids cause holes on the back. */
function garment(b:Toy,name:string,color:string,bottom:number,top:number){
  const start=Math.acos((top-.48)/.385),end=Math.acos((bottom-.48)/.385);
  b.add(name,new THREE.SphereGeometry(1,12,8,0,Math.PI*2,start,end-start),color,[0,.48,0],[.275,.385,.245]);
}

/** Large readable costume accents take priority over tiny surface decoration. */
function tailoredDetails(b:Toy,skin:CharacterSkin){
  const stitch='#d9c5a4',gold=C.gold;
  // A dark inset and a faceted brass rim make the player-colour plinth feel crafted.
  b.add('base-inset',new THREE.CylinderGeometry(.27,.27,.012,12),'#324c48',[0,.061,0]);
  const button=(x:number,y:number,z:number)=>b.ball('tailored-button',[x,y,z],[.017,.017,.009],gold,'gold');
  if(skin==='lucky-cat'){
    b.box('festival-bib',[0,.67,.218],[.23,.16,.024],'#a8323f');
    for(const x of [-.085,.085])b.box('bib-gold-border',[x,.67,.238],[.012,.14,.008],gold);
    b.box('bib-bottom-border',[0,.60,.239],[.18,.014,.008],gold);
    b.box('bell-link',[0,.795,.22],[.024,.05,.018],gold,[0,0,0],'gold');
    for(const x of [-.19,.19])for(let i=0;i<2;i++)b.box('paw-toe',[x+i*.032-.015,.125,.224],[.009,.025,.009],'#c6aa85');
  }else if(skin==='piggy-bank'){
    garment(b,'waistcoat','#458a7e',.27,.73);
    b.box('waistcoat-opening',[0,.55,.252],[.11,.29,.018],'#f4bdc6');
    heart(b,[0,.49,.273],C.cream,.045);
    for(const x of [-.066,.066])b.box('waistcoat-piping',[x,.55,.262],[.012,.26,.01],gold);
    for(const x of [-.078,.078])b.box('bow-loop',[x,.79,.204],[.12,.065,.045],'#236557',[0,0,x>0?.25:-.25]);
    button(0,.79,.238);button(.105,.52,.252);button(.105,.44,.252);
    for(const side of [-1,1])b.box('hoof-cleft',[side*.155,.106,.24],[.012,.045,.014],'#995d73');
  }else if(skin==='wall-street-wolf'){
    for(const side of [-1,1]){
      b.box('jacket-cuff',[side*.29,.43,.07],[.12,.045,.10],C.white);
      b.box('shoe-toecap',[side*.155,.10,.19],[.19,.055,.11],'#192a3a');
      b.box('lapel-edge',[side*.095,.67,.23],[.013,.23,.012],'#8b9ba9',[0,0,-side*.32]);
    }
    b.box('breast-pocket',[.14,.65,.208],[.10,.025,.02],C.navy);
    b.box('pocket-square',[.14,.679,.211],[.055,.045,.018],C.cream,[0,0,.12]);
    b.box('tie-pin',[0,.65,.249],[.058,.012,.014],gold,[0,0,0],'gold');
    for(const x of [-.35,-.19])b.box('briefcase-strap',[x,.34,.204],[.018,.17,.014],'#c39560');
  }else if(skin==='compound-bunny'){
    for(const side of [-1,1]){b.box('apron-strap',[side*.13,.70,.177],[.047,.19,.025],'#438674',[0,0,-side*.17]);button(side*.12,.65,.208);}
    b.box('pocket-hem',[0,.405,.276],[.175,.016,.014],stitch);
    for(const x of [-.08,.08])b.box('pocket-seam',[x,.37,.275],[.009,.065,.01],stitch);
    b.box('pot-label',[0,.565,.393],[.085,.055,.014],C.cream);
    b.ball('sprout-leaf-right',[.056,.752,.28],[.058,.023,.025],'#568551','toy',[0,0,.45]);
    b.curve('apron-back-tie',[[-.20,.63,-.10],[-.13,.63,-.19],[0,.63,-.22],[.13,.63,-.19],[.20,.63,-.10]],.018,'#438674');
    b.box('garden-bow-left',[-.095,.64,-.20],[.13,.075,.04],'#438674',[0,0,-.25]);
    b.box('garden-bow-right',[.095,.64,-.20],[.13,.075,.04],'#438674',[0,0,.25]);
  }else if(skin==='fortune-panda'){
    for(const side of [-1,1])b.box('vest-gold-lapel',[side*.105,.70,.197],[.034,.19,.025],gold,[0,0,-side*.55]);
    for(const y of [.60,.67]){b.box('frog-fastener',[0,y,.254],[.095,.012,.012],gold);button(0,y,.268);}
    for(const side of [-1,1])b.box('vest-hem',[side*.135,.40,.20],[.16,.025,.018],gold,[0,0,side*.15]);
    b.box('ingot-seal',[0,.555,.339],[.045,.025,.014],'#b47d27');
  }else if(skin==='vault-bear'){
    b.box('denim-bib',[0,.55,.227],[.23,.22,.028],'#397987');
    b.box('bib-pocket',[0,.53,.25],[.14,.095,.018],'#88b4b7');
    b.box('pocket-stitch',[0,.568,.265],[.13,.012,.009],stitch);
    for(const x of [-.061,.061])b.box('pocket-side-stitch',[x,.53,.266],[.008,.065,.009],stitch);
    for(const side of [-1,1])b.curve('back-suspender',[[side*.15,.72,-.10],[side*.13,.63,-.175],[side*.11,.53,-.237]],.023,'#528793');
    b.box('cap-band',[0,1.32,.164],[.30,.035,.035],'#416f60');
    b.box('cap-badge',[0,1.344,.19],[.056,.043,.013],gold,[0,0,0],'gold');
    b.box('key-second-tooth',[.075,.46,.275],[.075,.023,.03],gold,[0,0,0],'gold');
  }else if(skin==='abacus-fox'){
    b.box('scarf-second-tail',[.06,.697,.199],[.07,.13,.028],'#30725f',[0,0,.28]);
    b.box('scarf-hem',[-.12,.60,.226],[.075,.017,.014],gold,[0,0,-.28]);
    for(const x of [-.145,.145])for(const y of [.38,.58])button(x,y,.312);
    b.box('abacus-divider',[0,.508,.333],[.28,.015,.018],'#82523b');
    for(const side of [-1,1])b.box('brow',[side*.12,1.17,.237],[.065,.018,.012],'#8a5439',[0,0,side*.13]);
  }else{
    b.box('apron-pocket',[0,.40,.318],[.15,.10,.02],'#805443');
    b.box('apron-pocket-hem',[0,.444,.333],[.16,.012,.012],stitch);
    for(const side of [-1,1]){b.box('apron-strap',[side*.16,.71,.197],[.038,.20,.025],'#805443',[0,0,-side*.16]);button(side*.16,.65,.23);}
    b.curve('apron-back-tie',[[-.26,.51,-.04],[-.20,.51,-.20],[0,.51,-.26],[.20,.51,-.20],[.26,.51,-.04]],.018,'#805443');
    b.box('hat-band',[0,1.30,.19],[.24,.04,.024],C.navy);
    b.box('hat-label',[.10,1.31,.208],[.06,.045,.012],C.cream,[0,0,.15]);
    for(const y of [.61,.64,.67])b.box('ledger-rule',[.02,y,.389],[.075,.006,.008],'#8b7055');
    b.box('ledger-corner',[.11,.71,.377],[.045,.025,.012],gold);
  }
}
