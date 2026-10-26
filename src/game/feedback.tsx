import {useEffect,useRef,useState} from 'react';
import {money,propertyRent,propertyOperatingIncome} from '../../shared/finance';
import type {GameState,Player} from '../../shared/types';
import {fmt} from './CashflowPanel';

type Cue='buy'|'upgrade'|'rent'|'settlement'|'cash'|'victory'|'restructure'|'end'|'casinoTick'|'casinoSafe'|'casinoBust'|'casinoJackpot';
let audio:AudioContext|undefined,lastCue=0;
// Original synthesised tones: no downloaded or third-party audio assets.
export async function unlockAudio() {
  try {audio??=new AudioContext();await audio.resume();return audio.state==='running';}catch{return false;}
}
export function playCue(cue:Cue,volume:number) {
  if(!audio||audio.state!=='running'||Date.now()-lastCue<220&&!['casinoSafe','casinoBust','casinoJackpot','cash','victory'].includes(cue)||document.hidden)return;
  lastCue=Date.now();
  const notes:Record<Cue,number[]>={buy:[660,880],upgrade:[240,320,480,720],rent:[880,1175],settlement:[220,165],cash:[110,1318,1760,2093,1568,2637],victory:[523,659,784,1047,1319,1568],restructure:[130,98],end:[196],casinoTick:[185],casinoSafe:[660,880],casinoBust:[110,73],casinoJackpot:[523,659,784]};
  notes[cue].forEach((hz,i)=>{
    const osc=audio!.createOscillator(),gain=audio!.createGain(),time=audio!.currentTime+i*.09;
    osc.type=cue==='upgrade'||cue==='cash'||cue==='victory'?'triangle':'sine';osc.frequency.value=hz;
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(Math.max(0,Math.min(1,volume))*.06,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+.16);
    osc.connect(gain);gain.connect(audio!.destination);osc.start(time);osc.stop(time+.18);
  });
}
export function CashNumber({value,reduced}:{value:number;reduced:boolean}) {
  const [shown,setShown]=useState(value),last=useRef(value);
  useEffect(()=> {
    const from=last.current;last.current=value;
    if(reduced){setShown(value);return;}
    let frame=0;const start=performance.now();
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/420);setShown(from+(value-from)*(1-(1-t)**3));if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[value,reduced]);
  return <span>{fmt(money(shown))}</span>;
}
export function useGameFeedback(state:GameState|null,me:Player|undefined,sound:boolean,volume:number) {
  const previous=useRef<GameState|null>(null),[feedback,setFeedback]=useState<{id:number;text:string;tone:Cue}|null>(null),[receipt,setReceipt]=useState<Player['lastSettlement']>();
  useEffect(()=> {
    const old=previous.current;previous.current=state;
    if(!state||!me){setReceipt(undefined);setFeedback(null);return;}
    const before=old?.code===state.code?old.players.find(p=>p.id===me.id):undefined;
    if(!before){setReceipt(undefined);return;} // Reconnecting or switching rooms must not replay old financial events.
    let event:{text:string;tone:Cue}|undefined,cue:Cue|undefined;
    if(me.lastSettlement?.id&&me.lastSettlement.id!==before.lastSettlement?.id){setReceipt(me.lastSettlement);event={text:'本回合结算已入账',tone:'settlement'};cue=me.lastSettlement.total<0?'settlement':'cash';}
    if(me.defaults>before.defaults){event={text:'重组完成，现金 30 万；请重新评估债务',tone:'restructure'};cue=undefined;}
    const owned=state.properties.filter(a=>a.owner===me.id);
    const bought=owned.find(a=>old!.properties.find(b=>b.tileId===a.tileId)?.owner!==me.id);
    const upgraded=owned.find(a=>{const prior=old!.properties.find(b=>b.tileId===a.tileId);return prior?.owner===me.id&&a.level>prior.level;});
    if(bought){event={text:`地契已入账 · 经营 +${propertyOperatingIncome(state,bought)}/回合 · 租金 ${propertyRent(state,bought)} 万/次`,tone:'buy'};cue=undefined;}
    if(upgraded){const prior=old!.properties.find(b=>b.tileId===upgraded.tileId)!;event={text:`升级已确认 · 经营 +${propertyOperatingIncome(old!,prior)} → +${propertyOperatingIncome(state,upgraded)}/回合 · 租金 +${money(propertyRent(state,upgraded)-propertyRent(old!,prior))} 万/次`,tone:'upgrade'};cue=undefined;}
    // Use explicit rent receipts: a salary and rent may occur during the same move.
    const newLogs=state.logs.filter(l=>!old!.logs.some(a=>a.id===l.id));
    const rent=newLogs.find(l=>l.rent&&(l.rent.payer===me.id||l.rent.recipient===me.id))?.rent;
    if(rent){event={text:rent.recipient===me.id?`收到税后租金 +${fmt(rent.net)} 万`:`支付租金 -${fmt(rent.gross)} 万`,tone:'rent'};cue=undefined;}
    if(event){setFeedback({id:Date.now(),...event});if(sound)playCue(cue??event.tone,volume);}
  },[state,me,sound,volume]);
  useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(null),3800);return()=>clearTimeout(timer);},[feedback]);
  return {feedback,receipt,dismissReceipt:()=>setReceipt(undefined)};
}
