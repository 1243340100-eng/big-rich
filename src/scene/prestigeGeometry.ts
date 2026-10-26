import * as THREE from 'three';
import type { ArchitecturalPalette } from './detailGeometry';
import { Model } from './buildingPrimitives';
import { buildBayHotel } from './bayHotelGeometry';

/**
 * Level 3 statement buildings. These replace the ordinary level-3 model of the
 * selected plots instead of layering more trim onto it.
 *
 * References:
 * - 15 Skyline Center: Art Deco / Chrysler-style crown and illuminated setbacks.
 * - 18 Bay Hotel: sail-shaped luxury hotel with a gold mast and sky deck.
 * - 31 Cloud HQ: three-tower SkyPark with an infinity pool and roof gardens.
 */
export const PRESTIGE_HEIGHTS: Record<number, number> = {15: 2.30, 18: 2.18, 31: 2.35};

const FOLIAGE = '#65846c';

/** Four-sided tapered box: base wb×db, top wt×dt, height h, sitting on its own y=0. */
function taperedBox(wb: number, db: number, wt: number, dt: number, h: number) {
  const v = [
    [-wb / 2, 0, -db / 2], [wb / 2, 0, -db / 2], [wb / 2, 0, db / 2], [-wb / 2, 0, db / 2],
    [-wt / 2, h, -dt / 2], [wt / 2, h, -dt / 2], [wt / 2, h, dt / 2], [-wt / 2, h, dt / 2],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  g.computeVertexNormals();
  return g;
}

function skyline(b: Model, p: ArchitecturalPalette) {
  // Podium and illuminated entrance.
  b.block('prestige-l3-skyline-podium', [1.10, .30, .82], [0, .21, .02], p.wallAlt);
  b.block('prestige-l3-skyline-podium-cap', [1.14, .025, .86], [0, .3725, .02], p.trim);
  b.block('prestige-l3-skyline-steps', [1.18, .04, .92], [0, .08, .05], p.wallAlt);
  b.block('prestige-l3-skyline-entry', [.34, .23, .018], [0, .235, .445], p.glow, false, 'glass');
  for (const x of [-.25, .25]) b.post('prestige-l3-skyline-entry-column', .018, .06, .40, x, .37, p.trim);
  b.block('upgrade-1-skyline-entry-canopy', [.66, .035, .22], [0, .41, .36], p.trim);
  b.block('prestige-l3-skyline-entry-light', [.58, .012, .018], [0, .405, .475], p.glow, false, 'light');

  // Three setbacks. The crown is intentionally much more vertical than the old block tower.
  b.block('skyline-setback-tier', [.78, 1.00, .62], [0, .86, -.03], p.wall);
  b.block('prestige-l3-skyline-tier-cornice', [.84, .035, .66], [0, 1.3775, -.03], p.trim);
  b.block('skyline-setback-tier', [.58, .44, .50], [0, 1.58, -.03], p.wallAlt);
  b.block('upgrade-2-skyline-terrace', [.63, .035, .55], [0, 1.8175, -.03], p.trim);
  b.block('skyline-setback-tier', [.40, .18, .38], [0, 1.89, -.03], p.wall);
  b.block('prestige-l3-skyline-tier-cornice', [.45, .025, .43], [0, 1.9925, -.03], p.trim);

  // Vertical metal piers and glazing are the main Art Deco language.
  for (const x of [-.38, .38]) b.block('prestige-l3-skyline-gold-pier', [.035, 1.00, .05], [x, .86, .29], p.trim, false, 'metal');
  for (const x of [-.29, -.14, 0, .14, .29]) b.block('prestige-l3-skyline-window-bay', [.075, 1.18, .012], [x, .86, .297], p.glow, false, 'glass');
  for (const y of [.47, .74, 1.01, 1.28]) b.block('prestige-l3-skyline-horizontal-band', [.80, .012, .015], [0, y, .298], p.trim, false, 'metal');
  for (const x of [-.20, 0, .20]) {
    b.block('prestige-l3-skyline-upper-window', [.07, .26, .012], [x, 1.58, .224], p.glow, false, 'glass');
    b.block('prestige-l3-skyline-upper-pier', [.018, .40, .025], [x - .045, 1.58, .226], p.trim, false, 'metal');
  }
  for (const x of [-.10, .10]) b.block('prestige-l3-skyline-crown-window', [.06, .12, .012], [x, 1.89, .164], p.glow, false, 'glass');
  // Side and podium glazing keep the narrow tower from showing blank walls.
  for (const s of [-1, 1]) {
    for (const z of [-.20, 0, .20]) for (const y of [.58, .88, 1.18]) {
      b.block('prestige-l3-skyline-side-window', [.012, .14, .15], [s * .396, y, z], p.glow, false, 'glass');
    }
    for (const z of [-.32, .26]) b.block('prestige-l3-skyline-side-fin', [.030, 1.00, .030], [s * .397, .86, z], p.trim, false, 'metal');
    for (const z of [-.10, .08]) for (const y of [1.47, 1.66]) {
      b.block('prestige-l3-skyline-upper-side-window', [.012, .10, .11], [s * .293, y, z], p.glow, false, 'glass');
    }
    b.block('prestige-l3-skyline-top-side-window', [.012, .07, .09], [s * .203, 1.89, -.03], p.glow, false, 'glass');
    b.block('prestige-l3-skyline-podium-side-window', [.012, .12, .32], [s * .552, .22, -.02], p.glow, false, 'glass');
  }

  // Observation crown, gold rail and the stepped Chrysler-like lantern.
  b.block('upgrade-3-skyline-observation-crown', [.50, .035, .46], [0, 1.9975, -.03], p.trim);
  for (const x of [-.20, .20]) for (const z of [-.19, .13]) b.post('prestige-l3-skyline-crown-rail-post', .010, 2.015, 2.12, x, z, p.trim);
  for (const z of [-.19, .13]) b.block('prestige-l3-skyline-crown-rail', [.43, .014, .014], [0, 2.12, z], p.trim);
  for (const x of [-.20, .20]) b.block('prestige-l3-skyline-crown-rail', [.014, .014, .34], [x, 2.12, -.03], p.trim);
  b.part('prestige-l3-skyline-crown-base', new THREE.CylinderGeometry(.20, .23, .20, 8), [0, 2.10, -.03], p.trim, true, [0, 0, 0], 'metal');
  b.part('prestige-l3-skyline-crown-upper', new THREE.CylinderGeometry(.13, .20, .08, 8), [0, 2.23, -.03], p.trim, true, [0, 0, 0], 'metal');
  b.part('prestige-l3-skyline-crown-ring', new THREE.TorusGeometry(.235, .009, 6, 28), [0, 2.08, -.03], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  b.part('prestige-l3-skyline-crown-ring', new THREE.TorusGeometry(.16, .008, 6, 24), [0, 2.22, -.03], p.glow, false, [Math.PI / 2, 0, 0], 'light');
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    b.rod([Math.sin(a) * .19, 2.06, Math.cos(a) * .19 - .03], [Math.sin(a) * .08, 2.26, Math.cos(a) * .08 - .03], .006, p.trim, 'metal');
  }
  b.post('prestige-l3-skyline-needle', .010, 2.26, 2.30, 0, -.03, p.trim);
  b.part('prestige-l3-skyline-needle-light', new THREE.SphereGeometry(.020, 10, 8), [0, 2.285, -.03], p.glow, false, [0, 0, 0], 'light');

  // Corner pinnacles sit on the second setback instead of floating beside the facade.
  for (const x of [-.27, .27]) {
    b.post('prestige-l3-skyline-corner-pinnacle', .010, 1.8175, 1.96, x, -.03, p.trim);
    b.block('prestige-l3-skyline-corner-pinnacle-cap', [.04, .025, .04], [x, 1.9725, -.03], p.trim);
    b.part('prestige-l3-skyline-corner-pinnacle-light', new THREE.SphereGeometry(.016, 10, 8), [x, 1.99, -.03], p.glow, false, [0, 0, 0], 'light');
  }
}

/**
 * Cloud HQ (31): a slender tapered shaft threaded by two cantilevered "cloud
 * wafers", capped by an open observation crown and a spire. Structure, trim and
 * night lighting come from the district palette, so the tower belongs to the
 * 未来产业 block instead of importing its own beige-and-gold scheme.
 */
function cloudTower(b: Model, p: ArchitecturalPalette) {
  const shell = p.wall, shade = p.wallAlt, edge = p.trim, light = p.glow;
  const glass = '#6d9694';

  // Podium: arrival deck, glazed lobby, columned canopy and planted court.
  b.block('upgrade-1-cloud-arrival', [1.22, .04, .98], [0, .08, .04], edge);
  b.block('prestige-l3-cloud-podium', [1.10, .26, .84], [0, .19, .02], shade);
  b.block('prestige-l3-cloud-podium-band', [1.11, .05, .85], [0, .085, .02], shell, false);
  b.block('prestige-l3-cloud-podium-cap', [1.14, .022, .88], [0, .331, .02], edge);
  b.block('prestige-l3-cloud-lobby-frame', [.78, .20, .03], [0, .20, .436], edge, false, 'metal');
  b.block('prestige-l3-cloud-lobby-glass', [.72, .165, .014], [0, .20, .452], light, false, 'light');
  for (const x of [-.24, 0, .24]) b.block('prestige-l3-cloud-lobby-mullion', [.012, .165, .020], [x, .20, .462], glass, false, 'glass');
  b.block('prestige-l3-cloud-lobby-cove', [.70, .010, .010], [0, .322, .446], light, false, 'light');
  b.block('prestige-l3-cloud-canopy', [.64, .028, .22], [0, .40, .40], edge);
  for (const x of [-.30, .30]) b.post('prestige-l3-cloud-canopy-post', .012, .342, .40, x, .40, edge);
  for (const x of [-.48, .48]) {
    b.block('prestige-l3-cloud-planter', [.14, .06, .14], [x, .34, .30], edge);
    b.part('prestige-l3-cloud-shrub', new THREE.IcosahedronGeometry(.07, 0), [x, .405, .30], FOLIAGE, false, [0, 0, 0], 'leaf');
  }

  // Shaft: one continuous taper from the podium to the crown.
  const base = .342, top = 1.92, w0 = .48, d0 = .44, w1 = .32, d1 = .28;
  b.part('cloud-rounded-tower', taperedBox(w0, d0, w1, d1, top - base), [0, base, -.02], shell, true, [0, 0, 0], 'stone');
  // Canted corner fins trace the taper and keep the silhouette crisp.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.rod([sx * w0 / 2, base, -.02 + sz * d0 / 2], [sx * w1 / 2, top, -.02 + sz * d1 / 2], .007, edge, 'metal');
  }
  const at = (y: number) => {
    const t = (y - base) / (top - base);
    return { w: w0 + (w1 - w0) * t, d: d0 + (d1 - d0) * t };
  };

  // Glazing bands and vertical coves between the wafers.
  for (const [y, h] of [[.64, .50], [1.18, .44], [1.70, .38]] as [number, number][]) {
    const { w, d } = at(y), z = -.02 + d / 2 + .006;
    b.block('prestige-l3-cloud-glass', [w * .84, h, .016], [0, y, z], glass, false, 'glass');
    for (const x of [-w * .40, w * .40]) b.block('prestige-l3-cloud-glass-frame', [.012, h, .022], [x, y, z + .004], edge, false, 'metal');
    for (const x of [-w * .26, -.09, .09, w * .26]) b.block('prestige-l3-cloud-mullion', [.008, h, .024], [x, y, z + .006], edge, false, 'metal');
    for (const x of [-w * .17, w * .17]) b.block('prestige-l3-cloud-cove', [.024, h * .84, .010], [x, y, z + .014], light, false, 'light');
    for (const s of [-1, 1]) b.block('prestige-l3-cloud-side-glass', [.016, h, d * .62], [s * (w / 2 + .006), y, -.02], glass, false, 'glass');
  }
  for (const y of [.52, 1.06, 1.60]) {
    const { w, d } = at(y);
    b.block('prestige-l3-cloud-floor-line', [w + .012, .012, d + .012], [0, y, -.02], edge, false, 'metal');
  }

  // Two cantilevered cloud wafers: planted decks, lit undersides, visible brackets.
  for (const [y, w, d] of [[.92, .66, .54], [1.44, .58, .48]] as [number, number, number][]) {
    b.block('upgrade-2-cloud-wafer', [w, .030, d], [0, y, -.02], shell);
    b.block('prestige-l3-cloud-wafer-fascia', [w + .016, .012, d + .016], [0, y - .010, -.02], edge, false, 'metal');
    b.block('prestige-l3-cloud-wafer-cove', [w - .05, .010, d - .05], [0, y - .021, -.02], light, false, 'light');
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      b.post('prestige-l3-cloud-wafer-post', .007, y + .014, y + .104, s * (w / 2 - .035), -.02 + t * (d / 2 - .035), edge);
    }
    for (const t of [-1, 1]) b.block('prestige-l3-cloud-wafer-rail', [w - .05, .010, .010], [0, y + .104, -.02 + t * (d / 2 - .035)], edge, false, 'metal');
    for (const s of [-1, 1]) b.block('prestige-l3-cloud-wafer-rail', [.010, .010, d - .05], [s * (w / 2 - .035), y + .104, -.02], edge, false, 'metal');
    const inner = at(y - .16);
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      b.rod([s * inner.w / 2, y - .18, -.02 + t * inner.d / 2], [s * (w / 2 - .02), y - .014, -.02 + t * (d / 2 - .02)], .006, edge, 'metal');
    }
    for (const s of [-1, 1]) {
      b.block('prestige-l3-cloud-wafer-planter', [.11, .05, .11], [s * (w / 2 - .09), y + .040, -.02 + d / 2 - .09], edge);
      b.part('prestige-l3-cloud-wafer-tree', new THREE.IcosahedronGeometry(.055, 0), [s * (w / 2 - .09), y + .105, -.02 + d / 2 - .09], FOLIAGE, false, [0, 0, 0], 'leaf');
    }
  }

  // Open observation crown, lantern, cap and spire.
  const crown = top + .19;
  // The crown is the widest deck, cantilevered past the shaft on angled brackets,
  // so the silhouette grows towards the sky instead of stacking equal floors.
  b.block('upgrade-3-cloud-crown', [.74, .028, .56], [0, top + .014, -.02], shade);
  b.block('prestige-l3-cloud-crown-fascia', [.76, .012, .58], [0, top - .001, -.02], edge, false, 'metal');
  b.block('prestige-l3-cloud-crown-cove', [.68, .010, .50], [0, top - .008, -.02], light, false, 'light');
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    b.post('prestige-l3-cloud-crown-post', .008, top + .028, top + .126, s * .335, -.02 + t * .245, edge);
    b.rod([s * .155, top - .16, -.02 + t * .135], [s * .335, top - .004, -.02 + t * .245], .006, edge, 'metal');
  }
  for (const t of [-1, 1]) b.block('prestige-l3-cloud-crown-rail', [.69, .010, .010], [0, top + .126, -.02 + t * .245], edge, false, 'metal');
  for (const s of [-1, 1]) b.block('prestige-l3-cloud-crown-rail', [.010, .010, .50], [s * .335, top + .126, -.02], edge, false, 'metal');
  b.block('prestige-l3-cloud-lantern-sill', [.34, .018, .30], [0, top + .022, -.02], edge, false, 'metal');
  b.block('prestige-l3-cloud-lantern-glass', [.28, .15, .24], [0, top + .105, -.02], light, false, 'light');
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    b.block('prestige-l3-cloud-lantern-post', [.016, .17, .016], [s * .142, top + .105, -.02 + t * .122], edge);
  }
  b.block('prestige-l3-cloud-cap', [.34, .018, .30], [0, top + .199, -.02], edge);
  b.post('prestige-l3-cloud-spire', .009, crown, 2.35, 0, -.02, edge);
  b.part('prestige-l3-cloud-beacon', new THREE.SphereGeometry(.012, 10, 8), [0, 2.34, -.02], light, false, [0, 0, 0], 'light');
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    b.rod([Math.sin(a) * .15, crown + .03, -.02 + Math.cos(a) * .15], [Math.sin(a) * .05, 2.30, -.02 + Math.cos(a) * .05], .006, edge, 'metal');
  }

  // Entrance steps centred under the canopy.
  b.block('prestige-l3-cloud-step', [.56, .05, .16], [0, .325, .41], shade);
  b.block('prestige-l3-cloud-step-trim', [.48, .030, .12], [0, .355, .38], edge, false, 'metal');
}

export const PRESTIGE_MODELS: Record<number, (b: Model, p: ArchitecturalPalette) => void> = {
  15: skyline,
  18: buildBayHotel,
  31: cloudTower,
};
