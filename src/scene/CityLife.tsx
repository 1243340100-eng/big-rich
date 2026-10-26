import {LIGHTING,useTimeOfDay} from './timeOfDay';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DetailBuilder, type ArchitecturalPalette } from './detailGeometry';
import { useCityClock } from './CityMotion';
import { usePerformanceMode } from '../game/preferences';
import { factoryChimneyTop, marqueeBrightness, marqueePositions, PLAZA_WALK, smokePuff, STREET_WALKS, theatreLightHeight, walkingPose, windRotorCentre, type WalkingRoute } from './cityActivity';

const noRaycast=()=>{};
const coats=['#9c795e','#658c7b','#b19770','#4c747e','#a47376','#b5ac83'];

function Pedestrians({routes}:{routes:WalkingRoute[]}) {
  const clock=useCityClock(),body=useRef<THREE.InstancedMesh>(null),heads=useRef<THREE.InstancedMesh>(null);
  const walkers=useMemo(()=>routes.flatMap((route,routeId)=>Array.from({length:route.count},(_,index)=>({route,routeId,index}))),[routes]);
  const tools=useMemo(()=>({root:new THREE.Matrix4(),local:new THREE.Object3D(),matrix:new THREE.Matrix4(),color:new THREE.Color()}),[]);
  useEffect(()=>{
    walkers.forEach(({routeId,index},i)=>{
      const coat=coats[(routeId*3+index)%coats.length];
      [coat,'#384943','#493d33',coat,coat,'#364a47','#364a47','#806544'].forEach((paint,part)=>body.current?.setColorAt(i*8+part,tools.color.set(paint)));
      heads.current?.setColorAt(i,tools.color.set(['#c49c7b','#d7b18f','#aa7f63'][(index+routeId)%3]));
    });
    if(body.current?.instanceColor)body.current.instanceColor.needsUpdate=true;
    if(heads.current?.instanceColor)heads.current.instanceColor.needsUpdate=true;
  },[walkers,tools]);
  useFrame(()=>{
    if(!body.current||!heads.current)return;
    const {root,local,matrix}=tools;
    function part(index:number,x:number,y:number,z:number,w:number,h:number,d:number,rotation=0){
      local.position.set(x,y,z);local.rotation.set(rotation,0,0);local.scale.set(w,h,d);local.updateMatrix();
      matrix.multiplyMatrices(root,local.matrix);body.current!.setMatrixAt(index,matrix);
    }
    walkers.forEach(({route,index},i)=>{
      const p=walkingPose(route,clock.time,index),stride=clock.enabled?p.stride:0;
      root.makeRotationY(p.yaw).setPosition(p.x,p.y+(clock.enabled?p.bob:0),p.z);
      const offset=i*8;
      part(offset,0,.171,0,.076,.112,.052);
      part(offset+1,0,.109,0,.063,.025,.050);
      part(offset+2,0,.269,-.006,.065,.025,.055);
      for(let side=0;side<2;side++){
        const swing=stride*(side?1:-1);
        part(offset+3+side,(side?1:-1)*.049,.214-Math.cos(swing)*.048,-Math.sin(swing)*.048,.022,.096,.023,swing);
        part(offset+5+side,(side?1:-1)*.019,.105-Math.cos(swing)*.050,Math.sin(swing)*.050,.024,.100,.029,-swing);
      }
      part(offset+7,.069,.112,0,.025,.045,.045);
      local.position.set(0,.246,0);local.rotation.set(0,0,0);local.scale.setScalar(.036);local.updateMatrix();
      matrix.multiplyMatrices(root,local.matrix);heads.current!.setMatrixAt(i,matrix);
    });
    body.current.instanceMatrix.needsUpdate=true;heads.current.instanceMatrix.needsUpdate=true;
  });
  return <group raycast={noRaycast}>
    <instancedMesh ref={body} args={[undefined,undefined,walkers.length*8]} frustumCulled={false} raycast={noRaycast}><boxGeometry args={[1,1,1]}/><meshStandardMaterial roughness={.93}/></instancedMesh>
    <instancedMesh ref={heads} args={[undefined,undefined,walkers.length]} frustumCulled={false} raycast={noRaycast}><icosahedronGeometry args={[1,1]}/><meshStandardMaterial roughness={.95}/></instancedMesh>
  </group>;
}

