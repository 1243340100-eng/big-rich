import * as THREE from 'three';
import {Model} from './buildingPrimitives';
import {INNER_SPECS} from './propertyGeometry';
import type {ArchitecturalPalette} from './detailGeometry';

/** Six small commissions, all fitted inside the original plot and roof envelope. */
export function innerPrestige(id:number){return (b:Model,p:ArchitecturalPalette)=>{
  const s=INNER_SPECS[id],h=.06+s.h0+3*s.grow,f=s.d/2-.06;
  const gold='#be9758',ink='#263e43',glass='#467c88',cream='#e2d9bf';
  const block=(tag:string,size:[number,number,number],pos:[number,number,number],paint:string,finish:'stone'|'metal'|'glass'|'light'='stone')=>b.block(`prestige-l3-${s.tag}-${tag}`,size,pos,paint,false,finish);
  // Side and rear elevations remain detailed when seen from the opposite street.
  for(const side of [-1,1])for(let j=0;j<3;j++){
    block('side-inset',[.018,.15,.12],[side*(s.w/2+.012),.43+j*.19,-.07],id===38?ink:glass,'glass');
    block('side-reveal',[.026,.016,.15],[side*(s.w/2+.017),.52+j*.19,-.07],gold,'metal');
  }
  for(const x of [-s.w*.3,0,s.w*.3]){
    block('rear-panel',[.12,.24,.018],[x,.45,-.07-s.d/2],glass,'glass');
    block('rear-frame',[.14,.018,.028],[x,.58,-.075-s.d/2],gold,'metal');
  }
  for(const side of [-1,1]){
    block('entry-planter',[.13,.09,.19],[side*.57,.105,.42],cream);
    block('entry-greenery',[.11,.07,.17],[side*.57,.18,.42],'#557960');
    block('entry-light',[.025,.06,.025],[side*.57,.20,.54],p.glow,'light');
  }
  if(id===36){
    // Exchange hall: tall bronze colonnade and a full-width market ticker.
    block('ticker-housing',[.73,.20,.055],[0,.86,f+.04],ink,'metal');
    for(let i=0;i<12;i++){
      const bar=.035+(i%4)*.025;
      block('ticker-quote',[.035,bar,.012],[-.31+i*.056,.81+bar/2,f+.073],i%4===0?'#dc9973':'#81d8b2','light');
    }
    for(const x of [-.35,-.23,.23,.35]){
      b.post('prestige-l3-trading-hall-column',.023,.06,.73,x,f+.10,gold);
      block('column-cap',[.07,.035,.075],[x,.72,f+.10],cream);
    }
    block('portico-entablature',[.83,.06,.22],[0,.76,f+.05],cream);
    block('portico-gold-line',[.85,.018,.24],[0,.79,f+.05],gold,'metal');
    for(const x of [-.27,0,.27])block('clerestory',[.18,.15,.02],[x,h-.11,f+.012],glass,'glass');
  }else if(id===37){
    // Data atelier: cyan curtain wall, irregular data bars and a diagonal exoskeleton.
    block('blue-curtain-wall',[s.w+.015,.82,.025],[0,.83,f+.02],'#235d73','glass');
    for(let i=0;i<6;i++){
      block('data-fin',[.018,.92,.045],[-.28+i*.112,.83,f+.04],i%2?gold:'#86bcc5','metal');
      for(let j=0;j<5;j++)block('data-cell',[.055,.022,.012],[-.25+i*.1,.49+j*.145,f+.066],(i+j)%3===0?'#87d7dd':ink,(i+j)%3===0?'light':'metal');
    }
    for(const side of [-1,1])for(let j=0;j<3;j++)b.rod([side*(s.w/2+.025),.4+j*.28,-.27],[side*(s.w/2+.025),.67+j*.28,.15],.012,gold);
    for(const side of [-1,1])for(let j=0;j<5;j++)block('server-louver',[.14,.015,.025],[side*.41,.12+j*.045,.075],ink,'metal');
  }else if(id===38){
    // Vault: circular steel door with brass locking bolts, stone ribs and narrow slits.
    block('portal-stone',[.48,.53,.10],[0,.325,f+.11],cream);
    b.part('prestige-l3-vault-door',new THREE.CylinderGeometry(.185,.185,.045,32),[0,.34,f+.18],ink,false,[Math.PI/2,0,0],'metal');
    b.part('prestige-l3-vault-ring',new THREE.TorusGeometry(.155,.015,8,32),[0,.34,f+.208],gold,false,[0,0,0],'metal');
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;block('locking-bolt',[.027,.027,.025],[Math.cos(a)*.128,.34+Math.sin(a)*.128,f+.22],cream,'metal');
    }
    block('door-spindle',[.13,.02,.025],[0,.34,f+.232],gold,'metal');
    block('door-spindle',[.02,.13,.025],[0,.34,f+.232],gold,'metal');
    for(const x of [-.31,.31]){block('fortified-rib',[.065,.66,.08],[x,.39,f+.035],cream);block('security-slit',[.10,.025,.012],[x,.65,f+.08],'#8ad7d2','light');}
    for(let j=0;j<4;j++)block('stone-course',[.73,.012,.025],[0,.13+j*.17,-.075-s.d/2],gold,'metal');
  }else if(id===39){
    // Procurement arcade: striped canopies, individual stalls and roof glazing.
    for(const x of [-.29,0,.29]){
      block('display-window',[.22,.31,.023],[x,.50,f+.02],glass,'glass');
      for(const dx of [-.115,.115])block('arcade-pier',[.035,.54,.07],[x+dx,.33,f+.06],cream);
      for(let i=0;i<4;i++)block('striped-awning',[.065,.035,.24],[x-.098+i*.065,.70,f+.10],i%2?cream:'#4f8b7c');
      block('display-counter',[.22,.09,.10],[x,.30,f+.08],gold);
    }
    for(const x of [-.20,0,.20]){
      // Follow the front roof pitch so the panes remain visible above the roof.
      b.part('prestige-l3-procurement-skylight-frame',new THREE.BoxGeometry(.18,.014,.21),[x,h+.108,.09],gold,false,[.386,0,0],'metal');
      b.part('prestige-l3-procurement-skylight-pane',new THREE.BoxGeometry(.15,.012,.18),[x,h+.118,.09],glass,false,[.386,0,0],'glass');
    }
  }else if(id===40){
    // Flagship maison: oxblood facade, tall gold frame, jewel medallion and display vitrines.
    block('brand-portal',[.40,.96,.045],[0,.87,f+.035],'#713d46');
    for(const x of [-.23,.23])block('gold-ribbon',[.035,1.15,.065],[x,.82,f+.04],gold,'metal');
    block('brand-lintel',[.50,.035,.07],[0,1.38,f+.04],gold,'metal');
    b.part('prestige-l3-flagship-medallion',new THREE.TorusGeometry(.095,.012,8,24),[0,1.12,f+.065],gold,false,[0,0,0],'metal');
    b.part('prestige-l3-flagship-jewel',new THREE.OctahedronGeometry(.065),[0,1.12,f+.075],cream,false,[0,0,0],'metal');
    for(const x of [-.115,.115]){
      block('boutique-vitrine',[.17,.38,.04],[x,.57,f+.065],glass,'glass');
      block('display-pedestal',[.11,.06,.07],[x,.43,f+.09],cream);
      b.part('prestige-l3-flagship-display',new THREE.OctahedronGeometry(.037),[x,.50,f+.12],gold,false,[0,0,0],'metal');
    }
    block('arrival-canopy',[.66,.04,.30],[0,.36,f+.13],ink,'metal');
    block('canopy-edge',[.66,.012,.025],[0,.35,f+.28],p.glow,'light');
  }else{
    // Logistics bays: three rolling shutters, steel loading canopy and packed cargo.
    for(const x of [-.29,0,.29]){
      block('dock-door',[.23,.38,.04],[x,.32,f+.04],ink,'metal');
      for(let j=0;j<7;j++)block('roller-slat',[.22,.013,.012],[x,.16+j*.048,f+.067],'#8d9d98','metal');
      block('dock-number-light',[.09,.04,.012],[x,.57,f+.07],p.glow,'light');
    }
    block('loading-platform',[1.10,.08,.22],[0,.10,.49],cream);
    block('industrial-canopy',[1.12,.04,.32],[0,.62,.43],'#4b6c69','metal');
    for(const x of [-.52,.52])b.post('prestige-l3-warehouse-bay-canopy-post',.018,.06,.62,x,.55,gold);
    for(let i=0;i<12;i++)block('dock-hazard-stripe',[.045,.018,.025],[-.50+i*.09,.15,.602],i%2?ink:gold,'metal');
    for(const x of [-.53,.53])for(let j=0;j<2;j++){
      block('cargo-case',[.13,.11,.15],[x,.115+j*.11,-.30],j?cream:'#a97c50');
      block('cargo-band',[.02,.10,.154],[x,.115+j*.11,-.30],gold,'metal');
    }
  }
};}
