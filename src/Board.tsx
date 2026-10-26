import {SHORTCUT_LANES,SHORTCUT_LANE_WIDTH,SHORTCUT_WALK_WIDTH,shortcutNeck} from './scene/boardNavigation';
import {SceneLighting} from './scene/SceneLighting';
import {DistantCity} from './scene/DistantCityLayer';
import {CITY,cityOverviewFov} from './scene/distantCity';
import {overviewCameraDistance,boardCameraNear,BOARD_CAMERA_FAR} from './scene/cameraFraming';
import {LIGHTING,useTimeOfDay} from './scene/timeOfDay';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, events, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { TILES } from '../shared/catalog';
import type { GameState, Player, Property, Tile } from '../shared/types';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { ArchitectureDetails, PlotDetails, UrbanDetails, SceneMetrics, LandmarkModel, CentralLandmark } from './scene/CityDetails';
import { hasLandmarkModel, landmarkModelHeight } from './scene/landmarkGeometry';
import { UpgradeableBuilding } from './scene/UpgradeableBuilding';
import { CityMotionProvider,useCityClock } from './scene/CityMotion';
import {CharacterModel} from './scene/CharacterModel';
import {characterFor,PAWN_RADIUS,PAWN_SCALE} from '../shared/characters';
import { CityActivity } from './scene/CityLife';
import { usePerformanceMode, useReducedMotion } from './game/preferences';
import {CasinoLandmark} from './scene/CasinoLandmark';
import { ACTIVE_LABEL_WIDTH, LABEL_ASPECT, LABEL_WIDTH, hoveredTileFromHits, labelFirstHits, visibleLabelRaycast } from './scene/labelInteraction';
import { ROAD_INNER, pawnRoute, chooseLabels, parkingPose, roadAnchor, type RoadPoint, type LabelCandidate } from './scene/boardNavigation';

type Vec3 = [number, number, number];
type DistrictStyle = {
  accent: string;
  wall: string;
  wallAlt: string;
  roof: string;
  trim: string;
  pad: string;
  glow: string;
};

const DUSK = {
  wood: '#0b1615',
  base: '#111f1c',
  rim: '#b98a45',
  asphalt: '#304740',
  paver: '#c8bea3',
  paverEdge: '#938b74',
  ink: '#17251f',
  brass: '#d2a24c',
  brassDark: '#8e682f',
  cream: '#efe4ca',
  stone: '#9e9783',
  water: '#55a5a5',
  foliage: '#5d7562',
  foliageLight: '#809275',
  trunk: '#66503b',
  window: '#ffc378',
  cyan: '#8ed8cc',
} as const;

const DISTRICTS: Record<string, DistrictStyle> = {
  花园住区: { accent: '#87ad91', wall: '#ddcfb1', wallAlt: '#cbbb99', roof: '#5e7564', trim: '#a96c4f', pad: '#d4cdb4', glow: DUSK.window },
  中央商区: { accent: '#d8ab62', wall: '#ddc9a3', wallAlt: '#cbb58a', roof: '#5b5c4c', trim: '#a26d45', pad: '#d8c8a6', glow: '#ffc879' },
  海湾文旅: { accent: '#a293c8', wall: '#e1d1ba', wallAlt: '#cdbca4', roof: '#5c6a75', trim: '#8b6875', pad: '#cec6b7', glow: '#ffd09b' },
  未来产业: { accent: '#78abbc', wall: '#c9d0c1', wallAlt: '#b6bfb2', roof: '#4b6467', trim: '#5c8d87', pad: '#c4cdc0', glow: DUSK.cyan },
  // 内区两条街道：金融偏冷、商业偏暖，和各自的入口地块色一致。
  金融捷径: { accent: '#79b9af', wall: '#cad8d3', wallAlt: '#b5c6c1', roof: '#49635f', trim: '#5c8d87', pad: '#c3d1cc', glow: '#8ed8cc' },
  商业捷径: { accent: '#d5af7a', wall: '#ddc9a3', wallAlt: '#cbb58a', roof: '#5b5c4c', trim: '#a26d45', pad: '#d8c8a6', glow: '#ffc879' },
};

const FALLBACK_STYLE: DistrictStyle = {
  accent: DUSK.brass,
  wall: '#d4c8ad',
  wallAlt: '#c0b39a',
  roof: '#5b6659',
  trim: '#a5734b',
  pad: '#cec5ab',
  glow: DUSK.window,
};

function styleFor(tile: Tile): DistrictStyle {
  if (tile.type !== 'property') return FALLBACK_STYLE;
  if (tile.district === '商业捷径') return DISTRICTS['中央商区'];
  if (tile.district === '金融捷径') return DISTRICTS['海湾文旅'];
  return DISTRICTS[tile.district] ?? FALLBACK_STYLE;
}

function hash(seed: number, salt = 0) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function sideOf(id: number) {
  if (id >= 32) return TILES[id].x >= 0 ? 1 : 3;
  return Math.floor(id / 8);
}

function outwardRotation(id: number) {
  const side = sideOf(id);
  return side === 0 ? 0 : side === 1 ? Math.PI / 2 : side === 2 ? Math.PI : -Math.PI / 2;
}

function useCanvasTexture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, width: number, height: number, deps: unknown[]) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.minFilter = THREE.LinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.anisotropy = 4;
    return map;
    // The draw callback intentionally follows the explicit dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function landmarkTexture(name: string, accent: string, active: boolean) {
  return useCanvasTexture((ctx, w, h) => {
    const cut = 24;
    const border = active ? 7 : 5;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(4, 4);
      ctx.lineTo(w - cut, 4);
      ctx.lineTo(w - 4, cut);
      ctx.lineTo(w - 4, h - 4);
      ctx.lineTo(4, h - 4);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(5, 6);
    shape();
    ctx.fillStyle = 'rgba(18,26,19,.4)';
    ctx.fill();
    ctx.restore();
    shape();
    ctx.fillStyle = active ? '#fff8e8' : '#f4e7cf';
    ctx.fill();
    ctx.lineWidth = border;
    ctx.strokeStyle = active ? '#9a6b2d' : '#213127';
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(4, 4, active ? 14 : 10, h - 8);
    ctx.fillStyle = '#1f2f25';
    ctx.font = '600 90px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 31, 63, w - 59);
    ctx.fillStyle = active ? 'rgba(167,120,54,.9)' : 'rgba(43,58,46,.42)';
    ctx.beginPath();
    ctx.moveTo(w - 35, 29);
    ctx.lineTo(w - 22, 42);
    ctx.lineTo(w - 35, 55);
    ctx.lineTo(w - 48, 42);
    ctx.closePath();
    ctx.fill();
  }, 512, 120, [name, accent, active]);
}

function LandmarkTag({ name, accent, active, y, spriteRef }: { name: string; accent: string; active: boolean; y: number; spriteRef?: (sprite: THREE.Sprite | null) => void }) {
  const texture = landmarkTexture(name, accent, active);
  return (
    <sprite ref={spriteRef} position={[0, y, 0]} raycast={visibleLabelRaycast} userData={{ boardLabel: true }} renderOrder={active ? 40 : 20}>
      <spriteMaterial
        map={texture}
        transparent
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
        opacity={active ? 1 : 0.97}
      />
    </sprite>
  );
}

function centerBankTexture() {
  return useCanvasTexture((ctx, w, h) => {
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(5, 5);
      ctx.lineTo(w - 46, 5);
      ctx.lineTo(w - 5, 46);
      ctx.lineTo(w - 5, h - 5);
      ctx.lineTo(5, h - 5);
      ctx.closePath();
    };
    ctx.save();
    ctx.translate(7, 8);
    shape();
    ctx.fillStyle = 'rgba(18,27,20,.4)';
    ctx.fill();
    ctx.restore();
    shape();
    ctx.fillStyle = '#f4e8d1';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#26372c';
    ctx.stroke();
    ctx.fillStyle = DUSK.brass;
    ctx.fillRect(5, 5, 16, h - 10);
    ctx.fillStyle = '#213127';
    ctx.font = '600 70px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('星海城市银行', 40, 92, w - 80);
    ctx.fillStyle = '#82683e';
    ctx.font = '600 21px Bahnschrift, "Segoe UI", sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('CENTRAL BANK  ·  CITY CORE', 42, 151);
  }, 768, 192, []);
}

function CenterBankLabel() {
  const texture = centerBankTexture();
  return (
    <sprite position={[0, 4.45, -1.2]} scale={[3.8, 0.95, 1]} renderOrder={35}>
      <spriteMaterial map={texture} transparent depthWrite={false} depthTest={false} toneMapped={false} />
    </sprite>
  );
}

function PyramidRoof({ w, d, h, color, position = [0, 0, 0], y = 0 }: { w: number; d: number; h: number; color: string; position?: Vec3; y?: number }) {
  return (
    <group position={[position[0], y, position[2]]} scale={[1, 1, d / w]}><mesh rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
      <coneGeometry args={[w / Math.SQRT2, h, 4]} />
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh></group>
  );
}

function WindowStrip({
  width, y, z, color = DUSK.window, height = 0.08, intensity = 1.65, columns,
}: {
  width: number; y: number; z: number; color?: string; height?: number; intensity?: number; columns?: number;
}) {
  const count = columns ?? Math.max(2, Math.min(5, Math.round(width / 0.12)));
  const gap = 0.022;
  const paneW = Math.max(0.028, (width - gap * (count - 1)) / count);
  return (
    <group>
      <mesh position={[0, y, z - 0.006]}>
        <boxGeometry args={[width + 0.045, height + 0.045, 0.022]} />
        <meshStandardMaterial color="#20251e" roughness={0.65} />
      </mesh>
      {Array.from({ length: count }, (_, i) => {
        const x = -width / 2 + paneW / 2 + i * (paneW + gap);
        return (
          <mesh key={i} position={[x, y, z + 0.011]}>
            <boxGeometry args={[paneW, height, 0.026]} />
            <meshStandardMaterial
              color="#352818"
              emissive={color}
              emissiveIntensity={intensity * (i % 3 === 0 ? 0.84 : 1)}
              roughness={0.3}
              toneMapped={false}
            />
          </mesh>
        );
      })}
      <mesh position={[0, y + height / 2 + 0.022, z + 0.01]}>
        <boxGeometry args={[width + 0.075, 0.018, 0.04]} />
        <meshStandardMaterial color="#303228" roughness={0.75} />
      </mesh>
      <mesh position={[0, y - height / 2 - 0.019, z + 0.014]}>
        <boxGeometry args={[width + 0.09, 0.025, 0.055]} />
        <meshStandardMaterial color="#4b4435" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Balcony({ width = 0.42, y, z, color = '#c9bba0', rail = '#354338' }: { width?: number; y: number; z: number; color?: string; rail?: string }) {
  return (
    <group position={[0, y, z]}>
      <mesh castShadow>
        <boxGeometry args={[width, 0.035, 0.17]} />
        <meshStandardMaterial color={color} roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.1, 0.075]}>
        <boxGeometry args={[width, 0.02, 0.02]} />
        <meshStandardMaterial color={rail} roughness={0.7} metalness={0.18} />
      </mesh>
      {[-width / 2 + 0.02, 0, width / 2 - 0.02].map((x) => (
        <mesh key={x} position={[x, 0.063, 0.075]}>
          <boxGeometry args={[0.015, 0.11, 0.015]} />
          <meshStandardMaterial color={rail} roughness={0.7} metalness={0.18} />
        </mesh>
      ))}
    </group>
  );
}

function Door({ x = 0, z, color = '#24362f' }: { x?: number; z: number; color?: string }) {
  return (
    <group>
      <mesh position={[x, 0.17, z]}>
        <boxGeometry args={[0.12, 0.28, 0.035]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[x, 0.32, z + 0.005]}>
        <boxGeometry args={[0.17, 0.02, 0.045]} />
        <meshStandardMaterial color={DUSK.brass} roughness={0.45} metalness={0.3} />
      </mesh>
    </group>
  );
}

function Awning({ width = 0.52, y = 0.3, z = 0.3, color }: { width?: number; y?: number; z?: number; color: string }) {
  return (
    <mesh position={[0, y, z]} rotation={[-0.24, 0, 0]} castShadow>
      <boxGeometry args={[width, 0.035, 0.19]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

function RoofSign({ width = 0.48, y, z, color, accent = DUSK.window }: { width?: number; y: number; z: number; color: string; accent?: string }) {
  return (
    <group position={[0, y, z]}>
      <mesh castShadow>
        <boxGeometry args={[width, 0.16, 0.05]} />
        <meshStandardMaterial color={color} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[width * 0.72, 0.055, 0.01]} />
        <meshStandardMaterial color="#2b2017" emissive={accent} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      <mesh position={[-width * 0.36, -0.11, 0]}>
        <boxGeometry args={[0.018, 0.22, 0.018]} />
        <meshStandardMaterial color="#28352e" roughness={0.6} />
      </mesh>
      <mesh position={[width * 0.36, -0.11, 0]}>
        <boxGeometry args={[0.018, 0.22, 0.018]} />
        <meshStandardMaterial color="#28352e" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Tree({ position, scale = 1, tone = 0 }: { position: Vec3; scale?: number; tone?: number }) {
  const leaf = tone % 2 ? DUSK.foliageLight : DUSK.foliage;
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.23, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.075, 0.46, 5]} />
        <meshStandardMaterial color={DUSK.trunk} roughness={1} />
      </mesh>
      <mesh position={[0, 0.67, 0]} castShadow>
        <icosahedronGeometry args={[0.34, 0]} />
        <meshStandardMaterial color={leaf} roughness={1} flatShading />
      </mesh>
      <mesh position={[0.11, 0.88, 0.03]} castShadow>
        <icosahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={tone % 3 ? '#738568' : '#8c9a7c'} roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function Fir({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.06, 0.48, 5]} />
        <meshStandardMaterial color={DUSK.trunk} roughness={1} />
      </mesh>
      {[0.56, 0.76, 0.94].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <coneGeometry args={[0.3 - i * 0.065, 0.4, 6]} />
          <meshStandardMaterial color={i === 2 ? '#84947b' : '#637866'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function StreetLamp({ position, illuminate=false }: { position: Vec3; illuminate?:boolean }) {
  const lighting=LIGHTING[useTimeOfDay()];
  return (
    <group position={position}>
      {illuminate&&<pointLight position={[0,.95,0]} color="#ffc17c" intensity={lighting.lamps*1.1} distance={2.4} decay={2}/>}
      <mesh position={[0, 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.05, 0.92, 5]} />
        <meshStandardMaterial color="#1a2924" roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.01, 0]}>
        <boxGeometry args={[0.15, 0.08, 0.15]} />
        <meshStandardMaterial color={DUSK.window} emissive={DUSK.window} emissiveIntensity={2.2*lighting.lamps} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[0.23, 0.045, 0.23]} />
        <meshStandardMaterial color="#101d19" roughness={0.5} />
      </mesh>
    </group>
  );
}

function OwnerFlag({ color }: { color: string }) {
  return (
    <group position={[-0.58, 0.02, -0.35]}>
      <mesh position={[0, 0.27, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.022, 0.54, 5]} />
        <meshStandardMaterial color="#24362f" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0.15, 0.47, 0]} castShadow>
        <boxGeometry args={[0.28, 0.17, 0.018]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} roughness={0.75} />
      </mesh>
      <mesh position={[0.15, 0.47, 0.014]}>
        <boxGeometry args={[0.055, 0.055, 0.006]} />
        <meshStandardMaterial color={DUSK.cream} roughness={0.7} />
      </mesh>
    </group>
  );
}

