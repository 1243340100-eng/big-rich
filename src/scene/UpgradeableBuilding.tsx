import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LandmarkModel } from './CityDetails';
import type { ArchitecturalPalette } from './detailGeometry';
import { landmarkModelHeight } from './landmarkGeometry';
import { BuildingUpgradeTimeline, constructionFrame, scaffoldRingProgress } from './upgradeAnimation';
import { CONSTRUCTION, buildConstructionCurtain, buildScaffoldTier, constructionDimensions } from './constructionGeometry';
import { useReducedMotion } from '../game/preferences';

const noRaycast = () => {};
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(callback:()=>void) {
  const query=window.matchMedia(motionQuery);query.addEventListener('change',callback);
  return ()=>query.removeEventListener('change',callback);
}
const reducedMotion = () => window.matchMedia(motionQuery).matches;

export function UpgradeableBuilding({tileId,level,palette,identity,owner='',vacant,replayToken=0}:{tileId:number;level:number;palette:ArchitecturalPalette;identity:string;owner?:string;vacant?:ReactNode;replayToken?:number}) {
  const {gl}=useThree();
  const reduce=useReducedMotion();
  const [timeline]=useState(()=>new BuildingUpgradeTimeline(level,identity,owner));
  const [visual,setVisual]=useState({level,runId:0,from:level,to:level});
  const building=useRef<THREE.Group>(null), replay=useRef(replayToken), diagnosticTime=useRef(0);
  const diagnosticKey=`upgrade${tileId}`;
  function publish() {
    const run=timeline.run;
    const next={level:timeline.displayLevel,runId:run?.id??0,from:run?.from??timeline.displayLevel,to:run?.to??timeline.displayLevel};
    setVisual(previous=>previous.level===next.level&&previous.runId===next.runId?previous:next);
  }
  function writeDiagnostic() {
    const run=timeline.run;
    if(!run){delete gl.domElement.dataset[diagnosticKey];return;}
    gl.domElement.dataset[diagnosticKey]=JSON.stringify({phase:constructionFrame(run.elapsed).phase,elapsed:Number(run.elapsed.toFixed(3)),displayLevel:timeline.displayLevel,from:run.from,to:run.to});
  }
  useLayoutEffect(()=>{
    timeline.sync(level,identity,!reduce,owner);
    if(replay.current!==replayToken&&!reduce)timeline.replay(level);
    replay.current=replayToken;publish();writeDiagnostic();
  },[level,identity,owner,reduce,replayToken]);
  useEffect(()=>()=>{delete gl.domElement.dataset[diagnosticKey];},[gl,diagnosticKey]);
  useFrame((_,delta)=>{
    const previousLevel=timeline.displayLevel,previousRun=timeline.run?.id;
    if(timeline.run)timeline.advance(delta);
    if(previousLevel!==timeline.displayLevel||previousRun!==timeline.run?.id){publish();writeDiagnostic();}
    const frame=timeline.run?constructionFrame(timeline.run.elapsed):null;
    building.current?.scale.set(frame?.buildingXZ??1,frame?.buildingY??1,frame?.buildingXZ??1);
    if(timeline.run){diagnosticTime.current+=delta;if(diagnosticTime.current>.08){diagnosticTime.current=0;writeDiagnostic();}}
  });
  const height=Math.max(landmarkModelHeight(tileId,Math.max(0,visual.from)),landmarkModelHeight(tileId,Math.max(0,visual.to)));
  return <group>
    <group ref={building}>{visual.level<0?(visual.runId===0?vacant:null):<LandmarkModel tileId={tileId} level={visual.level} palette={palette} active={visual.runId===0}/>}</group>
    {visual.runId!==0&&<ConstructionEffect key={visual.runId} timeline={timeline} height={height} accent={palette.accent}/>}
  </group>;
}

