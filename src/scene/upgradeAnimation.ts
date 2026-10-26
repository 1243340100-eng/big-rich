export const UPGRADE_TIMING = {
  scaffoldEnd: 1.22,
  wrapEnd: 1.96,
  commit: 2.08,
  revealStart: 2.48,
  revealEnd: 3.22,
  scaffoldClearStart: 2.95,
  scaffoldClearEnd: 3.32,
  bounceStart: 3.14,
  duration: 4.15,
} as const;

export type ConstructionPhase = 'scaffold' | 'wrap' | 'covered' | 'reveal' | 'settle';
export interface UpgradeRun { id:number; from:number; to:number; elapsed:number; }
const clamp = (x:number) => Math.max(0,Math.min(1,x));
const progress = (t:number,a:number,b:number) => clamp((t-a)/(b-a));
const smooth = (x:number) => x*x*(3-2*x);
const easeOutBack = (x:number) => 1+2.70158*Math.pow(x-1,3)+1.70158*Math.pow(x-1,2);

export function constructionFrame(elapsed:number) {
  const t=Math.max(0,elapsed), k=UPGRADE_TIMING;
  const wrapping=progress(t,k.scaffoldEnd,k.wrapEnd);
  const revealing=progress(t,k.revealStart,k.revealEnd);
  const bounce=progress(t,k.bounceStart,k.duration);
  const spring=t<k.bounceStart?0:Math.cos(bounce*Math.PI*4.5)*Math.exp(-5.5*bounce)*(1-smooth(progress(bounce,.78,1)));
  const phase:ConstructionPhase=t<k.scaffoldEnd?'scaffold':t<k.wrapEnd?'wrap':t<k.revealStart?'covered':t<k.revealEnd?'reveal':'settle';
  return {
    phase,
    coverDrop: t<k.revealStart?smooth(wrapping):1-smooth(revealing),
    coverOpacity: 1-smooth(progress(revealing,.72,1)),
    scaffoldOpacity: 1-smooth(progress(t,k.scaffoldClearStart,k.scaffoldClearEnd)),
    buildingY: 1-.13*spring,
    buildingXZ: 1+.055*spring,
    clothBillow: Math.sin(wrapping*Math.PI)*.010,
    celebration: progress(t,3.10,4.05),
  };
}

/** Each complete perimeter grows from the ring below it, with a small overshoot. */
export function scaffoldRingProgress(elapsed:number, index:number, count:number) {
  const start=.03+index*(UPGRADE_TIMING.scaffoldEnd-.31)/Math.max(1,count-1);
  const p=progress(elapsed,start,start+.28);
  return p===0?0:p===1?1:easeOutBack(p);
}

/** Financial state changes immediately; only the rendered model waits for the curtain. */
export class BuildingUpgradeTimeline {
  displayLevel:number;
  requestedLevel:number;
  identity:string;
  owner:string;
  run:UpgradeRun|null=null;
  private serial=0;
  constructor(level:number, identity:string, owner='') {
    this.displayLevel=level; this.requestedLevel=level; this.identity=identity; this.owner=owner;
  }
  private start(from:number,to:number) { this.run={id:++this.serial,from,to,elapsed:0}; }
  sync(level:number, identity:string, animate=true, owner='') {
    if(!animate || identity!==this.identity || (owner!==this.owner&&this.requestedLevel>=0) || level<this.requestedLevel) {
      this.owner=owner; this.identity=identity; this.displayLevel=level; this.requestedLevel=level; this.run=null;
      return;
    }
    this.owner=owner;
    if(level>this.requestedLevel) {
      this.requestedLevel=level;
      if(!this.run)this.start(this.displayLevel,level);
    }
  }
  replay(level:number) {
    this.requestedLevel=level;
    this.displayLevel=Math.max(0,level-1);
    this.run=null;
    if(level>0)this.start(this.displayLevel,level);
  }
  advance(delta:number) {
    if(!Number.isFinite(delta)||delta<0)return;
    let remaining=delta;
    while(this.run) {
      const run=this.run;
      const step=Math.min(remaining,UPGRADE_TIMING.duration-run.elapsed);
      run.elapsed+=step;remaining-=step;
      if(run.elapsed>=UPGRADE_TIMING.commit)this.displayLevel=run.to;
      if(run.elapsed<UPGRADE_TIMING.duration)break;
      this.displayLevel=run.to;this.run=null;
      // Rapid requests keep the current construction intact and coalesce the next target.
      if(this.requestedLevel>this.displayLevel)this.start(this.displayLevel,this.requestedLevel);
      if(remaining<=0)break;
    }
  }
}