function SaleSign({ accent }: { accent: string }) {
  return (
    <group position={[-0.53, 0.02, -0.28]} rotation={[0, 0, -0.05]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.025, 0.5, 0.025]} />
        <meshStandardMaterial color={DUSK.brassDark} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.49, 0]} castShadow>
        <boxGeometry args={[0.42, 0.25, 0.035]} />
        <meshStandardMaterial color={DUSK.cream} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.49, 0.021]}>
        <boxGeometry args={[0.08, 0.15, 0.008]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
      <mesh position={[0.12, 0.49, 0.021]}>
        <boxGeometry args={[0.14, 0.035, 0.008]} />
        <meshStandardMaterial color={DUSK.ink} roughness={0.8} />
      </mesh>
    </group>
  );
}

function GardenProperty({ level, style, seed }: { level: number; style: DistrictStyle; seed: number }) {
  const floors = Math.max(0, Math.min(3, level));
  const bodyH = 0.42 + floors * 0.17;
  const bodyW = 0.78 + floors * 0.025;
  const bodyD = 0.6 + floors * 0.015;
  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[bodyW, bodyH, bodyD]} />
        <meshStandardMaterial color={style.wall} roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.09, 0]} castShadow>
        <boxGeometry args={[0.96, 0.12, 0.78]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.96} />
      </mesh>
      <mesh position={[0, bodyH - 0.022, 0]} castShadow>
        <boxGeometry args={[bodyW + 0.012, 0.038, bodyD + 0.012]} />
        <meshStandardMaterial color={style.accent} roughness={0.83} />
      </mesh>
      <PyramidRoof w={bodyW + 0.18} d={bodyD + 0.16} h={0.3 + floors * 0.025} color={style.roof} y={bodyH + 0.01} />
      <mesh position={[0.21, bodyH + 0.24, -0.13]} castShadow>
        <boxGeometry args={[0.085, 0.32, 0.085]} />
        <meshStandardMaterial color={style.trim} roughness={0.95} />
      </mesh>
      <mesh position={[0.21, bodyH + 0.415, -0.13]}>
        <boxGeometry args={[0.13, 0.035, 0.13]} />
        <meshStandardMaterial color="#3b342c" roughness={0.9} />
      </mesh>
      <Door x={-0.22} z={bodyD / 2 + 0.018} color={style.roof} />
      <WindowStrip width={0.22} y={bodyH * 0.62} z={bodyD / 2 + 0.018} height={0.075} />
      {[-0.16, 0.16].map((x) => (
        <mesh key={`shutter-${x}`} position={[x, bodyH * 0.62, bodyD / 2 + 0.045]}>
          <boxGeometry args={[0.035, 0.1, 0.018]} />
          <meshStandardMaterial color={style.roof} roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, bodyH * 0.62 - 0.08, bodyD / 2 + 0.09]} castShadow>
        <boxGeometry args={[0.28, 0.04, 0.15]} />
        <meshStandardMaterial color={style.trim} roughness={0.9} />
      </mesh>
      {[-0.1, -0.03, 0.04].map((x) => (
        <mesh key={`flower-${x}`} position={[x, bodyH * 0.62 - 0.045, bodyD / 2 + 0.095]}>
          <icosahedronGeometry args={[0.035, 0]} />
          <meshStandardMaterial color={x === -0.03 ? '#d3aa5a' : '#8b9f77'} roughness={1} flatShading />
        </mesh>
      ))}
      <mesh position={[0, bodyH * 0.62 - 0.14, bodyD / 2 + 0.02]}>
        <boxGeometry args={[0.33, 0.018, 0.03]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
      </mesh>
      <mesh position={[0, bodyH + 0.06, 0]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[bodyW + 0.24, 0.035, 0.2]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.88} />
      </mesh>
      {[-0.16, 0.16].map((x) => (
        <mesh key={`porch-${x}`} position={[-0.22 + x, 0.23, bodyD / 2 + 0.07]}>
          <boxGeometry args={[0.022, 0.36, 0.022]} />
          <meshStandardMaterial color={style.roof} roughness={0.78} />
        </mesh>
      ))}
      <mesh position={[-0.37, 0.35, bodyD / 2 + 0.2]}>
        <boxGeometry args={[0.038, 0.07, 0.038]} />
        <meshStandardMaterial color="#f4c77c" emissive="#ffc378" emissiveIntensity={1.9} toneMapped={false} />
      </mesh>
      <mesh position={[bodyW / 2 + 0.006, bodyH * 0.54, 0.06]}>
        <boxGeometry args={[0.018, 0.07, 0.16]} />
        <meshStandardMaterial color="#322616" emissive={style.glow} emissiveIntensity={1.25} toneMapped={false} />
      </mesh>
      {floors >= 1 && <WindowStrip width={0.48} y={bodyH - 0.11} z={bodyD / 2 + 0.018} height={0.06} />}
      {floors >= 2 && (
        <>
          <mesh position={[0, bodyH * 0.65, bodyD / 2 + 0.13]} castShadow>
            <boxGeometry args={[0.68, 0.035, 0.22]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
          </mesh>
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} position={[x, bodyH * 0.65 + 0.1, bodyD / 2 + 0.23]}>
              <boxGeometry args={[0.022, 0.19, 0.022]} />
              <meshStandardMaterial color={style.roof} roughness={0.8} />
            </mesh>
          ))}
        </>
      )}
      {floors >= 3 && (
        <group position={[0.3, bodyH + 0.2, -0.04]}>
          <mesh castShadow>
            <boxGeometry args={[0.23, 0.3, 0.28]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
          </mesh>
          <PyramidRoof w={0.34} d={0.38} h={0.2} color={style.roof} y={0.02} />
          <WindowStrip width={0.12} y={0.02} z={0.15} height={0.045} />
        </group>
      )}
      <mesh position={[-0.51, 0.11, 0.24]} rotation={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.16, 0.12, 0.12]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.95} />
      </mesh>
      <Tree position={[-0.55, 0.02, 0.36]} scale={0.55 + hash(seed, 2) * 0.12} tone={seed} />
      <mesh position={[0.48, 0.07, 0.32]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={seed % 2 ? '#6f846d' : '#859379'} roughness={1} flatShading />
      </mesh>
      <Awning y={0.37} z={bodyD / 2 + 0.15} color={style.accent} width={0.28} />
    </group>
  );
}

function CommerceProperty({ level, style, seed }: { level: number; style: DistrictStyle; seed: number }) {
  const floors = Math.max(0, Math.min(3, level));
  const height = 0.55 + floors * 0.28;
  const width = 0.72 + floors * 0.025;
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.64]} />
        <meshStandardMaterial color={style.wall} roughness={0.82} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.13, 0.335]} castShadow>
        <boxGeometry args={[width - 0.08, 0.26, 0.045]} />
        <meshStandardMaterial color="#352c20" emissive={style.glow} emissiveIntensity={0.72} roughness={0.35} toneMapped={false} />
      </mesh>
      <mesh position={[0, height - 0.03, 0]} castShadow>
        <boxGeometry args={[width + 0.014, 0.04, 0.66]} />
        <meshStandardMaterial color={style.accent} roughness={0.8} />
      </mesh>
      {[-width / 2, width / 2].map((x) => (
        <mesh key={`pilaster-${x}`} position={[x, height / 2, 0.34]} castShadow>
          <boxGeometry args={[0.034, height, 0.035]} />
          <meshStandardMaterial color={style.wallAlt} roughness={0.82} />
        </mesh>
      ))}
      {Array.from({ length: floors + 1 }, (_, i) => (
        <mesh key={`band-${i}`} position={[0, 0.43 + i * 0.22, 0.338]}>
          <boxGeometry args={[width + 0.04, 0.018, 0.026]} />
          <meshStandardMaterial color={style.wallAlt} roughness={0.86} />
        </mesh>
      ))}
      <Awning width={width - 0.04} y={0.36} z={0.37} color={style.accent} />
      <mesh position={[width / 2 - 0.13, 0.43, 0.42]} castShadow>
        <boxGeometry args={[0.3, 0.032, 0.18]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.8} />
      </mesh>
      <Door x={width / 2 - 0.13} z={0.37} color={style.roof} />
      {Array.from({ length: floors + 1 }, (_, i) => (
        <WindowStrip key={i} width={width * 0.68} y={0.52 + i * 0.22} z={0.328} height={0.052} color={style.glow} />
      ))}
      {Array.from({ length: Math.min(3, floors + 1) }, (_, i) => (
        <mesh key={`sidewin-${i}`} position={[width / 2 + 0.006, 0.55 + i * 0.22, 0.04]}>
          <boxGeometry args={[0.018, 0.045, 0.22]} />
          <meshStandardMaterial color="#302518" emissive={style.glow} emissiveIntensity={1.1} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, height / 2, -0.34]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.72, 0.04, 0.02]} />
        <meshStandardMaterial color={DUSK.brassDark} roughness={0.65} metalness={0.2} />
      </mesh>
      {floors >= 1 && (
        <mesh position={[0.06, height + 0.18, -0.02]} castShadow>
          <boxGeometry args={[width * 0.66, 0.31, 0.5]} />
          <meshStandardMaterial color={style.wallAlt} roughness={0.76} />
        </mesh>
      )}
      {floors >= 2 && (
        <mesh position={[0.02, height + 0.42, -0.02]} castShadow>
          <boxGeometry args={[width * 0.52, 0.24, 0.4]} />
          <meshStandardMaterial color={style.wall} roughness={0.7} />
        </mesh>
      )}
      {floors >= 3 && (
        <group position={[0.02, height + 0.67, -0.02]}>
          <mesh castShadow>
            <boxGeometry args={[width * 0.38, 0.22, 0.32]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.72} />
          </mesh>
          <mesh position={[0.11, 0.17, 0]}>
            <boxGeometry args={[0.018, 0.32, 0.018]} />
            <meshStandardMaterial color={DUSK.brassDark} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0.14, 0.34, 0]}>
            <sphereGeometry args={[0.025, 6, 4]} />
            <meshStandardMaterial color={DUSK.window} emissive={DUSK.window} emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        </group>
      )}
      {floors >= 1 && <RoofSign width={width * 0.66} y={height + 0.39} z={0.28} color={style.roof} accent={style.accent} />}
      {floors >= 2 && [-0.18, 0.2].map((x) => (
        <group key={`roof-unit-${x}`} position={[x, height + 0.04, -0.12]}>
          <mesh castShadow>
            <boxGeometry args={[0.15, 0.1, 0.18]} />
            <meshStandardMaterial color="#7b7f70" roughness={0.68} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.025, 7]} />
            <meshStandardMaterial color="#3a433b" roughness={0.45} metalness={0.25} />
          </mesh>
        </group>
      ))}
      <mesh position={[-width / 2 - 0.02, height * 0.63, 0.32]} castShadow>
        <boxGeometry args={[0.035, height * 0.35, 0.035]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.55} roughness={0.35} />
      </mesh>
      {[0.23, 0.34, 0.45].map((y) => (
        <mesh key={`signlite-${y}`} position={[-width / 2 - 0.04, y, 0.335]}>
          <boxGeometry args={[0.055, 0.045, 0.02]} />
          <meshStandardMaterial color="#f6d59a" emissive="#ffc378" emissiveIntensity={1.7} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[-0.43, 0.06, 0.26]} castShadow>
        <boxGeometry args={[0.2, 0.09, 0.16]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
      </mesh>
      <mesh position={[0.33, 0.06, 0.28]} castShadow>
        <boxGeometry args={[0.18, 0.08, 0.14]} />
        <meshStandardMaterial color="#665844" roughness={0.9} />
      </mesh>
      <Tree position={[-0.49, 0.02, 0.3]} scale={0.42} tone={seed + 1} />
    </group>
  );
}

function CoastProperty({ level, style, seed }: { level: number; style: DistrictStyle; seed: number }) {
  const floors = Math.max(0, Math.min(3, level));
  const bodyH = 0.42 + floors * 0.19;
  const towerH = 0.62 + floors * 0.23;
  return (
    <group>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.8, bodyH, 0.58]} />
        <meshStandardMaterial color={style.wall} roughness={0.9} />
      </mesh>
      <mesh position={[0.29, towerH / 2 + 0.05, -0.08]} castShadow>
        <cylinderGeometry args={[0.29, 0.34, towerH, 6]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.78} />
      </mesh>
      <mesh position={[0.29, towerH * 0.62, 0.17]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.36, 0.075, 0.02]} />
        <meshStandardMaterial color="#2d2218" emissive={style.glow} emissiveIntensity={1.15} toneMapped={false} />
      </mesh>
      <WindowStrip width={0.26} y={towerH * 0.34} z={0.18} height={0.045} color={style.glow} columns={3} />
      {floors >= 1 && (
        <group position={[0.29, towerH * 0.73, 0.15]}>
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.032, 0.17]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.07, 0.08]}>
            <boxGeometry args={[0.42, 0.018, 0.018]} />
            <meshStandardMaterial color={style.roof} roughness={0.65} metalness={0.2} />
          </mesh>
          {[-0.18, 0, 0.18].map((x) => (
            <mesh key={x} position={[x, 0.04, 0.08]}>
              <boxGeometry args={[0.012, 0.08, 0.012]} />
              <meshStandardMaterial color={style.roof} roughness={0.65} metalness={0.2} />
            </mesh>
          ))}
        </group>
      )}
      <mesh position={[0.29, towerH + 0.07, -0.07]} rotation={[0, Math.PI / 4, -0.12]} castShadow>
        <coneGeometry args={[0.46, 0.21, 4]} />
        <meshStandardMaterial color={style.roof} roughness={0.8} />
      </mesh>
      <mesh position={[0.29, towerH + 0.31, -0.07]} castShadow>
        <cylinderGeometry args={[0.012, 0.02, 0.4, 5]} />
        <meshStandardMaterial color="#666e61" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0.29, towerH + 0.53, -0.07]}>
        <sphereGeometry args={[0.025, 6, 4]} />
        <meshStandardMaterial color="#ffd18c" emissive="#ffc378" emissiveIntensity={2.1} toneMapped={false} />
      </mesh>
      <mesh position={[0.54, bodyH * 0.52, 0.02]}>
        <boxGeometry args={[0.02, 0.065, 0.18]} />
        <meshStandardMaterial color="#332719" emissive={style.glow} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      <mesh position={[0, bodyH - 0.02, 0]} castShadow>
        <boxGeometry args={[0.82, 0.038, 0.6]} />
        <meshStandardMaterial color={style.accent} roughness={0.82} />
      </mesh>
      <mesh position={[0, bodyH + 0.16, 0.08]} rotation={[-0.12, 0, 0]} castShadow>
        <boxGeometry args={[0.72, 0.05, 0.22]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.85} />
      </mesh>
      <Door x={-0.25} z={0.305} color={style.roof} />
      <WindowStrip width={0.3} y={bodyH * 0.64} z={0.302} height={0.065} color={style.glow} />
      <Awning y={0.36} z={0.35} width={0.36} color={style.accent} />
      <mesh position={[-0.42, 0.145, 0.22]}>
        <boxGeometry args={[0.26, 0.025, 0.18]} />
        <meshStandardMaterial color="#3e8e92" emissive={DUSK.water} emissiveIntensity={0.38} roughness={0.25} metalness={0.1} />
      </mesh>
      <mesh position={[-0.42, 0.16, 0.22]}>
        <boxGeometry args={[0.3, 0.02, 0.22]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
      </mesh>
      <mesh position={[-0.54, 0.21, 0.22]} rotation={[0, 0, -0.16]}>
        <boxGeometry args={[0.07, 0.16, 0.012]} />
        <meshStandardMaterial color="#dfdfd3" roughness={0.35} metalness={0.45} />
      </mesh>
      <mesh position={[-0.3, 0.2, 0.3]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.12, 0.035, 0.08]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.88} />
      </mesh>
      {floors >= 2 && (
        <group>
          <mesh position={[-0.31, 0.23, -0.17]} castShadow>
            <boxGeometry args={[0.22, 0.44, 0.36]} />
            <meshStandardMaterial color={style.wall} roughness={0.9} />
          </mesh>
          <mesh position={[-0.31, 0.46, -0.17]}>
            <boxGeometry args={[0.28, 0.035, 0.42]} />
            <meshStandardMaterial color={style.accent} roughness={0.8} />
          </mesh>
        </group>
      )}
      <mesh position={[0.11, bodyH + 0.3, 0.21]} rotation={[0, 0.15, 0]}>
        <boxGeometry args={[0.012, 0.4, 0.012]} />
        <meshStandardMaterial color={style.roof} roughness={0.7} />
      </mesh>
      <Palm position={[0.16, bodyH + 0.5, 0.21]} scale={0.7} />
      <mesh position={[0.51, 0.07, 0.31]} castShadow>
        <icosahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial color={seed % 2 ? '#779078' : '#889c87'} roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function Palm({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation={[0, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.018, 0.04, 0.5, 5]} />
        <meshStandardMaterial color={DUSK.trunk} roughness={1} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[Math.sin(i * 1.45) * 0.17, 0.25, Math.cos(i * 1.45) * 0.17]} rotation={[0, i * 1.45, Math.PI / 2.4]} castShadow>
          <coneGeometry args={[0.07, 0.42, 3]} />
          <meshStandardMaterial color={i % 2 ? '#6c846a' : '#7c9579'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Wedge({ w, h, d, color, position }: { w: number; h: number; d: number; color: string; position: Vec3 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, h);
    shape.closePath();
    const next = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
    next.translate(0, 0, -d / 2);
    return next;
  }, [w, h, d]);
  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} flatShading />
    </mesh>
  );
}

