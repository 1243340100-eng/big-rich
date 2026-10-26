import {createContext,useContext,useSyncExternalStore} from 'react';
import {TIMES,type TimeOfDay} from '../../shared/worldTime';

export {TIMES,type TimeOfDay} from '../../shared/worldTime';
export const TimeOfDayContext=createContext<TimeOfDay|null>(null);
export const LIGHTING = {
  morning: {label:'早晨', caption:'晨光', sky:'#aec7cb', ground:'#65786d', sun:'#fff0ce', position:[14,18,-10], sunPower:3.1, ambient:.38, hemisphere:1.05, fill:'#9bc5e8', fillPower:.75, lamps:.04, windows:.025, shadow:.35},
  dusk: {label:'黄昏', caption:'暮色', sky:'#354d49', ground:'#102a32', sun:'#ffb875', position:[-16,11,13], sunPower:2.8, ambient:.16, hemisphere:.56, fill:'#6094a8', fillPower:.7, lamps:1, windows:.48, shadow:.62},
  night: {label:'深夜', caption:'月夜', sky:'#0b152b', ground:'#142235', sun:'#9dbcec', position:[-7,19,-15], sunPower:1.05, ambient:.12, hemisphere:.4, fill:'#607bb5', fillPower:.42, lamps:1.45, windows:1.25, shadow:.72},
} satisfies Record<TimeOfDay, {label:string;caption:string;sky:string;ground:string;sun:string;position:number[];sunPower:number;ambient:number;hemisphere:number;fill:string;fillPower:number;lamps:number;windows:number;shadow:number}>;

export function isTimeOfDay(value:unknown): value is TimeOfDay {return TIMES.includes(value as TimeOfDay);}
const key='capital-time-of-day', event='capital-time-of-day-change';
let current:TimeOfDay|undefined;
function snapshot():TimeOfDay {
  if(current)return current;
  if(typeof window==='undefined')return 'dusk';
  const requested=new URLSearchParams(window.location.search).get('time');
  if(isTimeOfDay(requested))return current=requested;
  try {const saved=localStorage.getItem(key);if(isTimeOfDay(saved))return current=saved;} catch {/* Storage may be disabled. */}
  return current='dusk';
}
function subscribe(notify:()=>void){
  const storage=(e:StorageEvent)=>{if(e.key===key||e.key===null){current=isTimeOfDay(e.newValue)?e.newValue:'dusk';notify();}};
  window.addEventListener(event,notify);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(event,notify);window.removeEventListener('storage',storage);};
}
export function useTimeOfDay(){
  const match=useContext(TimeOfDayContext);
  const selection=useSyncExternalStore(subscribe,snapshot,()=>'dusk' as TimeOfDay);
  return match??selection;
}
export function setTimeOfDay(value:TimeOfDay){
  current=value;
  try{localStorage.setItem(key,value);}catch{/* Retain the in-memory selection. */}
  // Keep explicit preview links in sync with the user's latest selection.
  const url=new URL(window.location.href);
  if(url.searchParams.has('time')){url.searchParams.set('time',value);window.history.replaceState(window.history.state,'',url);}
  window.dispatchEvent(new Event(event));
}
