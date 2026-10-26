import {Suspense,useEffect,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {ContactShadows,OrbitControls} from '@react-three/drei';
import {Check,RotateCw,Sparkles} from 'lucide-react';
import {CHARACTER_SKINS,characterFor,type CharacterSkin} from '../../shared/characters';
import {CharacterModel} from '../scene/CharacterModel';
import {useReducedMotion} from './preferences';
import {Dialog} from './Dialog';
import './characters.css';

export {readCharacterPreference,saveCharacterPreference} from './characterPreference';
function PreviewInfo({skin}:{skin:CharacterSkin}){const {gl}=useThree();useEffect(()=>{gl.domElement.dataset.characterSkin=skin;},[gl,skin]);return null;}
export function CharacterPreview({skin,color}:{skin:CharacterSkin;color?:string}){
  const reduced=useReducedMotion();
  return <Canvas shadows dpr={[1,1.6]} camera={{position:[2.0,1.65,3.8],fov:32}} gl={{antialias:true}} aria-label={`${characterFor(skin).name}三维预览`}>
    <color attach="background" args={['#ebe7dd']}/><ambientLight intensity={.55}/><hemisphereLight args={['#fff4e4','#b9c7bb',.9]}/>
    <directionalLight position={[-3,5,5]} intensity={2.6} color="#fff0d7" castShadow shadow-mapSize={[1024,1024]}/><directionalLight position={[4,2,-2]} intensity={1.25} color="#d5e8f4"/>
    <Suspense fallback={null}><CharacterModel skin={skin} color={color}/><ContactShadows position={[0,-.012,0]} opacity={.32} scale={4} blur={2.5} far={3} resolution={256}/></Suspense>
    <OrbitControls target={[0,.85,0]} enablePan={false} enableZoom={false} autoRotate={!reduced} autoRotateSpeed={.65} minPolarAngle={.5} maxPolarAngle={1.65}/><PreviewInfo skin={skin}/>
  </Canvas>;
}
export function CharacterWardrobe({value,color,onChoose,onClose,blocked=''}:{value:CharacterSkin;color?:string;onChoose:(skin:CharacterSkin)=>void;onClose:()=>void;blocked?:string}){
  const [preview,setPreview]=useState(value),skin=characterFor(preview);
  return <Dialog title="选择你的城市伙伴" className="character-wardrobe" onClose={onClose}>
    <div className="wardrobe-layout">
      <div className="character-preview"><CharacterPreview skin={preview} color={color}/><span className="character-edition">CITY COMPANIONS / 01—08</span><span className="character-rotate"><RotateCw size={12}/>拖动旋转 · 查看细节</span></div>
      <div className="character-collection"><div className="character-intro"><span><Sparkles size={13}/> 城市伙伴系列</span><h3>{skin.name}</h3><b>{skin.title}</b><p>{skin.description}</p></div>
        <div className="character-options" role="group" aria-label="角色皮肤">{CHARACTER_SKINS.map((item,index)=><button key={item.id} type="button" aria-pressed={preview===item.id} onClick={()=>setPreview(item.id)} title={item.title}><span className="character-emoji" aria-hidden="true" style={{background:item.color+'40'}}>{item.emoji}</span><span><small>NO. {String(index+1).padStart(2,'0')}</small><b>{item.name}</b></span>{value===item.id&&<Check size={13}/>}</button>)}</div>
        <button className="primary character-confirm" disabled={!!blocked} onClick={()=>onChoose(preview)}><Check size={16}/>使用{skin.name}</button>{blocked&&<p className="disabled-reason">{blocked}</p>}<small className="character-note">对局中也能更换 · 皮肤不影响属性与收益</small>
      </div>
    </div>
  </Dialog>;
}
