import {isCharacterSkin,type CharacterSkin} from '../../shared/characters';
const key='capital-character-skin';
export function readCharacterPreference():CharacterSkin{try{const saved=localStorage.getItem(key);if(isCharacterSkin(saved))return saved;}catch{/* Use the default when storage is unavailable. */}return 'lucky-cat';}
export function saveCharacterPreference(skin:CharacterSkin){try{localStorage.setItem(key,skin);}catch{/* The room still retains the choice. */}}