function WindTurbine({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  const rotor = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rotor.current) rotor.current.rotation.z += dt * 0.35;
  });
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.045, 1.1, 5]} />
        <meshStandardMaterial color="#84908a" roughness={0.55} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <boxGeometry args={[0.08, 0.1, 0.16]} />
        <meshStandardMaterial color="#a8b1a6" roughness={0.4} metalness={0.5} />
      </mesh>
      <group ref={rotor} position={[0, 1.12, 0.09]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI * 2) / 3]} position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.035, 0.55, 0.012]} />
            <meshStandardMaterial color="#b9c2b7" roughness={0.45} metalness={0.15} transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function IndustryProperty({ level, style, seed }: { level: number; style: DistrictStyle; seed: number }) {
  const floors = Math.max(0, Math.min(3, level));
  const height = 0.4 + floors * 0.16;
  const width = 0.84 + floors * 0.018;
  return (
    <group>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.68]} />
        <meshStandardMaterial color={style.wall} roughness={0.94} />
      </mesh>
      <mesh position={[0, height - 0.025, 0]} castShadow>
        <boxGeometry args={[width + 0.014, 0.04, 0.7]} />
        <meshStandardMaterial color={style.accent} roughness={0.82} />
      </mesh>
      <Wedge w={width * 0.42} h={0.2} d={0.62} color={style.roof} position={[-width * 0.23, height, 0]} />
      <Wedge w={width * 0.42} h={0.2} d={0.62} color={style.roof} position={[width * 0.23, height, 0]} />
      <mesh position={[0, 0.13, 0.355]}>
        <boxGeometry args={[width * 0.72, 0.22, 0.025]} />
        <meshStandardMaterial color="#2f2b22" emissive={style.glow} emissiveIntensity={0.75} roughness={0.35} toneMapped={false} />
      </mesh>
      <Door x={width / 2 - 0.1} z={0.37} color={style.roof} />
      {Array.from({ length: floors + 1 }, (_, i) => (
        <WindowStrip key={i} width={width * 0.56} y={0.44 + i * 0.18} z={0.348} height={0.045} color={style.glow} intensity={0.92} />
      ))}
      {floors >= 1 && (
        <group position={[-0.44, 0, -0.12]}>
          <mesh position={[0, 0.43, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.15, 0.58, 7]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.84} />
          </mesh>
          <mesh position={[0, 0.74, 0]} castShadow>
            <coneGeometry args={[0.15, 0.2, 7]} />
            <meshStandardMaterial color={style.roof} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.42, 0.13]}>
            <boxGeometry args={[0.045, 0.2, 0.02]} />
            <meshStandardMaterial color={style.accent} emissive={style.accent} emissiveIntensity={0.45} toneMapped={false} />
          </mesh>
        </group>
      )}
      {floors >= 2 && <WindTurbine position={[0.46, 0.02, -0.3]} scale={0.6} />}
      {floors >= 3 && (
        <group position={[0.28, height + 0.04, 0.16]} rotation={[0.1, 0.35, -0.05]}>
          <mesh castShadow>
            <boxGeometry args={[0.3, 0.025, 0.18]} />
            <meshStandardMaterial color="#2b4548" roughness={0.32} metalness={0.2} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-0.1 + i * 0.1, 0.017, 0]}>
              <boxGeometry args={[0.004, 0.004, 0.17]} />
              <meshStandardMaterial color="#6eaaa6" emissive="#6eaaa6" emissiveIntensity={0.25} />
            </mesh>
          ))}
        </group>
      )}
      {[-0.22, 0.16].map((x) => (
        <group key={`vent-${x}`} position={[x, height + 0.05, -0.08]}>
          <mesh castShadow>
            <boxGeometry args={[0.11, 0.08, 0.11]} />
            <meshStandardMaterial color="#697063" roughness={0.62} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.02, 7]} />
            <meshStandardMaterial color="#333d36" roughness={0.45} />
          </mesh>
        </group>
      ))}
      <mesh position={[width / 2 + 0.006, height * 0.55, -0.02]}>
        <boxGeometry args={[0.018, 0.05, 0.2]} />
        <meshStandardMaterial color="#2d2b21" emissive={style.glow} emissiveIntensity={0.95} toneMapped={false} />
      </mesh>
      <mesh position={[0.38, 0.17, 0.352]} castShadow>
        <boxGeometry args={[0.22, 0.3, 0.02]} />
        <meshStandardMaterial color="#343a31" roughness={0.74} metalness={0.2} />
      </mesh>
      {[0.07, 0.13, 0.19, 0.25].map((y) => (
        <mesh key={`slat-${y}`} position={[0.38, y, 0.366]}>
          <boxGeometry args={[0.19, 0.01, 0.009]} />
          <meshStandardMaterial color="#7e8475" roughness={0.7} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[0.5, 0.16, 0.28]} castShadow>
        <boxGeometry args={[0.2, 0.14, 0.16]} />
        <meshStandardMaterial color={style.wallAlt} roughness={0.92} />
      </mesh>
      {seed % 2 === 0 && <Tree position={[-0.54, 0.02, 0.3]} scale={0.45} tone={seed} />}
      <mesh position={[0.2, 0.05, 0.3]}>
        <cylinderGeometry args={[0.04, 0.045, 0.1, 6]} />
        <meshStandardMaterial color={style.trim} roughness={0.7} />
      </mesh>
    </group>
  );
}

function shadeColor(hex: string, amount: number) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0.06, 0.94));
  return `#${color.getHexString()}`;
}

function GinkgoTree({ position, scale = 1, spin = 0 }: { position: Vec3; scale?: number; spin?: number }) {
  return (
    <group position={position} scale={scale} rotation={[0, spin, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.028, 0.055, 0.6, 5]} />
        <meshStandardMaterial color={DUSK.trunk} roughness={1} />
      </mesh>
      <mesh position={[0, 0.67, 0]} rotation={[0, 0.2, 0]} castShadow>
        <icosahedronGeometry args={[0.23, 0]} />
        <meshStandardMaterial color="#b4a14f" roughness={1} flatShading />
      </mesh>
      <mesh position={[0.12, 0.83, 0.04]} castShadow>
        <icosahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#d0b967" roughness={1} flatShading />
      </mesh>
      <mesh position={[-0.12, 0.78, -0.04]} castShadow>
        <icosahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#93853f" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function Pond({ position, w = 0.36, d = 0.24 }: { position: Vec3; w?: number; d?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.025, 0]} receiveShadow>
        <boxGeometry args={[w + 0.12, 0.05, d + 0.12]} />
        <meshStandardMaterial color="#8e8877" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.052, 0]}>
        <boxGeometry args={[w, 0.02, d]} />
        <meshStandardMaterial color="#4a9692" emissive="#3d7f7d" emissiveIntensity={0.25} roughness={0.25} />
      </mesh>
      <mesh position={[w * 0.2, 0.065, -d * 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.035, 6]} />
        <meshStandardMaterial color="#7aa375" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[-0.35, -0.1, 0.24].map((x, i) => (
        <mesh key={i} position={[x * w, 0.12 + i * 0.015, d * 0.23]} castShadow>
          <cylinderGeometry args={[0.006, 0.009, 0.18 + i * 0.03, 4]} />
          <meshStandardMaterial color="#6d875f" roughness={1} />
        </mesh>
      ))}
      <mesh position={[-w * 0.25, 0.085, 0]} rotation={[0, 0.04, 0]}>
        <boxGeometry args={[w * 0.36, 0.018, 0.08]} />
        <meshStandardMaterial color="#806d52" roughness={0.92} />
      </mesh>
    </group>
  );
}

function Conservatory({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.42, 0.08, 0.32]} />
        <meshStandardMaterial color="#8d8876" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[0.36, 0.24, 0.27]} />
        <meshStandardMaterial color="#9dc8bf" transparent opacity={0.34} roughness={0.18} metalness={0.08} />
      </mesh>
      {[-0.18, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.23, 0.0]}>
          <boxGeometry args={[0.018, 0.31, 0.3]} />
          <meshStandardMaterial color="#41544a" roughness={0.55} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.34, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.29, 0.17, 4]} />
        <meshStandardMaterial color="#8bbcb2" transparent opacity={0.38} roughness={0.16} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.445, 0]}>
        <octahedronGeometry args={[0.035, 0]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.07, 0.18]}>
        <boxGeometry args={[0.09, 0.11, 0.02]} />
        <meshStandardMaterial color="#d7b568" emissive={DUSK.window} emissiveIntensity={0.75} toneMapped={false} />
      </mesh>
    </group>
  );
}

function WaterTower({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {[-0.11, 0.11].flatMap((x) => [-0.1, 0.1].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.17, z]} castShadow>
          <boxGeometry args={[0.018, 0.35, 0.018]} />
          <meshStandardMaterial color="#49534a" roughness={0.7} metalness={0.2} />
        </mesh>
      )))}
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.26, 8]} />
        <meshStandardMaterial color="#6a6e60" roughness={0.82} metalness={0.12} />
      </mesh>
      {[0.35, 0.54].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <torusGeometry args={[0.153, 0.008, 4, 8]} />
          <meshStandardMaterial color="#3c473e" roughness={0.6} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, 0.61, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.17, 0.13, 8]} />
        <meshStandardMaterial color={DUSK.brassDark} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.012, 0.35, 0.012]} />
        <meshStandardMaterial color="#4d5548" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

function ClockFace({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.025, 12]} />
        <meshStandardMaterial color="#f3e5ca" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <torusGeometry args={[0.11, 0.012, 4, 12]} />
        <meshStandardMaterial color={DUSK.brassDark} metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.027, 0.028]}>
        <boxGeometry args={[0.008, 0.06, 0.008]} />
        <meshStandardMaterial color="#26342b" roughness={0.7} />
      </mesh>
      <mesh position={[0.028, 0, 0.029]}>
        <boxGeometry args={[0.055, 0.008, 0.008]} />
        <meshStandardMaterial color="#26342b" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.033]}>
        <cylinderGeometry args={[0.013, 0.013, 0.01, 8]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

function ClockTower({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[0.28, 0.08, 0.28]} />
        <meshStandardMaterial color="#7c7665" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <boxGeometry args={[0.18, 0.58, 0.18]} />
        <meshStandardMaterial color="#d1c3a7" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <boxGeometry args={[0.25, 0.045, 0.25]} />
        <meshStandardMaterial color={DUSK.brassDark} roughness={0.7} />
      </mesh>
      <ClockFace position={[0, 0.79, 0.1]} scale={0.7} />
      <PyramidRoof w={0.3} d={0.3} h={0.16} color="#53665a" y={0.82} />
    </group>
  );
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 0.18 : 0.075;
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
}

function StarEmblem({ position, scale = 1, color = '#d6a955' }: { position: Vec3; scale?: number; color?: string }) {
  const geometry = useMemo(starGeometry, []);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0, -0.018]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.035]} />
        <meshStandardMaterial color="#27352d" roughness={0.8} />
      </mesh>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} metalness={0.32} roughness={0.35} />
      </mesh>
      {[[-0.22, 0.22], [0.22, 0.22], [-0.22, -0.22], [0.22, -0.22]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.015]}>
          <sphereGeometry args={[0.015, 5, 4]} />
          <meshStandardMaterial color="#f7d7a0" emissive="#f7d7a0" emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Marquee({ position, color = '#e0b665' }: { position: Vec3; color?: string }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]} rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[0.76, 0.055, 0.3]} />
        <meshStandardMaterial color="#28342d" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.035, 0]}>
        <boxGeometry args={[0.64, 0.012, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.5} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-0.3 + i * 0.1, -0.03, 0.15]}>
          <sphereGeometry args={[0.016, 6, 4]} />
          <meshStandardMaterial color="#ffe1a6" emissive="#ffe1a6" emissiveIntensity={2.1} toneMapped={false} />
        </mesh>
      ))}
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, -0.18, 0.05]}>
          <cylinderGeometry args={[0.012, 0.018, 0.34, 5]} />
          <meshStandardMaterial color="#38473d" metalness={0.25} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function HangingSign({ position, accent, board = '#354636' }: { position: Vec3; accent: string; board?: string }) {
  return (
    <group position={position}>
      <mesh position={[-0.09, 0.07, 0]}>
        <boxGeometry args={[0.2, 0.022, 0.025]} />
        <meshStandardMaterial color={DUSK.brassDark} metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.045, 0.26, 0.22]} />
        <meshStandardMaterial color={board} roughness={0.75} />
      </mesh>
      <mesh position={[0.028, 0.02, 0.02]}>
        <boxGeometry args={[0.008, 0.13, 0.13]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.3} roughness={0.6} />
      </mesh>
    </group>
  );
}

function PoolDeck({ position, scale = 1, accent }: { position: Vec3; scale?: number; accent: string }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <boxGeometry args={[0.5, 0.06, 0.31]} />
        <meshStandardMaterial color="#b4aa95" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.066, 0]}>
        <boxGeometry args={[0.42, 0.018, 0.24]} />
        <meshStandardMaterial color="#62b1b0" emissive="#55a5a5" emissiveIntensity={0.25} roughness={0.2} metalness={0.08} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x, 0.2, -0.08]}>
          <cylinderGeometry args={[0.008, 0.012, 0.38, 5]} />
          <meshStandardMaterial color="#45574b" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.22, 0.4, -0.08]} rotation={[0, 0, 0.1]} castShadow>
        <coneGeometry args={[0.15, 0.16, 6]} />
        <meshStandardMaterial color={accent} roughness={0.8} />
      </mesh>
      <mesh position={[0.24, 0.33, 0.02]}>
        <boxGeometry args={[0.12, 0.1, 0.18]} />
        <meshStandardMaterial color={accent} roughness={0.85} />
      </mesh>
    </group>
  );
}

function Palapa({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {[-0.1, 0.1].flatMap((x) => [-0.07, 0.07].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.16, z]}>
          <cylinderGeometry args={[0.009, 0.014, 0.32, 4]} />
          <meshStandardMaterial color="#6b543b" roughness={1} />
        </mesh>
      )))}
      <mesh position={[0, 0.38, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[0.23, 0.12, 4]} />
        <meshStandardMaterial color="#b28d54" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 0.44, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.12, 0.08, 4]} />
        <meshStandardMaterial color="#c7a267" roughness={1} flatShading />
      </mesh>
    </group>
  );
}

