import * as THREE from 'three';
import {Model,prism} from './buildingPrimitives';
import {SECTORS,sectorColor} from '../../shared/casino';

export const CASINO_HEIGHT=2.46,CASINO_WHEEL_Y=2.22;
const C={wall:'#193b35',panel:'#254b43',dark:'#152b29',gold:'#be9654',pale:'#eed7a7',glass:'#bc9459',red:'#773c43'};
export function casinoWheel(b:Model,y=CASINO_WHEEL_Y,z=0) {
  b.part('casino-wheel-disc',new THREE.CylinderGeometry(.24,.24,.045,40),[0,y,z],C.gold,true,[Math.PI/2,0,0],'metal');
  for(let i=0;i<20;i++) {
    const start=i*Math.PI/10-Math.PI/20;
    b.part(`casino-wheel-sector-${i}`,new THREE.RingGeometry(.065,.213,2,1,start,Math.PI/10),[0,y,z+.025],sectorColor(SECTORS[i]),false,[0,0,0],'light');
  }
  b.part('casino-wheel-hub',new THREE.CylinderGeometry(.055,.055,.065,16),[0,y,z+.01],C.pale,false,[Math.PI/2,0,0],'metal');
}
export function buildCasinoModel(includeWheel=true) {
  const b=new Model();
  b.block('casino-foundation',[1.4,.06,1.30],[0,.03,0],C.dark);
  b.block('casino-main-hall',[.60,1.38,.83],[0,.75,-.10],C.wall);
  for(const side of [-1,1]) {
    const x=side*.47;
    b.block('casino-side-wing',[.42,1.16,.83],[x,.64,-.10],C.wall);
    b.block('casino-wing-cornice',[.46,.075,.90],[x,1.2575,-.10],C.gold);
    for(const y of [.32,.66,1]) {
      b.block('casino-floor-band',[.43,.035,.85],[x,y-.15,-.10],C.panel);
      b.block('casino-wing-window',[.23,.19,.018],[x,y,.325],C.glass,false,'light');
      for(const dx of [-.15,.15])b.block('casino-brass-pilaster',[.018,.29,.027],[x+dx,y,.33],C.gold,false,'metal');
    }
    // A vertical mounted sign, with letters made from narrow geometric strokes.
    b.block('casino-sign-backing',[.095,.77,.05],[side*.655,.84,.35],C.dark);
  }
  b.block('casino-main-cornice',[.68,.085,.93],[0,1.4825,-.10],C.gold);
  b.block('casino-title-panel',[.58,.095,.03],[0,1.42,.323],C.dark);
  b.block('casino-tower',[.43,.22,.47],[0,1.635,-.10],C.panel);
  b.block('casino-dome-drum',[.49,.05,.53],[0,1.77,-.10],C.gold);
  b.part('casino-dome',new THREE.SphereGeometry(.25,20,10,0,Math.PI*2,0,Math.PI/2),[0,1.795,-.10],C.gold,true);
  // The sign's mast passes through the dome crown and has a supported axle.
  b.post('casino-wheel-mast',.028,1.99,CASINO_WHEEL_Y,0,-.10,C.gold);
  b.block('casino-wheel-axle',[.06,.06,.16],[0,CASINO_WHEEL_Y,-.04],C.gold);
  if(includeWheel)casinoWheel(b);
  b.block('casino-lobby-glass',[.38,.46,.027],[0,.30,.33],C.glass,false,'light');
  const arch=new THREE.Shape();arch.absarc(0,0,.255,0,Math.PI,false);arch.lineTo(-.255,-.04);arch.absarc(0,-.04,.215,Math.PI,0,true);arch.closePath();
  b.part('casino-entrance-arch',new THREE.ExtrudeGeometry(arch,{depth:.055,bevelEnabled:false,curveSegments:20}),[0,.59,.35],C.gold,true);
  for(const x of [-.235,.235])b.post('casino-door-column',.023,.06,.61,x,.365,C.gold);
  b.block('casino-canopy',[.70,.045,.27],[0,.585,.50],C.gold);
  for(const x of [-.31,.31])b.post('casino-canopy-column',.016,.06,.57,x,.60,C.gold);
  b.block('casino-red-carpet',[.29,.012,.32],[0,.067,.49],C.red,false);
  b.post('casino-chandelier-stem',.007,.38,.55,0,.35,C.gold);
  for(const x of [-.09,0,.09])b.block('casino-chandelier-crystal',[.026,.035,.014],[x,.41,.351],C.pale,false,'light');
  for(const side of [-1,1]) {
    for(const z of [.41,.66]){
      b.post('casino-velvet-stanchion',.011,.06,.21,side*.24,z,C.gold);
      b.part('casino-stanchion-cap',new THREE.SphereGeometry(.017,8,6),[side*.24,.21,z],C.gold,false);
    }
    b.block('casino-velvet-rope',[.013,.012,.25],[side*.24,.18,.535],C.red,false);
    const x=side*.56;
    b.block('casino-palm-planter',[.16,.13,.16],[x,.125,.50],C.gold);
    b.post('casino-palm-trunk',.016,.19,.43,x,.50,'#735c41');
    for(let k=0;k<6;k++)b.part('casino-palm-frond',new THREE.ConeGeometry(.055,.22,4),[x+Math.sin(k*Math.PI/3)*.055,.43,.50+Math.cos(k*Math.PI/3)*.055],'#507958',false,[Math.cos(k*Math.PI/3)*.9,0,-Math.sin(k*Math.PI/3)*.9],'leaf');
  }
  b.block('casino-valet-desk',[.12,.18,.12],[.66,.15,.16],C.dark);
  b.block('casino-valet-counter',[.14,.025,.14],[.66,.2525,.16],C.gold);
  b.part('casino-small-fountain-basin',new THREE.CylinderGeometry(.105,.105,.055,16),[-.62,.0875,.14],C.gold,true);
  b.part('casino-small-fountain-water',new THREE.CylinderGeometry(.084,.084,.012,16),[-.62,.12,.14],'#79a69a',false,[0,0,0],'glass');
  return {family:'casino',parts:b.parts,batches:b.finish()};
}
