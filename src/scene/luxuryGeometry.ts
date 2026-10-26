import {innerPrestige} from './innerStreetPrestige';
import * as THREE from 'three';
import { Model, hipRoof, prism } from './buildingPrimitives';
import { INNER_SPECS, innerRoofTop } from './propertyGeometry';
import type { ArchitecturalPalette } from './detailGeometry';

/** Lv.3 architectural additions. Each commission keeps its original building family.
 * Small fittings are baked into the existing five material batches. No new lights,
 * textures or per-frame work are needed. Heights also drive labels and scaffolding.
 */
type Commission = (b: Model, p: ArchitecturalPalette) => void;
const green = '#638971', glass = '#638f92', water = '#83c9c7';
const name = (s: string) => `prestige-l3-${s}`;

function band(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number, d: number, tag: string) {
  for (const dz of [-d / 2, d / 2]) {
    b.block(name(`${tag}-cornice`), [w, .028, .028], [x, y, z + dz], p.trim, false, 'metal');
    b.block(name(`${tag}-cove`), [w - .04, .008, .012], [x, y - .020, z + dz], p.glow, false, 'light');
  }
  for (const dx of [-w / 2, w / 2]) b.block(name(`${tag}-side-cornice`), [.028, .028, d], [x + dx, y, z], p.trim, false, 'metal');
}

function garden(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number) {
  b.block(name('garden-trough'), [w, .045, .095], [x, y + .0225, z], p.wallAlt);
  for (let i = 0; i < 3; i++) {
    const px = x + (i - 1) * w * .28;
    b.part(name('garden-topiary'), new THREE.IcosahedronGeometry(.045, 0), [px, y + .075, z], green, false, [0, 0, 0], 'leaf');
    b.part(name('garden-flower'), new THREE.IcosahedronGeometry(.014, 0), [px, y + .108, z + .018], i % 2 ? '#d8ac87' : '#e5d4a1', false, [0, 0, 0], 'leaf');
  }
}

function rail(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number, d: number) {
  for (const dx of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) b.post(name('terrace-post'), .009, y, y + .12, x + dx, z + dz, p.trim);
  for (const dz of [-d / 2, d / 2]) {
    b.block(name('terrace-glass'), [w, .082, .009], [x, y + .06, z + dz], glass, false, 'glass');
    b.block(name('terrace-handrail'), [w + .02, .012, .015], [x, y + .12, z + dz], p.trim, false, 'metal');
  }
  for (const dx of [-w / 2, w / 2]) b.block(name('terrace-side-rail'), [.015, .012, d], [x + dx, y + .12, z], p.trim, false, 'metal');
}

function pavilion(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number, d: number, h: number) {
  b.block(name('pavilion-deck'), [w + .06, .035, d + .06], [x, y + .0175, z], p.wallAlt);
  b.block(name('pavilion-glass'), [w, h, d], [x, y + .035 + h / 2, z], glass, true, 'glass');
  for (const dx of [-w / 2, 0, w / 2]) for (const dz of [-d / 2, d / 2]) b.post(name('pavilion-mullion'), .008, y + .035, y + h + .035, x + dx, z + dz, p.trim);
  b.block(name('pavilion-roof'), [w + .10, .035, d + .10], [x, y + h + .0525, z], p.roof);
  band(b, p, x, y + h + .055, z, w + .10, d + .10, 'pavilion');
}

function lantern(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, r: number, h: number) {
  b.part(name('lantern-base'), new THREE.CylinderGeometry(r * 1.15, r * 1.15, .04, 8), [x, y + .02, z], p.trim, true);
  b.part(name('lantern-glazing'), new THREE.CylinderGeometry(r, r, h, 8), [x, y + .04 + h / 2, z], p.glow, true, [0, 0, 0], 'glass');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.post(name('lantern-rib'), .007, y + .04, y + .04 + h, x + Math.sin(a) * r, z + Math.cos(a) * r, p.trim);
  }
  b.part(name('lantern-roof'), new THREE.ConeGeometry(r * 1.23, .14, 8), [x, y + h + .11, z], p.roof, true);
  b.post(name('lantern-finial'), .009, y + h + .18, y + h + .24, x, z, p.trim);
}

function arch(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, r: number, h: number, tag: string) {
  for (const dx of [-r, r]) {
    b.post(name(`${tag}-column`), .023, y, y + h, x + dx, z, p.wallAlt);
    b.block(name(`${tag}-capital`), [.08, .035, .07], [x + dx, y + h - .0175, z], p.trim);
  }
  b.part(name(`${tag}-arch`), new THREE.TorusGeometry(r, .024, 5, 20, Math.PI), [x, y + h, z], p.trim, true, [0, 0, 0], 'metal');
  b.part(name(`${tag}-arch-light`), new THREE.TorusGeometry(r - .026, .006, 4, 20, Math.PI), [x, y + h, z + .018], p.glow, false, [0, 0, 0], 'light');
}

