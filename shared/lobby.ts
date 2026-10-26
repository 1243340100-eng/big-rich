export interface LobbyStatus {
  status:'empty'|'lobby'|'playing';
  players:number;
  capacity:number;
  emptyExpiresAt?:number;
}
