import * as THREE from 'three';
import { TILES } from '../../shared/catalog';
import type { ArchitecturalPalette, DetailBatch } from './detailGeometry';
import { Model, base, frontWindows, rows, prism, hipRoof, type ModelPart } from './buildingPrimitives';
import { PROPERTY_MODELS } from './propertyGeometry';
import { DYNAMIC_MODEL_PARTS, factoryChimneyTop, windRotorCentre } from './cityActivity';
import {buildCasinoModel,CASINO_HEIGHT} from './casinoGeometry';
import {PRESTIGE_HEIGHTS,PRESTIGE_MODELS} from './prestigeGeometry';
import {LUXURY_ADDITIONS,LUXURY_HEIGHTS} from './luxuryGeometry';

export const DISTINCT_PROPERTIES = [1,3,5,7,8,10,12,13,15,17,18,20,21,23,24,26,28,31,34,35,36,37,38,39,40,41] as const;
export function hasLandmarkModel(id: number) {
  return (DISTINCT_PROPERTIES as readonly number[]).includes(id) || ['bank', 'exchange', 'event','casino'].includes(TILES[id]?.type);
}
export function landmarkModelHeight(id: number, level: number): number {
  if(id===19)return CASINO_HEIGHT;
  if(level>=3&&PRESTIGE_HEIGHTS[id]!==undefined) return PRESTIGE_HEIGHTS[id];
  if(level>=3&&LUXURY_HEIGHTS[id]!==undefined) return LUXURY_HEIGHTS[id];
  if(PROPERTY_MODELS[id]) return PROPERTY_MODELS[id].height(level);
  switch(id) {
    case 18: return 1.065+level*.24;
    case 20: return Math.max(1.11+level*.08,1.045+level*.13);
    case 23: return 1.065+level*.16;
    case 24: return 1.295+level*.18;
    case 26: return .68+level*.12+(level>=3?.11:0);
    default: return TILES[id].type==='bank'?.9:TILES[id].type==='exchange'?1.345:.96;
  }
}
export interface LandmarkModel { family: string; batches: DetailBatch[]; parts: ModelPart[]; }

function hotel(b: Model, level: number, p: ArchitecturalPalette) {
  const h=.78+level*.24;
  b.block('hotel-rear-wing', [1.16,h,.3], [0,.06+h/2,-.28], p.wall);
  for (const x of [-.42,.42]) {
    b.block('hotel-guest-wing', [.32,h,.73], [x,.06+h/2,.02], p.wall);
    b.block('hotel-wing-cornice', [.37,.055,.78], [x,.06+h+.0275,.02], p.wallAlt);
    frontWindows(b,p,[x],rows(level),.397,.20);
    for (const y of rows(level)) {
      b.block('hotel-balcony-slab', [.30,.028,.13], [x,y-.085,.43], p.wallAlt);
      for (const sx of [-.12,.12]) b.block('hotel-balcony-post', [.012,.095,.012], [x+sx,y-.025,.482], p.roof);
      b.block('hotel-balcony-rail', [.27,.014,.018], [x,y+.02,.482], p.roof);
    }
  }
  b.block('hotel-lobby', [.58,.29,.38], [0,.205,.22], '#507b79');
  for(const sign of [-1,1]) for(const y of rows(level)) for(const z of [-.12,.14]) {
    b.block('hotel-side-window-frame',[.025,.12,.17],[sign*.585,y,z],p.roof,false);
    b.block('hotel-side-window-glass',[.012,.09,.14],[sign*.601,y,z],p.glow,false,'light');
  }
  for(const x of [-.38,0,.38]) for(const y of rows(level)) {
    b.block('hotel-rear-window-frame',[.18,.12,.025],[x,y,-.44],p.roof,false);
    b.block('hotel-rear-window-glass',[.15,.09,.012],[x,y,-.456],p.glow,false,'light');
  }
  b.block('hotel-entry-canopy', [.53,.04,.29], [0,.37,.46], p.trim);
  for (const x of [-.22,.22]) b.post('hotel-canopy-column',.018,.06,.35,x,.58,p.wallAlt);
  b.block('hotel-entry-doors', [.28,.24,.02], [0,.18,.417], p.roof, false);
  for (const x of [-.07,.07]) b.block('hotel-door-glass', [.10,.18,.012], [x,.20,.432], p.glow, false, 'light');
  // A grounded rooftop sign, rather than the coastal template's freestanding palm.
  b.block('hotel-sign-plinth', [.36,.06,.11], [0,h+.085,-.28], p.roof);
  for (const x of [-.085,.085]) b.block('hotel-letter-H-upright', [.035,.18,.03], [x,h+.195,-.28], p.trim);
  b.block('hotel-letter-H-crossbar', [.17,.035,.03], [0,h+.195,-.28], p.trim);
}

