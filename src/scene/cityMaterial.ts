import * as THREE from 'three';

export interface CityMaterialUniforms{near:{value:number};far:{value:number};windows:{value:number};}
/** Reuse the scene's fog colour; fade only background surfaces sooner at overview. */
export function cityMaterial(uniforms:CityMaterialUniforms,vertexColors=false,facade=false){
  const material=new THREE.MeshStandardMaterial({vertexColors,roughness:.98});
  material.customProgramCacheKey=()=>`city-bowl-stable-windows-v3-${vertexColors}-${facade}`;
  material.onBeforeCompile=shader=>{
    shader.uniforms.cityFogNear=uniforms.near;shader.uniforms.cityFogFar=uniforms.far;shader.uniforms.cityWindows=uniforms.windows;
    shader.fragmentShader='uniform float cityFogNear;\nuniform float cityFogFar;\nuniform float cityWindows;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`
      #ifdef USE_FOG
        float cityFog=smoothstep(cityFogNear,cityFogFar,vFogDepth);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,cityFog);
      #endif
    `);
    if(!facade)return;
    // Instance constants must not be perspective-interpolated across fragments.
    const varyings='varying vec3 cityLocal;\nvarying vec3 cityNormal;\nflat varying vec3 citySize;\nflat varying vec2 cityOrigin;\n';
    shader.vertexShader=varyings+shader.vertexShader;
    shader.fragmentShader=varyings+shader.fragmentShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      cityLocal=position;cityNormal=normal;
      citySize=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      cityOrigin=floor(instanceMatrix[3].xz*4.0+vec2(.5));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 wall=vec2(abs(cityNormal.x)>.5?cityLocal.z*citySize.z:cityLocal.x*citySize.x,(cityLocal.y+.5)*citySize.y);
      vec2 grid=wall/vec2(.75,.95)+vec2(.5,0.0),cell=fract(grid);
      vec2 pixel=max(fwidth(grid),vec2(.001)),soft=min(pixel,vec2(.23));
      vec2 paneEdges=smoothstep(vec2(.28)-soft,vec2(.28)+soft,cell)*(1.0-smoothstep(vec2(.72)-soft,vec2(.72)+soft,cell));
      float pane=paneEdges.x*paneEdges.y*(1.0-smoothstep(.30,.65,max(pixel.x,pixel.y)));
      pane*=step(abs(cityNormal.y),.5)*step(.65,wall.y)*step(wall.y,citySize.y-.3);
      // Small integer arithmetic is exact in highp float. A sin hash multiplied
      // by 43758 amplified interpolation noise into different on/off decisions.
      vec2 windowId=floor(grid);
      float windowHash=mod(dot(windowId,vec2(23.0,47.0))+dot(cityOrigin,vec2(17.0,37.0)),101.0);
      windowHash=mod(windowHash*windowHash*13.0+windowHash*17.0+19.0,101.0);
      float occupied=step(54.0,windowHash);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.23,.24),pane*.65);
      totalEmissiveRadiance+=vec3(1.0,.58,.24)*pane*occupied*cityWindows*.85;
      float roofEdge=1.0-step(.11,min((.5-abs(cityLocal.x))*citySize.x,(.5-abs(cityLocal.z))*citySize.z));
      diffuseColor.rgb*=1.0-roofEdge*step(.5,cityNormal.y)*.18;
    `);
  };
  return material;
}
