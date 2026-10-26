import type { V3 } from './detailGeometry';

export const PEDESTRIAN_RADIUS=.085;
export interface WalkingRoute { a:number; b:number; z:number; y:number; turn:number; side:number; count:number; speed:number; }
// Short pavement loops leave the crossings, benches, bicycles and traffic lanes clear.
export const STREET_WALKS:WalkingRoute[]=Array.from({length:4},(_,side)=>[
  {a:-8.8,b:-6.2,z:10.66,y:.09,turn:.09,side,count:3,speed:.22},
  {a:6.2,b:8.8,z:10.66,y:.09,turn:.09,side,count:3,speed:.22},
]).flat();
export const PLAZA_WALK:WalkingRoute={a:-1.05,b:1.05,z:1.13,y:.13,turn:.09,side:0,count:6,speed:.19};
export const routeLength=(route:WalkingRoute)=>2*(route.b-route.a)+2*Math.PI*route.turn;

/** A capsule-shaped closed path: positions and headings remain continuous at U-turns. */
export function walkingPose(route:WalkingRoute,time:number,index:number) {
  const length=route.b-route.a,r=route.turn,perimeter=routeLength(route);
  let d=((time*route.speed+index/route.count*perimeter)%perimeter+perimeter)%perimeter;
  let x:number,z:number,dx:number,dz:number;
  if(d<length){x=route.a+d;z=-r;dx=1;dz=0;}
  else if((d-=length)<Math.PI*r){const a=-Math.PI/2+d/r;x=route.b+Math.cos(a)*r;z=Math.sin(a)*r;dx=-Math.sin(a);dz=Math.cos(a);}
  else if((d-=Math.PI*r)<length){x=route.b-d;z=r;dx=-1;dz=0;}
  else {d-=length;const a=Math.PI/2+d/r;x=route.a+Math.cos(a)*r;z=Math.sin(a)*r;dx=-Math.sin(a);dz=Math.cos(a);}
  z+=route.z;
  const angle=route.side*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  return {x:c*x+s*z,z:-s*x+c*z,y:route.y,yaw:Math.atan2(c*dx+s*dz,-s*dx+c*dz),stride:Math.sin(time*8+index*2.1)*.40,bob:Math.pow(Math.sin(time*8+index*2.1),2)*.004};
}

export const factoryChimneyTop=(level:number)=>1.065+level*.16;
export const windRotorCentre=(level:number):V3=>[-.39,1.03+level*.18,-.365];
export const theatreLightHeight=(level:number)=>1.045+level*.13;
export const DYNAMIC_MODEL_PARTS=new Set(['energy-wind-blade','theatre-marquee-bulb','cinema-marquee-bulb','exchange-beacon']);
export function marqueePositions(tileId:number,level:number):V3[] {
  return tileId===20?Array.from({length:11},(_,i)=>[-.5+i*.1,.48,.600]):tileId===17&&level>=1?Array.from({length:9},(_,i)=>[-.38+i*.095,.32,.529]):[];
}
export function smokePuff(time:number,index:number,count=12) {
  const age=((time*.27+index/count)%1+1)%1;
  return {x:age*.14+Math.sin(time*.7+index)*.026*age,y:.025+age*.78,z:Math.sin(age*4+index*.7)*.035*age,size:.085+age*.22,opacity:Math.sin(age*Math.PI)**2*.31};
}
export const marqueeBrightness=(time:number,index:number)=>.58+.42*(.5+.5*Math.sin(time*3-index*.85));
export function cityTimeStep(time:number,delta:number,enabled:boolean,visible:boolean) {
  return time+(enabled&&visible?Math.min(.05,Math.max(0,Number.isFinite(delta)?delta:0)):0);
}
