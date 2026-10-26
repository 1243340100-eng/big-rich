import * as THREE from 'three';
import {neighborhoodGeometry} from './neighborhoodGeometry';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type CityBand='near'|'mid'|'far';
export const CITY={
  enabled:true,
  seed:20261025,
  stage:3 as 0|1|2|3,
  groundY:-.30,
  // Wide FOV at distance 140 exposes a radius-120 rim in the foreground.
  // Extending this same 32-segment ground adds no triangles or draw calls.
  groundRadius:220,
  boardHalf:11.4,
  streetOuter:15.5,
  gridCells:80,
  streetHalfWidth:1.2,
  gap:.28,
  fog:[65,135] as const,
  heightLimits:{clearanceSlope:.57,screenIntercept:13.5,screenSlope:.3},
  atmosphere:{nearRatio:.68,farRatio:1.75,nearCap:55,farCap:120,zoomNear:.8,zoomFar:1.5,sceneZoomNear:.7,sceneZoomFar:1.2},
  river:[38,55] as const,
  bands:{
    near:{minRadius:15.5,maxRadius:26,count:70,width:[6,14],widthScale:.22,height:[3,9],heightScale:.65,roofFraction:.6},
    mid:{minRadius:26,maxRadius:38,count:60,width:[10,20],widthScale:.24,height:[6,14],heightScale:.55,roofFraction:0},
    far:{minRadius:55,maxRadius:90,count:90,width:[20,45],widthScale:.24,height:[14,30],heightScale:1,roofFraction:0},
  },
  colors:['#ddcfb1','#ddc9a3','#e1d1ba','#c9d0c1'],
  ground:'#788570',water:'#567d7c',street:'#52605c',paving:'#b5b39c',marking:'#c6bda3',bridge:'#929d91',
  maxTriangles:30000,maxDrawCalls:5,
  wideFov:82,
};

export interface CityBuilding{
  id:number;band:CityBand;x:number;z:number;radius:number;width:number;depth:number;height:number;roofHeight:number;rotation:number;
  halfX:number;halfZ:number;nearestRadius:number;clearance:number;color:[number,number,number];
}
export function cityHash(seed:number,salt=0){const x=Math.sin(seed*127.1+salt*311.7)*43758.5453;return x-Math.floor(x);}
export function allowedHeight(radius:number){return Math.max(0,.9*(radius-CITY.boardHalf));}
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

