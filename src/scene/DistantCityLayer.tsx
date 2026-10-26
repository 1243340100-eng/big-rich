import {memo,useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {OrbitControls as OrbitControlsImpl} from 'three-stdlib';
import {CITY,cityBuildings,cityFogRanges,cityGroundGeometry,cityRoofGeometry,cityRoofFixtures,cityStreetGeometry,cityTriangleCount,farVisibility,noCityRaycast,type CityBuilding} from './distantCity';
import {overviewCameraDistance} from './cameraFraming';
import {neighborhoodGeometry} from './neighborhoodGeometry';
import {cityMaterial} from './cityMaterial';
import {LIGHTING,useTimeOfDay} from './timeOfDay';

interface Props{inRoom:boolean;showcase?:boolean;inspect?:boolean;}
function setBuildingMatrix(mesh:THREE.InstancedMesh,index:number,building:CityBuilding,matrix:THREE.Object3D,visibility=1,roof=false){
  const height=roof?building.roofHeight:building.height-building.roofHeight;
  const baseHeight='baseHeight' in building?Number(building.baseHeight):0;
  matrix.position.set(building.x,CITY.groundY+baseHeight+(roof?building.height-building.roofHeight:height*visibility/2),building.z);
  matrix.rotation.set(0,building.rotation,0);
  matrix.scale.set(building.width*visibility,height*visibility,building.depth*visibility);
  if(!visibility)matrix.position.y=CITY.groundY-.05;
  matrix.updateMatrix();mesh.setMatrixAt(index,matrix.matrix);
}
function CityBowl({inRoom,showcase=false}:Props){
  const {camera,size,gl,scene}=useThree(),controls=useThree(state=>state.controls) as OrbitControlsImpl|undefined;
  const time=useTimeOfDay();
  const bodies=useRef<THREE.InstancedMesh>(null),roofs=useRef<THREE.InstancedMesh>(null);
  const buildings=useMemo(()=>cityBuildings(),[]),pitched=useMemo(()=>buildings.filter(b=>b.roofHeight>0),[buildings]);
  const fixtures=useMemo(()=>cityRoofFixtures(buildings),[buildings]);
  const uniforms=useMemo(()=>({near:{value:32},far:{value:82},windows:{value:0}}),[]);
  const materials=useMemo(()=>({ground:cityMaterial(uniforms,true),street:cityMaterial(uniforms,true),body:cityMaterial(uniforms,false,CITY.stage>=3),roof:cityMaterial(uniforms)}),[uniforms]);
  const geometry=useMemo(()=>({body:new THREE.BoxGeometry(1,1,1),roof:cityRoofGeometry(),ground:cityGroundGeometry(),street:cityStreetGeometry(),detail:neighborhoodGeometry(buildings)}),[]);
  const transform=useMemo(()=>new THREE.Object3D(),[]),paint=useMemo(()=>new THREE.Color(),[]);
  const previousVisibility=useRef(-1),diagnosticTime=useRef(0),origin=useMemo(()=>new THREE.Vector3(),[]),projected=useMemo(()=>new THREE.Vector3(),[]);
  const defaultDistance=overviewCameraDistance(size.width,size.height,inRoom,showcase);
  useLayoutEffect(()=>{uniforms.windows.value=CITY.stage>=3?LIGHTING[time].windows:0;},[time,uniforms]);
  useLayoutEffect(()=>{
    if(!bodies.current)return;
    buildings.forEach((building,index)=>{
      setBuildingMatrix(bodies.current!,index,building,transform,building.band==='far'?0:1);
      bodies.current!.setColorAt(index,paint.setRGB(...building.color));
    });
    fixtures.forEach((fixture,index)=>{setBuildingMatrix(bodies.current!,buildings.length+index,fixture,transform);bodies.current!.setColorAt(buildings.length+index,paint.setRGB(...fixture.color));});
    pitched.forEach((building,index)=>{
      setBuildingMatrix(roofs.current!,index,building,transform,1,true);
      roofs.current!.setColorAt(index,paint.setRGB(...building.color).multiplyScalar(.64));
    });
    bodies.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);bodies.current.instanceMatrix.needsUpdate=true;
    if(bodies.current.instanceColor)bodies.current.instanceColor.needsUpdate=true;
    if(roofs.current){roofs.current.instanceMatrix.needsUpdate=true;if(roofs.current.instanceColor)roofs.current.instanceColor.needsUpdate=true;}
    gl.domElement.dataset.cityLayout=JSON.stringify(buildings.map(({id,band,x,z,width,depth,height,roofHeight,rotation,color})=>({id,band,x,z,width,depth,height,roofHeight,rotation,color})));
    gl.domElement.dataset.cityCounts=JSON.stringify({near:buildings.filter(b=>b.band==='near').length,mid:buildings.filter(b=>b.band==='mid').length,far:buildings.filter(b=>b.band==='far').length,roofs:pitched.length});
    gl.domElement.dataset.cityTriangles=String(cityTriangleCount(buildings));
    gl.domElement.dataset.cityDrawCalls=String(pitched.length?5:4);
  },[buildings,pitched,fixtures,transform,paint,gl]);
  useEffect(()=>()=>{
    Object.values(geometry).forEach(item=>item.dispose());
    Object.values(materials).forEach(item=>item.dispose());
    if(scene.fog instanceof THREE.Fog){scene.fog.near=CITY.fog[0];scene.fog.far=CITY.fog[1];}
    for(const key of ['cityLayout','cityCounts','cityTriangles','cityDrawCalls','cityFarVisibility','cityCameraDistance','cityPickSamples'])delete gl.domElement.dataset[key];
  },[geometry,materials,gl,scene]);
  useFrame((_,delta)=>{
    const distance=camera.position.distanceTo(controls?.target??origin);
    const fog=cityFogRanges(distance,defaultDistance);
    uniforms.near.value=fog.near;uniforms.far.value=fog.far;
    // At 140 the original far=135 would hide the centre of the board itself.
    if(scene.fog instanceof THREE.Fog){scene.fog.near=fog.sceneNear;scene.fog.far=fog.sceneFar;}
    const visibility=Math.round(farVisibility(distance,defaultDistance)*40)/40;
    if(bodies.current&&visibility!==previousVisibility.current){
      previousVisibility.current=visibility;
      buildings.forEach((building,index)=>{if(building.band==='far')setBuildingMatrix(bodies.current!,index,building,transform,visibility);});
      bodies.current.instanceMatrix.needsUpdate=true;
    }
    diagnosticTime.current+=delta;
    if(diagnosticTime.current>.25){
      diagnosticTime.current=0;gl.domElement.dataset.cityFarVisibility=String(visibility);gl.domElement.dataset.cityCameraDistance=distance.toFixed(3);
      const samples=[];
      for(const building of buildings){
        if(building.band==='far')continue;
        projected.set(building.x,CITY.groundY+building.height,building.z).project(camera);
        const x=(projected.x+1)*size.width/2,y=(1-projected.y)*size.height/2;
        if(projected.z>-1&&projected.z<1&&x>16&&x<size.width-16&&y>150&&y<size.height-160)samples.push({id:building.id,x,y});
        if(samples.length===12)break;
      }
      gl.domElement.dataset.cityPickSamples=JSON.stringify(samples);
    }
  });
  return <group name="city-bowl" userData={{backgroundCity:true}}>
    <mesh name="city-ground-and-river" geometry={geometry.ground} material={materials.ground} raycast={noCityRaycast} frustumCulled={false} castShadow={false} receiveShadow={false}/>
    <mesh name="city-ring-street-and-bridges" geometry={geometry.street} material={materials.street} raycast={noCityRaycast} frustumCulled={false} castShadow={false} receiveShadow={false}/>
    <mesh name="city-neighborhood-details" geometry={geometry.detail} material={materials.street} raycast={noCityRaycast} frustumCulled={false} castShadow={false} receiveShadow={false}/>
    <instancedMesh ref={bodies} name="city-building-instances" args={[geometry.body,materials.body,buildings.length+fixtures.length]} raycast={noCityRaycast} frustumCulled={false} castShadow={false} receiveShadow={false}/>
    {pitched.length>0&&<instancedMesh ref={roofs} name="city-roof-instances" args={[geometry.roof,materials.roof,pitched.length]} raycast={noCityRaycast} frustumCulled={false} castShadow={false} receiveShadow={false}/>}
  </group>;
}
export const DistantCity=memo(function DistantCity(props:Props){return CITY.enabled&&!props.inspect?<CityBowl {...props}/>:null;});