function facadeFins(b: Model, p: ArchitecturalPalette, xs: number[], bottom: number, top: number, front: number, rear: number) {
  for (const x of xs) for (const z of [front, rear]) {
    b.block(name('facade-pilaster'), [.026, top - bottom, .035], [x, (bottom + top) / 2, z], p.trim, false, 'metal');
    b.block(name('facade-foot'), [.065, .05, .045], [x, bottom + .025, z], p.wallAlt, false);
    b.block(name('facade-capital'), [.065, .035, .045], [x, top - .0175, z], p.trim, false, 'metal');
  }
}

const courtyard: Commission = (b, p) => {
  // Two roof pavilions and a lit ceremonial gateway turn the courtyard into a manor.
  for (const x of [-.39, .39]) {
    b.block(name('courtyard-roof-tower'), [.19, .30, .24], [x, .86, -.30], p.wallAlt);
    lantern(b, p, x, 1.01, -.30, .095, .12);
    for (const z of [-.427, -.173]) b.block(name('courtyard-tower-window'), [.10, .14, .012], [x, .90, z], p.glow, false, 'light');
  }
  for (const x of [-.44, .44]) band(b, p, x, .32, .15, .26, .64, 'courtyard-wing');
  band(b, p, 0, .71, -.30, 1.09, .40, 'courtyard-eaves');
  facadeFins(b, p, [-.51, -.17, .17, .51], .08, .70, -.102, -.50);
  arch(b, p, 0, .06, .54, .22, .40, 'courtyard-gateway');
  for (const x of [-.27, .27]) {
    b.post(name('courtyard-lantern-post'), .012, .06, .31, x, .51, p.trim);
    b.block(name('courtyard-lantern'), [.065, .095, .065], [x, .35, .51], p.glow, true, 'light');
  }
  for (const z of [.02, .12, .22, .32, .42]) b.block(name('courtyard-inlaid-path'), [.18, .006, .035], [0, .076, z], p.wallAlt, false);
};

const apartment: Commission = (b, p) => {
  // A glazed communal penthouse occupies the existing pergola; a lantern crowns the core.
  b.block(name('apartment-penthouse'), [.48, .17, .36], [-.14, 1.445, -.12], glass, true, 'glass');
  b.block(name('apartment-floating-roof'), [.65, .035, .50], [-.14, 1.585, -.12], p.roof);
  band(b, p, -.14, 1.585, -.12, .65, .50, 'apartment-crown');
  lantern(b, p, .39, 1.58, -.16, .10, .13);
  for (const y of [.1135, .3655, .6175, .8695, 1.1215]) for (const x of [-.39, .13]) garden(b, p, x, y, .29, .18);
  facadeFins(b, p, [-.49, .25], .06, 1.32, .227, -.457);
  band(b, p, -.12, 1.34, -.12, .87, .74, 'apartment-roof');
  b.block(name('apartment-lobby-canopy'), [.48, .035, .24], [.36, .36, .28], p.trim);
  for (const x of [.16, .56]) b.post(name('apartment-lobby-post'), .015, .06, .35, x, .36, p.trim);
  b.block(name('apartment-lobby-door'), [.15, .23, .015], [.39, .19, .12], p.glow, false, 'glass');
};

const lakeside: Commission = (b, p) => {
  // An overhanging penthouse roof and glazed roof lounge echo a luxury lake villa.
  b.block(name('lakeside-roof-lounge'), [.69, .17, .28], [-.06, 1.01, -.29], glass, true, 'glass');
  b.block(name('lakeside-floating-canopy'), [1.17, .045, .59], [-.04, 1.16, -.29], p.wallAlt);
  band(b, p, -.04, 1.16, -.29, 1.17, .59, 'lakeside-canopy');
  for (const x of [-.42, .30]) b.post(name('lakeside-roof-frame'), .013, .925, 1.14, x, -.44, p.trim);
  band(b, p, -.06, .90, -.29, 1.10, .51, 'lakeside-terrace');
  facadeFins(b, p, [-.52, .43], .07, .88, -.055, -.522);
  for (const x of [-.28, .11, .47]) b.block(name('lakeside-window-reveal'), [.018, .70, .020], [x, .49, -.047], p.trim, false, 'metal');
  b.block(name('lakeside-infinity-edge'), [.65, .008, .015], [.22, .082, .238], p.glow, false, 'light');
  for (const x of [-.22, .12, .46]) b.block(name('lakeside-deck-inlay'), [.01, .006, .26], [x, .103, .40], p.wallAlt, false);
  rail(b, p, -.02, .10, .40, 1.08, .25);
};