function theatre(b: Model, level: number, p: ArchitecturalPalette) {
  const h=.48+level*.08;
  b.block('theatre-auditorium', [1.10,h,.73], [0,.06+h/2,-.04], p.wall);
  const arch = new THREE.Shape();
  arch.moveTo(-.57,0); arch.lineTo(.57,0); arch.absarc(0,0,.57,0,Math.PI,false); arch.closePath();
  const roof = new THREE.ExtrudeGeometry(arch,{depth:.76,bevelEnabled:false,curveSegments:20});
  b.part('theatre-barrel-roof',roof,[0,.06+h,-.42],p.roof,true);
  b.part('theatre-arch-trim',new THREE.TorusGeometry(.57,.012,5,28,Math.PI),[0,.06+h,.346],p.trim,false,[0,0,0],'metal');
  const stageH=.93+level*.13;
  b.block('theatre-stage-house',[.67,stageH,.28],[0,.06+stageH/2,-.43],p.wallAlt);
  b.block('theatre-stage-cap',[.72,.055,.32],[0,.06+stageH+.0275,-.43],p.roof);
  b.block('theatre-proscenium',[.86,.35,.055],[0,.285,.353],p.trim);
  b.block('theatre-red-curtain',[.66,.30,.025],[0,.28,.389],'#864b51',false);
  for(const x of [-.26,-.13,0,.13,.26]) b.block('theatre-curtain-fold',[.014,.29,.015],[x,.28,.409],'#b77a68',false);
  b.block('theatre-marquee',[1.18,.065,.30],[0,.49,.43],p.wallAlt);
  for(const x of [-.51,.51]) b.post('theatre-marquee-column',.026,.06,.46,x,.53,p.trim);
  for(let i=0;i<11;i++) b.block('theatre-marquee-bulb',[.025,.018,.016],[-.5+i*.1,.48,.589],p.glow,false,'light');
  for(const x of [-.43,.43]) b.block('theatre-poster',[.14,.25,.022],[x,.265,.402],x<0?'#a28a58':'#76848f',false);
}

function factory(b: Model, level: number, p: ArchitecturalPalette) {
  const h=.44+level*.13;
  b.block('factory-production-hall',[1.12,h,.72],[0,.06+h/2,0],p.wall);
  for(let i=0;i<3;i++) b.part('factory-sawtooth-roof',prism([[0,0],[.38,0],[.32,.23]],.75),[-.57+i*.38,.06+h,-.375],p.roof,true);
  for(const x of [-.49,-.28]) {
    const top=factoryChimneyTop(level)-.035;
    b.post('factory-chimney',.065,.06,top,x,-.49,p.wallAlt);
    b.post('factory-chimney-cap',.084,top-.025,top+.035,x,-.49,p.trim);
  }
  b.block('factory-loading-door',[.4,.30,.025],[.25,.21,.373],p.roof,false);
  for(const y of [.10,.16,.22,.28,.34]) b.block('factory-door-slat',[.38,.01,.012],[.25,y,.39],p.wallAlt,false);
  frontWindows(b,p,[-.37,-.12],[.37],.373,.17);
  for(const y of Array.from({length:level},(_,i)=>.52+i*.12)) frontWindows(b,p,[-.36,0,.36],[y],.373,.15);
  b.block('factory-loading-step',[.65,.06,.2],[.20,.09,.47],p.wallAlt);
}

