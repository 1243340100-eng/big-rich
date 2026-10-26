import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIGHTING, useTimeOfDay } from './timeOfDay';
import { usePerformanceMode } from '../game/preferences';

/** 指数平滑系数：约 0.9 秒完成 90% 的过渡，切时段不再硬切。 */
const smoothing = (dt: number) => 1 - Math.pow(.002, Math.min(dt, .06));

export function SceneLighting() {
  const time = useTimeOfDay(), { gl, scene } = useThree();
  const performance = usePerformanceMode();
  const p = LIGHTING[time];
  const initial = useRef(p);

  const ambient = useRef<THREE.AmbientLight>(null);
  const hemisphere = useRef<THREE.HemisphereLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);

  const target = useMemo(() => ({
    sky: new THREE.Color(p.sky),
    ground: new THREE.Color(p.ground),
    sun: new THREE.Color(p.sun),
    fill: new THREE.Color(p.fill),
    position: new THREE.Vector3(...(p.position as [number, number, number])),
    rim: new THREE.Color(time === 'night' ? '#718aca' : '#c67950'),
    rimPower: time === 'night' ? .22 : .38,
    ambient: p.ambient,
    hemisphere: p.hemisphere,
    sunPower: p.sunPower,
    fillPower: p.fillPower,
  }), [p, time]);

  useEffect(() => { gl.domElement.dataset.timeOfDay = time; }, [gl, time]);

  useFrame((_, delta) => {
    const k = smoothing(delta), t = target;

    if (scene.background instanceof THREE.Color) scene.background.lerp(t.sky, k);
    else scene.background = t.sky.clone();

    const fog = scene.fog as THREE.Fog | null;
    if (fog) { fog.color.lerp(t.sky, k); fog.near = THREE.MathUtils.lerp(fog.near, 65, k); fog.far = THREE.MathUtils.lerp(fog.far, 135, k); }

    if (ambient.current) ambient.current.intensity = THREE.MathUtils.lerp(ambient.current.intensity, t.ambient, k);
    if (hemisphere.current) {
      hemisphere.current.intensity = THREE.MathUtils.lerp(hemisphere.current.intensity, t.hemisphere, k);
      hemisphere.current.color.lerp(t.sky, k);
      hemisphere.current.groundColor.lerp(t.ground, k);
    }
    if (key.current) {
      key.current.intensity = THREE.MathUtils.lerp(key.current.intensity, t.sunPower, k);
      key.current.color.lerp(t.sun, k);
      key.current.position.lerp(t.position, k);
    }
    if (fill.current) {
      fill.current.intensity = THREE.MathUtils.lerp(fill.current.intensity, t.fillPower, k);
      fill.current.color.lerp(t.fill, k);
    }
    if (rim.current) {
      rim.current.intensity = THREE.MathUtils.lerp(rim.current.intensity, t.rimPower, k);
      rim.current.color.lerp(t.rim, k);
    }
  });

  return <>
    <color attach="background" args={[initial.current.sky]} />
    <fog attach="fog" args={[initial.current.sky, 65, 135]} />
    <ambientLight ref={ambient} intensity={initial.current.ambient} />
    <hemisphereLight ref={hemisphere} args={[initial.current.sky, initial.current.ground, initial.current.hemisphere]} />
    <directionalLight ref={key} position={initial.current.position as [number, number, number]} intensity={initial.current.sunPower} color={initial.current.sun} castShadow={!performance}
      shadow-mapSize={performance ? [1024, 1024] : [2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20}
      shadow-camera-top={20} shadow-camera-bottom={-20} shadow-camera-near={1} shadow-camera-far={65}
      shadow-bias={-.00018} shadow-normalBias={.025} />
    <directionalLight ref={fill} position={[14, 9, -8]} intensity={initial.current.fillPower} color={initial.current.fill} />
    <directionalLight ref={rim} position={[4, 12, 16]} intensity={.38} color="#c67950" />
  </>;
}