function SolarPanel({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale} rotation={[0, 0.22, 0]}>
      <mesh position={[0, 0.1, 0]} rotation={[-0.28, 0, 0]} castShadow>
        <boxGeometry args={[0.34, 0.015, 0.22]} />
        <meshStandardMaterial color="#33575c" roughness={0.3} metalness={0.2} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.08 + i * 0.08, 0.11, 0]} rotation={[-0.28, 0, 0]}>
          <boxGeometry args={[0.004, 0.003, 0.2]} />
          <meshStandardMaterial color="#7caeb0" />
        </mesh>
      ))}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.22, 0.06, 0.035]} />
        <meshStandardMaterial color="#5a665c" roughness={0.7} />
      </mesh>
    </group>
  );
}

function SatelliteDish({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.012, 0.02, 0.36, 5]} />
        <meshStandardMaterial color="#66746a" roughness={0.55} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.39, 0]} rotation={[0.8, 0.2, 0.2]}>
        <coneGeometry args={[0.13, 0.055, 8, 1, true]} />
        <meshStandardMaterial color="#b3bcb2" roughness={0.35} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[0.8, 0.2, 0.2]}>
        <cylinderGeometry args={[0.008, 0.008, 0.18, 4]} />
        <meshStandardMaterial color="#4c5d50" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <sphereGeometry args={[0.018, 5, 4]} />
        <meshStandardMaterial color="#d9b46d" emissive="#d9b46d" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function MiniTruck({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.11, 0]} castShadow>
        <boxGeometry args={[0.2, 0.12, 0.3]} />
        <meshStandardMaterial color="#63795f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.19, 0.12]} castShadow>
        <boxGeometry args={[0.19, 0.1, 0.1]} />
        <meshStandardMaterial color="#50624f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.2, 0.175]}>
        <boxGeometry args={[0.15, 0.04, 0.012]} />
        <meshStandardMaterial color="#24342d" emissive="#e6b86c" emissiveIntensity={0.35} roughness={0.35} />
      </mesh>
      {[-0.07, 0.07].flatMap((x) => [-0.1, 0.1].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.045, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 6]} />
          <meshStandardMaterial color="#1e2822" roughness={0.9} />
        </mesh>
      )))}
    </group>
  );
}

function FlagPole({ position, color, scale = 1 }: { position: Vec3; color: string; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.01, 0.016, 0.6, 5]} />
        <meshStandardMaterial color="#7b725f" roughness={0.55} metalness={0.25} />
      </mesh>
      <mesh position={[0.1, 0.49, 0]} rotation={[0, 0, -0.12]} castShadow>
        <boxGeometry args={[0.2, 0.12, 0.012]} />
        <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.61, 0]} rotation={[0, 0, Math.PI / 4]}>
        <octahedronGeometry args={[0.025, 0]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Obelisk({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.3, 0.1, 0.3]} />
        <meshStandardMaterial color="#928a78" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.22, 0.06, 0.22]} />
        <meshStandardMaterial color="#b2a78f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.095, 0.55, 4]} />
        <meshStandardMaterial color="#cfc2a6" roughness={0.82} flatShading />
      </mesh>
      <mesh position={[0, 0.72, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.07, 0.12, 4]} />
        <meshStandardMaterial color={DUSK.brass} emissive={DUSK.brass} emissiveIntensity={0.2} metalness={0.35} roughness={0.35} />
      </mesh>
    </group>
  );
}

function LandmarkSignature({ tile, level, style }: { tile: Tile; level: number; style: DistrictStyle }) {
  const accent = style.accent;
  const trim = style.trim;
  const commercialTop = 0.55 + level * 0.28 + (level >= 1 ? 0.31 : 0) + (level >= 2 ? 0.24 : 0) + (level >= 3 ? 0.22 : 0);
  let signature: React.ReactNode = null;
  switch (tile.id) {
    case 1:
      signature = (
        <group>
          {[-0.43, 0.43].map((x) => (
            <mesh key={x} position={[x, 0.13, 0.48]} castShadow>
              <boxGeometry args={[0.28, 0.22, 0.055]} />
              <meshStandardMaterial color={style.wallAlt} roughness={0.92} />
            </mesh>
          ))}
          {[-0.55, 0.55].map((x) => (
            <mesh key={x} position={[x, 0.18, 0.48]} castShadow>
              <boxGeometry args={[0.08, 0.34, 0.08]} />
              <meshStandardMaterial color={style.trim} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 0.12, 0.56]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.18, 0.36]} />
            <meshStandardMaterial color="#a99b83" roughness={0.92} />
          </mesh>
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[x, 0.32, 0.54]}>
              <boxGeometry args={[0.07, 0.1, 0.07]} />
              <meshStandardMaterial color="#f1c277" emissive="#ffc378" emissiveIntensity={1.6} toneMapped={false} />
            </mesh>
          ))}
          <Tree position={[0.5, 0.02, 0.37]} scale={0.62} tone={1} />
        </group>
      );
      break;
    case 3:
      signature = (
        <group>
          <GinkgoTree position={[0.5, 0.02, 0.35]} scale={0.7} />
          {level >= 1 && <Balcony width={0.5} y={0.65} z={0.32} color={style.wallAlt} rail={style.roof} />}
          <mesh position={[-0.36, 0.12, 0.4]} castShadow>
            <boxGeometry args={[0.46, 0.2, 0.16]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.94} />
          </mesh>
        </group>
      );
      break;
    case 5:
      signature = (
        <group>
          <Pond position={[0.44, 0.01, 0.47]} w={0.34} d={0.2} />
          <mesh position={[-0.54, 0.03, 0.46]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.13, 0.36]} />
            <meshStandardMaterial color="#887d69" roughness={0.94} />
          </mesh>
        </group>
      );
      break;
    case 7:
      signature = (
        <group>
          <Conservatory position={[-0.48, 0.02, 0.47]} scale={0.72} />
          {[-0.33, 0.33].map((x) => (
            <mesh key={x} position={[x, 0.1, 0.52]} castShadow>
              <boxGeometry args={[0.16, 0.1, 0.14]} />
              <meshStandardMaterial color={style.wallAlt} roughness={0.95} />
            </mesh>
          ))}
          <mesh position={[0.12, 0.16, 0.55]}>
            <icosahedronGeometry args={[0.11, 0]} />
            <meshStandardMaterial color={accent} roughness={0.95} flatShading />
          </mesh>
        </group>
      );
      break;
    case 8:
      signature = (
        <group>
          {[-0.38, 0.36].map((x, i) => (
            <HangingSign key={x} position={[x, 0.68 + i * 0.16, 0.32]} accent={i ? trim : accent} board="#33453a" />
          ))}
          {[-0.43, 0.43].map((x) => (
            <mesh key={x} position={[x, 0.34, 0.46]}>
              <cylinderGeometry args={[0.008, 0.012, 0.64, 5]} />
              <meshStandardMaterial color="#4c5649" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0, 0.65, 0.46]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.007, 0.007, 0.84, 4]} />
            <meshStandardMaterial color="#6e6150" roughness={0.6} />
          </mesh>
          {[-0.32, -0.16, 0, 0.16, 0.32].map((x) => (
            <mesh key={x} position={[x, 0.62, 0.46]}>
              <sphereGeometry args={[0.018, 5, 4]} />
              <meshStandardMaterial color="#ffd68a" emissive="#ffd68a" emissiveIntensity={1.8} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
      break;
    case 10:
      signature = (
        <group>
          <WaterTower position={[0.48, 0.02, -0.28]} scale={0.82} />
          {[0.24, 0.45, 0.66, 0.87].map((y, i) => (
            <mesh key={y} position={[-0.47, y, 0.2 + i * 0.035]} rotation={[0, 0.1, 0]} castShadow>
              <boxGeometry args={[0.2, 0.022, 0.06]} />
              <meshStandardMaterial color="#495349" roughness={0.7} metalness={0.15} />
            </mesh>
          ))}
          <mesh position={[0.44, 0.34, 0.24]} castShadow>
            <boxGeometry args={[0.08, 0.58, 0.1]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.94} />
          </mesh>
        </group>
      );
      break;
    case 12:
      signature = (
        <group>
          <Obelisk position={[0.48, 0.02, 0.48]} scale={0.8} />
          <mesh position={[-0.4, 0.12, 0.5]}>
            <boxGeometry args={[0.3, 0.045, 0.14]} />
            <meshStandardMaterial color="#74644d" roughness={0.9} />
          </mesh>
          <mesh position={[-0.4, 0.17, 0.5]}>
            <boxGeometry args={[0.3, 0.08, 0.025]} />
            <meshStandardMaterial color="#74644d" roughness={0.9} />
          </mesh>
          {[-0.64, 0.65].map((x) => (
            <mesh key={x} position={[x, 0.29, 0.58]}>
              <octahedronGeometry args={[0.045, 0]} />
              <meshStandardMaterial color={DUSK.window} emissive={DUSK.window} emissiveIntensity={1.9} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
      break;
    case 13:
      signature = (
        <group>
          <ClockTower position={[0.46, 0.02, 0.5]} scale={0.74} />
          {level >= 1 && <Balcony width={0.56} y={0.72} z={0.32} color={style.wallAlt} rail={style.roof} />}
          <FlagPole position={[-0.43, commercialTop - 0.05, -0.12]} color={accent} scale={0.74} />
        </group>
      );
      break;
    case 15:
      signature = (
        <group>
          <mesh position={[0, commercialTop + 0.29, -0.02]} castShadow>
            <cylinderGeometry args={[0.022, 0.045, 0.94, 5]} />
            <meshStandardMaterial color="#6f7567" roughness={0.44} metalness={0.45} />
          </mesh>
          <mesh position={[0, commercialTop + 0.38, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.018, 4, 12]} />
            <meshStandardMaterial color={DUSK.brass} metalness={0.45} roughness={0.35} />
          </mesh>
          <mesh position={[0, commercialTop + 0.77, -0.02]}>
            <sphereGeometry args={[0.035, 6, 4]} />
            <meshStandardMaterial color="#ffdb9b" emissive="#ffc378" emissiveIntensity={2.6} toneMapped={false} />
          </mesh>
          <mesh position={[0.38, 0.18, 0.46]}>
            <boxGeometry args={[0.4, 0.26, 0.16]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.92} />
          </mesh>
        </group>
      );
      break;
    case 17:
      signature = (
        <group>
          <Marquee position={[0, 0.52, 0.45]} color={accent} />
          <StarEmblem position={[0, 0.9, 0.37]} scale={0.8} color="#e2b15c" />
          <mesh position={[-0.5, 0.48, 0.35]} castShadow>
            <boxGeometry args={[0.08, 0.34, 0.06]} />
            <meshStandardMaterial color="#2c3a31" roughness={0.65} />
          </mesh>
          <mesh position={[-0.5, 0.54, 0.385]}>
            <boxGeometry args={[0.045, 0.22, 0.01]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.6} toneMapped={false} />
          </mesh>
          <mesh position={[0.46, 0.24, 0.42]} rotation={[0, 0.3, 0]}>
            <boxGeometry args={[0.22, 0.05, 0.12]} />
            <meshStandardMaterial color="#9c8462" roughness={0.85} />
          </mesh>
        </group>
      );
      break;
    case 18:
      signature = (
        <group>
          <PoolDeck position={[0.44, 0.02, 0.4]} scale={0.8} accent={accent} />
          <Palapa position={[-0.48, 0.02, 0.43]} scale={0.6} />
          {[-0.28, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.44, 0.34]}>
              <boxGeometry args={[0.12, 0.07, 0.012]} />
              <meshStandardMaterial color="#efd7a7" emissive="#efd7a7" emissiveIntensity={0.7} toneMapped={false} />
            </mesh>
          ))}
        </group>
      );
      break;
    case 20:
      signature = (
        <group>
          <mesh position={[0, 0.64, 0.42]} rotation={[-0.24, 0, 0]} castShadow>
            <boxGeometry args={[0.78, 0.035, 0.32]} />
            <meshStandardMaterial color="#4c554a" roughness={0.65} />
          </mesh>
          {[-0.28, 0.28].map((x) => (
            <mesh key={x} position={[x, 0.36, 0.44]} castShadow>
              <boxGeometry args={[0.022, 0.58, 0.022]} />
              <meshStandardMaterial color="#4f5a4c" roughness={0.6} />
            </mesh>
          ))}
          {[-0.36, 0.36].map((x, i) => (
            <mesh key={x} position={[x, 0.36, 0.34]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.16, 0.42, 0.012]} />
              <meshStandardMaterial color={i ? accent : trim} roughness={0.8} />
            </mesh>
          ))}
        </group>
      );
      break;
    case 21:
      signature = (
        <group>
          <Palapa position={[0.5, 0.02, 0.38]} scale={0.62} />
          <Palapa position={[-0.5, 0.02, 0.46]} scale={0.5} />
          <Pond position={[0.02, 0.01, 0.54]} w={0.3} d={0.15} />
          <mesh position={[-0.32, 0.2, 0.38]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.12, 0.35, 0.03]} />
            <meshStandardMaterial color={trim} roughness={0.9} />
          </mesh>
        </group>
      );
      break;
    case 23:
      signature = (
        <group>
          <mesh position={[0.5, 0.55, -0.24]} castShadow>
            <cylinderGeometry args={[0.06, 0.095, 1.05, 7]} />
            <meshStandardMaterial color="#646a5d" roughness={0.86} />
          </mesh>
          <mesh position={[0.5, 1.09, -0.24]}>
            <cylinderGeometry args={[0.082, 0.07, 0.08, 7]} />
            <meshStandardMaterial color="#3d473d" roughness={0.8} />
          </mesh>
          <mesh position={[0.28, 0.32, 0.2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.035, 0.58, 6]} />
            <meshStandardMaterial color="#8c8b77" roughness={0.62} metalness={0.25} />
          </mesh>
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[x, 0.35, -0.32]}>
              <boxGeometry args={[0.08, 0.22, 0.05]} />
              <meshStandardMaterial color="#44514a" roughness={0.7} />
            </mesh>
          ))}
        </group>
      );
      break;
    case 24:
      signature = (
        <group>
          <WindTurbine position={[-0.52, 0.02, -0.24]} scale={0.44} />
          <SolarPanel position={[0.37, 0.02, 0.46]} scale={0.82} />
          <mesh position={[0.52, 0.13, -0.26]} castShadow>
            <boxGeometry args={[0.18, 0.22, 0.14]} />
            <meshStandardMaterial color="#46584c" roughness={0.74} />
          </mesh>
          <mesh position={[0.52, 0.17, -0.184]}>
            <boxGeometry args={[0.11, 0.045, 0.008]} />
            <meshStandardMaterial color={DUSK.cyan} emissive={DUSK.cyan} emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        </group>
      );
      break;
    case 26:
      signature = (
        <group>
          <mesh position={[0.02, 0.18, 0.36]} castShadow>
            <boxGeometry args={[0.56, 0.3, 0.035]} />
            <meshStandardMaterial color="#454f45" roughness={0.75} />
          </mesh>
          {[0.11, 0.25].map((y) => (
            <mesh key={y} position={[0.02, y, 0.379]}>
              <boxGeometry args={[0.48, 0.012, 0.012]} />
              <meshStandardMaterial color="#6b7465" roughness={0.7} metalness={0.2} />
            </mesh>
          ))}
          <MiniTruck position={[-0.44, 0.02, 0.46]} scale={0.75} />
          <mesh position={[0.56, 0.11, 0.42]} rotation={[0, 0.2, 0]}>
            <boxGeometry args={[0.16, 0.16, 0.13]} />
            <meshStandardMaterial color="#8a714a" roughness={0.92} />
          </mesh>
        </group>
      );
      break;
    case 28:
      signature = (
        <group>
          <mesh position={[-0.5, 0.13, -0.2]}>
            <sphereGeometry args={[0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#8ebfb6" transparent opacity={0.32} roughness={0.2} side={THREE.DoubleSide} />
          </mesh>
          <SatelliteDish position={[0.48, 0.02, -0.3]} scale={0.7} />
          <SolarPanel position={[-0.45, 0.02, 0.46]} scale={0.68} />
          <mesh position={[0.24, 0.08, 0.47]}>
            <boxGeometry args={[0.32, 0.05, 0.16]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
          </mesh>
        </group>
      );
      break;
    case 31:
      signature = (
        <group>
          <mesh position={[0.46, (1.0 + level * 0.18) / 2, -0.08]} castShadow>
            <boxGeometry args={[0.24, 1.0 + level * 0.18, 0.28]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.55} metalness={0.15} />
          </mesh>
          <mesh position={[0.46, 0.48, 0.07]}>
            <boxGeometry args={[0.18, 0.06, 0.02]} />
            <meshStandardMaterial color={DUSK.cyan} emissive={DUSK.cyan} emissiveIntensity={0.8} toneMapped={false} />
          </mesh>
          <mesh position={[0.22, 0.74, -0.08]} castShadow>
            <boxGeometry args={[0.3, 0.1, 0.16]} />
            <meshStandardMaterial color="#68756c" roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0.46, 1.22 + level * 0.18, -0.08]}>
            <boxGeometry args={[0.026, 0.2, 0.026]} />
            <meshStandardMaterial color={DUSK.brass} metalness={0.5} roughness={0.35} />
          </mesh>
        </group>
      );
      break;
    case 34:
      signature = (
        <group>
          <mesh position={[0, 0.58, 0.42]} rotation={[-0.1, 0, 0]} castShadow>
            <boxGeometry args={[0.72, 0.035, 0.25]} />
            <meshStandardMaterial color={style.accent} roughness={0.7} />
          </mesh>
          {[-0.5, 0.5].map((x, i) => (
            <FlagPole key={x} position={[x, 0.03, 0.46]} color={i ? style.accent : style.trim} scale={0.9} />
          ))}
          <mesh position={[0.24, 0.17, 0.48]} castShadow>
            <boxGeometry args={[0.34, 0.24, 0.16]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.9} />
          </mesh>
        </group>
      );
      break;
    case 35:
      signature = (
        <group>
          <mesh position={[-0.28, 0.15, 0.45]} castShadow>
            <boxGeometry args={[0.58, 0.28, 0.18]} />
            <meshStandardMaterial color={style.wallAlt} roughness={0.82} />
          </mesh>
          {[-0.45, -0.28, -0.11].map((x, i) => (
            <mesh key={x} position={[x, 0.22, 0.545]}>
              <boxGeometry args={[0.14, 0.16, 0.012]} />
              <meshStandardMaterial color={i % 2 ? style.accent : trim} roughness={0.75} />
            </mesh>
          ))}
          {[0.1, 0.28, 0.46].map((x) => (
            <mesh key={x} position={[x, 0.27, 0.41]}>
              <boxGeometry args={[0.006, 0.14, 0.006]} />
              <meshStandardMaterial color="#6c6250" roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0.35, 0.36, 0.24]} rotation={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.3, 0.04, 0.2]} />
            <meshStandardMaterial color={style.accent} roughness={0.8} />
          </mesh>
        </group>
      );
      break;
    default:
      signature = null;
  }
  return signature;
}