/** The entire footprint, not just its centre, must leave the square plaza free. */
export function footprintClearance(x:number,z:number,halfX:number,halfZ:number){
  return Math.hypot(Math.max(0,Math.abs(x)-halfX-CITY.boardHalf),Math.max(0,Math.abs(z)-halfZ-CITY.boardHalf));
}
export function cityBuildings(seed=CITY.seed,stage:number=CITY.stage):CityBuilding[]{
  const result:CityBuilding[]=[];
  const span=CITY.bands.far.maxRadius*2,step=span/CITY.gridCells;
  for(const [bandIndex,band] of (['near','mid','far'] as const).entries()){
    if(bandIndex>stage)break;
    const config=CITY.bands[band];
    const candidates:CityBuilding[]=[];
    for(let i=0;i<CITY.gridCells;i++)for(let j=0;j<CITY.gridCells;j++){
      const id=i*131+j*17+seed;
      const x=-span/2+(i+.5)*step+(cityHash(id,0)-.5)*step*.18;
      const z=-span/2+(j+.5)*step+(cityHash(id,1)-.5)*step*.18;
      const radius=Math.hypot(x,z);
      if(radius<config.minRadius||radius>config.maxRadius)continue;
      const width=mix(config.width[0],config.width[1],cityHash(id,3))*config.widthScale;
      const depth=width*mix(.7,1.3,cityHash(id,4));
      const rotation=band==='far'?cityHash(id,5)*Math.PI:Math.floor(cityHash(id,5)*4)*Math.PI/2;
      const c=Math.abs(Math.cos(rotation)),s=Math.abs(Math.sin(rotation));
      const halfX=(width*c+depth*s)/2,halfZ=(width*s+depth*c)/2;
      const nearestRadius=Math.hypot(Math.max(0,Math.abs(x)-halfX),Math.max(0,Math.abs(z)-halfZ));
      // Reserve the ring street, the full river annulus and the four avenues.
      if(Math.abs(x)-halfX<CITY.streetOuter&&Math.abs(z)-halfZ<CITY.streetOuter)continue;
      if(Math.abs(x)-halfX<CITY.streetHalfWidth||Math.abs(z)-halfZ<CITY.streetHalfWidth)continue;
      if(band==='far'&&nearestRadius<CITY.river[1]+.45)continue;
      if(band!=='far'&&Math.hypot(Math.abs(x)+halfX,Math.abs(z)+halfZ)>CITY.river[0]-.45)continue;
      if(Math.hypot(Math.abs(x)+halfX,Math.abs(z)+halfZ)>CITY.bands.far.maxRadius)continue;
      const clearance=footprintClearance(x,z,halfX,halfZ);
      // A lower limit also protects the square board's diagonal corners.
      const screenCap=band==='far'?18:CITY.heightLimits.screenIntercept-CITY.heightLimits.screenSlope*Math.hypot(Math.abs(x)+halfX,Math.abs(z)+halfZ);
      const height=Math.min(mix(config.height[0],config.height[1],cityHash(id,2))*config.heightScale,allowedHeight(nearestRadius),clearance*CITY.heightLimits.clearanceSlope,screenCap);
      if(height<1.5)continue;
      const quadrant=Math.abs(z)>=Math.abs(x)?(z>0?0:2):(x>0?1:3);
      const paint=new THREE.Color(CITY.colors[quadrant]);
      const grey=(paint.r+paint.g+paint.b)/3;paint.lerp(new THREE.Color(grey,grey,grey),.15).multiplyScalar(mix(.82,.94,cityHash(id,6)));
      candidates.push({id,band,x,z,radius,width,depth,height,roofHeight:0,rotation,halfX,halfZ,nearestRadius,clearance,color:paint.toArray() as [number,number,number]});
    }
    candidates.sort((a,b)=>cityHash(a.id,7)-cityHash(b.id,7)||a.id-b.id);
    const accepted:CityBuilding[]=[];
    for(const candidate of candidates){
      if(result.some(other=>Math.abs(candidate.x-other.x)<candidate.halfX+other.halfX+CITY.gap&&Math.abs(candidate.z-other.z)<candidate.halfZ+other.halfZ+CITY.gap))continue;
      result.push(candidate);accepted.push(candidate);
      if(accepted.length===config.count)break;
    }
    if(stage>0&&band==='near'){
      const roofs=[...accepted].sort((a,b)=>cityHash(a.id,8)-cityHash(b.id,8)||a.id-b.id);
      roofs.slice(0,Math.round(config.count*config.roofFraction)).forEach(building=>building.roofHeight=Math.min(.85,building.height*.2));
    }
  }
  if(stage>=3)result.filter(b=>b.band==='mid').slice(0,2).forEach(b=>b.height-=.26);
  return result;
}

export interface CityRoofFixture extends CityBuilding{baseHeight:number;}
export function cityRoofFixtures(buildings:CityBuilding[],stage:number=CITY.stage):CityRoofFixture[]{
  return stage<3?[]:buildings.filter(b=>b.band==='mid').slice(0,2).map(building=>({...building,id:-building.id,baseHeight:building.height,width:.58,depth:.38,height:.22,roofHeight:0,color:building.color.map(value=>value*.66) as [number,number,number]}));
}

/** Far towers stay down in every default framing, including portrait screens. */
export function farVisibility(distance:number,defaultDistance:number){
  const base=Math.min(132,defaultDistance);
  const start=base+Math.max(4,Math.min(14,(140-base)*.25));
  const end=base+Math.max(6,Math.min(48,(140-base)*.8));
  const t=THREE.MathUtils.clamp((distance-start)/(end-start),0,1);
  return t*t*(3-2*t);
}
export function cityOverviewFov(distance:number,defaultDistance:number){return 38+(CITY.wideFov-38)*farVisibility(distance,defaultDistance);}

export function cityFogRanges(distance:number,defaultDistance:number){
  const delta=Math.max(0,distance-defaultDistance),a=CITY.atmosphere;
  return {near:Math.min(a.nearCap,defaultDistance*a.nearRatio)+delta*a.zoomNear,far:Math.min(a.farCap,defaultDistance*a.farRatio)+delta*a.zoomFar,sceneNear:CITY.fog[0]+delta*a.sceneZoomNear,sceneFar:CITY.fog[1]+delta*a.sceneZoomFar};
}

