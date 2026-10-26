import {LIGHTING,useTimeOfDay} from './timeOfDay';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildArchitecture, buildPlotDetails, buildPlaza, buildStreets, type ArchitecturalPalette, type DetailBatch } from './detailGeometry';
import { buildLandmarkModel } from './landmarkGeometry';
import { BuildingActivity } from './CityLife';
import { buildCentralLandmark } from './centralPlazaGeometry';
import { useCityClock } from './CityMotion';
import { usePerformanceMode } from '../game/preferences';

function Batches({batches}:{batches:DetailBatch[]}) {
  const lighting=LIGHTING[useTimeOfDay()];
  useEffect(()=>()=>batches.forEach(b=>b.geometry.dispose()),[batches]);
  return <group>{batches.map(b=><mesh key={b.finish} geometry={b.geometry} castShadow={b.finish!=='light'} receiveShadow>
    <meshStandardMaterial vertexColors roughness={b.finish==='metal'?.48:b.finish==='glass'?.22:.88} metalness={b.finish==='metal'?.55:b.finish==='glass'?.2:0} emissive={b.finish==='light'?'#f2ae62':'#000000'} emissiveIntensity={b.finish==='light'?lighting.windows:0}/>
  </mesh>)}</group>;
}

export const ArchitectureDetails=memo(function ArchitectureDetails({tileId,level,palette}:{tileId:number;level:number;palette:ArchitecturalPalette}) {
  const batches=useMemo(()=>buildArchitecture(tileId,level,palette),[tileId,level,palette]);
  return <Batches batches={batches}/>;
});
export const LandmarkModel=memo(function LandmarkModel({tileId,level,palette,active=true}:{tileId:number;level:number;palette:ArchitecturalPalette;active?:boolean}) {
  const model=useMemo(()=>buildLandmarkModel(tileId,level,palette,true),[tileId,level,palette]);
  return <group><Batches batches={model.batches}/>{[9,17,20,23,24,33].includes(tileId)&&<BuildingActivity tileId={tileId} level={level} palette={palette} active={active}/>}</group>;
});
export const PlotDetails=memo(function PlotDetails({tileId,vacant}:{tileId:number;vacant:boolean}) {
  const batches=useMemo(()=>buildPlotDetails(tileId,vacant),[tileId,vacant]);
  return <Batches batches={batches}/>;
});
export const CentralLandmark=memo(function CentralLandmark(){
  const model=useMemo(buildCentralLandmark,[]);
  return <Batches batches={model.batches}/>;
});

export const UrbanDetails=memo(function UrbanDetails() {
  const performance=usePerformanceMode();
  const street=useMemo(buildStreets,[]),plaza=useMemo(buildPlaza,[]);
  return <><Batches batches={street}/><Batches batches={plaza}/>{!performance&&<FountainDrops/>}</>;
});

function FountainDrops(){
  const clock=useCityClock();
  const mesh=useRef<THREE.InstancedMesh>(null);const matrix=useMemo(()=>new THREE.Matrix4(),[]);
  useFrame(()=>{
    if(!mesh.current)return;
    for(let i=0;i<48;i++){
      const t=(clock.time*.6+(i%8)/8)%1,a=Math.floor(i/8)*Math.PI/3;
      matrix.makeTranslation(Math.cos(a)*(.05+t*.27),.48+.45*4*t*(1-t)-t*.23,1.85+Math.sin(a)*(.05+t*.27));
      mesh.current.setMatrixAt(i,matrix);
    }
    mesh.current.instanceMatrix.needsUpdate=true;
  });
  return <instancedMesh ref={mesh} args={[undefined,undefined,48]} frustumCulled={false} raycast={()=>{}}><icosahedronGeometry args={[.012,0]}/><meshStandardMaterial color="#c3e1ce" roughness={.1} emissive="#559b99" emissiveIntensity={.2}/></instancedMesh>;
}

/** DOM diagnostics can be inspected without reaching into renderer internals. */
export function SceneMetrics(){
  const {gl}=useThree();const elapsed=useRef(0),frames=useRef(0);
  useFrame((_,dt)=>{elapsed.current+=dt;frames.current++;if(elapsed.current>=1){
    gl.domElement.dataset.drawCalls=String(gl.info.render.calls);
    gl.domElement.dataset.triangles=String(gl.info.render.triangles);
    gl.domElement.dataset.fps=String(Math.round(frames.current/elapsed.current));
    elapsed.current=0;frames.current=0;
  }});
  return null;
}
