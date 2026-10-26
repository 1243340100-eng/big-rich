import * as THREE from 'three';
import { Model, hipRoof, prism } from './buildingPrimitives';
import type { V3 } from './detailGeometry';

export const CENTRAL_LANDMARK={width:5.3,rear:-2.68,front:.85,height:4.025,clockY:2.65,towerZ:-1.43} as const;
const C={stone:'#dfd0b1',shade:'#b5a384',light:'#eee0c0',base:'#a99575',copper:'#496b60',roofEdge:'#314f48',gold:'#bd944f',dark:'#30453d',glass:'#638981',glow:'#ffd39a',burgundy:'#7b4e4c'};

function archedShape(width:number,height:number){
  const r=width/2,s=new THREE.Shape();s.moveTo(-r,0);s.lineTo(r,0);s.lineTo(r,height-r);s.absarc(0,height-r,r,0,Math.PI,false);s.lineTo(-r,0);s.closePath();return s;
}
function arch(b:Model,name:string,x:number,bottom:number,z:number,width:number,height:number,rear=false){
  const direction=rear?-1:1,rotation:V3=[0,rear?Math.PI:0,0];
  b.part(`${name}-stone-surround`,new THREE.ExtrudeGeometry(archedShape(width+.075,height+.05),{depth:.035,bevelEnabled:false,curveSegments:10}),[x,bottom-.025,z],C.light,false,rotation);
  b.part(`${name}-warm-glass`,new THREE.ExtrudeGeometry(archedShape(width,height),{depth:.012,bevelEnabled:false,curveSegments:10}),[x,bottom,z+direction*.037],C.glow,false,rotation,'light');
  b.block(`${name}-mullion`,[.018,height-.04,.016],[x,bottom+(height-.04)/2,z+direction*.059],C.gold,false,'metal');
  b.block(`${name}-transom`,[width,.016,.016],[x,bottom+height*.44,z+direction*.059],C.roofEdge,false,'metal');
  b.block(`${name}-sill`,[width+.13,.04,.09],[x,bottom-.04,z+direction*.024],C.shade,false);
}
function cornice(b:Model,name:string,x:number,z:number,w:number,d:number,bottom:number){
  b.block(`${name}-lower`,[w,.045,d],[x,bottom+.0225,z],C.shade);
  b.block(`${name}-fascia`,[w+.06,.07,d+.06],[x,bottom+.08,z],C.light);
  b.block(`${name}-crown`,[w+.14,.045,d+.14],[x,bottom+.1375,z],C.shade);
  const n=Math.floor(w/.17);
  for(let i=0;i<n;i++)for(const side of [-1,1])b.block(`${name}-dentil`,[.06,.05,.07],[x+(i-(n-1)/2)*.17,bottom+.055,z+side*(d/2+.035)],C.gold,false,'metal');
}
function roof(b:Model,name:string,x:number,z:number,w:number,d:number,bottom:number,height:number){
  b.part(`${name}-copper-hip`,hipRoof(w,d,height),[x,bottom,z],C.copper,true);
  // Standing seams follow the pitched roof surface and end at its ridge.
  for(let i=-3;i<=3;i++)for(const side of [-1,1]){
    const start:V3=[x+i*w/8,bottom+.008,z+side*d/2],end:V3=[x,bottom+height+.008,z];
    b.rod(start,end,.007,C.gold,'metal');
  }
  for(const side of [-1,1]){
    b.block(`${name}-front-drip-edge`,[w+.025,.025,.025],[x,bottom,z+side*d/2],C.roofEdge,false,'metal');
    b.block(`${name}-side-drip-edge`,[.025,.025,d],[x+side*w/2,bottom,z],C.roofEdge,false,'metal');
  }
}
function balustrade(b:Model,name:string,from:V3,to:V3){
  const dx=to[0]-from[0],dz=to[2]-from[2],length=Math.hypot(dx,dz),n=Math.max(2,Math.round(length/.19));
  for(let i=0;i<=n;i++){
    const t=i/n,x=from[0]+dx*t,z=from[2]+dz*t,y=from[1]+(to[1]-from[1])*t;
    if(name==='entrance-stair-rail')b.block('stair-rail-grounded-plinth',[.14,y-.105,.14],[x,(y+.105)/2,z],C.shade);
    b.block(`${name}-baluster-base`,[.075,.035,.075],[x,y+.0175,z],C.shade);
    b.part(`${name}-baluster`,new THREE.CylinderGeometry(.025,.035,.18,8),[x,y+.125,z],C.light,true);
    b.block(`${name}-baluster-cap`,[.073,.035,.073],[x,y+.2325,z],C.light);
  }
  b.rod([from[0],from[1]+.26,from[2]],[to[0],to[1]+.26,to[2]],.032,C.light,'stone');
}
function clock(b:Model,side:number){
  const angle=side*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),z=CENTRAL_LANDMARK.towerZ;
  const at=(x:number,y:number,depth:number):V3=>[c*x+s*depth,y,z-s*x+c*depth];
  b.part('clock-dial',new THREE.CylinderGeometry(.171,.171,.024,32),at(0,CENTRAL_LANDMARK.clockY,.452),C.light,false,[Math.PI/2,0,-angle]);
  b.part('clock-brass-bezel',new THREE.TorusGeometry(.181,.018,6,32),at(0,CENTRAL_LANDMARK.clockY,.472),C.gold,false,[0,angle,0],'metal');
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    b.part('clock-hour-marker',new THREE.BoxGeometry(.012,i%3===0?.038:.023,.009),at(Math.sin(a)*.137,CENTRAL_LANDMARK.clockY+Math.cos(a)*.137,.468),C.dark,false,[0,angle,-a]);
  }
  b.part('clock-minute-hand',new THREE.BoxGeometry(.010,.118,.012),at(0,CENTRAL_LANDMARK.clockY+.05,.472),C.dark,false,[0,angle,0]);
  b.part('clock-centre-pin',new THREE.SphereGeometry(.018,8,6),at(0,CENTRAL_LANDMARK.clockY,.479),C.gold,false,[0,0,0],'metal');
  b.part('clock-hour-hand',new THREE.BoxGeometry(.086,.012,.014),at(.033,CENTRAL_LANDMARK.clockY,.474),C.dark,false,[0,angle,0]);
}

