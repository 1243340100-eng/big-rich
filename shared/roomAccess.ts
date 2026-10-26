export interface ActiveRoom {
  code:string;
  round:number;
  players:{id:string;name:string;bot:boolean;connected:boolean;job:string}[];
}
export interface RoomRequest {
  id:string;
  code:string;
  kind:'close'|'replace';
  requesterName:string;
  targetId?:string;
  targetName?:string;
  endsAt:number;
}
export interface RoomRequestResult {id:string;code:string;message:string;accepted:boolean;}
