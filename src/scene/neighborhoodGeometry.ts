import * as THREE from 'three';
import {DetailBuilder,type V3} from './detailGeometry';
import {CITY,cityHash,type CityBuilding} from './distantCity';

/** One baked, vertex-coloured batch. Details stay below the existing roof envelope. */
export function neighborhoodGeometry(buildings:CityBuilding[]){
  const b=new DetailBuilder();
  const stone='#c3bba6',trim='#e2d8bf',iron='#455953',wood='#917357',glass='#476d70';
  for(const house of buildings){
    if(house.band==='far')continue;
    const {width:w,depth:d,height:h,roofHeight:rh,rotation:r}=house;
    const body=h-rh,c=Math.cos(r),s=Math.sin(r);
    const point=(x:number,y:number,z:number):V3=>[house.x+c*x+s*z,CITY.groundY+y,house.z-s*x+c*z];
    const box=(size:V3,x:number,y:number,z:number,color:string)=>b.box(size,point(x,y,z),color,[0,r,0]);
    // Small paved plots replace the abrupt grass-to-wall join.
    box([w+.16,.06,d+.16],0,.03,0,stone);
    box([w+.07,.14,d+.07],0,.14,0,'#968e7c');
    box([w+.10,.10,d+.10],0,body-.08,0,trim);
    if(house.band==='mid')continue;
    const accent=['#6f8980','#af8266','#687f8b','#9b916c'][Math.floor(cityHash(house.id,21)*4)];
    if(rh===0){
      // Recessed roof and four coping edges, all inside the original height.
      box([w-.13,.035,d-.13],0,h+.018,0,'#69746b');
      for(const sign of [-1,1]){
        box([w,.12,.07],0,h-.05,sign*(d/2-.035),trim);
        box([.07,.12,d],sign*(w/2-.035),h-.05,0,trim);
      }
    }
    // Ground-floor shop glazing, cornice and fabric awnings on both street faces.
    for(const sign of [-1,1]){
      const z=sign*(d/2+.018);
      box([w*.72,.52,.035],0,.48,z,glass);
      for(const x of [-w*.36,0,w*.36])box([.045,.57,.05],x,.49,z+sign*.02,trim);
      box([w*.83,.12,.20],0,.85,z,accent);
      if(house.band==='near'){
        for(const x of [-w/2+.07,w/2-.07])box([.10,Math.max(.2,body-1.15),.07],x,(body+1.0)/2,z,trim);
        // Horizontal string courses keep windows aligned with the shader's floors.
        for(let y=1.90;y<body-.3;y+=.95)box([w,.055,.055],0,y,z,stone);
      }
    }
  }
  const y=CITY.groundY,ring=(CITY.boardHalf+CITY.streetOuter)/2;
  // Rotate one coherent streetscape to each side of the square.
  for(let side=0;side<4;side++){
    const r=side*Math.PI/2,c=Math.cos(r),s=Math.sin(r);
    const p=(x:number,h:number,z:number):V3=>[c*x+s*z,y+h,-s*x+c*z];
    const box=(size:V3,x:number,h:number,z:number,color:string)=>b.box(size,p(x,h,z),color,[0,r,0]);
    for(const z of [ring-.91,ring+.91]){
      for(const sign of [-1,1])box([11.1,.065,.12],sign*7,.047,z,stone);
    }
    // Paving joints and inset grass beds form a consistent promenade.
    for(let x=-12;x<=12;x+=1.5){
      if(Math.abs(x)<2)continue;
      box([.025,.012,.65],x,.025,14.95,'#929c89');
    }
    for(const x of [-11,-7,-3,3,7,11]){
      box([1.18,.12,.64],x,.09,14.96,stone);
      box([1.02,.03,.49],x,.16,14.96,'#647d59');
      b.cylinder(.065,.65,p(x,.49,14.96),wood,'stone',6);
      b.add(new THREE.IcosahedronGeometry(.42,0),'#6c875c',p(x,1.02,14.96),[0,0,0],'stone');
      b.add(new THREE.IcosahedronGeometry(.30,0),'#8c9d6d',p(x+.10,1.29,14.96),[0,0,0],'stone');
      // Low lamps stay clear of the board sight lines.
      const lx=x+1.35;
      box([.07,.92,.07],lx,.49,14.8,iron);
      box([.20,.08,.20],lx,.98,14.8,trim);
      box([.25,.05,.25],lx,1.045,14.8,iron);
    }
    for(const x of [-9,9]){
      box([.90,.07,.29],x,.29,14.9,wood);
      box([.90,.24,.05],x,.43,15.04,wood);
      for(const sign of [-1,1])box([.07,.23,.25],x+sign*.32,.15,14.9,iron);
    }
    // Crosswalks at avenue mouths and stop lines before the junction.
    for(let i=0;i<7;i++)box([.16,.012,1.48],-.9+i*.3,.027,ring,'#ddd7bb');
    for(const sign of [-1,1])box([.06,.012,.67],sign*1.45,.027,ring+sign*.43,'#ddd7bb');
    for(let z=16.5;z<37;z+=2)box([.045,.012,.72],0,.027,z,'#c6bda3');
    // Avenue shoulders join the river approaches without spreading into lots.
    for(const sign of [-1,1])box([.10,.045,22],sign*1.13,.027,26.5,stone);
  }
  return b.finish()[0].geometry;
}