const villa: Commission = (b, p) => {
  b.part(name('villa-octagonal-turret'), new THREE.CylinderGeometry(.19, .19, .89, 8), [.38, .785, -.08], p.wallAlt, true);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    for (const y of [.66, .97]) b.part(name('villa-turret-window'), new THREE.BoxGeometry(.075, .16, .012), [.38 + Math.sin(a) * .179, y, -.08 + Math.cos(a) * .179], p.glow, false, [0, a, 0], 'glass');
  }
  b.part(name('villa-turret-eaves'), new THREE.CylinderGeometry(.22, .22, .035, 8), [.38, 1.2475, -.08], p.trim, true);
  b.part(name('villa-turret-cap'), new THREE.ConeGeometry(.235, .30, 8), [.38, 1.415, -.08], p.roof, true);
  b.post(name('villa-turret-finial'), .01, 1.565, 1.64, .38, -.08, p.trim);
  for (const x of [-.60, .26]) b.rod([x, .81, .27], [-.17, 1.13, .27], .009, p.trim);
  facadeFins(b, p, [-.53, .19], .06, .81, .235, -.473);
  band(b, p, -.17, .81, -.12, .80, .71, 'villa-eaves');
  arch(b, p, -.17, .06, .53, .24, .29, 'villa-porch');
  for (const x of [-.48, .11]) garden(b, p, x, .06, .40, .13);
};

const shops: Commission = (b, p) => {
  // Glazed shopping arcade with a miniature copper bell tower.
  lantern(b, p, -.46, 1.12, -.29, .105, .19);
  b.block(name('shops-roof-galleria'), [.72, .22, .42], [.17, .86, -.10], glass, true, 'glass');
  b.part(name('shops-galleria-hip'), hipRoof(.79, .48, .17), [.17, .97, -.10], p.roof, true);
  for (const x of [-.15, .01, .17, .33, .49]) b.post(name('shops-galleria-frame'), .009, .75, .97, x, .114, p.trim);
  band(b, p, .17, .97, -.10, .79, .48, 'shops-galleria');
  for (const x of [-.43, 0, .43]) {
    arch(b, p, x, .06, .46, .18, .35, 'shops-arcade');
    b.block(name('shops-jewel-sign'), [.25, .045, .018], [x, .35, .261], p.glow, false, 'light');
  }
  facadeFins(b, p, [-.62, -.21, .21, .62], .07, .67, .224, -.425);
  band(b, p, 0, .68, -.10, 1.27, .66, 'shops-entablature');
};

const workshop: Commission = (b, p) => {
  // Folded north-light roof fins distinguish the atelier from the mansions.
  for (const x of [.16, .34, .52]) {
    b.part(name('atelier-folded-roof'), prism([[-.08, 0], [.08, 0], [.045, .28]], .62), [x, .87, -.54], p.trim, true);
    b.part(name('atelier-northlight'), prism([[-.055, .015], [.055, .015], [.035, .23]], .012), [x, .89, .085], glass, false, [0, 0, 0], 'glass');
  }
  pavilion(b, p, -.33, .715, -.18, .36, .35, .19);
  band(b, p, .34, .81, -.23, .51, .64, 'atelier-eaves');
  facadeFins(b, p, [.115, .565], .06, .80, .083, -.541);
  b.part(name('atelier-sculpture-orbit'), new THREE.TorusGeometry(.125, .012, 5, 24), [.13, .27, .35], p.trim, true, [0, .6, .4], 'metal');
  b.part(name('atelier-sculpture-jewel'), new THREE.OctahedronGeometry(.055), [.13, .27, .35], p.glow, false, [0, .3, 0], 'glass');
  for (const x of [-.49, -.33, -.17]) b.block(name('atelier-gallery-light'), [.07, .012, .016], [x, .345, .324], p.glow, false, 'light');
};

const rotunda: Commission = (b, p) => {
  // Follow the existing oblate dome exactly, including the hidden rear hemisphere.
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 10; j++) {
      const t = j * Math.PI / 20;
      points.push(new THREE.Vector3(Math.cos(a) * .515 * Math.cos(t), .73 + .235 * Math.sin(t), -.12 + Math.sin(a) * .515 * Math.cos(t)));
    }
    b.part(name('rotunda-dome-rib'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, .008, 4, false), [0, 0, 0], p.trim, false, [0, 0, 0], 'metal');
  }
  b.part(name('rotunda-crown-drum'), new THREE.CylinderGeometry(.14, .17, .16, 16), [0, .98, -.12], p.wallAlt, true);
  lantern(b, p, 0, 1.06, -.12, .12, .16);
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5, x = Math.sin(a) * .48, z = -.12 + Math.cos(a) * .48;
    b.post(name('rotunda-pilaster'), .016, .06, .73, x, z, p.trim);
  }
  b.part(name('rotunda-eaves-light'), new THREE.TorusGeometry(.49, .009, 4, 40), [0, .73, -.12], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  arch(b, p, 0, .395, .44, .30, .14, 'rotunda-portico');
};