function ConstructionEffect({timeline,height,accent}:{timeline:BuildingUpgradeTimeline;height:number;accent:string}) {
  const dimensions=useMemo(()=>constructionDimensions(height),[height]);
  const tier=useMemo(()=>buildScaffoldTier(dimensions.tierHeight),[dimensions]);
  const cloth=useMemo(()=>buildConstructionCurtain(dimensions.clothTop-.02,accent),[dimensions,accent]);
  const root=useRef<THREE.Group>(null),scaffold=useRef<THREE.InstancedMesh>(null),curtain=useRef<THREE.Group>(null);
  const scaffoldMaterial=useRef<THREE.MeshStandardMaterial>(null),clothMaterial=useRef<THREE.MeshStandardMaterial>(null);
  const sparkles=useRef<THREE.InstancedMesh>(null),sparkleMaterial=useRef<THREE.MeshBasicMaterial>(null);
  const pulse=useRef<THREE.Mesh>(null),pulseMaterial=useRef<THREE.MeshBasicMaterial>(null);
  const matrix=useMemo(()=>new THREE.Matrix4(),[]),dummy=useMemo(()=>new THREE.Object3D(),[]);
  useEffect(()=>()=>{tier.dispose();cloth.dispose();},[tier,cloth]);
  useFrame(()=>{
    if(!timeline.run){if(root.current)root.current.visible=false;return;}
    const t=timeline.run.elapsed,frame=constructionFrame(t);
    if(scaffold.current) {
      scaffold.current.visible=frame.scaffoldOpacity>.002;
      for(let i=0;i<dimensions.rings;i++) {
        const p=scaffoldRingProgress(t,i,dimensions.rings);
        const lateral=p===0?0:1+.018*Math.sin(Math.min(1,p)*Math.PI);
        matrix.makeScale(lateral,p,lateral).setPosition(0,CONSTRUCTION.bottom+i*dimensions.tierHeight,0);
        scaffold.current.setMatrixAt(i,matrix);
      }
      scaffold.current.instanceMatrix.needsUpdate=true;
    }
    if(scaffoldMaterial.current)scaffoldMaterial.current.opacity=frame.scaffoldOpacity;
    if(curtain.current) {
      curtain.current.visible=frame.coverDrop>.002&&frame.coverOpacity>.002;
      curtain.current.scale.set(1+frame.clothBillow,frame.coverDrop,1+frame.clothBillow);
    }
    if(clothMaterial.current)clothMaterial.current.opacity=frame.coverOpacity;
    const pop=frame.celebration;
    if(sparkles.current) {
      sparkles.current.visible=pop>0&&pop<1;
      for(let i=0;i<16;i++) {
        const u=Math.max(0,Math.min(1,(t-3.1-(i%4)*.035)/.72)),a=i*Math.PI*2/16;
        dummy.position.set(Math.cos(a)*(.60+.13*u),.12+height*.35+Math.sin(u*Math.PI)*.35,Math.sin(a)*(.57+.10*u));
        dummy.rotation.set(u*4,a,u*5);dummy.scale.setScalar(Math.sin(u*Math.PI)*(.7+(i%3)*.15));dummy.updateMatrix();
        sparkles.current.setMatrixAt(i,dummy.matrix);
      }
      sparkles.current.instanceMatrix.needsUpdate=true;
    }
    if(sparkleMaterial.current)sparkleMaterial.current.opacity=1-pop;
    if(pulse.current){pulse.current.visible=pop>0&&pop<1;pulse.current.scale.setScalar(.78+.27*pop);}
    if(pulseMaterial.current)pulseMaterial.current.opacity=Math.sin(pop*Math.PI)*.65;
  });
  return <group ref={root}>
    <instancedMesh ref={scaffold} args={[tier,undefined,dimensions.rings]} frustumCulled={false} raycast={noRaycast} castShadow>
      <meshStandardMaterial ref={scaffoldMaterial} vertexColors roughness={.66} metalness={.28} transparent/>
    </instancedMesh>
    <group ref={curtain} position={[0,dimensions.clothTop,0]} visible={false}>
      <mesh geometry={cloth} raycast={noRaycast} castShadow receiveShadow>
        <meshStandardMaterial ref={clothMaterial} vertexColors roughness={.96} side={THREE.DoubleSide} transparent/>
      </mesh>
    </group>
    <instancedMesh ref={sparkles} args={[undefined,undefined,16]} visible={false} frustumCulled={false} raycast={noRaycast}>
      <octahedronGeometry args={[.028,0]}/><meshBasicMaterial ref={sparkleMaterial} color="#ffe0a0" transparent depthWrite={false}/>
    </instancedMesh>
    <mesh ref={pulse} position={[0,.065,0]} rotation={[-Math.PI/2,0,0]} visible={false} raycast={noRaycast}>
      <ringGeometry args={[.64,.657,64]}/><meshBasicMaterial ref={pulseMaterial} color="#ffe0a0" transparent depthWrite={false} side={THREE.DoubleSide}/>
    </mesh>
  </group>;
}
