import {useSyncExternalStore} from 'react';
const query='(prefers-reduced-motion: reduce)',event='capital-motion-preference';
const mobileQuery='(max-width: 759px)';
let preference=false,performancePreference=false;
const snapshot=()=>{try{return preference||localStorage.getItem('capital-reduce-motion')==='true'||window.matchMedia(query).matches;}catch{return preference||window.matchMedia(query).matches;}};
function subscribe(callback:()=>void){const media=window.matchMedia(query);media.addEventListener('change',callback);window.addEventListener(event,callback);return()=>{media.removeEventListener('change',callback);window.removeEventListener(event,callback);};}
export const useReducedMotion=()=>useSyncExternalStore(subscribe,snapshot,()=>false);
export function setReducedMotion(value:boolean){preference=value;try{localStorage.setItem('capital-reduce-motion',String(value));}catch{/* Keep the in-memory setting when storage is unavailable. */}window.dispatchEvent(new Event(event));}

const performanceEvent='capital-performance-preference';
const performanceSnapshot=()=>{if(typeof window==='undefined')return false;try{return performancePreference||localStorage.getItem('capital-performance-mode')==='true';}catch{return performancePreference;}};
function subscribePerformance(callback:()=>void){if(typeof window==='undefined')return()=>{};window.addEventListener(performanceEvent,callback);return()=>window.removeEventListener(performanceEvent,callback);}
/** Optional low-power profile for phones: lower pixel cost, fewer decorative passes. */
export const usePerformanceMode=()=>useSyncExternalStore(subscribePerformance,performanceSnapshot,()=>false);
export function setPerformanceMode(value:boolean){performancePreference=value;try{localStorage.setItem('capital-performance-mode',String(value));}catch{/* Keep the in-memory setting when storage is unavailable. */}if(typeof window!=='undefined')window.dispatchEvent(new Event(performanceEvent));}

const mobileSnapshot=()=>typeof window!=='undefined'&&window.matchMedia(mobileQuery).matches;
function subscribeMobile(callback:()=>void){if(typeof window==='undefined')return()=>{};const media=window.matchMedia(mobileQuery);media.addEventListener('change',callback);return()=>media.removeEventListener('change',callback);}
/** True below the 759px phone breakpoint; components use it to start collapsed. */
export const useMobileLayout=()=>useSyncExternalStore(subscribeMobile,mobileSnapshot,()=>false);
