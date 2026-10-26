import * as THREE from 'three';
import type { ArchitecturalPalette } from './detailGeometry';
import { Model, frontWindows, hipRoof, prism } from './buildingPrimitives';

type Builder = (b: Model, level: number, p: ArchitecturalPalette) => void;

function floors(level: number, height: number, bottom=.06) {
  return Array.from({length:level+2}, (_,i)=>bottom+(i+.5)*height/(level+2));
}
function door(b: Model, p: ArchitecturalPalette, x: number, z: number, width=.19) {
  b.block('entrance-frame',[width+.045,.24,.025],[x,.18,z],p.trim,false);
  b.block('entrance-glazing',[width,.21,.015],[x,.18,z+.02],p.roof,false,'glass');
}
function planter(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, width=.22, name='planter') {
  b.block(name,[width,.075,.12],[x,y+.0375,z],p.wallAlt);
  b.block(`${name}-foliage`,[width-.025,.05,.095],[x,y+.10,z],'#65846c');
}
function pergola(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number, d: number, name: string) {
  for(const dx of [-w/2+.025,w/2-.025]) for(const dz of [-d/2+.025,d/2-.025])
    b.post(`${name}-post`,.012,y,y+.19,x+dx,z+dz,p.trim);
  for(const dz of [-d/2+.025,d/2-.025]) b.block(`${name}-crossbeam`,[w,.025,.025],[x,y+.18,z+dz],p.trim);
  for(let i=0;i<5;i++) b.block(`${name}-slat`,[.025,.025,d],[x-w/2+.025+i*(w-.05)/4,y+.20,z],p.trim);
}
function rails(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, width: number, name: string) {
  for(const dx of [-width/2,0,width/2]) b.block(`${name}-post`,[.012,.11,.012],[x+dx,y+.055,z],p.roof);
  b.block(`${name}-rail`,[width+.012,.015,.015],[x,y+.11,z],p.roof);
}
function sideWindows(b: Model, p: ArchitecturalPalette, x: number, zs: number[], ys: number[]) {
  for(const z of zs) for(const y of ys) {
    b.block('side-window-frame',[.025,.12,.17],[x,y,z],p.wallAlt,false);
    b.block('side-window-glass',[.012,.09,.14],[x+Math.sign(x)*.018,y,z],p.glow,false,'light');
  }
}
function rearWindows(b: Model, p: ArchitecturalPalette, xs: number[], ys: number[], z: number, width=.17) {
  for(const x of xs) for(const y of ys) {
    b.block('rear-window-frame',[width+.025,.12,.025],[x,y,z],p.roof,false);
    b.block('rear-window-glass',[width,.09,.012],[x,y,z-.018],p.glow,false,'light');
  }
}
function roundWindows(b: Model, p: ArchitecturalPalette, x: number, z: number, r: number, ys: number[], n=12) {
  for(let i=0;i<n;i++) for(const y of ys) {
    const a=i*Math.PI*2/n;
    b.part('radial-glazing',new THREE.BoxGeometry(.11,.11,.014),[x+Math.sin(a)*(r+.008),y,z+Math.cos(a)*(r+.008)],p.glow,false,[0,a,0],'light');
  }
}

const courtyard: Builder = (b,l,p)=>{
  const h=.35+l*.10;
  b.block('courtyard-rear-house',[1.07,h,.38],[0,.06+h/2,-.30],p.wall);
  b.part('courtyard-main-tile-roof',hipRoof(1.15,.46,.26),[0,.06+h,-.30],p.roof,true);
  for(const x of [-.44,.44]) {
    b.block('courtyard-side-house',[.23,.25,.61],[x,.185,.15],p.wall);
    b.part('courtyard-wing-roof',hipRoof(.29,.67,.16),[x,.31,.15],p.roof,true);
    frontWindows(b,p,[x],[.20],.466,.12);
  }
  frontWindows(b,p,[-.34,0,.34],floors(l,h),-.098,.19);
  rearWindows(b,p,[-.34,0,.34],floors(l,h),-.502,.19);
  b.block('courtyard-path',[.24,.012,.64],[0,.066,.18],p.trim);
  door(b,p,0,-.09);
  if(l>=1) {
    b.block('upgrade-1-gate-pillars',[.065,.28,.065],[-.18,.20,.49],p.wallAlt);
    b.block('upgrade-1-gate-pillars',[.065,.28,.065],[.18,.20,.49],p.wallAlt);
    b.part('upgrade-1-gate-roof',hipRoof(.49,.25,.10),[0,.34,.49],p.roof,true);
  }
  if(l>=2) { planter(b,p,-.22,.06,.22,.15,'upgrade-2-courtyard-garden'); planter(b,p,.22,.06,.22,.15,'upgrade-2-courtyard-garden'); }
  if(l>=3) {
    b.block('upgrade-3-attic-dormer',[.31,.16,.18],[0,.06+h+.06,-.17],p.wallAlt);
    b.part('upgrade-3-dormer-roof',hipRoof(.36,.22,.09),[0,.06+h+.14,-.17],p.roof,true);
    frontWindows(b,p,[0],[.06+h+.065],-.067,.18);
  }
};

