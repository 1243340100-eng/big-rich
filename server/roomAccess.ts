import type {Server,Socket} from 'socket.io';
import {randomBytes} from 'node:crypto';
import type {ActiveRoom,RoomRequest,RoomRequestResult} from '../shared/roomAccess';
import {sharedRoom,type Room} from './sharedLobby';
import {publicState} from './publicState';

export const ROOM_REQUEST_MS=10_000;
type Pending={view:RoomRequest;requester:string;timer:ReturnType<typeof setTimeout>};
export function roomAccess(io:Server,rooms:Map<string,Room>,callbacks:{
  close:(room:Room,reason:string)=>void;
  connect:(socket:Socket,room:Room,id:string,token:string)=>unknown;
  leave:(socket:Socket,explicit?:boolean)=>void;
}){
  // Ephemeral: a server restart cancels proposals rather than executing old requests.
  const pending=new Map<string,Pending>();
  function summary():ActiveRoom|null{
    const room=sharedRoom(rooms);if(room?.state.status!=='playing')return null;
    return {code:room.state.code,round:room.state.round,players:room.state.players.map(({id,name,bot,connected,job})=>({id,name,bot,connected,job}))};
  }
  function publish(){io.emit('activeRoom',summary());}
  function seated(socket:Socket,code:string){return socket.data.code===code&&!socket.data.spectator&&rooms.get(code)?.state.players.some(p=>p.id===socket.data.playerId&&!p.bot);}
  function finish(code:string,message:string,accepted=false){
    const request=pending.get(code);if(!request)return;
    clearTimeout(request.timer);pending.delete(code);
    const result:RoomRequestResult={id:request.view.id,code,message,accepted};
    for(const socket of io.sockets.sockets.values())if(socket.id===request.requester||socket.data.code===code)socket.emit('roomRequestResult',result);
  }
  function cancelRequester(socket:Socket){for(const [code,p] of pending)if(p.requester===socket.id)finish(code,'申请人已离开，申请取消');}
  function current(code:unknown){const room=typeof code==='string'?rooms.get(code):undefined;if(!room?.state.sharedRoom||room.state.status!=='playing')throw Error('这场联机对局已经结束或不存在');return room;}
  function sendPending(socket:Socket){const p=pending.get(socket.data.code);if(p&&seated(socket,p.view.code))socket.emit('roomRequest',p.view);}
  function request(socket:Socket,payload:any){
    const room=current(payload.code),code=room.state.code;
    if(socket.data.code)throw Error('请先返回首页，再申请操作房间');
    if(payload.kind!=='close'&&payload.kind!=='replace')throw Error('无效申请');
    if(pending.has(code))throw Error('已有申请正在等待回应，请稍后重试');
    const name=typeof payload.name==='string'?payload.name.trim().slice(0,16):'';
    if(!name)throw Error('请先填写你的名字');
    const target=payload.kind==='replace'?room.state.players.find(p=>p.id===payload.targetId):undefined;
    if(payload.kind==='replace'&&!target)throw Error('请选择房内的一名玩家');
    const view:RoomRequest={id:randomBytes(12).toString('hex'),code,kind:payload.kind,requesterName:name,endsAt:Date.now()+ROOM_REQUEST_MS,...(target?{targetId:target.id,targetName:target.name}:{})};
    const timer=setTimeout(()=>{
      if(pending.get(code)?.view.id!==view.id)return;
      const applicant=io.sockets.sockets.get(socket.id);
      if(!applicant?.connected||applicant.data.code){finish(code,'申请人已离开，申请取消');return;}
      if(rooms.get(code)!==room||room.state.status!=='playing'){finish(code,'房间状态已变化，申请取消');return;}
      if(view.kind==='close'){
        finish(code,'10 秒内无人反对，房间已关闭',true);
        callbacks.close(room,'房外关闭申请在 10 秒内无人反对，房间已关闭');
      }else{
        const player=room.state.players.find(p=>p.id===view.targetId);
        if(!player){finish(code,'该玩家已不存在，申请取消');return;}
        finish(code,`10 秒内无人反对，${name} 已接替 ${player.name}`,true);
        // Revoke every previous credential before granting a fresh one.
        for(const [token,id] of Object.entries(room.tokens))if(id===player.id)delete room.tokens[token];
        for(const old of io.sockets.sockets.values())if(old.data.code===code&&old.data.playerId===player.id){
          old.data.code=undefined;old.data.playerId=undefined;old.data.spectator=false;
          old.emit('identityTaken',{code,reason:`${name} 已接替你的身份，你已返回首页，可重新进入观战`});
        }
        player.bot=false;
        const token=randomBytes(24).toString('hex');room.tokens[token]=player.id;
        applicant.emit('takeoverGranted',callbacks.connect(applicant,room,player.id,token));
      }
    },ROOM_REQUEST_MS);
    pending.set(code,{view,requester:socket.id,timer});
    for(const member of io.sockets.sockets.values())if(seated(member,code))member.emit('roomRequest',view);
    socket.emit('roomRequest',view);
    return {request:view};
  }
  function respond(socket:Socket,payload:any){
    const p=pending.get(payload.code);
    if(!p||p.view.id!==payload.id)throw Error('申请已结束');
    if(Date.now()>=p.view.endsAt)throw Error('回应时间已结束');
    if(payload.cancel===true){if(p.requester!==socket.id)throw Error('只有申请人可以撤回');finish(payload.code,'申请人已撤回申请');return {};}
    if(!seated(socket,payload.code))throw Error('只有房内玩家可以回应');
    if(typeof payload.reject!=='boolean')throw Error('无效回应');
    if(payload.reject){const name=rooms.get(payload.code)!.state.players.find(p=>p.id===socket.data.playerId)!.name;finish(payload.code,`${name} 反对，申请已取消`);}
    // Agreement never shortens the ten-second veto window.
    return {};
  }
  function watch(socket:Socket,payload:any){
    const room=current(payload.code);
    if(socket.data.playerId)throw Error('请先离开当前玩家身份再观战');
    cancelRequester(socket);callbacks.leave(socket,true);
    socket.data.code=room.state.code;socket.data.playerId=undefined;socket.data.spectator=true;
    return {code:room.state.code,spectator:true,state:publicState(room.state,'')};
  }
  return {summary,publish,request,respond,watch,sendPending,cancelRequester,hasPending:(code:string)=>pending.has(code),cancelRoom:(code:string)=>finish(code,'房间已关闭，申请取消')};
}