const office: Commission = (b, p) => {
  b.block(name('office-sky-club-platform'), [.85, .04, .73], [.08, 1.54, -.10], p.wallAlt);
  pavilion(b, p, .08, 1.56, -.10, .55, .44, .25);
  rail(b, p, .08, 1.56, -.10, .80, .68);
  for (const x of [-.23, .39]) garden(b, p, x, 1.56, .12, .13);
  facadeFins(b, p, [-.29, .45], .06, 1.52, .255, -.448);
  for (const y of [.36, .65, .94, 1.23]) band(b, p, .08, y, -.10, .80, .68, 'office-belt');
  b.block(name('office-core-light'), [.055, 1.31, .012], [-.43, .78, .269], p.glow, false, 'light');
  b.block(name('office-crown-blade'), [.055, .35, .47], [-.43, 1.825, -.10], p.trim);
  b.block(name('office-crown-tip'), [.075, .018, .49], [-.43, 2.009, -.10], p.glow, true, 'light');
  b.block(name('office-entry-light'), [.61, .012, .015], [.02, .305, .548], p.glow, false, 'light');
};

const cinema: Commission = (b, p) => {
  // A stepped sunburst crest and red-carpet arrival announce a premiere palace.
  for (let i = -3; i <= 3; i++) {
    const h = .32 - Math.abs(i) * .065;
    b.block(name('cinema-sunburst-fin'), [.068, h, .075], [i * .095, 1 + h / 2, -.10], p.trim);
    b.block(name('cinema-sunburst-light'), [.022, h - .025, .012], [i * .095, 1 + h / 2, -.055], p.glow, false, 'light');
  }
  for (const x of [-.51, .51]) {
    lantern(b, p, x, 1.07, -.10, .078, .15);
    for (const dx of [-.063, .063]) b.block(name('cinema-tower-fluting'), [.012, .87, .02], [x + dx, .55, .312], p.trim, false, 'metal');
  }
  band(b, p, 0, .79, -.14, .95, .73, 'cinema-cornice');
  b.block(name('cinema-red-carpet'), [.36, .008, .38], [0, .066, .43], '#884b59', false);
  for (const x of [-.21, .21]) for (const z of [.35, .59]) {
    b.post(name('cinema-velvet-post'), .012, .06, .19, x, z, p.trim);
    b.part(name('cinema-post-cap'), new THREE.SphereGeometry(.018, 8, 6), [x, .19, z], p.trim, true);
  }
  for (const x of [-.21, .21]) b.rod([x, .17, .35], [x, .17, .59], .01, '#884b59');
  for (const x of [-.30, .30]) b.block(name('cinema-poster-glass'), [.145, .18, .012], [x, .21, .254], '#b78075', false, 'glass');
};

const theatre: Commission = (b, p) => {
  for (const z of [-.36, -.13, .10, .35]) b.part(name('theatre-vault-rib'), new THREE.TorusGeometry(.577, .012, 5, 28, Math.PI), [0, .78, z], p.trim, false, [0, 0, 0], 'metal');
  b.part(name('theatre-rose-frame'), new THREE.TorusGeometry(.18, .017, 5, 24), [0, 1.02, .357], p.trim, false, [0, 0, 0], 'metal');
  b.part(name('theatre-rose-glass'), new THREE.CircleGeometry(.16, 24), [0, 1.02, .362], glass, false, [0, 0, 0], 'glass');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.rod([0, 1.02, .374], [Math.sin(a) * .17, 1.02 + Math.cos(a) * .17, .374], .005, p.glow, 'light');
  }
  for (const x of [-.49, .49]) {
    b.block(name('theatre-front-pier'), [.095, .84, .10], [x, .66, .34], p.wallAlt);
    lantern(b, p, x, 1.08, .34, .066, .12);
  }
  facadeFins(b, p, [-.30, .30], .08, 1.38, -.278, -.579);
  for (const y of [.58, .81, 1.04, 1.27]) b.block(name('theatre-flytower-rear-band'), [.68, .022, .016], [0, y, -.58], p.trim, false, 'metal');
  b.block(name('theatre-arrival-carpet'), [.46, .008, .21], [0, .067, .53], '#854954', false);
  band(b, p, 0, .51, .43, 1.18, .30, 'theatre-marquee');
};