function Spinner({ children, speed = 0.5, position = [0, 0, 0] }: { children: React.ReactNode; speed?: number; position?: Vec3 }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed;
  });
  return <group ref={ref} position={position}>{children}</group>;
}

function SpecialTile({ tile, style }: { tile: Tile; style: DistrictStyle }) {
  const type = tile.type;
  if(type==='casino')return <CasinoLandmark/>;
  if (hasLandmarkModel(tile.id)) return <LandmarkModel tileId={tile.id} level={0} palette={style} />;
  if (type === 'start') {
    return (
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <circleGeometry args={[0.6, 16]} />
          <meshStandardMaterial color="#2b443a" roughness={0.8} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
          <ringGeometry args={[0.34, 0.43, 16]} />
          <meshStandardMaterial color={DUSK.brass} emissive={DUSK.brass} emissiveIntensity={0.18} roughness={0.45} metalness={0.35} />
        </mesh>
        {[-0.47, 0.47].map((x) => (
          <mesh key={x} position={[x, 0.33, 0.03]} castShadow>
            <boxGeometry args={[0.1, 0.58, 0.1]} />
            <meshStandardMaterial color={style.wall} roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, 0.6, 0.03]} castShadow>
          <torusGeometry args={[0.42, 0.075, 4, 12, Math.PI]} />
          <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.42} flatShading />
        </mesh>
        <mesh position={[0, 0.2, 0.03]} castShadow>
          <cylinderGeometry args={[0.12, 0.18, 0.3, 8]} />
          <meshStandardMaterial color={DUSK.brassDark} roughness={0.55} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.38, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.025, 8]} />
          <meshStandardMaterial color={DUSK.brass} emissive={DUSK.window} emissiveIntensity={0.4} metalness={0.35} roughness={0.4} />
        </mesh>
        {[0.32, 0.4, 0.48].map((x, i) => (
          <mesh key={x} position={[x, 0.08 + i * 0.045, 0.42]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.045, 8]} />
            <meshStandardMaterial color={i % 2 ? '#b88b43' : DUSK.brass} metalness={0.4} roughness={0.35} />
          </mesh>
        ))}
        {[-0.64, 0.64].map((x, i) => (
          <FlagPole key={x} position={[x, 0.02, 0.28]} color={i ? style.accent : style.trim} scale={0.68} />
        ))}
        <mesh position={[0, 0.52, 0.52]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.24, 0.025, 0.025]} />
          <meshStandardMaterial color={DUSK.brass} metalness={0.35} roughness={0.4} />
        </mesh>
        {[-0.09, 0, 0.09].map((x) => (
          <mesh key={x} position={[x, 0.46, 0.52]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[0.05, 0.05, 0.008]} />
            <meshStandardMaterial color={style.accent} roughness={0.7} />
          </mesh>
        ))}
      </group>
    );
  }

  if (type === 'tax') {
    return (
      <group>
        <mesh position={[0, 0.13, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.9, 0.2, 0.72]} />
          <meshStandardMaterial color="#7e7a68" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.38, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.66, 0.44, 0.55]} />
          <meshStandardMaterial color="#5d6256" roughness={0.84} />
        </mesh>
        <mesh position={[0, 0.65, -0.02]} castShadow>
          <boxGeometry args={[0.86, 0.1, 0.7]} />
          <meshStandardMaterial color="#777563" roughness={0.8} />
        </mesh>
        {[-0.18, 0, 0.18].map((x) => (
          <mesh key={x} position={[x, 0.36, 0.255]}>
            <boxGeometry args={[0.045, 0.25, 0.02]} />
            <meshStandardMaterial color="#2b1f17" emissive="#d9875b" emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
        ))}
        <mesh position={[0, 0.16, 0.45]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.18, 0.025, 0.09]} />
          <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.74, 0.18]} rotation={[0, 0, 0.18]}>
          <boxGeometry args={[0.012, 0.34, 0.012]} />
          <meshStandardMaterial color="#302c22" roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.9, 0.18]}>
          <boxGeometry args={[0.26, 0.025, 0.03]} />
          <meshStandardMaterial color={DUSK.brassDark} metalness={0.3} roughness={0.5} />
        </mesh>
        {[-0.12, 0.12].map((x) => (
          <mesh key={x} position={[x, 0.82, 0.18]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.12, 0.13, 0.055]} />
            <meshStandardMaterial color={style.trim} roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0, 0.24, 0.36]} castShadow>
          <boxGeometry args={[0.16, 0.3, 0.035]} />
          <meshStandardMaterial color="#2e3730" roughness={0.72} />
        </mesh>
        {[-0.075, 0.075].map((x) => (
          <mesh key={x} position={[x, 0.24, 0.382]}>
            <boxGeometry args={[0.018, 0.23, 0.008]} />
            <meshStandardMaterial color={DUSK.brass} metalness={0.35} roughness={0.42} />
          </mesh>
        ))}
        <mesh position={[0, 0.41, 0.385]}>
          <boxGeometry args={[0.22, 0.026, 0.02]} />
          <meshStandardMaterial color={DUSK.brassDark} metalness={0.35} roughness={0.4} />
        </mesh>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 0.36, 0.4]}>
            <sphereGeometry args={[0.035, 6, 4]} />
            <meshStandardMaterial color="#ffd398" emissive="#ffcb76" emissiveIntensity={1.8} toneMapped={false} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.14, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.2, 0.7]} />
        <meshStandardMaterial color="#696f65" roughness={0.9} />
      </mesh>
      {[-0.24, 0.24].map((x) => (
        <mesh key={x} position={[x, 0.16, 0.35]}>
          <boxGeometry args={[0.045, 0.035, 0.52]} />
          <meshStandardMaterial color="#3a3c35" metalness={0.45} roughness={0.35} />
        </mesh>
      ))}
      <mesh position={[0, 0.24, 0.02]} castShadow>
        <boxGeometry args={[0.6, 0.22, 0.32]} />
        <meshStandardMaterial color={style.trim} roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.27, 0.185]}>
        <boxGeometry args={[0.42, 0.09, 0.02]} />
        <meshStandardMaterial color="#2a2119" emissive={style.glow} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.07]} castShadow>
          <cylinderGeometry args={[0.022, 0.03, 0.6, 5]} />
          <meshStandardMaterial color="#3b463d" metalness={0.3} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, 0.75, 0.07]} castShadow>
        <boxGeometry args={[0.88, 0.06, 0.42]} />
        <meshStandardMaterial color={style.roof} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.38, 0.32]}>
        <boxGeometry args={[0.08, 0.3, 0.06]} />
        <meshStandardMaterial color={style.accent} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.88, 0.07]}>
        <boxGeometry args={[0.54, 0.035, 0.035]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.35} roughness={0.45} />
      </mesh>
      <group position={[0, 0.2, 0.03]}>
        <mesh position={[0, 0.07, 0]} castShadow>
          <boxGeometry args={[0.54, 0.16, 0.22]} />
          <meshStandardMaterial color={style.accent} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.17, 0.02]}>
          <boxGeometry args={[0.46, 0.04, 0.18]} />
          <meshStandardMaterial color="#4c574c" roughness={0.65} />
        </mesh>
        {[-0.17, 0.17].map((x) => (
          <mesh key={x} position={[x, 0.1, 0.112]}>
            <boxGeometry args={[0.12, 0.055, 0.008]} />
            <meshStandardMaterial color="#ffd493" emissive="#ffc378" emissiveIntensity={1.4} toneMapped={false} />
          </mesh>
        ))}
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.045, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.024, 6]} />
            <meshStandardMaterial color="#1e2822" roughness={0.9} />
          </mesh>
        ))}
      </group>
      {[-0.38, 0.38].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.24]} castShadow>
          <cylinderGeometry args={[0.018, 0.02, 0.5, 5]} />
          <meshStandardMaterial color="#4b5449" roughness={0.6} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, 0.71, 0.24]}>
        <boxGeometry args={[0.8, 0.008, 0.008]} />
        <meshStandardMaterial color="#5c5d4b" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.48, 0.3]}>
        <boxGeometry args={[0.2, 0.16, 0.02]} />
        <meshStandardMaterial color="#2e382f" emissive={style.glow} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0.36, 0.32, 0.3]}>
        <boxGeometry args={[0.08, 0.12, 0.025]} />
        <meshStandardMaterial color="#f1e2c7" roughness={0.9} />
      </mesh>
    </group>
  );
}

function BrassBull({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[0.22, 0.1, 0.14]} />
        <meshStandardMaterial color="#7c7463" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.19, 0]} castShadow>
        <boxGeometry args={[0.16, 0.09, 0.09]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.34} />
      </mesh>
      <mesh position={[0, 0.2, 0.07]}>
        <boxGeometry args={[0.075, 0.075, 0.07]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.34} />
      </mesh>
      {[-0.045, 0.045].map((x) => (
        <mesh key={x} position={[x, 0.24, 0.09]} rotation={[0, 0, x > 0 ? -0.7 : 0.7]}>
          <coneGeometry args={[0.016, 0.09, 3]} />
          <meshStandardMaterial color="#e3bb6d" metalness={0.35} roughness={0.3} />
        </mesh>
      ))}
      {[-0.055, 0.055].flatMap((x) => [-0.03, 0.03].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, 0.1, z]}>
          <boxGeometry args={[0.018, 0.12, 0.018]} />
          <meshStandardMaterial color={DUSK.brass} metalness={0.4} roughness={0.35} />
        </mesh>
      )))}
    </group>
  );
}

function VacantLot({ style }: { style: DistrictStyle }) {
  return (
    <group>
      <mesh position={[0, 0.055, -0.02]} receiveShadow>
        <boxGeometry args={[1.08, 0.08, 0.78]} />
        <meshStandardMaterial color={style.wallAlt} roughness={1} />
      </mesh>
      {[-0.34, 0.34].map((x) => (
        <mesh key={x} position={[x, 0.17, -0.32]} castShadow>
          <boxGeometry args={[0.035, 0.28, 0.035]} />
          <meshStandardMaterial color={DUSK.brassDark} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 0.3, -0.32]}>
        <boxGeometry args={[0.74, 0.025, 0.025]} />
        <meshStandardMaterial color={DUSK.brassDark} roughness={0.7} />
      </mesh>
      <SaleSign accent={style.accent} />
      <mesh position={[0.36, 0.1, 0.28]} castShadow>
        <icosahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color="#707e68" roughness={1} flatShading />
      </mesh>
      <mesh position={[-0.4, 0.06, 0.25]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.22, 0.16]} />
        <meshStandardMaterial color={style.accent} roughness={0.95} />
      </mesh>
    </group>
  );
}

function PropertyBuilding({ tile, level, style, seed, identity, owner, replayToken }: { tile: Tile; level: number; style: DistrictStyle; seed: number; identity:string; owner?:string; replayToken?:number }) {
  const localStyle = useMemo(() => ({
    ...style,
    wall: shadeColor(style.wall, (hash(seed, 4) - 0.5) * 0.07),
    wallAlt: shadeColor(style.wallAlt, (hash(seed, 7) - 0.5) * 0.08),
    roof: shadeColor(style.roof, (hash(seed, 9) - 0.5) * 0.05),
  }), [style, seed]);
  return <group scale={[1.08,1.07,1.08]}><UpgradeableBuilding tileId={tile.id} level={level} palette={localStyle} identity={identity} owner={owner} vacant={<group scale={[1/1.08,1/1.07,1/1.08]}><VacantLot style={style}/></group>} replayToken={replayToken}/></group>;
}