function WalkingPavement({routes}:{routes:WalkingRoute[]}) {
  const geometry=useMemo(()=>{
    const builder=new DetailBuilder();
    for(const route of routes){
      const angle=route.side*Math.PI/2,x=(route.a+route.b)/2,z=route.z;
      builder.box([route.b-route.a+.38,.025,.35],[Math.cos(angle)*x+Math.sin(angle)*z,route.y-.0125,-Math.sin(angle)*x+Math.cos(angle)*z],route.z>10?'#92917b':'#c7b999',[0,angle,0]);
    }
    return builder.finish()[0]?.geometry;
  },[routes]);
  useEffect(()=>()=>geometry?.dispose(),[geometry]);
  return geometry?<mesh geometry={geometry} receiveShadow raycast={noRaycast}><meshStandardMaterial vertexColors roughness={.98}/></mesh>:null;
}

function Birds() {
  const clock=useCityClock(),wings=useRef<THREE.InstancedMesh>(null),bodies=useRef<THREE.InstancedMesh>(null);
  const tools=useMemo(()=>({root:new THREE.Matrix4(),part:new THREE.Object3D(),matrix:new THREE.Matrix4()}),[]);
  useFrame(()=>{
    if(!wings.current||!bodies.current)return;
    for(let i=0;i<4;i++){
      const a=clock.time*.14+i*.22,phase=clock.enabled?Math.sin(clock.time*5+i)*.43:0;
      tools.root.makeRotationY(Math.atan2(-Math.sin(a)*3.0,Math.cos(a)*1.65)).setPosition(Math.cos(a)*3.0,4.45+i*.10+Math.sin(a*2)*.12,Math.sin(a)*1.65);
      for(let side=0;side<2;side++){
        tools.part.position.set((side?1:-1)*.071,.006,0);tools.part.rotation.set(0,0,(side?1:-1)*phase);tools.part.scale.set(.15,.012,.052);tools.part.updateMatrix();
        tools.matrix.multiplyMatrices(tools.root,tools.part.matrix);wings.current.setMatrixAt(i*2+side,tools.matrix);
      }
      tools.part.position.set(0,0,.01);tools.part.rotation.set(0,0,0);tools.part.scale.set(.035,.026,.085);tools.part.updateMatrix();
      tools.matrix.multiplyMatrices(tools.root,tools.part.matrix);bodies.current.setMatrixAt(i,tools.matrix);
    }
    wings.current.instanceMatrix.needsUpdate=true;bodies.current.instanceMatrix.needsUpdate=true;
  });
  return <group><instancedMesh ref={wings} args={[undefined,undefined,8]} frustumCulled={false} raycast={noRaycast}><boxGeometry/><meshStandardMaterial color="#c6bea1" roughness={1}/></instancedMesh><instancedMesh ref={bodies} args={[undefined,undefined,4]} frustumCulled={false} raycast={noRaycast}><icosahedronGeometry args={[1,0]}/><meshStandardMaterial color="#b5af98" roughness={1}/></instancedMesh></group>;
}

export function CityActivity({streets,plaza}:{streets:boolean;plaza:boolean}) {
  const performance=usePerformanceMode();
  const clock=useCityClock(),{gl}=useThree(),elapsed=useRef(0);
  const routes=useMemo(()=>[...(streets?STREET_WALKS:[]),...(plaza?[PLAZA_WALK]:[])],[streets,plaza]);
  useEffect(()=>()=>{delete gl.domElement.dataset.cityLife;},[gl]);
  useFrame((_,delta)=>{if(performance)return;elapsed.current+=delta;if(elapsed.current<.5)return;elapsed.current=0;gl.domElement.dataset.cityLife=JSON.stringify({walkers:routes.reduce((n,r)=>n+r.count,0),birds:plaza?4:0,time:Number(clock.time.toFixed(2)),reducedMotion:!clock.enabled});});
  if(performance)return null;
  return <group>{routes.length>0&&<><WalkingPavement routes={routes}/><Pedestrians routes={routes}/></>}{plaza&&<Birds/>}</group>;
}

