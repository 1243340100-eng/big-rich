import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {buildCasinoModel,casinoWheel,CASINO_WHEEL_Y} from './casinoGeometry';
import {Model} from './buildingPrimitives';
import {useCityClock} from './CityMotion';
import type {DetailBatch} from './detailGeometry';

function Parts({batches}:{batches:DetailBatch[]}) {
  useEffect(()=>()=>batches.forEach(b=>b.geometry.dispose()),[batches]);
  return <>{batches.map(b=><mesh key={b.finish} geometry={b.geometry} castShadow={b.finish!=='light'} receiveShadow>{b.finish==='light'?<meshBasicMaterial vertexColors toneMapped={false}/>:<meshStandardMaterial vertexColors roughness={b.finish==='metal'?.38:.75} metalness={b.finish==='metal'?.65:0}/>}</mesh>)}</>;
}
export function CasinoLandmark() {
  const clock=useCityClock(),wheel=useRef<THREE.Group>(null),bulbs=useRef<THREE.InstancedMesh>(null),water=useRef<THREE.InstancedMesh>(null);
  const body=useMemo(()=>buildCasinoModel(false),[]),disc=useMemo(()=>{const b=new Model();casinoWheel(b,0,0);return b.finish();},[]);
  const matrix=useMemo(()=>new THREE.Matrix4(),[]),color=useMemo(()=>new THREE.Color(),[]);
  const signs=useMemo(()=>[false,true].map(vertical=>{
    const canvas=document.createElement('canvas');canvas.width=vertical?96:512;canvas.height=vertical?768:96;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#eed7a7';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${vertical?65:67}px Georgia`;
    if(vertical)'STARPORT'.split('').forEach((letter,i)=>ctx.fillText(letter,48,48+i*96));else ctx.fillText('STARPORT',256,52);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
  }),[]);
  useEffect(()=>()=>signs.forEach(t=>t.dispose()),[signs]);
  useFrame(()=> {
    if(wheel.current)wheel.current.rotation.z=-clock.time*.14;
    for(let i=0;i<40;i++) {
      const side=i<20?-1:1,k=i%20;
      matrix.makeTranslation(side*(.27+k*.021),1.30,.34);
      bulbs.current?.setMatrixAt(i,matrix);color.setRGB(1,.68+(1+Math.sin(clock.time*1.4-i*.33))*.1,.34);
      bulbs.current?.setColorAt(i,color);
    }
    if(bulbs.current){bulbs.current.instanceMatrix.needsUpdate=true;if(bulbs.current.instanceColor)bulbs.current.instanceColor.needsUpdate=true;}
    for(let i=0;i<8;i++){const t=(clock.time*.65+i/8)%1;matrix.makeTranslation(-.62+Math.sin(i)*t*.04,.14+Math.sin(t*Math.PI)*.14,.14);water.current?.setMatrixAt(i,matrix);}
    if(water.current)water.current.instanceMatrix.needsUpdate=true;
  });
  return <group><Parts batches={body.batches}/><group ref={wheel} position={[0,CASINO_WHEEL_Y,0]}><Parts batches={disc}/></group><mesh position={[0,1.42,.34]} raycast={()=>{}}><planeGeometry args={[.54,.085]}/><meshBasicMaterial map={signs[0]} transparent depthWrite={false}/></mesh>{[-1,1].map(side=><mesh key={side} position={[side*.655,.84,.376]} raycast={()=>{}}><planeGeometry args={[.075,.72]}/><meshBasicMaterial map={signs[1]} transparent depthWrite={false}/></mesh>)}<instancedMesh ref={bulbs} args={[undefined,undefined,40]} raycast={()=>{}}><sphereGeometry args={[.012,6,4]}/><meshBasicMaterial toneMapped={false} color="#f9d894"/></instancedMesh><instancedMesh ref={water} args={[undefined,undefined,8]} raycast={()=>{}}><icosahedronGeometry args={[.009,0]}/><meshBasicMaterial color="#b9e0c7"/></instancedMesh></group>;
}