function SelectionFrame({ color = DUSK.brass, emphasis = false }: { color?: string; emphasis?: boolean }) {
  const bars: { position: Vec3; args: Vec3 }[] = [
    { position: [0, 0.188, 0.82], args: [1.76, 0.024, 0.045] },
    { position: [0, 0.188, -0.82], args: [1.76, 0.024, 0.045] },
    { position: [0.82, 0.188, 0], args: [0.045, 0.024, 1.6] },
    { position: [-0.82, 0.188, 0], args: [0.045, 0.024, 1.6] },
  ];
  return (
    <group scale={emphasis ? [1.015, 1, 1.015] : 1}>
      {bars.map((bar, i) => (
        <mesh key={i} position={bar.position}>
          <boxGeometry args={bar.args} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function landmarkTop(tile: Tile, level: number, owned: boolean) {
  if (hasLandmarkModel(tile.id) && (owned || tile.type !== 'property')) return .17 + landmarkModelHeight(tile.id,level) * (tile.type === 'property' ? 1.07 : 1) + .25;
  if (tile.type !== 'property') {
    if (tile.type === 'exchange') return 1.72;
    if (tile.type === 'tax') return 1.52;
    if (tile.type === 'bank') return 1.4;
    if (tile.type === 'start') return 1.38;
    if (tile.type === 'event') return 1.32;
    return 1.26;
  }
  if (!owned) return 1.08;
  const garden = [1, 3, 5, 7].includes(tile.id);
  const coastal = [17, 18, 20, 21].includes(tile.id);
  const industrial = [23, 24, 26, 28, 31].includes(tile.id);
  let height = 1.4;
  if (garden) height = 1.34 + level * 0.2;
  else if (coastal) height = 1.53 + level * 0.28;
  else if (industrial) height = 1.38 + level * 0.25;
  else height = 1.58 + level * 0.3;
  if ([13, 15, 26, 31].includes(tile.id)) height += 0.18;
  return height + (tile.id % 2 ? 0.7 : 0.02);
}

function SelectionPin({ accent, height }: { accent: string; height: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = height + 0.36 + Math.sin(state.clock.elapsedTime * 2.2) * 0.04;
      ref.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });
  return (
    <group ref={ref} position={[0, height + 0.36, 0]}>
      <mesh castShadow>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color={DUSK.brass} emissive={accent} emissiveIntensity={0.45} metalness={0.35} roughness={0.32} flatShading />
      </mesh>
      <mesh position={[0, -0.26, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.4, 5]} />
        <meshStandardMaterial color={DUSK.brass} emissive={DUSK.brass} emissiveIntensity={0.25} metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

function TilePlot({
  tile, property, ownerColor, selected, hovered, setHover, onSelect, mine = false, highlightMine = false, showSelectionMarker = true, buildingIdentity='', upgradeReplay=0,
}: {
  tile: Tile; property?: Property; ownerColor?: string; selected: boolean; hovered: boolean; mine?: boolean; highlightMine?: boolean; showSelectionMarker?: boolean;
  buildingIdentity?:string; upgradeReplay?:number;
  setHover: (id: number | null, pointerType?:string) => void; onSelect: (id: number) => void;
}) {
  const style = styleFor(tile);
  const level = property?.level ?? 0;
  const owned = !!property?.owner;
  const accent = owned ? ownerColor ?? DUSK.brass : style.accent;
  const labelTop = landmarkTop(tile, level, owned);
  const heightGuess = Math.max(0.65, labelTop - 0.42);
  return (
    <group
      position={[tile.x, 0, tile.z]}
      userData={{ tileId: tile.id }}
      onClick={(event) => {
        if(event.delta>5)return;
        event.stopPropagation();
        onSelect(tile.id);
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHover(tile.id,event.pointerType);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={(event) => {
        const next = hoveredTileFromHits(event.intersections);
        setHover(next,event.pointerType);
        document.body.style.cursor = next === null ? 'auto' : 'pointer';
      }}
    >
      {owned && (
        <mesh position={[0, 0.045, 0]} receiveShadow>
          <boxGeometry args={[1.78, 0.07, 1.78]} />
          <meshStandardMaterial color={ownerColor ?? DUSK.brass} roughness={0.65} metalness={0.08} />
        </mesh>
      )}
      <mesh position={[0, 0.105, 0]} receiveShadow>
        <boxGeometry args={[1.7, 0.13, 1.7]} />
        <meshStandardMaterial color={hovered || selected ? '#e1d5ba' : style.pad} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.171, -0.79]} receiveShadow>
        <boxGeometry args={[1.44, 0.018, 0.055]} />
        <meshStandardMaterial color={accent} roughness={0.74} />
      </mesh>
      <group rotation={[0, outwardRotation(tile.id), 0]}>
        <PlotDetails tileId={tile.id} vacant={tile.type==='property'&&!owned}/>
        <mesh position={[0, 0.173, 0.79]} receiveShadow>
          <boxGeometry args={[1.4, 0.018, 0.055]} />
          <meshStandardMaterial color={accent} roughness={0.7} />
        </mesh>
        <group position={[0, 0.17, -0.1]}>
          {tile.type === 'property' ? (
            <PropertyBuilding tile={tile} level={owned?level:-1} style={style} seed={tile.id} identity={buildingIdentity} owner={property?.owner??undefined} replayToken={upgradeReplay}/>
          ) : (
            <SpecialTile tile={tile} style={style} />
          )}
        </group>
        {owned && <OwnerFlag color={ownerColor ?? DUSK.brass} />}
        {owned && <SelectionFrame color={accent} emphasis={mine && highlightMine} />}
        {(hovered || selected) && <SelectionFrame />}
        {mine && highlightMine && !selected && <SelectionPin accent={accent} height={heightGuess} />}
        {selected && showSelectionMarker && <SelectionPin accent={accent} height={heightGuess} />}
      </group>
    </group>
  );
}

function BuildingLabels({ state, selected, hovered, onSelect, setHover, labelMode = 'smart', viewerId, highlightMine = false }: Pick<BoardProps, 'state' | 'selected' | 'labelMode' | 'viewerId' | 'highlightMine' | 'onSelect'> & { hovered: number | null; setHover: (id: number | null, pointerType?:string) => void }) {
  const sprites = useRef(new Map<number, THREE.Sprite>());
  const spriteRefs = useMemo(() => TILES.map(tile => (sprite: THREE.Sprite | null) => {
    if (sprite) { sprite.visible = false; sprites.current.set(tile.id, sprite); }
    else sprites.current.delete(tile.id);
  }), []);
  const elapsed = useRef(0);
  const world = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const view = useMemo(() => new THREE.Vector3(), []);
  const active = state?.players[state.turn];
  // 精简模式只保留两个地名：当前玩家所在格 + 鼠标悬浮格。
  const wantedRef = useRef<Set<number>>(new Set());
  wantedRef.current = new Set<number>([...(hovered === null ? [] : [hovered]), ...(active ? [active.position] : [])]);
  const entries = TILES.map(tile => {
    const property = state?.properties.find(p => p.tileId === tile.id);
    const owner = state?.players.find(p => p.id === property?.owner);
    const demoOwned = !state && tile.id % 3 === 0;
    const mine = !!viewerId && property?.owner === viewerId;
    const priority = tile.id === selected ? 300 : tile.id === hovered ? 250 : mine && highlightMine ? 180 : tile.id === state?.pendingTile ? 160 : tile.id === active?.position ? 140 : 0;
    return { tile, mine, priority, accent: owner?.color ?? styleFor(tile).accent, top: landmarkTop(tile, property?.level ?? (demoOwned ? tile.id % 3 : 0), !!property?.owner || demoOwned) };
  });
  useFrame(({ camera, size, gl }, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 0.08) return;
    elapsed.current = 0;
    const candidates: LabelCandidate[] = [];
    const perspective = camera as THREE.PerspectiveCamera;
    for (const entry of entries) {
      const sprite = sprites.current.get(entry.tile.id);
      if (!sprite) continue;
      sprite.visible = false;
      world.set(entry.tile.x, entry.top, entry.tile.z);
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      projected.copy(world).project(camera);
      if (view.z >= 0 || projected.z < -1 || projected.z > 1) continue;
      if (labelMode === 'all') {
        sprite.visible = true;
        sprite.scale.set(2.5, 2.5 * LABEL_ASPECT, 1);
        continue;
      }
      if (!wantedRef.current.has(entry.tile.id)) continue;
      const width = entry.priority >= 140 ? ACTIVE_LABEL_WIDTH : LABEL_WIDTH;
      const height = width * LABEL_ASPECT;
      // Reserve the highlighted footprint so hover cannot change clipping or
      // overlap eligibility and hide the very label being pointed at.
      const reservedWidth = ACTIVE_LABEL_WIDTH, reservedHeight = reservedWidth * LABEL_ASPECT;
      const x = (projected.x + 1) * size.width / 2, y = (1 - projected.y) * size.height / 2;
      if (x < reservedWidth / 2 + 6 || x > size.width - reservedWidth / 2 - 6 || y < reservedHeight / 2 + 8 || y > size.height - reservedHeight / 2 - 8) continue;
      // Pixel-sized billboards remain legible at both overview and close range.
      const unit = 2 * -view.z * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) / size.height;
      sprite.scale.set(width * unit, height * unit, 1);
      candidates.push({ id: entry.tile.id, x, y, width: reservedWidth, height: reservedHeight, priority: entry.priority, distance: world.distanceTo(camera.position), centrality: projected.x ** 2 + projected.y ** 2 });
    }
    if (labelMode !== 'all') {
      for (const id of chooseLabels(candidates, 2)) sprites.current.get(id)!.visible = true;
    }
    gl.domElement.dataset.hoveredTile = hovered === null ? '' : String(hovered);
    gl.domElement.dataset.labelLayout = JSON.stringify(entries.flatMap(entry => {
      const sprite = sprites.current.get(entry.tile.id);
      if (!sprite?.visible) return [];
      world.set(entry.tile.x, entry.top, entry.tile.z);
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      projected.copy(world).project(camera);
      const unit = 2 * -view.z * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) / size.height;
      return [{ id: entry.tile.id, x: (projected.x + 1) * size.width / 2, y: (1 - projected.y) * size.height / 2, width: sprite.scale.x / unit, height: sprite.scale.y / unit }];
    }));
  });
  return <>{entries.map(entry => <group key={entry.tile.id} position={[entry.tile.x, 0, entry.tile.z]} userData={{ tileId: entry.tile.id }} onClick={event => { if(event.delta>5)return;event.stopPropagation(); onSelect(entry.tile.id); }} onPointerOver={event => { event.stopPropagation(); setHover(entry.tile.id,event.pointerType); document.body.style.cursor = 'pointer'; }} onPointerOut={event => { const next = hoveredTileFromHits(event.intersections); setHover(next,event.pointerType); document.body.style.cursor = next === null ? 'auto' : 'pointer'; }}><LandmarkTag name={entry.tile.name} accent={entry.accent} active={entry.priority >= 140} y={entry.top} spriteRef={spriteRefs[entry.tile.id]}/></group>)}</>;
}

type Drive = { playerId: string; points: RoadPoint[]; segment: number; progress: number; origin: number; destination: number };
type Traffic = { queue: Drive[]; pawns: Map<string, THREE.Group> };

function TrafficMetrics({ traffic }: { traffic: Traffic }) {
  const elapsed = useRef(0);
  useFrame(({ gl }, dt) => {
    elapsed.current += dt;
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    gl.domElement.dataset.pawnPositions = JSON.stringify([...traffic.pawns.values()].map(pawn => [Number(pawn.position.x.toFixed(3)), Number(pawn.position.z.toFixed(3))]));
    gl.domElement.dataset.movingPawn = traffic.queue[0]?.playerId ?? '';
    gl.domElement.dataset.queuedMoves = String(traffic.queue.length);
    gl.domElement.dataset.playerSkins=JSON.stringify([...traffic.pawns.values()].map(pawn=>({id:pawn.userData.playerId,skin:pawn.userData.skin})));
    // Preserve the existing scene diagnostics consumed by older review scripts.
    gl.domElement.dataset.carPositions=gl.domElement.dataset.pawnPositions;gl.domElement.dataset.movingCars=gl.domElement.dataset.movingPawn;
  });
  return null;
}

function PlayerPawn({ player, index, active, mine, traffic, onArrive }: { player: Player; index: number; active: boolean; mine: boolean; traffic: Traffic; onArrive: (tile: number) => void }) {
  const ref = useRef<THREE.Group>(null),visual=useRef<THREE.Group>(null);
  const clock=useCityClock(),skin=characterFor(player.skin,index).id;
  const spawn = useMemo(() => {
    const pose = parkingPose(player.position, index);
    return { position: [pose.parked[0], 0.055, pose.parked[1]] as Vec3, rotation: [0, pose.yaw, 0] as Vec3 };
  }, [player.id, index]);
  const initial = useRef(true);
  const lastRoute = useRef<string | null>(null);
  const routeKey = `${player.position}:${player.path.join(',')}`;
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  useEffect(() => {
    if (lastRoute.current === routeKey) return;
    lastRoute.current = routeKey;
    if (initial.current) {
      const pose = parkingPose(player.position, index);
      ref.current?.position.set(pose.parked[0], 0.055, pose.parked[1]);
      if (ref.current) ref.current.rotation.y = pose.yaw;
      initial.current = false;
    } else if (player.path.length > 1) {
      traffic.queue.push({ playerId: player.id, points: pawnRoute(player.path, index), segment: 0, progress: 0, origin: player.path[0], destination: player.position });
    }
  }, [routeKey, index, player.id, traffic]);
  useEffect(() => {
    if (ref.current) traffic.pawns.set(player.id, ref.current);
    return () => { traffic.queue = traffic.queue.filter(drive => drive.playerId !== player.id); traffic.pawns.delete(player.id); };
  }, [traffic, player.id]);
  useFrame((_, dt) => {
    const drive = traffic.queue[0], pawn = ref.current;
    const moving=drive?.playerId===player.id;
    if(visual.current){visual.current.position.y=clock.enabled?(moving?Math.abs(Math.sin(clock.time*18))*.026:Math.sin(clock.time*2+index)*.003):0;visual.current.rotation.z=clock.enabled&&moving?Math.sin(clock.time*18)*.018:0;}
    if (!pawn || !drive || !moving) return;
    let remaining = Math.min(dt, 0.08) * 8;
    while (remaining > 0 && drive.segment < drive.points.length - 1) {
      const a = drive.points[drive.segment], b = drive.points[drive.segment + 1];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const step = Math.min(remaining, length - drive.progress);
      drive.progress += step;
      remaining -= step;
      const f = length ? drive.progress / length : 1;
      pawn.position.set(THREE.MathUtils.lerp(a[0], b[0], f), 0.055, THREE.MathUtils.lerp(a[1], b[1], f));
      pawn.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      if (drive.progress >= length - 0.00001) { drive.segment++; drive.progress = 0; }
    }
    if (drive.segment === drive.points.length - 1) {
      pawn.rotation.y = parkingPose(drive.destination, index).yaw;
      traffic.queue.shift();
      arrive.current(drive.destination);
    }
  });
  return (
    <group ref={ref} position={spawn.position} rotation={spawn.rotation} name={`player-pawn-${player.id}`} userData={{skin,playerId:player.id}}>
      {(active || mine) && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]}>
        <ringGeometry args={[PAWN_RADIUS+.015, active ? PAWN_RADIUS+.065 : PAWN_RADIUS+.04, 32]} />
        <meshBasicMaterial color={player.color} transparent opacity={active ? 0.8 : 0.4} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>}
      <group ref={visual}><group scale={PAWN_SCALE}><CharacterModel skin={skin} color={player.color}/></group></group>
    </group>
  );
}

function RoadMarkings() {
  const dashes: { position: Vec3; rotation: number }[] = [];
  for (let i = -4; i <= 4; i++) {
    dashes.push({ position: [i * 2.05, 0.053, 9.64], rotation: 0 });
    dashes.push({ position: [i * 2.05, 0.053, -9.64], rotation: 0 });
    if (i !== 0) {
      dashes.push({ position: [9.64, 0.053, i * 2.05], rotation: Math.PI / 2 });
      dashes.push({ position: [-9.64, 0.053, i * 2.05], rotation: Math.PI / 2 });
    }
  }
  return (
    <group>
      {dashes.map((dash, i) => (
        <mesh key={i} position={dash.position} rotation={[0, dash.rotation, 0]}>
          <boxGeometry args={[0.78, 0.014, 0.048]} />
          <meshStandardMaterial color="#d0b77e" emissive="#c9a45d" emissiveIntensity={0.12} roughness={0.75} />
        </mesh>
      ))}
      {[0, 1, 2, 3].flatMap(side => {
        const gap = 5;
        const normal = [[0, 1], [1, 0], [0, -1], [-1, 0]][side];
        const tangent = [normal[1], -normal[0]];
        return [[-9.35, gap - 0.17], [gap + 0.17, 9.35]].map(([a, b], i) => (
        <mesh key={`curb-${side}-${i}`} position={[normal[0] * 8.86 + tangent[0] * (a + b) / 2, 0.055, normal[1] * 8.86 + tangent[1] * (a + b) / 2]} rotation={[0, side * Math.PI / 2, 0]}>
          <boxGeometry args={[b - a, 0.055, 0.09]} />
          <meshStandardMaterial color="#817b68" roughness={0.92} />
        </mesh>
        ));
      })}
    </group>
  );
}

function BoardBase() {
  return (
    <group>
      <mesh position={[0, -0.36, 0]} receiveShadow castShadow>
        <boxGeometry args={[22.8, 0.56, 22.8]} />
        <meshStandardMaterial color={DUSK.base} roughness={0.63} metalness={0.12} />
      </mesh>
      <mesh position={[0, -0.072, 0]} receiveShadow>
        <boxGeometry args={[22.35, 0.05, 22.35]} />
        <meshStandardMaterial color={DUSK.rim} roughness={0.38} metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[22.05, 0.08, 22.05]} />
        <meshStandardMaterial color={DUSK.asphalt} roughness={0.92} />
      </mesh>
      {[
        { position: [0, 0.036, 10.84], args: [21.55, 0.028, 0.035] },
        { position: [0, 0.036, -10.84], args: [21.55, 0.028, 0.035] },
        { position: [10.84, 0.036, 0], args: [0.035, 0.028, 21.55] },
        { position: [-10.84, 0.036, 0], args: [0.035, 0.028, 21.55] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.position as Vec3}>
          <boxGeometry args={edge.args as Vec3} />
          <meshStandardMaterial color={DUSK.brass} metalness={0.5} roughness={0.32} />
        </mesh>
      ))}
    </group>
  );
}