const smokeVertex=`attribute float puffOpacity;varying float alpha;varying vec2 xy;void main(){xy=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);alpha=puffOpacity;}`;
const smokeFragment=`uniform vec3 tint;varying float alpha;varying vec2 xy;void main(){float r=length(xy-vec2(.5))*2.;float edge=1.-smoothstep(.10,1.,r);gl_FragColor=vec4(tint,alpha*edge*edge);}`;
function FactorySmoke({level,active}:{level:number;active:boolean}) {
  const clock=useCityClock(),{camera}=useThree(),puffs=useRef<THREE.InstancedMesh>(null);
  const geometry=useMemo(()=>{const g=new THREE.PlaneGeometry(1,1);g.setAttribute('puffOpacity',new THREE.InstancedBufferAttribute(new Float32Array(24),1));return g;},[]);
  const uniforms=useMemo(()=>({tint:{value:new THREE.Color('#c3c5b4')}}),[]);
  const tools=useMemo(()=>({dummy:new THREE.Object3D(),inverse:new THREE.Quaternion()}),[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{
    if(!puffs.current)return;
    puffs.current.visible=active&&clock.enabled;
    if(!active||!clock.enabled)return;
    puffs.current.getWorldQuaternion(tools.inverse).invert();
    tools.dummy.quaternion.copy(tools.inverse).multiply(camera.quaternion);
    const opacity=geometry.getAttribute('puffOpacity');
    for(let chimney=0;chimney<2;chimney++)for(let i=0;i<12;i++){
      const index=chimney*12+i,p=smokePuff(clock.time+chimney*.43,i);
      tools.dummy.position.set([-.49,-.28][chimney]+p.x,factoryChimneyTop(level)+p.y,-.49+p.z);
      tools.dummy.scale.setScalar(p.size);tools.dummy.updateMatrix();puffs.current.setMatrixAt(index,tools.dummy.matrix);opacity.setX(index,p.opacity);
    }
    puffs.current.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;
  });
  return <instancedMesh ref={puffs} args={[geometry,undefined,24]} frustumCulled={false} raycast={noRaycast}><shaderMaterial uniforms={uniforms} vertexShader={smokeVertex} fragmentShader={smokeFragment} transparent depthWrite={false} side={THREE.DoubleSide}/></instancedMesh>;
}

function WindRotor({level,paint,running}:{level:number;paint:string;running:boolean}) {
  const clock=useCityClock(),rotor=useRef<THREE.Group>(null);
  const geometry=useMemo(()=>{const b=new DetailBuilder();for(let i=0;i<3;i++){const a=i*Math.PI*2/3;b.box([.04,.27,.025],[Math.sin(a)*.13,Math.cos(a)*.13,0],paint,[0,0,-a]);}return b.finish()[0].geometry;},[paint]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{if(rotor.current&&clock.enabled&&running)rotor.current.rotation.z=clock.time*.65;});
  return <group ref={rotor} position={windRotorCentre(level)}><mesh geometry={geometry} castShadow raycast={noRaycast}><meshStandardMaterial vertexColors roughness={.82}/></mesh></group>;
}

const glowVertex=`varying vec2 xy;void main(){xy=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const glowFragment=`varying vec2 xy;uniform float opacity;uniform vec3 tint;void main(){float d=length((xy-.5)*2.);gl_FragColor=vec4(tint,(1.-smoothstep(.1,1.,d))*opacity);}`;
function Marquee({tileId,level,paint,running}:{tileId:number;level:number;paint:string;running:boolean}) {
  const lamps=LIGHTING[useTimeOfDay()].lamps;
  const clock=useCityClock(),bulbs=useRef<THREE.InstancedMesh>(null);
  const positions=useMemo(()=>marqueePositions(tileId,level),[tileId,level]);
  const tools=useMemo(()=>({matrix:new THREE.Matrix4(),color:new THREE.Color()}),[]);
  const uniforms=useMemo(()=>({opacity:{value:.2},tint:{value:new THREE.Color('#ffd08a')}}),[]);
  useFrame(()=>{
    if(!bulbs.current)return;
    positions.forEach((p,i)=>{bulbs.current!.setMatrixAt(i,tools.matrix.makeTranslation(...p));bulbs.current!.setColorAt(i,tools.color.set(paint).multiplyScalar(lamps*(clock.enabled&&running?marqueeBrightness(clock.time,i)*1.65:1)));});
    bulbs.current.instanceMatrix.needsUpdate=true;if(bulbs.current.instanceColor)bulbs.current.instanceColor.needsUpdate=true;
    uniforms.opacity.value=lamps*(running?.19+(clock.enabled?Math.sin(clock.time*1.1)*.035:0):.08);
  });
  if(!positions.length)return null;
  return <group><instancedMesh ref={bulbs} args={[undefined,undefined,positions.length]} frustumCulled={false} raycast={noRaycast}><sphereGeometry args={[.019,8,6]}/><meshBasicMaterial toneMapped={false}/></instancedMesh>
    <mesh position={[0,.063,tileId===20?.64:.55]} rotation={[-Math.PI/2,0,0]} raycast={noRaycast}><planeGeometry args={[1.10,.30]}/><shaderMaterial uniforms={uniforms} vertexShader={glowVertex} fragmentShader={glowFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending}/></mesh>
  </group>;
}

function TheatreBeams({level,active}:{level:number;active:boolean}) {
  const time=useTimeOfDay();
  const clock=useCityClock(),left=useRef<THREE.Group>(null),right=useRef<THREE.Group>(null),root=useRef<THREE.Group>(null);
  useFrame(()=>{if(root.current)root.current.visible=active&&time!=='morning';if(!clock.enabled||!active)return;for(const [ref,sign] of [[left,-1],[right,1]] as const)if(ref.current)ref.current.rotation.set(.13+Math.sin(clock.time*.55+sign)*.16,0,sign*(.20+Math.sin(clock.time*.42)*.13));});
  if(level<2)return null;
  return <group ref={root}>{[left,right].map((ref,i)=><group key={i} position={[(i?1:-1)*.26,theatreLightHeight(level),-.43]}><mesh position={[0,.012,0]} raycast={noRaycast}><cylinderGeometry args={[.033,.04,.024,10]}/><meshStandardMaterial color="#675e50" metalness={.5} roughness={.5}/></mesh><group ref={ref}><mesh position={[0,.39,0]} rotation={[0,0,Math.PI]} raycast={noRaycast}><coneGeometry args={[.19,.72,20,1,true]}/><shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} vertexShader={glowVertex} fragmentShader={`varying vec2 xy;void main(){gl_FragColor=vec4(vec3(1.,.70,.38),pow(sin(xy.y*3.14159265),2.)*.045);}`}/></mesh></group></group>)}</group>;
}

function ExchangeBeacon({running}:{running:boolean}) {
  const clock=useCityClock(),material=useRef<THREE.MeshBasicMaterial>(null);
  useFrame(()=>{material.current?.color.set('#ffce8b').multiplyScalar(running&&clock.enabled?1+.30*Math.sin(clock.time*1.5):1);});
  return <mesh position={[0,1.32,-.10]} raycast={noRaycast}><sphereGeometry args={[.025,8,6]}/><meshBasicMaterial ref={material} toneMapped={false}/></mesh>;
}

export function BuildingActivity({tileId,level,palette,active=true}:{tileId:number;level:number;palette:ArchitecturalPalette;active?:boolean}) {
  const performance=usePerformanceMode();
  const clock=useCityClock(),{gl}=useThree(),elapsed=useRef(0),key=`buildingLife${tileId}`;
  const marquee=marqueePositions(tileId,level).length;
  useEffect(()=>()=>{delete gl.domElement.dataset[key];},[gl,key]);
  useFrame((_,delta)=>{if(performance)return;elapsed.current+=delta;if(elapsed.current<.5)return;elapsed.current=0;if([17,20,23,24,9,33].includes(tileId))gl.domElement.dataset[key]=JSON.stringify({active,smoke:tileId===23&&active&&clock.enabled?24:0,marquee,wind:tileId===24,time:Number(clock.time.toFixed(2))});});
  if(performance)return null;
  return <group>{tileId===23&&<FactorySmoke level={level} active={active}/>}{tileId===24&&<WindRotor level={level} paint={palette.wall} running={active}/>}{(tileId===20||tileId===17)&&<Marquee tileId={tileId} level={level} paint={palette.glow} running={active}/>}{tileId===20&&<TheatreBeams level={level} active={active}/>}{[9,33].includes(tileId)&&<ExchangeBeacon running={active}/>}</group>;
}