const apartment: Builder = (b,l,p)=>{
  const h=.69+l*.19, top=.06+h;
  b.block('apartment-residential-slab',[.79,h,.66],[-.12,.06+h/2,-.12],p.wall);
  b.block('apartment-stair-core',[.23,h+.22,.50],[.39,.06+(h+.22)/2,-.16],p.wallAlt);
  b.block('apartment-core-cap',[.28,.04,.55],[.39,top+.24,-.16],p.roof);
  b.block('apartment-flat-roof',[.86,.04,.73],[-.12,top+.02,-.12],p.roof);
  frontWindows(b,p,[-.34,-.07,.19],floors(l,h),.221,.16);
  sideWindows(b,p,-.523,[-.31,-.06],floors(l,h)); door(b,p,.39,.101);
  rearWindows(b,p,[-.34,-.07,.19],floors(l,h),-.462,.16);
  for(const y of floors(l,h)) b.block('apartment-stair-window',[.12,.13,.015],[.39,y,.102],p.glow,false,'light');
  if(l>=1) for(const y of floors(l,h)) {
    b.block('upgrade-1-resident-balcony',[.78,.025,.17],[-.12,y-.085,.29],p.wallAlt);
    rails(b,p,-.12,y-.0725,.365,.72,'apartment-balcony');
  }
  if(l>=2) pergola(b,p,-.14,top+.04,-.12,.54,.44,'upgrade-2-roof-pergola');
  if(l>=3) {
    b.block('upgrade-3-community-room',[.44,.25,.30],[-.25,.185,.46],p.wallAlt);
    b.block('apartment-community-green-roof',[.47,.04,.33],[-.25,.33,.46],'#69866e');
    frontWindows(b,p,[-.25],[.21],.621,.28);
  }
};

const lakeside: Builder = (b,l,p)=>{
  const h=.46+l*.12, top=.06+h;
  b.block('lakeside-rear-residence',[1.02,h,.45],[-.06,.06+h/2,-.29],p.wall);
  b.block('lakeside-terrace-roof',[1.10,.045,.51],[-.06,top+.0225,-.29],p.wallAlt);
  b.block('lakeside-low-wing',[.38,h*.58,.38],[-.38,.06+h*.29,.12],p.wall);
  b.block('lakeside-deck',[1.12,.04,.29],[-.02,.08,.40],'#a08560');
  b.block('lakeside-reflecting-pool',[.68,.018,.27],[.22,.069,.10],'#7faaa4',false,'glass');
  frontWindows(b,p,[-.38,0,.31],floors(l,h),-.053,.23); door(b,p,-.38,.321);
  rearWindows(b,p,[-.38,0,.31],floors(l,h),-.527,.20);
  sideWindows(b,p,.462,[-.29],floors(l,h));
  if(l>=1) {
    b.block('upgrade-1-waterfront-balcony',[.69,.03,.16],[.14,h*.64,.01],p.wallAlt);
    for(const x of [-.17,.45]) b.post('lakeside-balcony-support',.018,.06,h*.64-.015,x,.055,p.trim);
    rails(b,p,.14,h*.64+.015,.082,.64,'lakeside-balcony');
  }
  if(l>=2) for(const x of [-.44,.44]) planter(b,p,x,.10,.40,.19,'upgrade-2-deck-garden');
  if(l>=3) pergola(b,p,-.06,top+.045,-.29,.77,.36,'upgrade-3-roof-lounge');
};