const resort: Commission = (b, p) => {
  // An elevated infinity pool above the main bungalow, held by four stone piers.
  for (const x of [-.46, .46]) for (const z of [-.47, -.17]) b.post(name('resort-sky-pool-pier'), .024, .55, .85, x, z, p.wallAlt);
  b.block(name('resort-sky-pool-deck'), [1.06, .06, .43], [0, .85, -.32], p.wallAlt);
  b.block(name('resort-sky-pool-water'), [.65, .014, .29], [.08, .89, -.32], water, false, 'glass');
  b.block(name('resort-infinity-lip'), [.65, .018, .014], [.08, .88, -.165], p.glow, false, 'light');
  rail(b, p, 0, .88, -.32, 1.00, .40);
  for (const x of [-.46, .46]) garden(b, p, x, .88, -.32, .12);
  pavilion(b, p, -.48, .46, .01, .25, .29, .22);
  for (const x of [-.59, .59]) {
    const z = .30;
    b.post(name('resort-palm-trunk'), .015, .06, .70, x, z, '#8a7556');
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      b.part(name('resort-palm-frond'), new THREE.SphereGeometry(.09, 8, 4), [x + Math.sin(a) * .045, .70, z + Math.cos(a) * .045], green, false, [0, a, 0], 'leaf');
    }
  }
  for (const z of [.04, .46]) b.block(name('resort-pool-edge-light'), [.49, .008, .012], [.22, .103, z], p.glow, false, 'light');
};

const factory: Commission = (b, p) => {
  pavilion(b, p, -.45, .405, .34, .25, .30, .62);
  for (const y of [.58, .78, .98]) band(b, p, -.45, y, .34, .26, .31, 'factory-lab');
  for (let i = 0; i < 3; i++) for (const z of [-.38, .38]) {
    const x = -.57 + i * .38;
    b.rod([x, .89, z], [x + .32, 1.12, z], .009, p.trim);
    b.rod([x + .32, 1.12, z], [x + .38, .89, z], .009, p.trim);
    b.part(name('factory-northlight-pane'), prism([[.035, .02], [.30, .20], [.30, .02]], .012), [x, .89, z], glass, false, [0, 0, 0], 'glass');
  }
  for (const x of [-.49, -.28]) for (const y of [1.13, 1.31, 1.48]) b.part(name('factory-stack-band'), new THREE.TorusGeometry(.067, .009, 4, 16), [x, y, -.49], p.trim, false, [Math.PI / 2, 0, 0], 'metal');
  for (const y of [.42, .66, .85]) band(b, p, 0, y, 0, 1.13, .73, 'factory-production');
  for (const x of [.08, .40]) b.post(name('factory-bay-light-post'), .012, .06, .43, x, .58, p.trim);
  b.block(name('factory-bay-signal'), [.37, .025, .035], [.24, .43, .58], p.glow, true, 'light');
};

const energy: Commission = (b, p) => {
  // A crystal grid-control crown leaves the turbine's complete swept volume free.
  b.part(name('energy-grid-drum'), new THREE.CylinderGeometry(.19, .21, .41, 12), [.38, .825, -.28], glass, true, [0, 0, 0], 'glass');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.post(name('energy-grid-fin'), .009, .625, 1.03, .38 + Math.sin(a) * .195, -.28 + Math.cos(a) * .195, p.trim);
  }
  b.part(name('energy-solar-disc'), new THREE.CylinderGeometry(.25, .25, .035, 24), [.38, 1.0475, -.28], p.roof, true);
  b.part(name('energy-disc-light'), new THREE.TorusGeometry(.24, .008, 4, 28), [.38, 1.068, -.28], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  b.part(name('energy-crystal'), new THREE.OctahedronGeometry(.13), [.38, 1.19, -.28], p.accent, true, [0, 0, 0], 'glass');
  for (const x of [-.46, -.10]) for (const z of [-.31, .02, .36]) {
    for (const dx of [-.14, .14]) b.part(name('energy-panel-edge'), new THREE.BoxGeometry(.009, .012, .25), [x + dx, .248, z], p.trim, false, [-.30, 0, 0], 'metal');
    for (const dz of [-.08, 0, .08]) b.part(name('energy-panel-cell'), new THREE.BoxGeometry(.27, .005, .005), [x, .25 + .2955 * dz, z + .9553 * dz], p.accent, false, [-.30, 0, 0], 'glass');
  }
  for (const x of [.24, .47]) {
    b.block(name('energy-battery-trim'), [.185, .02, .27], [x, .39, .29], p.trim);
    for (const y of [.12, .17, .22]) b.block(name('energy-battery-cell-light'), [.09, .009, .013], [x, y, .423], p.glow, false, 'light');
  }
  band(b, p, .38, .60, -.28, .47, .48, 'energy-control');
};

