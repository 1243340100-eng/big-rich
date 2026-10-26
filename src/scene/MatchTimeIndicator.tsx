import {useState} from 'react';
import {ChevronDown,ChevronUp,MoonStar,Sunrise,Sunset} from 'lucide-react';
import {matchTime,TIMES} from '../../shared/worldTime';
import {LIGHTING} from './timeOfDay';
import './time-of-day.css';

const icons={morning:Sunrise,dusk:Sunset,night:MoonStar};
const STORAGE='capital-match-time-open';
function initialOpen(){if(typeof window!=='undefined'&&window.matchMedia('(max-width:759px)').matches)return false;try{return localStorage.getItem(STORAGE)!=='0';}catch{return true;}}

export function MatchTimeIndicator({value,finished,defaultOpen}:{value:ReturnType<typeof matchTime>;finished:boolean;defaultOpen?:boolean}){
  const [open,setOpen]=useState(()=>defaultOpen??initialOpen());
  const toggle=()=>setOpen(current=>{const next=!current;try{localStorage.setItem(STORAGE,next?'1':'0');}catch{/* Storage may be disabled. */}return next;});
  const seconds=Math.ceil(value.remaining/1000);
  const countdown=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  return <aside className={`match-time game-time ${open?'is-open':'is-collapsed'}`} aria-label="对局时间">
    <button type="button" className="match-time-toggle" aria-expanded={open} onClick={toggle} title={open?'收起时间面板':'展开时间面板'}>
      <strong aria-live="polite">第 {value.day} 天 · {LIGHTING[value.time].label}</strong>
      {open&&<small>{finished?'已定格':'自动循环'}</small>}
      {open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
    </button>
    {open&&<>
      <div className="match-time-phases" aria-hidden="true">{TIMES.map(time=>{const Icon=icons[time];return <span key={time} className={time===value.time?'active':''}><Icon size={13}/>{LIGHTING[time].label}</span>;})}</div>
      <small className="match-time-next" role="timer" aria-live="off">{finished?'对局结束，保留此刻光影':`${countdown} 后进入${LIGHTING[value.next].label}`}</small>
    </>}
  </aside>;
}