function solarArray(b: Model, x: number, z: number, p: ArchitecturalPalette) {
  const tilt=-.30, centre=.23;
  for(const dz of [-.08,.08]) {
    const top=centre-Math.sin(tilt)*dz-.014;
    b.post('solar-panel-support',.012,.06,top,x,z+dz,p.roof);
  }
  b.part('supported-solar-panel',new THREE.BoxGeometry(.29,.025,.25),[x,centre,z],'#365c67',true,[tilt,0,0],'glass');
  for(const dx of [-.09,0,.09]) b.part('solar-panel-grid',new THREE.BoxGeometry(.008,.004,.235),[x+dx,centre+.015,z],p.accent,false,[tilt,0,0],'metal');
}
function energy(b: Model, level: number, p: ArchitecturalPalette) {
  const h=.34+level*.06;
  b.block('energy-control-room',[.46,h,.47],[.38,.06+h/2,-.28],p.wall);
  b.block('energy-living-roof',[.49,.045,.50],[.38,.06+h+.0225,-.28],'#66886b');
  frontWindows(b,p,[.38],[.24],-.031,.29);
  for(const x of [-.46,-.10]) for(const z of [.02,.36]) solarArray(b,x,z,p);
  if(level>=2) for(const x of [-.46,-.10]) solarArray(b,x,-.31,p);
  const top=windRotorCentre(level)[1];
  b.post('energy-turbine-mast',.028,.06,top,-.39,-.49,p.wallAlt);
  b.block('energy-nacelle',[.12,.09,.17],[-.39,top,-.47],p.wallAlt);
  b.part('energy-rotor-hub',new THREE.SphereGeometry(.052,10,8),[-.39,top,-.365],p.trim,true);
  for(let i=0;i<3;i++) {
    const a=i*Math.PI*2/3;
    b.part('energy-wind-blade',new THREE.BoxGeometry(.04,.27,.025),[-.39+Math.sin(a)*.13,top+Math.cos(a)*.13,-.365],p.wall,true,[0,0,-a]);
  }
  for(const x of [.24,.47]) {
    b.block('energy-battery-cabinet',[.17,.32,.25],[x,.22,.29],p.roof);
    b.block('energy-battery-indicator',[.10,.04,.012],[x,.28,.422],p.glow,false,'light');
  }
}

function warehouse(b: Model, level: number, p: ArchitecturalPalette) {
  const h=.43+level*.10;
  b.block('warehouse-wide-shed',[1.24,h,.86],[0,.06+h/2,-.11],p.wall);
  b.part('warehouse-gable-roof',prism([[-.66,0],[.66,0],[0,.19+level*.02]],.92),[0,.06+h,-.57],p.roof,true);
  b.block('warehouse-loading-dock',[1.30,.08,.28],[0,.10,.43],p.wallAlt);
  for(const x of [-.41,0,.41]) {
    b.block('warehouse-dock-frame',[.32,.33,.035],[x,.255,.337],p.trim,false);
    b.block('warehouse-roller-door',[.26,.29,.02],[x,.25,.364],p.roof,false);
    for(const y of [.14,.20,.26,.32]) b.block('warehouse-door-slat',[.25,.009,.01],[x,y,.38],p.wallAlt,false);
  }
  if(level>0) frontWindows(b,p,[-.41,0,.41],[h-.02],.337,.19);
  b.block('warehouse-dock-canopy',[1.31,.035,.24],[0,.43,.40],p.roof);
  for(const x of [-.60,.60]) b.post('warehouse-canopy-post',.016,.14,.415,x,.49,p.trim);
  for(const x of [-.45,.45]) {
    b.block('warehouse-pallet',[.25,.035,.17],[x,.0775,.59],'#856746');
    b.block('warehouse-cargo',[.20,.16,.13],[x,.175,.59],'#b89b6e');
  }
}

