import * as THREE from 'three';
import { Model } from './buildingPrimitives';
import type { ArchitecturalPalette, V3 } from './detailGeometry';

const BLUE = '#497f90', BLUE_PALE = '#80adb6', DARK = '#355c69';
const LIGHT = '#ffe1af', WATER = '#74bdc3', LEAF = '#5b8876';
const tag = (s: string) => `prestige-l3-hotel-${s}`;
const mix = (a: string, c: string, t: number) => `#${new THREE.Color(a).lerp(new THREE.Color(c), t).getHexString()}`;

/** A planar rounded rectangle, reused for slabs and hollow balcony balustrades. */
function rounded(w: number, d: number, r: number) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r);
  s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z);
  s.lineTo(-x + r, z); s.quadraticCurveTo(-x, z, -x, z - r);
  s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  s.closePath(); return s;
}
function slab(b: Model, label: string, w: number, d: number, h: number, r: number, pos: V3, color: string, finish: 'stone' | 'metal' | 'glass' = 'stone') {
  const g = new THREE.ExtrudeGeometry(rounded(w, d, r), {depth: h, bevelEnabled: false, curveSegments: 5});
  g.rotateX(-Math.PI / 2);
  b.part(label, g, pos, color, true, [0, 0, 0], finish);
}
function balconyRail(b: Model, w: number, d: number, y: number, z: number, gold: string) {
  const shape = rounded(w, d, .07), hole = rounded(w - .022, d - .022, .059);
  shape.holes.push(new THREE.Path(hole.getPoints(5)));
  const g = new THREE.ExtrudeGeometry(shape, {depth: .09, bevelEnabled: false, curveSegments: 5});
  g.rotateX(-Math.PI / 2);
  b.part(tag('curved-balcony-glass'), g, [0, y, z], BLUE_PALE, true, [0, 0, 0], 'glass');
  const points = shape.getPoints(5).map(v => new THREE.Vector3(v.x, y + .095, z - v.y));
  b.part(tag('curved-balcony-handrail'), new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, true), 48, .006, 4, true), [0, 0, 0], gold, false, [0, 0, 0], 'metal');
}

const SAIL_CURVES: [number, number][][] = [
  [[.38, .02], [.36, .55], [.28, 1.05]],
  [[.28, 1.05], [.20, 1.52], [.08, 1.73]],
];
function edgeX(y: number) {
  for (const [a, c, e] of SAIL_CURVES) {
    if (y < a[1] || y > e[1]) continue;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2, py = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * e[1];
      if (py < y) lo = t; else hi = t;
    }
    const t = (lo + hi) / 2;
    return (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * e[0];
  }
  return .08;
}

/** Continuous outline, including the curved roof: every rim stays on the sail. */
function sailRim(z: number) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const v = (x: number, y: number) => new THREE.Vector3(x, y + .31, z);
  path.add(new THREE.LineCurve3(v(-.30, 0), v(.38, .02)));
  for (const [a, c, e] of SAIL_CURVES) path.add(new THREE.QuadraticBezierCurve3(v(...a), v(...c), v(...e)));
  path.add(new THREE.QuadraticBezierCurve3(v(.08, 1.73), v(-.04, 1.82), v(-.30, 1.80)));
  path.add(new THREE.LineCurve3(v(-.30, 1.80), v(-.30, 0)));
  return new THREE.TubeGeometry(path, 100, .014, 6, true);
}