const villa: Builder = (b,l,p)=>{
  const h=.45+l*.10;
  b.block('villa-main-house',[.77,h,.69],[-.17,.06+h/2,-.12],p.wall);
  b.part('villa-steep-gable',prism([[-.43,0],[.43,0],[0,.32]],.77),[-.17,.06+h,-.505],p.roof,true);
  b.block('villa-chimney',[.11,.38,.12],[.07,.06+h+.19,-.26],p.trim);
  frontWindows(b,p,[-.37,.02],floors(l,h),.236,.21); door(b,p,-.17,.245);
  rearWindows(b,p,[-.37,.02],floors(l,h),-.477,.21);
  sideWindows(b,p,-.567,[-.32,-.04],floors(l,h));
  b.block('villa-garden-wall',[.045,.12,1.10],[.61,.12,0],p.wallAlt);
  if(l>=1) {
    b.part('upgrade-1-porch-roof',hipRoof(.52,.34,.12),[-.17,.35,.40],p.roof,true);
    for(const x of [-.39,.05]) b.post('villa-porch-column',.018,.06,.35,x,.51,p.trim);
  }
  if(l>=2) {
    b.block('upgrade-2-conservatory',[.32,.28,.41],[.38,.20,-.08],'#71948b',true,'glass');
    b.part('villa-conservatory-roof',hipRoof(.36,.45,.15),[.38,.34,-.08],p.trim,true);
    for(const x of [.25,.38,.51]) b.block('villa-conservatory-mullion',[.015,.27,.025],[x,.20,.137],p.wallAlt,false);
  }
  if(l>=3) pergola(b,p,.36,.06,.41,.37,.30,'upgrade-3-garden-pavilion');
};

const shops: Builder = (b,l,p)=>{
  const h=.34+l*.09, tower=.62+l*.14;
  for(const x of [-.43,0,.43]) {
    b.block('shops-individual-shop',[.39,h,.64],[x,.06+h/2,-.10],x===0?p.wallAlt:p.wall);
    b.block('shops-parapet',[.41,.08,.68],[x,.10+h,-.10],p.roof);
    b.block('shops-display-window',[.28,.20,.018],[x,.20,.23],p.glow,false,'glass');
    b.block('shops-signboard',[.30,.06,.025],[x,.345,.24],p.trim,false);
    rearWindows(b,p,[x],floors(l,h),-.432,.19);
  }
  b.block('shops-corner-clocktower',[.21,tower,.25],[-.46,.06+tower/2,-.29],p.wallAlt);
  b.part('shops-clocktower-roof',hipRoof(.27,.31,.10),[-.46,.06+tower,-.29],p.roof,true);
  b.part('shops-clock-face',new THREE.CircleGeometry(.065,16),[-.46,tower-.01,-.158],p.glow,false);
  if(l>=1) for(const x of [-.43,0,.43]) b.part('upgrade-1-striped-shop-awning',new THREE.BoxGeometry(.37,.025,.24),[x,.30,.34],x===0?p.trim:p.accent,true,[-.12,0,0]);
  if(l>=2) {
    b.block('upgrade-2-upper-shopping-gallery',[1.20,.025,.18],[0,.38,.27],p.wallAlt);
    for(const x of [-.58,.58]) b.post('shops-gallery-column',.014,.06,.368,x,.34,p.trim);
    rails(b,p,0,.393,.35,1.14,'shops-gallery');
  }
  if(l>=3) for(const x of [-.40,0,.40]) planter(b,p,x,.14+h,-.12,.28,'upgrade-3-roof-garden');
};

const workshop: Builder = (b,l,p)=>{
  const h=.51+l*.08;
  b.block('workshop-tall-studio',[.47,h,.61],[.34,.06+h/2,-.23],p.wall);
  b.part('workshop-studio-roof',hipRoof(.54,.68,.16),[.34,.06+h,-.23],p.roof,true);
  b.block('workshop-low-studio',[.48,h-.13,.50],[-.33,.06+(h-.13)/2,-.18],p.wallAlt);
  b.block('workshop-flat-studio-roof',[.53,.035,.55],[-.33,h-.0525,-.18],p.roof);
  frontWindows(b,p,[.34],floors(l,h),.087,.30);
  rearWindows(b,p,[.34],floors(l,h),-.547,.26);
  rearWindows(b,p,[-.33],floors(l,h-.13),-.442,.26);
  sideWindows(b,p,.587,[-.38,-.10],floors(l,h));
  b.block('workshop-large-atelier-window',[.35,.21,.025],[-.33,.235,.083],p.glow,false,'glass');
  b.block('workshop-courtyard-paving',[.67,.012,.49],[0,.066,.30],p.trim);
  b.block('workshop-art-plinth',[.16,.08,.16],[.13,.10,.35],p.wallAlt);
  b.part('workshop-sculpture',new THREE.TorusGeometry(.085,.018,6,16),[.13,.23,.35],p.trim,true);
  if(l>=1) {
    b.block('upgrade-1-open-gallery',[.45,.035,.24],[-.34,.36,.20],p.accent);
    for(const x of [-.53,-.15]) b.post('workshop-gallery-post',.015,.06,.343,x,.29,p.trim);
    for(const x of [-.48,-.34,-.20]) b.block('workshop-art-panel',[.10,.15,.025],[x,.22,.085],x===-.34?'#ac755d':'#7c99a0',false);
  }
  if(l>=2) pergola(b,p,-.02,.06,.41,.30,.28,'upgrade-2-makers-courtyard');
  if(l>=3) {
    b.block('upgrade-3-northlight-skylight',[.32,.105,.24],[-.33,h+.0175,-.18],p.roof);
    b.part('workshop-skylight-glass',new THREE.BoxGeometry(.28,.016,.21),[-.33,h+.078,-.18],p.glow,false,[0,0,0],'glass');
  }
};