function bank(b: Model, p: ArchitecturalPalette) {
  b.block('bank-main-hall',[.98,.54,.62],[0,.33,-.10],p.wall);
  b.block('bank-portico-platform',[1.12,.08,.38],[0,.10,.34],p.wallAlt);
  for(const x of [-.39,-.13,.13,.39]) {
    b.block('bank-column-foot',[.12,.045,.12],[x,.1625,.36],p.wallAlt);
    b.post('bank-column',.038,.18,.58,x,.36,p.wall);
    b.block('bank-column-capital',[.11,.045,.11],[x,.58,.36],p.wallAlt);
  }
  b.block('bank-entablature',[1.20,.08,.92],[0,.61,0],p.wallAlt);
  b.part('bank-hip-roof',hipRoof(1.26,.97,.25),[0,.65,0],p.roof,true);
  b.block('bank-doors',[.28,.32,.025],[0,.24,.221],p.roof,false);
  frontWindows(b,p,[-.32,.32],[.36],.221,.15);
  b.part('bank-seal',new THREE.CylinderGeometry(.032,.032,.014,16),[0,.61,.467],p.trim,false,[Math.PI/2,0,0],'metal');
  for(const x of [-.52,.52]) {
    b.post('bank-lamp-stem',.012,.14,.38,x,.45,p.roof);
    b.part('bank-lamp',new THREE.SphereGeometry(.03,8,6),[x,.40,.45],p.glow,true,[0,0,0],'light');
  }
  for(const x of [-.32,0,.32]) b.block('bank-rear-window',[.17,.20,.02],[x,.35,-.418],'#507b79',false,'glass');
}
function exchange(b: Model, p: ArchitecturalPalette) {
  b.block('exchange-main-hall',[.84,.64,.66],[0,.38,-.10],p.wall);
  b.block('exchange-roof-deck',[.95,.06,.75],[0,.73,-.10],p.wallAlt);
  b.block('exchange-stepped-crown',[.50,.28,.46],[0,.90,-.10],p.roof);
  b.block('exchange-crown-cap',[.56,.04,.52],[0,1.06,-.10],p.trim);
  b.post('exchange-mast',.014,1.08,1.30,0,-.10,p.trim);
  b.part('exchange-beacon',new THREE.SphereGeometry(.025,8,6),[0,1.32,-.10],p.glow,true,[0,0,0],'light');
  b.block('exchange-ticker-frame',[.72,.22,.035],[0,.53,.246],p.roof,false);
  b.block('exchange-ticker-screen',[.66,.16,.012],[0,.53,.27],'#365f58',false,'glass');
  for(let i=0;i<6;i++) b.block('exchange-chart-bar',[.05,.035+i*.015,.012],[-.25+i*.10,.49+i*.0075,.283],p.glow,false,'light');
  b.block('exchange-entry',[.28,.30,.02],[0,.21,.24],p.roof,false);
  b.block('exchange-sculpture-plinth',[.26,.09,.22],[.50,.105,.44],p.wallAlt);
  b.post('exchange-arrow-support',.02,.15,.38,.50,.44,p.trim);
  b.part('exchange-market-arrow',prism([[-.08,0],[.08,0],[0,.14]],.025),[.5,.36,.4275],p.trim,true);
}
function newsstand(b: Model, p: ArchitecturalPalette) {
  b.block('newsstand-kiosk',[.78,.35,.50],[0,.235,-.12],p.wall);
  b.part('newsstand-roof',hipRoof(.95,.68,.18),[0,.41,-.12],p.roof,true);
  for(const x of [-.43,.43]) b.post('newsstand-notice-post',.022,.06,.68,x,.34,p.trim);
  b.block('newsstand-notice-frame',[.92,.24,.04],[0,.56,.34],p.roof);
  b.block('newsstand-timetable',[.83,.18,.015],[0,.56,.368],p.wallAlt,false);
  for(let i=0;i<5;i++) b.block('newsstand-paper',[.12,.13,.012],[-.31+i*.155,.56,.382],i%2?p.wall:p.trim,false);
  b.block('newsstand-counter',[.83,.045,.19],[0,.30,.20],p.trim);
  b.post('newsstand-roof-mast',.014,.58,.80,0,-.12,p.trim);
  b.part('newsstand-finial',new THREE.OctahedronGeometry(.10,0),[0,.86,-.12],p.trim,true);
}

export function buildLandmarkModel(tileId: number, level: number, p: ArchitecturalPalette, animated=false): LandmarkModel {
  if(tileId===19)return buildCasinoModel();
  const family = PROPERTY_MODELS[tileId]?.family ?? ({18:'hotel',20:'theatre',23:'factory',24:'energy',26:'warehouse'} as Record<number,string>)[tileId] ?? TILES[tileId].type;
  const b = new Model(animated?DYNAMIC_MODEL_PARTS:undefined);
  base(b,p);
  if(level>=3&&PRESTIGE_MODELS[tileId]) {
    PRESTIGE_MODELS[tileId](b,p);
    return {family,parts:b.parts,batches:b.finish()};
  }
  const builders: Record<string,()=>void> = { hotel:()=>hotel(b,level,p), theatre:()=>theatre(b,level,p), factory:()=>factory(b,level,p), energy:()=>energy(b,level,p), warehouse:()=>warehouse(b,level,p), bank:()=>bank(b,p), exchange:()=>exchange(b,p), event:()=>newsstand(b,p) };
  if(PROPERTY_MODELS[tileId]) PROPERTY_MODELS[tileId].build(b,level,p);
  else {
    if(!builders[family]) throw new Error(`No landmark model for ${tileId}`);
    builders[family]();
    propertyUpgrades(b,tileId,level,p);
  }
  if(level>=3) LUXURY_ADDITIONS[tileId]?.(b,p);
  return {family,parts:b.parts,batches:b.finish()};
}