const warehouse: Commission = (b, p) => {
  // A glazed dispatch tower and illuminated freight gantry retain the broad shed.
  pavilion(b, p, -.49, .34, .34, .26, .26, .83);
  for (const y of [.55, .78, 1.01]) band(b, p, -.49, y, .34, .27, .27, 'warehouse-dispatch');
  for (const x of [-.60, .60]) {
    b.post(name('warehouse-gantry-leg'), .024, .14, .72, x, .53, p.trim);
    b.block(name('warehouse-gantry-foot'), [.10, .06, .10], [x, .17, .53], p.wallAlt);
  }
  b.block(name('warehouse-gantry-crossbeam'), [1.25, .08, .10], [0, .75, .53], p.trim);
  b.block(name('warehouse-gantry-light'), [1.12, .012, .018], [0, .715, .586], p.glow, false, 'light');
  for (const z of [-.56, -.29, -.02, .25]) {
    b.rod([-.66, .79, z], [0, 1.04, z], .01, p.trim);
    b.rod([0, 1.04, z], [.66, .79, z], .01, p.trim);
  }
  for (const x of [-.41, 0, .41]) for (const dx of [-.14, .14]) b.block(name('warehouse-dock-bumper'), [.025, .18, .04], [x + dx, .23, .389], '#3d5352', false);
  for (const x of [-.43, .43]) for (const y of [.56, .64]) b.block(name('warehouse-rear-louvre'), [.28, .025, .015], [x, y, -.547], p.trim, false, 'metal');
};