const rotunda: Builder = (b,l,p)=>{
  const h=.37+l*.10, top=.06+h;
  b.part('plaza-round-market-hall',new THREE.CylinderGeometry(.47,.47,h,24),[0,.06+h/2,-.12],p.wall,true);
  const dome=new THREE.SphereGeometry(.51,24,12,0,Math.PI*2,0,Math.PI/2); dome.scale(1,.45,1);
  b.part('plaza-glass-dome',dome,[0,top,-.12],p.roof,true);
  roundWindows(b,p,0,-.12,.47,floors(l,h)); door(b,p,0,.365,.24);
  if(l>=1) for(const x of [-.55,.55]) {
    b.block('upgrade-1-market-kiosk',[.20,.23,.26],[x,.175,.08],p.wallAlt);
    b.part('plaza-kiosk-roof',hipRoof(.25,.31,.08),[x,.29,.08],p.trim,true);
  }
  if(l>=2) {
    b.part('upgrade-2-courtyard-fountain',new THREE.CylinderGeometry(.17,.18,.065,20),[0,.0925,.49],p.wallAlt,true);
    b.part('plaza-fountain-water',new THREE.CylinderGeometry(.145,.145,.015,20),[0,.13,.49],'#7faaa4',true,[0,0,0],'glass');
    b.post('plaza-fountain-spout',.025,.1375,.24,0,.49,p.trim);
  }
  if(l>=3) {
    for(const x of [-.33,.33]) b.post('upgrade-3-market-portico',.022,.06,.36,x,.46,p.wallAlt);
    b.block('plaza-portico-roof',[.77,.035,.26],[0,.3775,.44],p.trim);
  }
};

const office: Builder = (b,l,p)=>{
  const h=.80+l*.22, top=.06+h;
  b.block('office-glazed-slab',[.78,h,.66],[.08,.06+h/2,-.10],'#709794',true,'glass');
  b.block('office-solid-service-core',[.22,h+.12,.72],[-.43,.06+(h+.12)/2,-.10],p.wallAlt);
  b.block('office-core-cap',[.27,.04,.77],[-.43,top+.14,-.10],p.roof);
  for(const y of floors(l,h)) {
    b.block('office-front-spandrel',[.78,.035,.025],[.08,y-.085,.244],p.wallAlt,false);
    b.block('office-rear-spandrel',[.78,.035,.025],[.08,y-.085,-.444],p.wallAlt,false);
  }
  for(const x of [-.22,-.02,.18,.38]) b.block('office-curtain-wall-mullion',[.014,h,.024],[x,.06+h/2,.244],p.trim,false);
  sideWindows(b,p,.482,[-.31,-.06,.15],floors(l,h));
  if(l>=1) {
    b.block('upgrade-1-office-glass-lobby',[.64,.24,.29],[.02,.18,.37],'#557d7c',true,'glass');
    b.block('office-entry-roof',[.70,.04,.34],[.02,.32,.37],p.trim);
  }
  if(l>=2) for(const y of floors(l,h).slice(1)) b.block('upgrade-2-office-sunshade',[.82,.025,.12],[.08,y+.06,.28],p.wallAlt);
  if(l>=3) {
    b.block('upgrade-3-roof-equipment',[.33,.12,.34],[.10,top+.06,-.10],p.roof);
    for(const x of [-.025,.10,.225]) b.block('office-equipment-louvre',[.015,.085,.02],[x,top+.07,.079],p.wallAlt,false);
  }
};

