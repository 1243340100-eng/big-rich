import {memo,useEffect,useMemo} from 'react';
import type {CharacterSkin} from '../../shared/characters';
import {buildCharacter} from './characterGeometry';

export const CharacterModel=memo(function CharacterModel({skin,color='#6ec7ad'}:{skin:CharacterSkin;color?:string}){
  const model=useMemo(()=>buildCharacter(skin,color),[skin,color]);
  useEffect(()=>()=>model.batches.forEach(batch=>batch.geometry.dispose()),[model]);
  return <group name={`character-${skin}`}>{model.batches.map(batch=><mesh key={batch.finish} geometry={batch.geometry} castShadow receiveShadow>
    <meshStandardMaterial vertexColors roughness={batch.finish==='gold'?.36:batch.finish==='gloss'?.24:.82} metalness={batch.finish==='gold'?.58:0}/>
  </mesh>)}</group>;
});