function RoadRing() {
  const shape = useMemo(() => {
    const outer = 10.48;
    const inner = 8.9;
    const s = new THREE.Shape();
    s.moveTo(-outer, -outer);
    s.lineTo(outer, -outer);
    s.lineTo(outer, outer);
    s.lineTo(-outer, outer);
    s.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner);
    hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, -inner);
    hole.closePath();
    s.holes.push(hole);
    return s;
  }, []);
  return (
    <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#182824" roughness={0.94} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
  );
}


function LanePlanter({ position, tone }: { position: Vec3; tone: number }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.052, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.24, 0.09, 0.62]} />
        <meshStandardMaterial color="#8c806a" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.101, 0]}>
        <boxGeometry args={[0.20, 0.025, 0.54]} />
        <meshStandardMaterial color="#3d5142" roughness={1} />
      </mesh>
      <Tree position={[0, 0.09, 0]} scale={0.4} tone={tone} />
      {[-0.2, 0.2].map((z) => (
        <mesh key={z} position={[0.03, 0.145, z]}>
          <icosahedronGeometry args={[0.06, 0]} />
          <meshStandardMaterial color={tone % 2 ? DUSK.foliageLight : '#6d8169'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function LaneLamp({ position }: { position: Vec3 }) {
  return (
    <group position={[position[0], 0.045, position[2]]} scale={0.66}>
      <StreetLamp position={[0, 0, 0]} />
    </group>
  );
}

function ShortcutRoads() {
  const arrowGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.17);
    shape.lineTo(0.095, 0.02);
    shape.lineTo(0.034, 0.02);
    shape.lineTo(0.034, -0.15);
    shape.lineTo(-0.034, -0.15);
    shape.lineTo(-0.034, 0.02);
    shape.lineTo(-0.095, 0.02);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  const segments = SHORTCUT_LANES.flatMap((points, lane) => points.slice(1).map((b, index) => ({
    a: points[index],
    b,
    lane,
    index,
    narrow: shortcutNeck(points[index],b),
  })));
  const corners = SHORTCUT_LANES.flatMap((points) => points.slice(1, -1));
  const parking = TILES.filter(tile=>tile.id>=32).map(tile=>({x:Math.sign(tile.x)*5.48,z:tile.z,side:Math.sign(tile.x)}));
  return (
    <group>
      {segments.map(({ a, b, lane, index, narrow }) => {
        const laneWidth=narrow?.16:SHORTCUT_LANE_WIDTH, walkWidth=narrow?.015:SHORTCUT_WALK_WIDTH;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const length = Math.hypot(dx, dz);
        const angle = -Math.atan2(dz, dx);
        const cx = (a[0] + b[0]) / 2;
        const cz = (a[1] + b[1]) / 2;
        const dirX = dx / length;
        const dirZ = dz / length;
        const dashCount = Math.max(1, Math.floor((length - 0.6) / 0.58));
        const dashUsable = length - 0.6;
        return (
          <group key={`${lane}-${index}`}>
            <mesh position={[cx, 0.044, cz]} rotation={[0, angle, 0]} receiveShadow>
              <boxGeometry args={[length + 0.03, 0.004, laneWidth + walkWidth * 2]} />
              <meshStandardMaterial color="#9b8f78" roughness={0.95} />
            </mesh>
            <mesh position={[cx, 0.0505, cz]} rotation={[0, angle, 0]} receiveShadow>
              <boxGeometry args={[length + 0.035, 0.003, laneWidth]} />
              <meshStandardMaterial color="#1e302a" roughness={0.93} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
            </mesh>
            <mesh position={[cx, 0.047, cz]} rotation={[0, angle, 0]} receiveShadow>
              <boxGeometry args={[length - 0.16, 0.002, laneWidth + walkWidth*.5]} />
              <meshStandardMaterial color="#6f6756" roughness={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
            </mesh>
            {!narrow && Array.from({ length: dashCount }, (_, i) => {
              const t = 0.3 + (dashUsable * (i + 0.5)) / dashCount;
              return (
                <mesh key={`dash-${i}`} position={[a[0] + dirX * t, 0.054, a[1] + dirZ * t]} rotation={[0, angle, 0]}>
                  <boxGeometry args={[0.26, 0.003, 0.032]} />
                  <meshBasicMaterial color="#c9b178" transparent opacity={0.72} toneMapped={false} polygonOffset polygonOffsetFactor={-7} polygonOffsetUnits={-7} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {corners.map((point, i) => (
        <group key={`corner-${i}`}>
          <mesh position={[point[0], 0.044, point[1]]} receiveShadow>
            <cylinderGeometry args={[SHORTCUT_LANE_WIDTH / 2 + SHORTCUT_WALK_WIDTH + 0.012, SHORTCUT_LANE_WIDTH / 2 + SHORTCUT_WALK_WIDTH + 0.012, 0.004, 18]} />
            <meshStandardMaterial color="#9b8f78" roughness={0.95} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          <mesh position={[point[0], 0.0505, point[1]]} receiveShadow>
            <cylinderGeometry args={[SHORTCUT_LANE_WIDTH / 2 + 0.012, SHORTCUT_LANE_WIDTH / 2 + 0.012, 0.003, 18]} />
            <meshStandardMaterial color="#1e302a" roughness={0.93} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
          </mesh>
        </group>
      ))}
      {[
        { x: 5, z: ROAD_INNER + 0.16, w: .18, d: 0.32 },
        { x: ROAD_INNER + 0.16, z: -5, w: 0.32, d: .18 },
        { x: -5, z: -ROAD_INNER - 0.16, w: .18, d: 0.32 },
        { x: -ROAD_INNER - 0.16, z: 5, w: 0.32, d: .18 },
      ].map((ramp, i) => (
        <mesh key={`ramp-${i}`} position={[ramp.x, 0.0505, ramp.z]} receiveShadow>
          <boxGeometry args={[ramp.w, 0.003, ramp.d]} />
          <meshStandardMaterial color="#1e302a" roughness={0.93} polygonOffset polygonOffsetFactor={-5} polygonOffsetUnits={-5} />
        </mesh>
      ))}
      {parking.map((bay) => (
        <group key={`bay-${bay.z}`}>
          <mesh position={[bay.x, 0.0512, bay.z]} receiveShadow>
            <boxGeometry args={[1.05, 0.003, 1.76]} />
            <meshStandardMaterial color="#22342d" roughness={0.94} polygonOffset polygonOffsetFactor={-6} polygonOffsetUnits={-6} />
          </mesh>
          {[-0.84, 0.84].map((offset) => (
            <mesh key={offset} position={[bay.x - bay.side * 0.145, 0.0545, bay.z + offset]}>
              <boxGeometry args={[0.84, 0.002, 0.022]} />
              <meshBasicMaterial color="#c9b178" transparent opacity={0.68} toneMapped={false} polygonOffset polygonOffsetFactor={-7} polygonOffsetUnits={-7} />
            </mesh>
          ))}
          {[-0.63, -0.42, -0.21, 0, 0.21, 0.42, 0.63].map((offset) => (
            <mesh key={`stall-${offset}`} position={[bay.x - bay.side * 0.145, 0.0542, bay.z + offset]}>
              <boxGeometry args={[0.75, 0.002, 0.01]} />
              <meshBasicMaterial color="#b7a985" transparent opacity={0.5} toneMapped={false} polygonOffset polygonOffsetFactor={-7} polygonOffsetUnits={-7} />
            </mesh>
          ))}
          <mesh position={[bay.side * 4.97, 0.057, bay.z]}>
            <boxGeometry args={[0.055, 0.025, 1.8]} />
            <meshStandardMaterial color="#877b65" roughness={0.88} />
          </mesh>
        </group>
      ))}
      <mesh geometry={arrowGeometry} position={[6.25, 0.0565, 4.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#d4bb80" transparent opacity={0.78} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} />
      </mesh>
      <mesh geometry={arrowGeometry} position={[-6.25, 0.0565, -4.3]} rotation={[-Math.PI / 2, 0, Math.PI]}>
        <meshBasicMaterial color="#d4bb80" transparent opacity={0.78} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-8} polygonOffsetUnits={-8} />
      </mesh>
      <LanePlanter position={[6.93, 0.015, 4.62]} tone={2} />
      <LanePlanter position={[6.93, 0.015, -2.78]} tone={1} />
      <LanePlanter position={[-6.93, 0.015, -4.62]} tone={3} />
      <LanePlanter position={[-6.93, 0.015, 2.78]} tone={0} />
      <LaneLamp position={[6.94, 0.045, 4.28]} />
      <LaneLamp position={[6.94, 0.045, -3.2]} />
      <LaneLamp position={[-6.94, 0.045, -4.28]} />
      <LaneLamp position={[-6.94, 0.045, 3.2]} />
    </group>
  );
}

function ParkingBays({ state, viewerId }: { state: GameState | null; viewerId?: string }) {
  return <group>{state?.players.map((player, index) => {
    const pose = parkingPose(player.position, index);
    return <group key={player.id} position={[pose.parked[0], 0.054, pose.parked[1]]} rotation={[0, pose.yaw, 0]}>
      <mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.11,.118,32]}/><meshBasicMaterial color={player.color} transparent opacity={player.id===viewerId ? .7 : .28} toneMapped={false} depthWrite={false}/></mesh>
    </group>;
  })}</group>;
}

function Fountain({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <cylinderGeometry args={[0.46, 0.5, 0.12, 10]} />
        <meshStandardMaterial color="#a8a18b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.105, 0]}>
        <cylinderGeometry args={[0.37, 0.4, 0.03, 10]} />
        <meshStandardMaterial color={DUSK.water} emissive={DUSK.water} emissiveIntensity={0.22} roughness={0.24} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.1, 0.26, 6]} />
        <meshStandardMaterial color={DUSK.brass} metalness={0.28} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <octahedronGeometry args={[0.13, 0]} />
        <meshStandardMaterial color="#d6caae" roughness={0.5} metalness={0.08} flatShading />
      </mesh>
    </group>
  );
}

function CentralBankInscription(){
  const texture=useCanvasTexture((ctx,w,h)=>{
    ctx.fillStyle='#806440';ctx.font='600 68px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('星 海 城 市 银 行',w/2,h/2,w-30);
  },1024,96,[]);
  return <mesh position={[0,1.825,.247]} raycast={()=>{}}><planeGeometry args={[1.58,.13]}/><meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false}/></mesh>;
}

function CentralPlaza() {
  return (
    <group>
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[7.2, 0.1, 6.2]} />
        <meshStandardMaterial color="#707565" roughness={0.94} />
      </mesh>
      <mesh position={[0, 0.09, 0]} receiveShadow>
        <boxGeometry args={[6.8, 0.03, 5.8]} />
        <meshStandardMaterial color="#bdb18f" roughness={0.92} />
      </mesh>
      {[
        { position: [0, 0.113, 0.25], args: [0.52, 0.014, 5.25] },
        // Meet the vertical path at its edges instead of overlapping its top.
        { position: [-1.5175, 0.113, 0.85], args: [2.515, 0.014, 0.46] },
        { position: [1.5175, 0.113, 0.85], args: [2.515, 0.014, 0.46] },
      ].map((path, i) => (
        <mesh key={i} position={path.position as Vec3}>
          <boxGeometry args={path.args as Vec3} />
          <meshStandardMaterial color="#ddd1b5" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-3} />
        </mesh>
      ))}
      <mesh position={[-2.25, 0.115, 1.72]} receiveShadow>
        <boxGeometry args={[1.7, 0.035, 1.7]} />
        <meshStandardMaterial color="#506753" roughness={1} />
      </mesh>
      <mesh position={[2.25, 0.115, 1.72]} receiveShadow>
        <boxGeometry args={[1.7, 0.035, 1.7]} />
        <meshStandardMaterial color="#506753" roughness={1} />
      </mesh>
      <mesh position={[-3.05, 0.115, -1.65]} receiveShadow>
        <boxGeometry args={[0.50, 0.035, 1.45]} />
        <meshStandardMaterial color="#586d58" roughness={1} />
      </mesh>
      <mesh position={[3.05, 0.115, -1.65]} receiveShadow>
        <boxGeometry args={[0.50, 0.035, 1.45]} />
        <meshStandardMaterial color="#586d58" roughness={1} />
      </mesh>
      {[
        [-2.25, -0.75],
        [-2.25, 0.7],
        [2.25, -0.75],
        [2.25, 0.7],
        [-2.4, 2.5],
        [2.4, 2.5],
        [-1.1, 2.62],
        [1.1, 2.62],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.145, z]} castShadow receiveShadow>
          <boxGeometry args={[i > 3 ? 0.58 : 0.4, 0.055, i > 3 ? 0.25 : 0.32]} />
          <meshStandardMaterial color="#3f5648" roughness={1} />
        </mesh>
      ))}
      <CentralLandmark />
      <CentralBankInscription />
      <Fountain position={[0, 0.12, 1.85]} />
      <Tree position={[-2.3, 0.12, 1.68]} scale={0.78} tone={2} />
      <Tree position={[-1.4, 0.12, 2.28]} scale={0.55} tone={1} />
      <Tree position={[2.25, 0.12, 1.55]} scale={0.62} tone={0} />
      <Fir position={[-3.12, 0.12, -1.70]} scale={0.46} />
      <Fir position={[3.12, 0.12, -1.70]} scale={0.44} />
      <Tree position={[1.15, 0.12, 2.5]} scale={0.46} tone={3} />
      {[[-0.9, 2.5], [0.7, 2.65]].map(([x, z], i) => (
        <group key={i} position={[x, 0.125, z]}>
          {[-.14,.14].flatMap(px=>[-.065,.065].map(pz=><mesh key={`${px}-${pz}`} position={[px,.0225,pz]} castShadow><boxGeometry args={[.025,.085,.025]}/><meshStandardMaterial color="#34443e" roughness={.75}/></mesh>))}
          <mesh position={[0, 0.09, 0]}>
            <boxGeometry args={[0.38, 0.05, 0.22]} />
            <meshStandardMaterial color="#6a5c46" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.16, -0.07]}>
            <boxGeometry args={[0.38, 0.12, 0.035]} />
            <meshStandardMaterial color="#6a5c46" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {[
        [-3.05, 2.75],
        [3.05, 2.75],
        [-3.05, -2.7],
        [3.05, -2.7],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0.12, z]}>
          <mesh position={[0, 0.35, 0]} castShadow>
            <cylinderGeometry args={[0.02, 0.03, 0.7, 5]} />
            <meshStandardMaterial color="#27372f" roughness={0.55} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.74, 0]}>
            <octahedronGeometry args={[0.07, 0]} />
            <meshStandardMaterial color={DUSK.window} emissive={DUSK.window} emissiveIntensity={2.1} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.115, 2.82]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.23, 12]} />
        <meshBasicMaterial color={DUSK.brass} />
      </mesh>
      <mesh position={[0, 0.116, 2.82]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.335, 12]} />
        <meshBasicMaterial color={DUSK.brassDark} />
      </mesh>
    </group>
  );
}