const skyscraper: Builder = (b,l,p)=>{
  const h=.85+l*.24;
  let bottom=.06;
  for(const [w,d,f] of [[1.02,.79,.52],[.72,.57,.30],[.42,.36,.18]]) {
    b.block('skyline-setback-tier',[w,h*f,d],[0,bottom+h*f/2,-.10],p.wall);
    frontWindows(b,p,Array.from({length:w>.8?4:w>.5?3:2},(_,i)=>(i-(w>.8?3:w>.5?2:1)/2)*.21),[bottom+h*f*.35,bottom+h*f*.72],-.10+d/2+.012,.11);
    rearWindows(b,p,Array.from({length:w>.8?4:w>.5?3:2},(_,i)=>(i-(w>.8?3:w>.5?2:1)/2)*.21),[bottom+h*f*.35,bottom+h*f*.72],-.10-d/2-.012,.11);
    sideWindows(b,p,w/2+.012,[-.10],[bottom+h*f*.35,bottom+h*f*.72]);
    bottom+=h*f;
    b.block('skyline-tier-cornice',[w+.04,.035,d+.04],[0,bottom+.0175,-.10],p.roof);
  }
  b.post('skyline-spire',.017,.06+h+.035,.37+h+(l>=3?.12:0),0,-.10,p.trim);
  if(l>=1) {
    b.block('upgrade-1-skyline-entry-canopy',[.74,.04,.30],[0,.34,.37],p.trim);
    for(const x of [-.33,.33]) b.post('skyline-entry-pillar',.02,.06,.32,x,.48,p.wallAlt);
  }
  if(l>=2) for(const x of [-.40,.40]) planter(b,p,x,.06+h*.52+.035,-.10,.15,'upgrade-2-setback-garden');
  if(l>=3) {
    b.block('upgrade-3-observation-deck',[.56,.045,.48],[0,.06+h*.82+.0575,-.10],p.trim);
    rails(b,p,0,.06+h*.82+.08,.13,.52,'skyline-observation');
  }
};

const cinema: Builder = (b,l,p)=>{
  const h=.43+l*.10;
  b.block('cinema-screen-box',[.94,h,.72],[0,.06+h/2,-.14],p.wall);
  for(const x of [-.51,.51]) {
    b.block('cinema-art-deco-pylon',[.17,h+.24,.80],[x,.06+(h+.24)/2,-.10],p.wallAlt);
    b.block('cinema-pylon-cap',[.21,.04,.84],[x,h+.32,-.10],p.roof);
    b.block('cinema-pylon-light',[.035,h+.15,.016],[x,.06+(h+.15)/2,.311],p.glow,false,'light');
  }
  b.block('cinema-front-title-panel',[.82,.15,.035],[0,h-.025,.24],p.roof,false);
  for(let i=0;i<5;i++) {
    const a=i*Math.PI*2/5;
    b.part('cinema-star-ray',new THREE.BoxGeometry(.025,.13,.02),[Math.sin(a)*.045,h-.025+Math.cos(a)*.045,.268],p.trim,false,[0,0,-a]);
  }
  for(const x of [-.30,.30]) b.block('cinema-poster-case',[.19,.23,.025],[x,.21,.235],p.trim,false);
  door(b,p,0,.235,.20);
  b.block('cinema-rear-service-door',[.20,.25,.025],[0,.185,-.512],p.roof,false);
  for(const x of [-.29,.29]) for(const y of [.28,.32,.36]) b.block('cinema-rear-vent',[.15,.015,.022],[x,y,-.514],p.trim,false);
  if(l>=1) {
    b.block('upgrade-1-cinema-lit-marquee',[.92,.07,.30],[0,.33,.36],p.wallAlt);
    for(const x of [-.42,.42]) b.post('cinema-marquee-post',.016,.06,.295,x,.47,p.trim);
    for(let i=0;i<9;i++) b.block('cinema-marquee-bulb',[.025,.02,.015],[-.38+i*.095,.32,.518],p.glow,false,'light');
  }
  if(l>=2) {
    b.block('upgrade-2-cinema-roof-billboard',[.65,.21,.055],[0,.06+h+.105,-.10],p.roof);
    for(const x of [-.20,.20]) b.part('cinema-film-reel',new THREE.TorusGeometry(.067,.015,6,16),[x,.06+h+.11,-.064],p.trim,false);
  }
  if(l>=3) {
    b.block('upgrade-3-cinema-ticket-booth',[.23,.23,.20],[.50,.175,.47],p.wallAlt);
    b.block('cinema-ticket-window',[.17,.11,.018],[.50,.21,.578],p.roof,false,'glass');
  }
};

const resort: Builder = (b,l,p)=>{
  const h=.31+l*.07;
  b.block('resort-main-bungalow',[1.08,h,.38],[0,.06+h/2,-.32],p.wall);
  b.part('resort-tropical-roof',hipRoof(1.19,.49,.22),[0,.06+h,-.32],p.roof,true);
  frontWindows(b,p,[-.37,0,.37],[.23],-.117,.22);
  rearWindows(b,p,[-.37,0,.37],[.23],-.522,.22);
  b.block('resort-pool-surround',[.65,.025,.63],[.22,.0725,.25],p.wallAlt);
  b.block('resort-swimming-pool',[.51,.014,.49],[.22,.092,.25],'#72a8aa',false,'glass');
  for(const z of [.12,.40]) b.block('resort-sun-lounger',[.16,.04,.23],[-.40,.08,z],p.trim);
  if(l>=1) {
    b.block('upgrade-1-resort-spa-wing',[.28,.24,.36],[-.48,.18,.01],p.wallAlt);
    b.part('resort-spa-roof',hipRoof(.34,.42,.16),[-.48,.30,.01],p.roof,true);
  }
  if(l>=2) pergola(b,p,.25,.06,.26,.51,.48,'upgrade-2-poolside-cabana');
  if(l>=3) {
    b.block('upgrade-3-resort-outdoor-bar',[.30,.22,.15],[-.30,.17,.50],p.wallAlt);
    b.block('resort-bar-counter',[.35,.03,.19],[-.30,.295,.50],p.trim);
    for(const x of [-.41,-.19]) b.post('resort-bar-stool',.025,.06,.15,x,.34,p.roof);
  }
};