const campus: Commission = (b, p) => {
  b.part(name('campus-observatory-drum'), new THREE.CylinderGeometry(.18, .18, .28, 20), [.39, 1.09, -.21], glass, true, [0, 0, 0], 'glass');
  const dome = new THREE.SphereGeometry(.21, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  b.part(name('campus-observatory-crown'), dome, [.39, 1.23, -.21], p.trim, true, [0, 0, 0], 'metal');
  b.part(name('campus-observatory-ring'), new THREE.TorusGeometry(.213, .009, 5, 28), [.39, 1.23, -.21], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  b.block(name('campus-telescope-slit'), [.035, .08, .19], [.39, 1.42, -.21], p.roof, false);
  for (const x of [-.39, .39]) {
    band(b, p, x, .92, -.10, .42, .93, 'campus-lab');
    facadeFins(b, p, [x - .17, x + .17], .06, .91, .357, -.557);
  }
  for (const z of [-.51, -.19, .13]) {
    b.rod([-.22, .91, z], [0, 1.14, z], .009, p.trim);
    b.rod([0, 1.14, z], [.22, .91, z], .009, p.trim);
  }
  arch(b, p, 0, .06, .38, .20, .40, 'campus-atrium-entry');
  b.block(name('campus-bridge-light'), [.42, .012, .018], [0, .39, .299], p.glow, false, 'light');
  for (const x of [-.39, .39]) garden(b, p, x, .06, .51, .30);
};

const headquarters: Commission = (b, p) => {
  for (const y of [.59, .91, 1.23, 1.55]) {
    b.part(name('headquarters-crown-band'), new THREE.TorusGeometry(.319, .012, 5, 32), [.24, y, -.10], p.trim, false, [Math.PI / 2, 0, 0], 'metal');
    b.part(name('headquarters-crown-light'), new THREE.TorusGeometry(.316, .005, 4, 32), [.24, y - .022, -.10], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  }
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    b.post(name('headquarters-radial-fin'), .008, .54, 1.51, .24 + Math.sin(a) * .316, -.10 + Math.cos(a) * .316, p.trim);
  }
  pavilion(b, p, -.36, 1.322, -.20, .29, .25, .25);
  lantern(b, p, -.36, 1.642, -.20, .07, .10);
  band(b, p, 0, .54, -.04, 1.18, .92, 'headquarters-podium');
  for (const x of [-.44, -.22, 0, .22, .44]) b.block(name('headquarters-arcade-glass'), [.14, .16, .014], [x, .40, .424], glass, false, 'glass');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.part(name('headquarters-helipad-light'), new THREE.SphereGeometry(.012, 6, 4), [.24 + Math.sin(a) * .265, 1.604, -.10 + Math.cos(a) * .265], p.glow, false, [0, 0, 0], 'light');
  }
};

const exhibition: Commission = (b, p) => {
  for (const x of [-.30, .30]) {
    for (const dx of [-.31, .31]) for (const dz of [-.425, .425]) b.rod([x + dx, .465, -.13 + dz], [x, .885, -.13], .01, p.trim);
    for (const dx of [-.16, 0, .16]) b.rod([x + dx, .465, .301], [x, .885, -.13], .006, p.glow, 'light');
    band(b, p, x, .465, -.13, .62, .85, 'exhibition-skylight');
  }
  // Monumental sculpted portal, anchored in the entrance forecourt.
  arch(b, p, 0, .06, .48, .37, .83, 'exhibition-grand-portal');
  for (const x of [-.37, .37]) b.block(name('exhibition-portal-foot'), [.13, .07, .15], [x, .095, .48], p.wallAlt);
  for (const x of [-.55, .55]) {
    b.block(name('exhibition-banner-post'), [.022, .57, .025], [x, .345, .43], p.trim);
    b.block(name('exhibition-banner'), [.10, .29, .016], [x - .035, .46, .43], p.accent, false);
  }
  band(b, p, 0, .31, .43, 1.20, .28, 'exhibition-arrival');
  for (const x of [-.44, -.15, .15, .44]) b.block(name('exhibition-rear-art-panel'), [.20, .19, .012], [x, .28, -.536], glass, false, 'glass');
};

const COMMISSIONS: Record<number, Commission> = {
  1: courtyard, 3: apartment, 5: lakeside, 7: villa, 8: shops, 10: workshop,
  12: rotunda, 13: office, 17: cinema, 20: theatre, 21: resort, 23: factory,
  24: energy, 26: warehouse, 28: campus, 34: headquarters, 35: exhibition,
  36: innerPrestige(36), 37: innerPrestige(37), 38: innerPrestige(38),
  39: innerPrestige(39), 40: innerPrestige(40), 41: innerPrestige(41),
};

/** Recessed glazing and metal reveals for the formerly plain side/rear elevations. */
function window(b: Model, p: ArchitecturalPalette, x: number, y: number, z: number, w: number, h: number, yaw = 0, lit = false) {
  const point = (dx: number, dy: number, dz: number): [number, number, number] =>
    [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y + dy, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];
  b.part(name('facade-inset-frame'), new THREE.BoxGeometry(w + .035, h + .035, .018), point(0, 0, 0), p.trim, false, [0, yaw, 0], 'metal');
  b.part(name('facade-inset-glass'), new THREE.BoxGeometry(w, h, .012), point(0, 0, .013), lit ? p.glow : glass, false, [0, yaw, 0], lit ? 'light' : 'glass');
  b.part(name('facade-inset-mullion'), new THREE.BoxGeometry(.009, h, .015), point(0, 0, .022), p.wallAlt, false, [0, yaw, 0]);
  b.part(name('facade-inset-sill'), new THREE.BoxGeometry(w + .055, .018, .045), point(0, -h / 2 - .025, .005), p.wallAlt, false, [0, yaw, 0]);
}

function envelope(b: Model, p: ArchitecturalPalette, id: number) {
  const side = (x: number, zs: number[], ys: number[], w = .13, h = .10) => {
    for (const z of zs) for (const y of ys) window(b, p, x, y, z, w, h, Math.sign(x) * Math.PI / 2, true);
  };
  const rear = (xs: number[], ys: number[], z: number, w = .16, h = .10) => {
    for (const x of xs) for (const y of ys) window(b, p, x, y, z, w, h, Math.PI);
  };
  switch (id) {
    case 1:
      for (const s of [-1, 1]) { side(s * .54, [-.30], [.26, .49], .22); side(s * .56, [.05, .28], [.20], .12, .09); }
      break;
    case 3:
      side(.513, [-.26, -.06], [.31, .56, .81, 1.06, 1.31], .10, .12);
      rear([.39], [.32, .61, .90, 1.19], -.415, .10, .15);
      break;
    case 5:
      side(-.576, [.12], [.28], .23, .18);
      for (const x of [-.30, .18]) window(b, p, x, 1.01, -.435, .18, .10, Math.PI);
      break;
    case 7:
      for (const y of [.40, .81, 1.23]) b.part(name('villa-tower-belt'), new THREE.TorusGeometry(.187, .008, 4, 8), [.38, y, -.08], p.trim, false, [Math.PI / 2, 0, 0], 'metal');
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        b.rod([.38 + Math.sin(a) * .235, 1.265, -.08 + Math.cos(a) * .235], [.38, 1.565, -.08], .005, p.trim);
      }
      break;
    case 8:
      for (const s of [-1, 1]) side(s * .628, [-.28, .08], [.29, .53], .16, .11);
      for (const x of [-.43, 0, .43]) window(b, p, x, .56, .225, .22, .105);
      rear([-.46], [.91], -.421, .105, .15);
      break;
    case 10:
      side(-.574, [-.30, -.06], [.28, .49], .13, .12);
      for (const x of [.16, .34, .52]) for (const z of [-.545, .085]) {
        b.rod([x - .08, .87, z], [x + .045, 1.15, z], .006, p.wallAlt);
        b.rod([x + .045, 1.15, z], [x + .08, .87, z], .006, p.trim);
      }
      break;
    case 12:
      for (const s of [-1, 1]) side(s * .654, [.08], [.18], .13, .12);
      break;
    case 13:
      side(-.544, [-.32, -.10, .12], [.34, .64, .94, 1.24, 1.49], .09, .12);
      rear([-.43], [.33, .64, .95, 1.26], -.464, .10, .17);
      for (const x of [-.22, -.02, .18, .38]) b.block(name('office-rear-mullion'), [.012, 1.46, .018], [x, .79, -.452], p.trim, false, 'metal');
      break;
    case 17:
      for (const s of [-1, 1]) for (const z of [-.34, -.10, .14]) {
        b.block(name('cinema-side-inset'), [.015, .66, .12], [s * .599, .53, z], p.roof, false, 'metal');
        b.block(name('cinema-side-gold-reveal'), [.020, .60, .018], [s * .611, .53, z], p.trim, false, 'metal');
        b.block(name('cinema-side-light'), [.022, .018, .09], [s * .613, .81, z], p.glow, false, 'light');
      }
      rear([-.29, 0, .29], [.61], -.508, .17, .16);
      band(b, p, 0, .48, -.14, .96, .75, 'cinema-lower-belt');
      break;
    case 20:
      for (const s of [-1, 1]) side(s * .575, [-.25, -.04, .17], [.58], .11, .18);
      rear([-.18, .18], [.69, .93, 1.17], -.578, .13, .12);
      for (const x of [-.28, .28]) window(b, p, x, .65, .353, .13, .13, 0, true);
      break;
    case 21:
      for (const s of [-1, 1]) side(s * .545, [-.32], [.30], .20, .19);
      for (const x of [-.33, .33]) b.block(name('resort-rear-shutter'), [.035, .29, .022], [x, .28, -.526], p.trim, false, 'metal');
      break;
    case 23:
      for (const s of [-1, 1]) side(s * .565, [-.19, .09], [.31, .58, .78], .17, .10);
      rear([-.36, 0, .36], [.31, .57, .77], -.367, .23, .10);
      break;
    case 24:
      side(.614, [-.28], [.29, .47], .25, .10);
      rear([.38], [.28, .46], -.519, .27, .10);
      break;
    case 26:
      for (const s of [-1, 1]) side(s * .625, [-.35, -.02], [.39, .65], .22, .12);
      rear([-.42, 0, .42], [.40], -.545, .27, .12);
      facadeFins(b, p, [-.61, -.21, .21, .61], .07, .78, .326, -.551);
      band(b, p, 0, .78, -.11, 1.25, .87, 'warehouse-eaves');
      break;
    case 28:
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        b.post(name('campus-observatory-mullion'), .005, .96, 1.23, .39 + Math.sin(a) * .181, -.21 + Math.cos(a) * .181, p.trim);
      }
      break;
    case 34:
      side(-.574, [-.27, -.04, .17], [.77, 1.02], .12, .12);
      for (const s of [-1, 1]) side(s * .589, [-.30, .03, .30], [.30], .21, .19);
      rear([-.42, -.14, .14, .42], [.30], -.501, .19, .19);
      break;
    case 35:
      for (const s of [-1, 1]) side(s * .595, [-.35, -.08, .16], [.25], .16, .15);
      break;
  }
}

export const LUXURY_ADDITIONS: Record<number, Commission> = Object.fromEntries(
  Object.entries(COMMISSIONS).map(([id, build]) => [id, (b: Model, p: ArchitecturalPalette) => {
    build(b, p);
    envelope(b, p, Number(id));
  }]),
);

export const LUXURY_HEIGHTS: Record<number, number> = {
  1: 1.37, 3: 1.95, 5: 1.188, 7: 1.64, 8: 1.55, 10: 1.15,
  12: 1.46, 13: 2.018, 17: 1.46, 20: 1.44, 21: 1.00, 23: 1.545,
  24: 1.835, 26: 1.24, 28: 1.46, 34: 1.982, 35: 1.284,
  36: innerRoofTop(INNER_SPECS[36], 3) + .11, 37: innerRoofTop(INNER_SPECS[37], 3) + .11,
  38: innerRoofTop(INNER_SPECS[38], 3) + .11, 39: innerRoofTop(INNER_SPECS[39], 3) + .11,
  40: innerRoofTop(INNER_SPECS[40], 3) + .11, 41: innerRoofTop(INNER_SPECS[41], 3) + .11,
};
