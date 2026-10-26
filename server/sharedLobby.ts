import type {GameState} from '../shared/types';
import type {LobbyStatus} from '../shared/lobby';

export interface Room {
  state:GameState;
  tokens:Record<string,string>;
  updated:number;
  lobbyDisconnects?:Record<string,number>;
  emptySince?:number;
}
export const EMPTY_ROOM_GRACE_MS=120000;
export function trackEmptyRoom(room:Room,now=Date.now()){
  if(!room.state.sharedRoom||room.state.status==='finished')return false;
  const before=room.emptySince;
  if(room.state.players.some(p=>!p.bot&&p.connected))delete room.emptySince;
  else room.emptySince??=now;
  return before!==room.emptySince;
}
export function emptyRoomExpired(room:Room,now=Date.now()){
  return !!room.state.sharedRoom&&room.state.status!=='finished'&&!room.state.players.some(p=>!p.bot&&p.connected)&&room.emptySince!==undefined&&now-room.emptySince>=EMPTY_ROOM_GRACE_MS;
}
export const LOBBY_RECONNECT_MS=60000;
export function sharedRoom(rooms:Map<string,Room>){
  const active=[...rooms.values()].filter(r=>r.state.sharedRoom&&r.state.status!=='finished');
  return active.find(r=>r.state.status==='playing')??active.find(r=>r.state.status==='lobby');
}
export function lobbyStatus(rooms:Map<string,Room>):LobbyStatus {
  const room=sharedRoom(rooms);
  return {status:!room||!room.state.players.length?'empty':room.state.status==='playing'?'playing':'lobby',players:room?.state.players.length??0,capacity:8,...(room?.emptySince!==undefined?{emptyExpiresAt:room.emptySince+EMPTY_ROOM_GRACE_MS}: {})};
}
export function assignLobbyHost(room:Room){
  const s=room.state;
  if(s.status!=='lobby'||s.players.some(p=>p.id===s.hostId&&p.connected&&!p.bot))return;
  s.hostId=(s.players.find(p=>p.connected&&!p.bot)??s.players.find(p=>!p.bot)??s.players[0])?.id??'';
}
export function removeLobbyPlayer(room:Room,id:string){
  if(!room.state.sharedRoom||room.state.status!=='lobby')return false;
  const before=room.state.players.length;
  room.state.players=room.state.players.filter(p=>p.id!==id);
  if(before===room.state.players.length)return false;
  for(const [token,owner] of Object.entries(room.tokens))if(owner===id)delete room.tokens[token];
  if(room.lobbyDisconnects)delete room.lobbyDisconnects[id];
  assignLobbyHost(room);room.state.version++;return true;
}
export function pruneLobby(room:Room,now=Date.now()){
  if(!room.state.sharedRoom||room.state.status!=='lobby')return false;
  let changed=false;
  for(const p of [...room.state.players]){
    const since=room.lobbyDisconnects?.[p.id];
    if(!p.bot&&!p.connected&&since!==undefined&&now-since>=LOBBY_RECONNECT_MS)changed=removeLobbyPlayer(room,p.id)||changed;
  }
  return changed;
}