const campus: Builder = (b,l,p)=>{
  const h=.49+l*.12, top=.06+h;
  for(const x of [-.39,.39]) {
    b.block('campus-research-lab',[.38,h,.89],[x,.06+h/2,-.10],p.wall);
    b.block('campus-lab-flat-roof',[.42,.035,.93],[x,top+.0175,-.10],p.roof);
    frontWindows(b,p,[x],floors(l,h),.357,.25);
    rearWindows(b,p,[x],floors(l,h),-.557,.25);
    sideWindows(b,p,Math.sign(x)*.592,[-.33,.02,.23],floors(l,h));
  }
  b.block('campus-central-atrium',[.40,h,.60],[0,.06+h/2,-.19],'#6d9794',true,'glass');
  b.part('campus-atrium-glass-roof',prism([[-.22,0],[.22,0],[0,.23]],.64),[0,top,-.51],p.trim,true);
  if(l>=1) b.block('upgrade-1-campus-bridge',[.48,.16,.20],[0,.31,.19],p.roof);
  if(l>=2) for(const z of [-.37,-.10,.17]) {
    b.block('upgrade-2-lab-solar-frame',[.30,.025,.18],[-.39,top+.048,z],p.trim);
    b.block('campus-solar-glass',[.27,.012,.15],[-.39,top+.066,z],'#365c67',true,'glass');
  }
  if(l>=3) {
    b.part('upgrade-3-campus-observatory-base',new THREE.CylinderGeometry(.15,.15,.045,20),[.39,top+.0575,-.21],p.wallAlt,true);
    b.part('campus-observatory-dome',new THREE.SphereGeometry(.15,20,10,0,Math.PI*2,0,Math.PI/2),[.39,top+.08,-.21],p.trim,true);
  }
};

const cloud: Builder = (b,l,p)=>{
  const h=.87+l*.20;
  for(const [x,z,f] of [[-.32,-.15,1],[.32,-.04,.83]]) {
    b.part('cloud-rounded-tower',new THREE.CylinderGeometry(.24,.24,h*f,20),[x,.06+h*f/2,z],p.wall,true);
    roundWindows(b,p,x,z,.24,floors(l,h*f),10);
    const crown=new THREE.SphereGeometry(.26,20,10,0,Math.PI*2,0,Math.PI/2); crown.scale(1,.55,1);
    b.part('cloud-curved-crown',crown,[x,.06+h*f,z],p.roof,true);
  }
  if(l>=1) {
    b.block('upgrade-1-cloud-skybridge',[.65,.16,.23],[0,.06+h*.64,-.10],p.trim);
    b.block('cloud-skybridge-glass',[.55,.10,.016],[0,.06+h*.64,.024],p.glow,false,'glass');
  }
  if(l>=2) {
    b.block('upgrade-2-cloud-conference-podium',[1.10,.25,.31],[0,.185,.32],p.wallAlt);
    planter(b,p,0,.31,.32,.72,'cloud-podium-garden');
    frontWindows(b,p,[-.34,0,.34],[.20],.487,.20);
  }
  if(l>=3) b.post('upgrade-3-cloud-communications-spire',.014,.06+h+.143,.06+h+.303,-.32,-.15,p.trim);
};

