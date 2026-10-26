import { createContext, useContext, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { cityTimeStep } from './cityActivity';
import { usePerformanceMode, useReducedMotion } from '../game/preferences';

const query='(prefers-reduced-motion: reduce)';
function subscribe(callback:()=>void){const media=window.matchMedia(query);media.addEventListener('change',callback);return ()=>media.removeEventListener('change',callback);}
const snapshot=()=>window.matchMedia(query).matches;
const CityClock=createContext({time:0,enabled:false});
export const useCityClock=()=>useContext(CityClock);
export function CityMotionProvider({children}:{children:ReactNode}) {
  const reduced=useReducedMotion(),performance=usePerformanceMode();
  const clock=useRef({time:0,enabled:!reduced&&!performance}).current;
  clock.enabled=!reduced&&!performance;
  useFrame((_,delta)=>{clock.time=cityTimeStep(clock.time,delta,clock.enabled,!document.hidden);},-1);
  return <CityClock.Provider value={clock}>{children}</CityClock.Provider>;
}
