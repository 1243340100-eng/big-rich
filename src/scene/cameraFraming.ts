/** Existing overview framing, shared with the outskirts LOD without changing it. */
export function overviewCameraDistance(width:number,height:number,inRoom:boolean,showcase=false){
  const aspect=Math.max(.3,width/Math.max(1,height));
  const verticalFov=38*Math.PI/180;
  const horizontalFov=2*Math.atan(Math.tan(verticalFov/2)*aspect);
  const limitingFov=Math.min(verticalFov,horizontalFov);
  const radius=inRoom?15.2:16.5;
  const framing=showcase?(aspect<1?.95:.62):1;
  return Math.max(42,radius/Math.sin(limitingFov/2))*framing;
}

/** A distant portrait overview needs more depth precision than close inspection. */
export function boardCameraNear(distance:number){
  return Math.min(4,Math.max(.5,distance*.04));
}

// Covers the full city even at OrbitControls' maximum distance of 140.
export const BOARD_CAMERA_FAR=420;