const headquarters: Builder = (b,l,p)=>{
  const podium=.30+l*.06, h=.52+l*.15, bottom=.06+podium, top=bottom+h;
  b.block('headquarters-retail-podium',[1.17,podium,.91],[0,.06+podium/2,-.04],p.wallAlt);
  b.part('headquarters-corner-rotunda',new THREE.CylinderGeometry(.31,.31,h,24),[.24,bottom+h/2,-.10],p.wall,true);
  roundWindows(b,p,.24,-.10,.31,floors(l,h,bottom),14);
  b.part('headquarters-circular-cornice',new THREE.CylinderGeometry(.35,.35,.06,24),[.24,top+.03,-.10],p.roof,true);
  b.block('headquarters-low-office-wing',[.42,h*.61,.63],[-.36,bottom+h*.305,-.10],p.wall);
  frontWindows(b,p,[-.36],[bottom+h*.3],.227,.26); door(b,p,0,.427,.27);
  rearWindows(b,p,[-.36],[bottom+h*.3],-.427,.26);
  if(l>=1) {
    b.block('upgrade-1-headquarters-shopping-canopy',[1.20,.035,.23],[0,.29,.46],p.trim);
    for(const x of [-.55,.55]) b.post('headquarters-arcade-post',.018,.06,.2725,x,.54,p.wallAlt);
  }
  if(l>=2) {
    b.block('upgrade-2-headquarters-terraced-wing',[.38,.19,.47],[-.36,bottom+h*.61+.095,-.10],p.wallAlt);
    planter(b,p,-.36,bottom+h*.61+.19,.01,.31,'headquarters-terrace-garden');
  }
  if(l>=3) {
    b.part('upgrade-3-headquarters-helipad',new THREE.CylinderGeometry(.28,.28,.025,24),[.24,top+.0725,-.10],'#6c8983',true);
    for(const dx of [-.065,.065]) b.block('headquarters-helipad-H',[.018,.005,.17],[.24+dx,top+.088,-.10],p.wallAlt,false);
    b.block('headquarters-helipad-H',[.13,.005,.018],[.24,top+.088,-.10],p.wallAlt,false);
  }
};

const exhibition: Builder = (b,l,p)=>{
  const h=.24+l*.055, top=.06+h;
  b.block('exhibition-low-span-hall',[1.18,h,.79],[0,.06+h/2,-.13],p.wall);
  for(const x of [-.30,.30]) b.part('exhibition-pyramid-skylight',hipRoof(.62,.85,.42),[x,top,-.13],p.roof,true);
  b.block('exhibition-glass-foyer',[1.02,.20,.025],[0,.17,.277],p.glow,false,'glass');
  rearWindows(b,p,[-.42,-.14,.14,.42],[.18],-.537,.18);
  for(const x of [-.45,-.15,.15,.45]) b.block('exhibition-foyer-mullion',[.018,.21,.035],[x,.17,.287],p.trim,false);
  if(l>=1) {
    b.block('upgrade-1-exhibition-arrival-canopy',[1.20,.035,.28],[0,.30,.43],p.trim);
    for(const x of [-.54,.54]) b.post('exhibition-canopy-post',.018,.06,.2825,x,.53,p.wallAlt);
  }
  if(l>=2) for(const x of [-.46,.46]) {
    b.block('upgrade-2-exhibition-display-podium',[.21,.085,.18],[x,.1025,.43],p.wallAlt);
    b.part('exhibition-outdoor-installation',new THREE.OctahedronGeometry(.085),[x,.225,.43],p.trim,true);
  }
  if(l>=3) b.post('upgrade-3-exhibition-roof-mast',.013,top+.42,top+.64,-.30,-.13,p.trim);
};

/**
 * 内区街区化后新增的 6 块地产。它们共用一个参数化生成器：主厅 + 檐口 + 门廊，
 * 坡顶按 spec.roof 变化，Lv.1/2/3 各叠一个结构件。六个 spec 的宽高不同，
 * 所以每一级的结构指纹天然互不相同。
 */