export function buildBayHotel(b: Model, p: ArchitecturalPalette) {
  const gold = mix(p.trim, '#dfc391', .78), stone = mix(p.wall, '#f4ecd9', .45), shadow = mix(p.wallAlt, '#b9c3b9', .35);

  // Travertine podium with a floating rounded porte-cochere and a stepped arrival.
  slab(b, tag('arrival-plinth'), 1.23, .96, .035, .13, [0, .06, .02], stone);
  slab(b, tag('rounded-podium'), 1.12, .86, .22, .10, [0, .095, .02], shadow);
  slab(b, tag('podium-terrace'), 1.18, .91, .03, .12, [0, .315, .02], stone);
  for (let i = 0; i < 3; i++) b.block(tag('arrival-step'), [.56 - i * .045, .025, .20 - i * .045], [0, .0725 + i * .025, .54 - i * .025], stone);
  for (const x of [-.44, .44]) b.post(tag('canopy-column'), .015, .095, .43, x, .47, gold);
  slab(b, 'upgrade-1-hotel-sail-arrival', 1.04, .27, .025, .09, [0, .43, .41], stone);
  b.block(tag('canopy-light'), [.82, .008, .012], [0, .429, .537], LIGHT, false, 'light');
  b.block(tag('lobby-frame'), [.62, .24, .025], [0, .22, .452], gold, false, 'metal');
  b.block(tag('lobby-glass'), [.56, .205, .014], [0, .22, .469], DARK, false, 'glass');
  for (const x of [-.19, .19]) b.block(tag('lobby-warm-panel'), [.095, .18, .010], [x, .22, .480], LIGHT, false, 'light');
  for (const x of [-.10, 0, .10]) b.block(tag('lobby-door-mullion'), [.008, .205, .014], [x, .22, .483], gold, false, 'metal');
  for (const x of [-.035, .035]) b.block(tag('door-handle'), [.006, .06, .012], [x, .215, .494], gold, false, 'metal');
  for (const x of [-.44, .44]) {
    b.block(tag('lobby-side-glass'), [.17, .15, .014], [x, .215, .447], BLUE, false, 'glass');
    b.block(tag('lobby-sconce'), [.018, .075, .018], [x, .25, .462], LIGHT, false, 'light');
  }
  for (const s of [-1, 1]) for (const z of [-.23, -.02, .19]) {
    b.block(tag('podium-side-glass'), [.012, .13, .14], [s * .565, .215, z], BLUE, false, 'glass');
    b.block(tag('podium-side-pier'), [.018, .20, .014], [s * .576, .215, z - .08], gold, false, 'metal');
  }

  // Two shallow reflecting pools and slender radial palm fronds on the terrace.
  for (const x of [-.45, .45]) {
    slab(b, tag('water-basin'), .21, .18, .022, .045, [x, .345, .25], gold, 'metal');
    slab(b, tag('water-surface'), .18, .15, .006, .035, [x, .367, .25], WATER, 'glass');
    b.block(tag('water-edge-light'), [.14, .005, .008], [x, .375, .322], '#a9e1dc', false, 'light');
    slab(b, tag('palm-pot'), .13, .13, .06, .035, [x, .345, .04], stone);
    b.post(tag('palm-trunk'), .010, .405, .65, x, .04, '#82765d');
    for (let j = 0; j < 7; j++) {
      const a = j * Math.PI * 2 / 7;
      const leaf = new THREE.SphereGeometry(1, 8, 4); leaf.scale(.026, .009, .10);
      b.part(tag('palm-frond'), leaf, [x + Math.sin(a) * .055, .645, .04 + Math.cos(a) * .055], LEAF, false, [.22, a, 0], 'leaf');
    }
  }

  const sail = new THREE.Shape();
  sail.moveTo(-.30, 0); sail.lineTo(.38, .02);
  sail.quadraticCurveTo(.36, .55, .28, 1.05);
  sail.quadraticCurveTo(.20, 1.52, .08, 1.73);
  sail.quadraticCurveTo(-.04, 1.82, -.30, 1.80); sail.closePath();
  const shell = new THREE.ExtrudeGeometry(sail, {depth: .46, bevelEnabled: false, curveSegments: 24});
  shell.translate(0, 0, -.23);
  b.part('hotel-guest-wing', shell, [0, .31, .02], BLUE, true, [0, 0, 0], 'glass');
  for (const z of [-.219, .259]) b.part(tag('continuous-sail-rim'), sailRim(z), [0, 0, 0], stone, false);

  // Separate hotel rooms, clipped to BOTH ends of each curved storey. Avoid the
  // old full-height luminous strips protruding beyond the tapered sail profile.
  for (let row = 0; row < 12; row++) {
    const bottom = .055 + row * .14, top = bottom + .098;
    const right = Math.min(edgeX(bottom), edgeX(top)) - .028, y = .31 + bottom + .049;
    for (let col = 0; col < 5; col++) {
      const x = -.24 + col * .125, w = Math.min(.085, (right - x) * 2);
      if (w < .035) continue;
      for (const face of [-1, 1]) {
        const lit = (row * 5 + col * 3 + (face > 0 ? 0 : 2)) % 7 < 2;
        b.block(tag('guestroom-pane'), [w, .087, .008], [x, y, face > 0 ? .255 : -.215], lit ? LIGHT : ((row + col) % 3 ? BLUE_PALE : DARK), false, lit ? 'light' : 'glass');
        b.block(tag('guestroom-mullion'), [.006, .098, .010], [x - w / 2 - .009, y, face > 0 ? .261 : -.221], gold, false, 'metal');
      }
    }
    const edge = edgeX(bottom), width = edge + .30, centre = (edge - .30) / 2;
    for (const z of [-.225, .265]) b.block(tag('slender-floor-band'), [width, .009, .016], [centre, .31 + bottom - .014, z], gold, false, 'metal');
    // Curved sidewall glazing follows the sail, rather than crossing its edge.
    for (const z of [-.13, .02, .17]) {
      const x0 = edgeX(bottom) + .004, x1 = edgeX(top) + .004, y0 = .31 + bottom, y1 = .31 + top;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0,y0,z-.045, x1,y1,z-.045, x1,y1,z+.045, x0,y0,z-.045, x1,y1,z+.045, x0,y0,z+.045], 3));
      g.computeVertexNormals();
      b.part(tag('curved-side-pane'), g, [0, 0, 0], row % 4 === 1 && z === .02 ? LIGHT : BLUE_PALE, false, [0, 0, 0], row % 4 === 1 && z === .02 ? 'light' : 'glass');
      b.block(tag('spine-side-pane'), [.009, .087, .085], [-.305, y, z], row % 4 === 2 ? LIGHT : BLUE_PALE, false, row % 4 === 2 ? 'light' : 'glass');
    }
  }

  // A single champagne spine and curved roof ribs replace the heavy roof box.
  b.post(tag('spine-foot'), .023, .315, .54, -.306, .02, gold);
  b.post(tag('spine-mast'), .012, .52, 2.155, -.306, .02, gold);
  b.part(tag('spine-beacon'), new THREE.SphereGeometry(.025, 10, 8), [-.306, 2.155, .02], LIGHT, true, [0, 0, 0], 'light');
  for (const z of [-.12, .02, .16]) {
    const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.30, 2.113, z), new THREE.Vector3(-.04, 2.133, z), new THREE.Vector3(.08, 2.043, z));
    b.part(tag('roof-swept-rib'), new THREE.TubeGeometry(c, 24, .007, 4, false), [0, 0, 0], gold, false, [0, 0, 0], 'metal');
  }
  b.part(tag('hotel-crest-ring'), new THREE.TorusGeometry(.031, .004, 4, 20), [-.14, 2.065, .267], gold, false, [0, 0, 0], 'metal');
  for (const x of [-.15, -.13]) b.block(tag('hotel-crest-H'), [.004, .032, .006], [x, 2.065, .270], gold, false, 'metal');
  b.block(tag('hotel-crest-crossbar'), [.023, .004, .006], [-.14, 2.065, .270], gold, false, 'metal');

  // Rounded sky restaurant, fine glass balustrade and a thin floating canopy.
  slab(b, 'upgrade-3-hotel-sail-sky-deck', .52, .30, .028, .09, [0, 1.55, .36], stone);
  balconyRail(b, .49, .27, 1.578, .36, gold);
  for (const x of [-.20, .20]) b.post(tag('restaurant-column'), .008, 1.578, 1.725, x, .40, gold);
  slab(b, tag('restaurant-roof'), .55, .32, .019, .10, [0, 1.725, .36], stone);
  b.block(tag('restaurant-cove'), [.36, .006, .010], [0, 1.722, .50], LIGHT, false, 'light');
  for (const x of [-.15, .15]) b.rod([x, 1.49, .249], [x, 1.55, .44], .008, gold);

  slab(b, 'upgrade-2-hotel-sail-sky-lobby', .48, .26, .025, .08, [0, 1.17, .35], stone);
  balconyRail(b, .45, .23, 1.195, .35, gold);
  for (const x of [-.15, .15]) {
    b.block(tag('sky-garden-planter'), [.10, .04, .07], [x, 1.215, .38], gold);
    b.part(tag('sky-garden-foliage'), new THREE.IcosahedronGeometry(.045, 0), [x, 1.26, .38], LEAF, false, [0, 0, 0], 'leaf');
    b.rod([x, 1.11, .249], [x, 1.17, .43], .008, gold);
  }

  // Rear service core becomes a dark glazed spine with slim, staggered stair lights.
  slab(b, tag('rear-service-core'), .23, .16, 1.27, .035, [-.05, .345, -.29], DARK, 'glass');
  for (const x of [-.16, .06]) b.block(tag('rear-core-fin'), [.014, 1.27, .019], [x, .98, -.377], gold, false, 'metal');
  for (let row = 0; row < 8; row++) {
    const y = .44 + row * .145;
    b.block(tag('rear-core-transom'), [.23, .009, .012], [-.05, y, -.381], gold, false, 'metal');
    b.block(tag('rear-core-stair-light'), [.06, .048, .009], [-.05 + (row % 2 ? .042 : -.042), y + .06, -.386], LIGHT, false, 'light');
  }
  slab(b, tag('rear-core-roof'), .27, .20, .025, .045, [-.05, 1.615, -.29], stone);
  for (const x of [-.12, .03]) {
    b.block(tag('rear-roof-planter'), [.085, .04, .09], [x, 1.66, -.29], gold);
    b.part(tag('rear-roof-greenery'), new THREE.IcosahedronGeometry(.047, 0), [x, 1.70, -.29], LEAF, false, [0, 0, 0], 'leaf');
  }
  slab(b, tag('rear-portico'), .51, .21, .025, .05, [-.02, .34, -.45], stone);
  for (const x of [-.23, .19]) b.post(tag('rear-portico-column'), .013, .095, .34, x, -.51, gold);
  b.block(tag('rear-entry-glass'), [.29, .19, .014], [-.02, .22, -.416], BLUE, false, 'glass');
  for (const x of [-.12, .08]) b.block(tag('rear-entry-light'), [.016, .15, .012], [x, .22, -.428], LIGHT, false, 'light');
}