/** Facility changes supplement the original five models' height progression. */
function propertyUpgrades(b: Model, id: number, l: number, p: ArchitecturalPalette) {
  if(id===18) {
    if(l>=1) {
      b.block('upgrade-1-hotel-entry-extension',[.34,.29,.22],[0,.205,.46],p.wallAlt);
      frontWindows(b,p,[0],[.23],.582,.24);
    }
    if(l>=2) {
      const roof=.84+l*.24;
      for(const x of [.22,.48]) b.post('upgrade-2-hotel-roof-lounge-post',.012,roof,roof+.14,x,-.28,p.trim);
      b.block('hotel-roof-lounge-shade',[.31,.025,.22],[.35,roof+.1525,-.28],p.trim);
    }
    if(l>=3) for(const x of [-.60,.60]) {
      b.block('upgrade-3-hotel-entry-planter',[.12,.11,.23],[x,.115,.42],p.wallAlt);
      b.block('hotel-entry-shrub',[.10,.08,.20],[x,.21,.42],'#66886b');
    }
  }
  if(id===20) {
    if(l>=1) {
      b.block('upgrade-1-theatre-box-office',[.23,.26,.18],[-.51,.19,.39],p.wallAlt);
      b.block('theatre-box-office-window',[.16,.12,.015],[-.51,.25,.489],p.roof,false,'glass');
    }
    if(l>=2) for(const x of [-.40,.40]) {
      b.block('upgrade-2-theatre-side-gallery',[.16,.28,.49],[Math.sign(x)*.60,.20,-.14],p.trim);
      frontWindows(b,p,[Math.sign(x)*.60],[.22],.117,.09);
    }
    if(l>=3) {
      b.block('upgrade-3-theatre-backstage-annex',[.24,.39,.53],[.53,.255,-.15],p.wallAlt);
      b.block('theatre-backstage-roof',[.28,.035,.57],[.53,.4675,-.15],p.roof);
      b.block('theatre-backstage-vent',[.12,.09,.14],[.53,.53,-.15],p.trim);
    }
  }
  if(id===23) {
    if(l>=1) {
      b.block('upgrade-1-factory-loading-bay',[.38,.25,.22],[.30,.185,.46],p.wallAlt);
      b.block('factory-bay-roof',[.44,.035,.26],[.30,.3275,.46],p.roof);
    }
    if(l>=2) {
      b.part('upgrade-2-factory-storage-silo',new THREE.CylinderGeometry(.10,.10,.39,14),[-.60,.255,.12],p.trim,true);
      b.part('factory-silo-cap',new THREE.ConeGeometry(.105,.10,14),[-.60,.50,.12],p.roof,true);
    }
    if(l>=3) {
      b.block('upgrade-3-factory-quality-lab',[.30,.31,.37],[-.45,.215,.34],p.wallAlt);
      b.block('factory-lab-roof',[.34,.035,.41],[-.45,.3875,.34],p.roof);
      frontWindows(b,p,[-.45],[.25],.536,.21);
    }
  }
  if(id===24) {
    if(l>=1) {
      b.block('upgrade-1-energy-transformer',[.22,.18,.19],[.35,.15,.51],p.wallAlt);
      for(const x of [.29,.41]) b.post('energy-transformer-insulator',.016,.24,.30,x,.51,p.trim);
    }
    if(l>=2) {
      // Extra arrays already appear at this level; name their support frame explicitly.
      b.block('upgrade-2-energy-array-foundation',[.71,.035,.28],[-.28,.0775,-.31],p.wallAlt);
    }
    if(l>=3) {
      b.block('upgrade-3-energy-grid-control',[.25,.27,.18],[.38,.195,.02],p.wallAlt);
      b.block('energy-grid-status-screen',[.16,.12,.015],[.38,.24,.119],p.glow,false,'light');
    }
  }
  if(id===26) {
    if(l>=1) for(const x of [-.45,.45]) b.block('upgrade-1-warehouse-stacked-cargo',[.17,.14,.12],[x,.325,.59],'#b89b6e');
    if(l>=2) {
      b.block('upgrade-2-warehouse-dispatch-office',[.28,.28,.27],[-.49,.20,.34],p.wallAlt);
      frontWindows(b,p,[-.49],[.25],.487,.19);
    }
    if(l>=3) {
      const ridge=.68+l*.12;
      b.block('upgrade-3-warehouse-roof-ventilator',[.31,.10,.32],[0,ridge+.025,-.11],p.trim);
      b.block('warehouse-ventilator-cap',[.35,.035,.36],[0,ridge+.0925,-.11],p.roof);
    }
  }
}
