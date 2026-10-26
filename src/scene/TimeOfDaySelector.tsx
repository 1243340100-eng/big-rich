import {Sunrise, Sunset, MoonStar} from 'lucide-react';
import {LIGHTING,TIMES,setTimeOfDay,useTimeOfDay} from './timeOfDay';
import './time-of-day.css';
const icons={morning:Sunrise,dusk:Sunset,night:MoonStar};
export function TimeOfDaySelector({className=''}:{className?:string}){
  const time=useTimeOfDay();
  return <div className={`time-of-day ${className}`} role="group" aria-label="场景时段">{TIMES.map(value=>{const Icon=icons[value];return <button key={value} type="button" aria-pressed={time===value} onClick={()=>setTimeOfDay(value)} title={`${LIGHTING[value].label}光影`}><Icon size={14}/>{LIGHTING[value].label}</button>;})}</div>;
}