export type InnerSpec = { tag:string; family:string; w:number; d:number; h0:number; grow:number; roof:'flat'|'hip'|'pyramid' };
export const INNER_SPECS: Record<number,InnerSpec> = {
  36:{tag:'trading-hall',family:'trading-hall',w:.78,d:.62,h0:.62,grow:.14,roof:'flat'},
  37:{tag:'quant-workshop',family:'quant-workshop',w:.64,d:.54,h0:.80,grow:.16,roof:'pyramid'},
  38:{tag:'vault',family:'vault',w:.72,d:.66,h0:.48,grow:.10,roof:'flat'},
  39:{tag:'procurement',family:'procurement',w:.84,d:.58,h0:.56,grow:.12,roof:'hip'},
  40:{tag:'flagship',family:'flagship',w:.60,d:.50,h0:.76,grow:.18,roof:'pyramid'},
  41:{tag:'warehouse-bay',family:'warehouse-bay',w:.88,d:.64,h0:.44,grow:.09,roof:'hip'},
};
const round2=(n:number)=>Math.round(n*100)/100;
/** 屋顶顶点的绝对高度偏移（相对 .06 + h）：平顶块、四坡顶与金字塔顶实测值。 */
const INNER_ROOF_TOP = {flat:.047,hip:.162,pyramid:.222} as const;
export const innerRoofTop=(s:InnerSpec,l:number)=>round2(.06+s.h0+l*s.grow+INNER_ROOF_TOP[s.roof]);
export const innerTop=(s:InnerSpec,l:number)=>round2(innerRoofTop(s,l)+(l>=3?.11:0));
function innerStreet(spec:InnerSpec):{family:string;height:(level:number)=>number;build:Builder} {
  const build:Builder=(b,l,p)=>{
    const {tag,w,d}=spec, h=spec.h0+l*spec.grow, top=.06+h, z=-.06, front=z+d/2;
    // 主厅：直接坐在共享基座上，保证连通
    b.block(`${tag}-main-hall`,[w,h,d],[0,.06+h/2,z],p.wall);
    b.block(`${tag}-hall-cornice`,[w+.05,.032,d+.05],[0,top+.016,z],p.roof);
    for(const y of floors(l,h).slice(-2)) frontWindows(b,p,[-w*.26,w*.26],[y],front+.014,.13);
    // 入口门廊（Lv.0 就在，属于主体）
    b.block(`${tag}-entry-portico`,[w*.42,.24,.12],[0,.18,front+.05],p.wallAlt);
    b.block(`${tag}-entry-canopy`,[w*.5,.03,.16],[0,.315,front+.06],p.trim);
    // 屋顶
    if(spec.roof==='hip') b.part(`${tag}-hip-roof`,hipRoof(w+.06,d+.06,INNER_ROOF_TOP.hip-.032),[0,top+.032,z],p.roof,true);
    else if(spec.roof==='pyramid') b.part(`${tag}-pyramid-roof`,hipRoof(w*.62,d*.62,INNER_ROOF_TOP.pyramid-.032),[0,top+.032,z],p.roof,true);
    else b.block(`${tag}-flat-roof`, [w+.02,.03,d+.02],[0,top+.032,z],p.roof);
    if(l>=1) b.block(`upgrade-1-${tag}-marquee`,[w+.10,.026,.16],[0,.335,front+.08],p.trim);
    if(l>=2) for(const sx of [-1,1]) b.block(`upgrade-2-${tag}-annex`,[.16,.30,.30],[sx*(w/2+.09),.21,z-.02],p.wallAlt);
    if(l>=3) {
      const crownBase=innerRoofTop(spec,l), top3=innerTop(spec,l);
      // 冠部做成贴在屋脊上的小型灯笼 + 短桅杆 + 信号灯，不再是一块悬浮的大方块
      b.block(`upgrade-3-${tag}-crown`,[.13,.07,.13],[0,crownBase+.035,z],p.trim);
      b.block(`upgrade-3-${tag}-crown-cap`,[.10,.016,.10],[0,crownBase+.078,z],p.roof);
      b.post(`upgrade-3-${tag}-mast`,.011,crownBase+.07,top3,0,z,p.trim);
      b.part(`upgrade-3-${tag}-beacon`,new THREE.SphereGeometry(.016,8,6),[0,top3-.012,z],p.glow,false,[0,0,0],'light');
    }
  };
  return {family:spec.family,height:(l)=>innerTop(spec,l),build};
}

export const PROPERTY_MODELS: Record<number,{family:string; height:(level:number)=>number; build:Builder}> = {
  1:{family:'courtyard',height:l=>.67+l*.10,build:courtyard},
  3:{family:'apartment',height:l=>1.01+l*.19,build:apartment},
  5:{family:'lakeside',height:l=>.565+l*.12+(l>=3?.2125:0),build:lakeside},
  7:{family:'villa',height:l=>.89+l*.10,build:villa},
  8:{family:'shops',height:l=>.78+l*.14,build:shops},
  10:{family:'workshop',height:l=>.73+l*.08,build:workshop},
  12:{family:'rotunda',height:l=>.6595+l*.10,build:rotunda},
  13:{family:'office',height:l=>1.02+l*.22,build:office},
  15:{family:'skyscraper',height:l=>1.22+l*.24+(l>=3?.12:0),build:skyscraper},
  17:{family:'cinema',height:l=>.77+l*.10,build:cinema},
  21:{family:'resort',height:l=>.59+l*.07,build:resort},
  28:{family:'campus',height:l=>.78+l*.12,build:campus},
  31:{family:'cloud',height:l=>1.073+l*.20+(l>=3?.16:0),build:cloud},
  34:{family:'headquarters',height:l=>.94+l*.21+(l>=3?.0305:0),build:headquarters},
  35:{family:'exhibition',height:l=>.72+l*.055+(l>=3?.22:0),build:exhibition},
  36:innerStreet(INNER_SPECS[36]), 37:innerStreet(INNER_SPECS[37]), 38:innerStreet(INNER_SPECS[38]),
  39:innerStreet(INNER_SPECS[39]), 40:innerStreet(INNER_SPECS[40]), 41:innerStreet(INNER_SPECS[41]),
};