function tint(geometry:THREE.BufferGeometry,color:string){
  const source=geometry;geometry=source.index?source.toNonIndexed():source;if(source!==geometry)source.dispose();
  const paint=new THREE.Color(color),colors=new Float32Array(geometry.getAttribute('position').count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=paint.r;colors[i+1]=paint.g;colors[i+2]=paint.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.deleteAttribute('uv');return geometry;
}
function merged(parts:THREE.BufferGeometry[]){const geometry=mergeGeometries(parts,false)!;parts.forEach(part=>part.dispose());geometry.computeBoundingSphere();return geometry;}
function flatRect(width:number,depth:number,x:number,z:number,y:number,color:string){return tint(new THREE.PlaneGeometry(width,depth).rotateX(-Math.PI/2).translate(x,y,z),color);}
export function cityGroundGeometry(){
  // 160 triangles include a river; all three surfaces share one draw call.
  const ground=tint(new THREE.CircleGeometry(CITY.river[0],32).rotateX(-Math.PI/2).translate(0,CITY.groundY,0),CITY.ground);
  const river=tint(new THREE.RingGeometry(...CITY.river,32).rotateX(-Math.PI/2).translate(0,CITY.groundY,0),CITY.water);
  const outer=tint(new THREE.RingGeometry(CITY.river[1],CITY.groundRadius,32).rotateX(-Math.PI/2).translate(0,CITY.groundY,0),CITY.ground);
  return merged([ground,river,outer]);
}
export function cityStreetGeometry(){
  const parts:THREE.BufferGeometry[]=[],inner=CITY.boardHalf,outer=CITY.streetOuter,y=CITY.groundY+.006;
  // A square annulus connects every edge and corner of the existing square board.
  for(const sign of [-1,1]){
    parts.push(flatRect(outer*2,outer-inner,0,sign*(inner+outer)/2,y,CITY.paving));
    parts.push(flatRect(outer-inner,inner*2,sign*(inner+outer)/2,0,y,CITY.paving));
  }
  const r=(inner+outer)/2,roadWidth=1.7;
  for(const sign of [-1,1]){
    parts.push(flatRect(outer*2,roadWidth,0,sign*r,y+.003,CITY.street));
    parts.push(flatRect(roadWidth,outer*2,sign*r,0,y+.003,CITY.street));
    const end=CITY.bands.far.maxRadius,length=end-r,centre=(end+r)/2;
    parts.push(flatRect(CITY.streetHalfWidth*2,length,0,sign*centre,y+.003,CITY.street));
    parts.push(flatRect(length,CITY.streetHalfWidth*2,sign*centre,0,y+.003,CITY.street));
    const riverLength=CITY.river[1]-CITY.river[0]+1,riverCentre=(CITY.river[0]+CITY.river[1])/2;
    parts.push(flatRect(CITY.streetHalfWidth*2+.15,riverLength,0,sign*riverCentre,y+.008,CITY.bridge));
    parts.push(flatRect(riverLength,CITY.streetHalfWidth*2+.15,sign*riverCentre,0,y+.008,CITY.bridge));
    for(let dash=-5;dash<=5;dash++){
      if(Math.abs(dash)<1)continue;
      parts.push(flatRect(.65,.035,dash*2.4,sign*r,y+.008,CITY.marking));
      parts.push(flatRect(.035,.65,sign*r,dash*2.4,y+.008,CITY.marking));
    }
  }
  return merged(parts);
}
export function cityRoofGeometry(){
  const vertices=[[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],[0,1,0]];
  const faces=[[0,4,1],[1,4,2],[2,4,3],[3,4,0],[0,1,2],[0,2,3]];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(face=>face.flatMap(i=>vertices[i])),3));geometry.computeVertexNormals();return geometry;
}
export function cityTriangleCount(buildings:CityBuilding[],stage:number=CITY.stage){
  const ground=cityGroundGeometry(),street=cityStreetGeometry(),roof=cityRoofGeometry();
  const triangles=(buildings.length+cityRoofFixtures(buildings,stage).length)*12+buildings.filter(b=>b.roofHeight>0).length*6+ground.getAttribute('position').count/3+street.getAttribute('position').count/3;
  const detail=stage>=3?neighborhoodGeometry(buildings):null;
  const total=triangles+(detail?detail.getAttribute('position').count/3:0);
  detail?.dispose();ground.dispose();street.dispose();roof.dispose();return total;
}
export const noCityRaycast:THREE.Object3D['raycast']=()=>{};