/** All architecture shares one coordinate system and four material batches. */
export function buildCentralLandmark(){
  const b=new Model();
  b.block('bank-foundation',[5.3,.345,2.84],[0,.2775,-1.23],C.base);
  b.block('bank-plinth-course',[5.34,.06,2.88],[0,.42,-1.23],C.shade);
  b.block('bank-main-hall',[3.42,1.32,1.60],[0,1.11,-1.43],C.stone);
  for(const sign of [-1,1]){
    const x=sign*2.05;
    b.block('bank-side-wing',[1.06,.95,1.66],[x,.925,-1.36],C.stone);
    cornice(b,'wing-cornice',x,-1.36,1.08,1.68,1.40);
    roof(b,'wing-roof',x,-1.36,1.22,1.82,1.56,.25);
    for(const dx of [-.27,.27]){
      arch(b,'wing-front-window',x+dx,.71,-.54,.25,.47);
      arch(b,'wing-rear-window',x+dx,.71,-2.18,.25,.47,true);
    }
    for(const z of [-1.90,-1.36,-.82]){
      b.block('wing-side-window-frame',[.025,.43,.30],[sign*2.588,.965,z],C.light,false);
      b.block('wing-side-window-glass',[.012,.36,.23],[sign*2.608,.965,z],C.glow,false,'light');
      b.block('wing-side-window-crossbar',[.015,.014,.24],[sign*2.619,.965,z],C.gold,false,'metal');
    }
    for(const dx of [-.46,.46])for(let i=0;i<6;i++)b.block('wing-corner-quoin',[.13,.09,.045],[x+dx,.52+i*.145,-.512],i%2?C.light:C.shade,false);
  }
  // Six complete orders, with fluting, torus bases and small capital scrolls.
  for(const x of [-1.30,-.78,-.26,.26,.78,1.30]){
    b.block('portico-column-plinth',[.22,.08,.24],[x,.49,.03],C.light);
    b.part('portico-column-base',new THREE.CylinderGeometry(.105,.115,.05,16),[x,.555,.03],C.shade,true);
    b.part('portico-fluted-column',new THREE.CylinderGeometry(.068,.086,1.08,16),[x,1.11,.03],C.light,true);
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      b.rod([x+Math.cos(a)*.079,.62,.03+Math.sin(a)*.079],[x+Math.cos(a)*.065,1.60,.03+Math.sin(a)*.065],.004,C.shade,'stone');
    }
    b.part('portico-capital-neck',new THREE.CylinderGeometry(.10,.075,.045,16),[x,1.6625,.03],C.shade,true);
    b.block('portico-capital',[.23,.07,.24],[x,1.7175,.03],C.light);
    for(const sign of [-1,1])b.part('portico-capital-scroll',new THREE.TorusGeometry(.038,.012,6,12),[x+sign*.072,1.697,.149],C.gold,false,[0,0,0],'metal');
  }
  b.block('portico-entablature',[3.32,.15,.92],[0,1.82,-.22],C.light);
  for(let i=0;i<19;i++)b.block('portico-dentil',[.065,.055,.08],[-1.53+i*.17,1.7625,.262],C.gold,false,'metal');
  cornice(b,'main-cornice',0,-1.43,3.46,1.65,1.74);
  roof(b,'main-roof',0,-1.43,3.66,1.83,1.90,.38);
  b.part('portico-pediment',prism([[-1.73,0],[1.73,0],[0,.52]],.28),[0,1.895,-.02],C.light,true);
  b.part('pediment-inset',prism([[-1.46,0],[1.46,0],[0,.38]],.012),[0,1.94,.258],C.shade,false);
  b.part('pediment-city-seal',new THREE.CylinderGeometry(.12,.12,.022,20),[0,2.105,.278],C.gold,false,[Math.PI/2,0,0],'metal');
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4;
    b.rod([Math.cos(a)*.05,2.105+Math.sin(a)*.05,.295],[Math.cos(a)*.09,2.105+Math.sin(a)*.09,.295],.006,C.light,'stone');
  }
  arch(b,'grand-entry',0,.48,-.64,.69,.99);
  for(const x of [-.22,.22])b.block('entry-brass-handle',[.018,.16,.025],[x,.91,-.58],C.gold,false,'metal');
  for(const x of [-1.15,-.66,.66,1.15])arch(b,'hall-front-window',x,.87,-.64,.27,.56);
  for(const x of [-1.25,-.75,-.25,.25,.75,1.25])for(const bottom of [.67,1.22])arch(b,'hall-rear-window',x,bottom,-2.22,.26,.45,true);
  for(let row=0;row<7;row++)for(const sign of [-1,1])b.block('hall-rusticated-band',[.015,.015,1.50],[sign*1.717,.54+row*.17,-1.43],C.shade,false);

  // Central clock tower, octagonal lantern and ribbed copper dome.
  b.block('clock-tower-core',[.90,1.31,.90],[0,2.365,-1.43],C.stone);
  b.block('clock-tower-base',[1.02,.10,1.02],[0,2.02,-1.43],C.light);
  for(const x of [-.405,.405])for(const dz of [-.405,.405])b.block('clock-tower-pilaster',[.09,.96,.09],[x,2.49,-1.43+dz],C.light);
  for(let side=0;side<4;side++)clock(b,side);
  cornice(b,'tower-cornice',0,-1.43,.96,.96,2.97);
  b.part('dome-lantern-drum',new THREE.CylinderGeometry(.48,.49,.20,12),[0,3.22,-1.43],C.shade,true);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    b.part('lantern-window',new THREE.BoxGeometry(.12,.12,.015),[Math.sin(a)*.481,3.22,-1.43+Math.cos(a)*.481],C.glow,false,[0,a,0],'light');
  }
  const dome=new THREE.SphereGeometry(.54,24,12,0,Math.PI*2,0,Math.PI/2);dome.scale(1,.70,1);
  b.part('clock-copper-dome',dome,[0,3.32,-1.43],C.copper,true);
  b.part('dome-equator-band',new THREE.TorusGeometry(.54,.014,6,32),[0,3.32,-1.43],C.gold,false,[Math.PI/2,0,0],'metal');
  for(let meridian=0;meridian<12;meridian++)for(let step=0;step<8;step++){
    const a=meridian*Math.PI/6,t=step*Math.PI/16,u=(step+1)*Math.PI/16;
    const at=(v:number):V3=>[Math.cos(a)*.544*Math.cos(v),3.32+.382*Math.sin(v),-1.43+Math.sin(a)*.544*Math.cos(v)];
    b.rod(at(t),at(u),.007,C.gold,'metal');
  }
  b.post('dome-finial-base',.042,3.69,3.75,0,-1.43,C.gold);
  b.post('dome-finial-spire',.015,3.74,3.97,0,-1.43,C.gold);
  b.part('dome-finial-star',new THREE.OctahedronGeometry(.055),[0,3.97,-1.43],C.gold,true,[0,0,0],'metal');

  // Broad stepped approach stops before the public pedestrian route.
  for(let i=0;i<7;i++){
    const top=.45-i*.05,width=3.0+i*.06,z=.20+i*.09;
    b.block('grand-entrance-step',[width,top-.105,.22],[0,(top+.105)/2,z],C.shade);
    b.block('step-brass-nosing',[width-.06,.007,.016],[0,top+.0035,z+.098],C.gold,false,'metal');
  }
  for(const sign of [-1,1]){
    balustrade(b,'terrace-side-rail',[sign*2.64,.45,-2.51],[sign*2.64,.45,-.27]);
    balustrade(b,'entrance-stair-rail',[sign*1.79,.45,.13],[sign*1.79,.15,.78]);
    b.block('terrace-corner-pier',[.18,.37,.18],[sign*2.64,.635,-.27],C.light);
    b.part('terrace-urn-foot',new THREE.CylinderGeometry(.06,.085,.06,12),[sign*2.64,.85,-.27],C.gold,true);
    b.part('terrace-urn-bowl',new THREE.CylinderGeometry(.10,.055,.12,12),[sign*2.64,.94,-.27],C.shade,true);
    b.part('terrace-topiary',new THREE.IcosahedronGeometry(.095,1),[sign*2.64,1.025,-.27],'#63816a',false,[0,0,0],'leaf');
  }
  balustrade(b,'terrace-rear-rail',[-2.64,.45,-2.51],[2.64,.45,-2.51]);
  return {parts:b.parts,batches:b.finish()};
}