function PocketPark({ position, vertical = false, phase = 0 }: { position: Vec3; vertical?: boolean; phase?: number }) {
  const width = vertical ? 1.25 : 2.15;
  const depth = vertical ? 2.15 : 1.25;
  return (
    <group position={position}>
      <mesh position={[0, 0.04, 0]} receiveShadow>
        <boxGeometry args={[width + 0.18, 0.08, depth + 0.18]} />
        <meshStandardMaterial color="#5f6758" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.085, 0]} receiveShadow>
        <boxGeometry args={[width - 0.18, 0.03, depth - 0.18]} />
        <meshStandardMaterial color="#4e6855" roughness={1} />
      </mesh>
      <Tree position={[vertical ? 0 : -0.48, 0.1, vertical ? -0.4 : 0.04]} scale={0.54} tone={phase} />
      <Fir position={[vertical ? 0.22 : 0.5, 0.1, vertical ? 0.45 : 0.08]} scale={0.45} />
      <mesh position={[vertical ? -0.32 : 0, 0.11, vertical ? 0.56 : 0.45]} rotation={[0, vertical ? Math.PI / 2 : 0, 0]}>
        <boxGeometry args={[0.42, 0.045, 0.18]} />
        <meshStandardMaterial color="#6f5f49" roughness={0.9} />
      </mesh>
      <group position={[vertical ? 0.31 : -0.75, 0.1, vertical ? -0.65 : -0.34]}>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.012, 0.02, 0.44, 5]} />
          <meshStandardMaterial color="#25352d" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.46, 0]}>
          <octahedronGeometry args={[0.05, 0]} />
          <meshStandardMaterial color={DUSK.window} emissive={DUSK.window} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function StreetFurniture() {
  return (
    <>
      {[
        [10.8, 0.05, 10.8],
        [-10.8, 0.05, 10.8],
        [10.8, 0.05, -10.8],
        [-10.8, 0.05, -10.8],
        [10.8, 0.05, 0],
        [-10.8, 0.05, 0],
      ].map((position, i) => (
        <StreetLamp key={i} position={position as Vec3} illuminate />
      ))}
      <Tree position={[10.9, 0.05, 5.6]} scale={0.8} tone={3} />
      <Tree position={[-10.9, 0.05, -5.4]} scale={0.86} tone={1} />
      <Tree position={[10.9, 0.05, -5.4]} scale={0.7} tone={4} />
      <Tree position={[-10.9, 0.05, 5.6]} scale={0.82} tone={2} />
    </>
  );
}

/** 跟拍时镜头与注视点的距离；略高于 minDistance(8)，避免与轨道控制的夹取互搏。 */
const FOLLOW_DISTANCE = 10.5;

function Focus({
  focus, reset, inRoom, inspect = false, follow = false, traffic, activePlayerId, showcase = false,
}: {
  focus: number | null; reset: number; inRoom: boolean; inspect?: boolean;
  follow?: boolean; traffic?: Traffic; activePlayerId?: string; showcase?: boolean;
}) {
  const control = useRef<OrbitControlsImpl>(null);
  const goal = useRef(new THREE.Vector3(0, 0, 0));
  const followPoint = useMemo(() => new THREE.Vector3(), []);
  const diagnostic = useRef(0);
  // 跟拍取景：移动时把镜头拉近到 FOLLOW_DISTANCE，停稳后回到玩家原来的距离。
  const zoom = useRef({ active: false, returning: false, from: 0, value: 0 });
  const zoomOffset = useMemo(() => new THREE.Vector3(), []);
  const wheelAdjusted = useRef(false);
  const reduceMotion = useReducedMotion();
  const { camera, size, gl } = useThree();
  const fittedCamera = useMemo(() => {
    const distance=overviewCameraDistance(size.width,size.height,inRoom,showcase);
    return new THREE.Vector3(24, 26, 29).normalize().multiplyScalar(distance);
  }, [size.width, size.height, inRoom, showcase]);
  useEffect(() => {
    const el = gl.domElement;
    const mark = () => { wheelAdjusted.current = true; };
    el.addEventListener('wheel', mark, { passive: true });
    return () => el.removeEventListener('wheel', mark);
  }, [gl]);
  useEffect(() => {
    if (focus !== null) {
      const tile = TILES[focus];
      if(inspect){
        goal.current.set(tile?.x??0,tile?.type==='casino'?1.2:tile ? .7 : 1.60,tile?.z??-.55);
        const constructionHeight=tile?.type==='casino'?landmarkModelHeight(tile.id,0)+.4:tile?.type==='property'?landmarkModelHeight(tile.id,3)+.16:0;
        const inspectDistance=Math.max(1,constructionHeight/1.75);
        const offset = tile ? new THREE.Vector3(3.2,2.6,4).multiplyScalar(inspectDistance).applyAxisAngle(new THREE.Vector3(0,1,0),outwardRotation(tile.id)) : new THREE.Vector3(6.4,5.2,7.0).multiplyScalar(Math.max(1,1.08/Math.max(.4,size.width/size.height)));
        camera.position.copy(goal.current).add(offset);
        if(control.current){control.current.target.copy(goal.current);control.current.update();}
      }else if(tile)goal.current.set(tile.x, 0.4, tile.z);
    }
  }, [focus,inspect,camera,reset,size.width,size.height]);
  useEffect(() => {
    if(inspect&&focus!==null)return;
    zoom.current = { active: false, returning: false, from: 0, value: 0 };
    goal.current.set(0, 0, 0);
    camera.position.copy(fittedCamera);
    (camera as THREE.PerspectiveCamera).fov=38;(camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    if (control.current) {
      control.current.target.set(0, 0, 0);
      control.current.update();
    }
  }, [reset, fittedCamera, camera,inspect]);
  useFrame((_, dt) => {
    if (!control.current) return;
    const controls = control.current;
    const perspective = camera as THREE.PerspectiveCamera;
    const drive = traffic?.queue[0];
    const pawn = activePlayerId ? traffic?.pawns.get(activePlayerId) : undefined;
    const tracking = follow && !inspect && !!pawn && drive?.playerId === activePlayerId;
    if (tracking && pawn && drive) {
      // Lead along the current route segment, including the initial reverse out of a bay.
      const segment = Math.min(drive.segment, Math.max(0, drive.points.length - 2));
      const from = drive.points[segment];
      const to = drive.points[segment + 1];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      const lead = 0.58;
      followPoint.set(
        pawn.position.x + ((to[0] - from[0]) / length) * lead,
        0.46,
        pawn.position.z + ((to[1] - from[1]) / length) * lead,
      );
      controls.target.lerp(followPoint, 1 - Math.exp(-dt * 4.4));
      goal.current.copy(controls.target);
    } else if (controls.target.distanceTo(goal.current) > 0.012) {
      controls.target.lerp(goal.current, 1 - Math.exp(-dt * 3.2));
    }
    if (!inspect) {
      // Widen the framing slightly while travelling, then settle back after parking.
      const overviewFov=CITY.enabled?cityOverviewFov(camera.position.distanceTo(controls.target),fittedCamera.length()):38;
      const targetFov = Math.max(tracking ? 39.2 : 38,overviewFov);
      if (Math.abs(perspective.fov - targetFov) > 0.02) {
        perspective.fov = THREE.MathUtils.damp(perspective.fov, targetFov, 2.3, dt);
        perspective.updateProjectionMatrix();
      }
    }
    // 跟拍时拉近镜头，让棋子/车辆在画面里有存在感；到站后平滑退回原来的取景距离。
    const shot = zoom.current;
    const currentDistance = camera.position.distanceTo(controls.target);
    if (tracking) {
      if (!shot.active) { shot.active = true; shot.returning = false; shot.from = currentDistance; shot.value = currentDistance; wheelAdjusted.current = false; }
      const wanted = wheelAdjusted.current ? currentDistance : FOLLOW_DISTANCE;
      shot.value = THREE.MathUtils.damp(shot.value, wanted, 2.8, dt);
    } else if (shot.active) {
      shot.active = false; shot.returning = true; shot.value = currentDistance;
      if (wheelAdjusted.current) shot.from = currentDistance;
    }
    if (shot.returning) {
      shot.value = THREE.MathUtils.damp(shot.value, shot.from, 2.8, dt);
      if (Math.abs(shot.value - shot.from) < 0.06) { shot.value = shot.from; shot.returning = false; }
    }
    if (shot.active || shot.returning) {
      zoomOffset.copy(camera.position).sub(controls.target);
      const length = zoomOffset.length() || 1;
      camera.position.copy(controls.target).addScaledVector(zoomOffset.divideScalar(length), shot.value);
    }
    controls.update();
    const near=boardCameraNear(camera.position.distanceTo(controls.target));
    if(Math.abs(perspective.near-near)>.001){
      perspective.near=near;
      perspective.updateProjectionMatrix();
    }
    diagnostic.current += dt;
    if (diagnostic.current > 0.25) {
      diagnostic.current = 0;
      gl.domElement.dataset.cameraFollow = tracking ? '1' : '0';
      gl.domElement.dataset.cameraFov = perspective.fov.toFixed(1);
      gl.domElement.dataset.cameraNear = perspective.near.toFixed(3);
      gl.domElement.dataset.cameraFar = String(perspective.far);
      gl.domElement.dataset.cameraTarget = `${controls.target.x.toFixed(2)},${controls.target.z.toFixed(2)}`;
    }
  });
  return (
    <OrbitControls
      ref={control}
      makeDefault
      minDistance={inspect?2.3:8}
      maxDistance={140}
      minPolarAngle={0.38}
      maxPolarAngle={Math.PI / 2.22}
      enablePan={inspect}
      autoRotate={showcase && !reduceMotion}
      autoRotateSpeed={0.25}
      onStart={() => {
        if (control.current) goal.current.copy(control.current.target);
      }}
    />
  );
}

function Scene({ state, selected, onSelect, onHoverChange, reset, follow, labels=true, labelMode='smart', viewerId, highlightMine=false, inspect=false, upgradeReplay=0, showcase=false }: BoardProps) {
  const lighting=LIGHTING[useTimeOfDay()];
  const performance=usePerformanceMode();
  const active = state?.players[state.turn];
  const [arrived, setArrived] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const gl=useThree(store=>store.gl);
  const updateHover=useCallback((id:number|null,pointerType?:string)=>{
    const next=pointerType==='touch'?null:id;
    setHovered(next);onHoverChange?.(next);
  },[onHoverChange]);
  useEffect(()=>{
    const leave=()=>updateHover(null);
    gl.domElement.addEventListener('pointerleave',leave);
    return()=>gl.domElement.removeEventListener('pointerleave',leave);
  },[gl,updateHover]);
  const [showcaseTokens, setShowcaseTokens] = useState<Record<number, number>>({});
  const traffic = useMemo<Traffic>(() => ({ queue: [], pawns: new Map() }), []);
  useEffect(() => () => {
    document.body.style.cursor = 'auto';
  }, []);
  useEffect(() => {
    if (!showcase || state) return;
    const candidates = TILES.filter(tile => tile.type === 'property' && tile.id % 3 === 0);
    if (!candidates.length) return;
    let last = -1;
    let timer = 0;
    const play = () => {
      const pool = candidates.length > 1 ? candidates.filter(tile => tile.id !== last) : candidates;
      const tile = pool[Math.floor(Math.random() * pool.length)];
      last = tile.id;
      setShowcaseTokens(previous => ({ ...previous, [tile.id]: (previous[tile.id] ?? 0) + 1 }));
      timer = window.setTimeout(play, 10000 + Math.random() * 8000);
    };
    timer = window.setTimeout(play, 4200);
    return () => window.clearTimeout(timer);
  }, [showcase, state]);
  return (
    <>
      <SceneLighting />
      <DistantCity inRoom={!!state} showcase={showcase} inspect={inspect}/>
      <BoardBase />
      <RoadRing />
      <RoadMarkings />
      <ShortcutRoads />
      {(!inspect || selected === -1) && <CentralPlaza />}
      <PocketPark position={[0, 0.01, 5.52]} phase={2} />
      <PocketPark position={[0, 0.01, -5.52]} phase={4} />
      <StreetFurniture />
      {(!inspect || selected === -1) && <UrbanDetails />}
      <CityActivity streets={!inspect} plaza={!inspect || selected===-1}/>
      <SceneMetrics />
      <TrafficMetrics traffic={traffic} />
      {labels && labelMode === 'all' && <CenterBankLabel />}
      {labels && <BuildingLabels state={state} selected={selected} hovered={hovered} onSelect={onSelect} setHover={updateHover} labelMode={labelMode} viewerId={viewerId} highlightMine={highlightMine} />}
      <ParkingBays state={state} viewerId={viewerId} />
      {TILES.filter(tile => !inspect || selected === null || tile.id === selected).map((tile) => {
        const demoOwned=tile.id%3===0||showcase&&[17,20,23].includes(tile.id);
        const property = state?.properties.find((item) => item.tileId === tile.id)
          ?? (state ? undefined : { tileId: tile.id, owner: demoOwned ? 'demo' : null, level: demoOwned && showcase ? 1 + (Math.floor(tile.id / 3) % 3) : 0, mortgage: 0 });
        const owner = state?.players.find((player) => player.id === property?.owner);
        return (
          <TilePlot
            key={tile.id}
            tile={tile}
            property={property}
            ownerColor={owner?.color}
            selected={selected === tile.id}
            hovered={hovered === tile.id}
            setHover={updateHover}
            onSelect={onSelect}
            mine={!!viewerId && property?.owner === viewerId}
            highlightMine={highlightMine}
            showSelectionMarker={!inspect}
            buildingIdentity={state?.code??'demo'}
            upgradeReplay={showcase ? showcaseTokens[tile.id] ?? 0 : upgradeReplay}
          />
        );
      })}
      {state?.players.map((player, index) => (
        <PlayerPawn
          key={player.id}
          player={player}
          index={index}
          active={player.id === active?.id}
          mine={player.id === viewerId}
          traffic={traffic}
          onArrive={(tile) => {
            if (player.id === active?.id) setArrived(tile);
          }}
        />
      ))}
      <ContactShadows position={[0, CITY.enabled&&!inspect?CITY.groundY+.035:-.66, 0]} opacity={lighting.shadow*(CITY.enabled&&!inspect ? .55 : 1)} scale={CITY.enabled&&!inspect?30:38} blur={2.8} far={15} resolution={performance?256:512} frames={performance?1:Infinity} color="#07100f" />
      <Focus
        focus={selected ?? (follow ? arrived : null)}
        reset={reset}
        inRoom={!!state}
        inspect={inspect}
        follow={follow && selected === null}
        traffic={traffic}
        activePlayerId={active?.id}
        showcase={showcase}
      />
    </>
  );
}

interface BoardProps { state: GameState | null; selected: number | null; onSelect: (id: number) => void; onHoverChange?:(id:number|null)=>void; onClearSelection?:()=>void; reset: number; follow: boolean; labels?: boolean; labelMode?: 'smart' | 'all'; viewerId?: string; highlightMine?: boolean; inspect?: boolean; upgradeReplay?:number; showcase?: boolean; }
export default function Board(props: BoardProps) {
  const performance=usePerformanceMode();
  return (
    <Canvas
      events={store => ({ ...events(store), filter: labelFirstHits })}
      shadows={!performance}
      onPointerMissed={event=>{if(event.type==='click'&&event.button===0)props.onClearSelection?.();}}
      dpr={performance?[1, 1.15]:[1, 1.6]}
      camera={{ position: [24, 26, 29], fov: 38, near: 0.5, far: BOARD_CAMERA_FAR }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      <Suspense fallback={null}>
        <CityMotionProvider><Scene {...props} /></CityMotionProvider>
      </Suspense>
    </Canvas>
  );
}
