import {trackEmptyRoom,emptyRoomExpired,assignLobbyHost,lobbyStatus,pruneLobby,removeLobbyPlayer,sharedRoom,type Room} from './sharedLobby';
import {COLORS} from '../shared/catalog';
import express from 'express';
import {staticAssets} from './staticAssets';
import { ensureFinanceState } from '../shared/finance';
import { ensureMarketState } from './stockMarket';
import { createServer } from 'node:http';
import { Server,type Socket } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPlayer, botAction, createGame, dispatch, log, settleAuction } from './engine';
import type { Action, GameState, Job } from '../shared/types';
import {expireCasino,recoverCasinos,settleCasino} from './casino';
import {publicState} from './publicState';
import {ensureMatchClock} from '../shared/worldTime';
import {roomAccess} from './roomAccess';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dataDir=process.env.DATA_DIR??path.join(root,'data');mkdirSync(dataDir,{recursive:true});
const rooms=new Map<string,Room>();
let casinoRecovery=false,clockRecovery=false,financeRecovery=false;
if(existsSync(path.join(dataDir,'rooms.json'))){
  try { const saved=JSON.parse(readFileSync(path.join(dataDir,'rooms.json'),'utf8')) as [string,Room][];for(const [code,room] of saved){if(Date.now()-room.updated<7*86400000){financeRecovery=ensureFinanceState(room.state)||financeRecovery;ensureMarketState(room.state);clockRecovery=ensureMatchClock(room.state)||clockRecovery;casinoRecovery=recoverCasinos(room.state)||casinoRecovery;for(const p of room.state.players){p.connected=p.bot;if(room.state.sharedRoom&&room.state.status==='lobby'&&!p.bot){room.lobbyDisconnects??={};room.lobbyDisconnects[p.id]??=Date.now();}}trackEmptyRoom(room);rooms.set(code,room);}} }
  catch { console.error('存档无法读取。为避免覆盖旧存档，服务已停止；请先备份并检查 data/rooms.json。');process.exit(1); }
}
const app=express(),http=createServer(app);
const io=new Server(http,{maxHttpBufferSize:16384});
app.get('/api/health',(_req,res)=>res.json({ok:true,app:'capital-city',version:'0.1.0',marketRules:2,economicsRules:3,casinoRules:1,worldClock:1,characterSkins:1,sharedLobby:1,roomLifecycle:1,externalRoomAccess:1,landChoices:1,rooms:rooms.size}));
if(existsSync(path.join(root,'dist'))){app.use(staticAssets(path.join(root,'dist')));app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-cache');res.sendFile(path.join(root,'dist/index.html'));});}
const broadcast=(room:Room)=>{room.updated=Date.now();for(const socket of io.sockets.sockets.values()){if(socket.data.code===room.state.code)socket.emit('state',publicState(room.state,socket.data.playerId??''));}};
let dirty=casinoRecovery||clockRecovery||financeRecovery,saving=false;
async function save(){if(saving||!dirty)return;saving=true;dirty=false;try{await writeFile(path.join(dataDir,'rooms.tmp'),JSON.stringify([...rooms]));await rename(path.join(dataDir,'rooms.tmp'),path.join(dataDir,'rooms.json'));}catch(e){dirty=true;console.error('无法保存对局快照',e);}finally{saving=false;}}
const changed=(r:Room)=>{trackEmptyRoom(r);dirty=true;broadcast(r);if(r.state.sharedRoom){io.emit('lobbyStatus',lobbyStatus(rooms));access.publish();}};
function leave(socket:Socket,explicit=false){
  const room=rooms.get(socket.data.code),id=socket.data.playerId;
  // Detach first so an explicit exit cannot receive a state push that reopens the room.
  socket.data.code=undefined;socket.data.playerId=undefined;socket.data.spectator=false;
  if(!room)return;
  const p=room.state.players.find(p=>p.id===id);if(!p||p.bot)return;
  if(p.casino){if(explicit){settleCasino(room.state,p,'leave');room.state.version++;}else p.casinoDisconnectedAt=Date.now();}
  p.connected=false;
  if(room.state.sharedRoom&&room.state.status==='lobby'){
    if(explicit)removeLobbyPlayer(room,p.id);
    else {room.lobbyDisconnects??={};room.lobbyDisconnects[p.id]=Date.now();assignLobbyHost(room);}
  }else if(room.state.status==='lobby'&&room.state.hostId===p.id){
    const next=room.state.players.find(pl=>pl.connected&&!pl.bot);if(next)room.state.hostId=next.id;
  }
  log(room.state,explicit?`${p.name} 离开房间`:`${p.name} 暂时离线，可刷新页面重连`);changed(room);
}
function closeRoom(room:Room,reason:string){
  const code=room.state.code;
  access.cancelRoom(code);
  for(const socket of io.sockets.sockets.values())if(socket.data.code===code){socket.data.code=undefined;socket.data.playerId=undefined;socket.emit('roomClosed',{code,reason});}
  rooms.delete(code);botNext.delete(code);dirty=true;io.emit('lobbyStatus',lobbyStatus(rooms));access.publish();
}
function pruneLobbies(){for(const room of rooms.values())if(pruneLobby(room)){log(room.state,'大厅已释放超过 60 秒未重连的离线席位');changed(room);}}
function connectPlayer(socket:Socket,room:Room,id:string,token:string){
  access.cancelRequester(socket);
  const code=room.state.code;
  if(socket.data.code&&!(socket.data.code===code&&socket.data.playerId===id))leave(socket,true);
  for(const old of io.sockets.sockets.values())if(old.id!==socket.id&&old.data.code===code&&old.data.playerId===id){old.emit('replaced');old.data.code=undefined;old.data.playerId=undefined;old.disconnect(true);}
  expireCasino(room.state);socket.data.code=code;socket.data.playerId=id;socket.data.spectator=false;
  const joined=room.state.players.find(p=>p.id===id)!;joined.connected=true;delete joined.casinoDisconnectedAt;
  if(room.lobbyDisconnects)delete room.lobbyDisconnects[id];
  assignLobbyHost(room);changed(room);access.sendPending(socket);
  return {code,token,playerId:id,state:publicState(room.state,id)};
}
const access=roomAccess(io,rooms,{close:closeRoom,connect:connectPlayer,leave});
io.on('connection',socket=>{
  let count=0,last=Date.now();
  const guarded=(handler:(payload:any)=>unknown)=>(payload:any,ack?:(data:unknown)=>void)=>{try{if(Date.now()-last>1000){count=0;last=Date.now();}if(++count>15)throw new Error('操作太快，请稍候');if(!payload||typeof payload!=='object')throw new Error('无效请求');const result=handler(payload);if(typeof ack==='function')ack({ok:true,...(result as object)});}catch(e){if(typeof ack==='function')ack({ok:false,error:e instanceof Error?e.message:'请求失败'});}};
  socket.on('clock',guarded(()=>({serverNow:Date.now()})));
  socket.on('activeRoom',guarded(()=>({room:access.summary()})));
  socket.on('requestRoom',guarded(payload=>access.request(socket,payload)));
  socket.on('respondRoom',guarded(payload=>access.respond(socket,payload)));
  socket.on('watchRoom',guarded(payload=>access.watch(socket,payload)));
  socket.on('lobbyStatus',guarded(()=>{pruneLobbies();return {lobby:lobbyStatus(rooms)};}));
  socket.on('enter',guarded(payload=>{
    pruneLobbies();
    const current=rooms.get(socket.data.code),currentId=socket.data.playerId;
    if(current?.state.sharedRoom&&current.state.status!=='finished'&&current.state.players.some(p=>p.id===currentId)){
      const token=Object.entries(current.tokens).find(([,id])=>id===currentId)?.[0];
      if(token)return connectPlayer(socket,current,currentId,token);
    }
    let room=sharedRoom(rooms);
    if(room?.state.status==='playing')throw new Error('对局已开始，已有玩家可刷新重连，新玩家请等待下一局');
    if(room&&room.state.players.length>=8)throw new Error('联机大厅已满（8 人），请等待空位');
    if(!room){
      if(rooms.size>=300)throw new Error('服务器房间数已达上限');
      let code='';do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
      const state=createGame(code);state.sharedRoom=true;room={state,tokens:{},updated:Date.now()};
    }
    const color=COLORS.find(value=>!room!.state.players.some(p=>p.color===value));
    const player=addPlayer(room.state,payload.name,payload.job as Job,false,payload.skin),token=randomBytes(24).toString('hex');
    if(color)player.color=color;
    room.tokens[token]=player.id;rooms.set(room.state.code,room);
    return connectPlayer(socket,room,player.id,token);
  }));
  socket.on('create',guarded(payload=>{
    access.cancelRequester(socket);
    if(rooms.size>=300)throw new Error('服务器房间数已达上限');leave(socket);
    let code='';do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));
    const state=createGame(code),player=addPlayer(state,payload.name,payload.job as Job,false,payload.skin),token=randomBytes(24).toString('hex');
    const room:Room={state,tokens:{[token]:player.id},updated:Date.now()};rooms.set(code,room);socket.data.code=code;socket.data.playerId=player.id;
    if(payload.solo===true){for(let i=0;i<3;i++)addPlayer(state,['林 · 稳健派','周 · 增长派','陈 · 地产派'][i],['银行家','投资经理','房地产商'][i] as Job,true);room.state=dispatch(state,player.id,{type:'start'});}
    changed(room);return {code,token,playerId:player.id,state:publicState(room.state,player.id)};
  }));
  socket.on('join',guarded(payload=>{
    const code=typeof payload.code==='string'?payload.code.trim().toUpperCase():'';const room=rooms.get(code);if(!room)throw new Error('房间不存在，请确认房间码');
    let id=typeof payload.token==='string'?room.tokens[payload.token]:undefined;
    let token=payload.token;
    if(!id&&typeof payload.token==='string')throw new Error('原身份已失效，请重新进入联机大厅');
    if(!id){if(room.state.status!=='lobby')throw new Error('游戏已开始，只能用原浏览器身份重连');const p=addPlayer(room.state,payload.name,payload.job as Job,false,payload.skin);id=p.id;token=randomBytes(24).toString('hex');room.tokens[token]=id;}
    return connectPlayer(socket,room,id,token);
  }));
  socket.on('action',guarded((action:Action)=>{const room=rooms.get(socket.data.code);if(!room)throw new Error('请先进入房间');if(socket.data.spectator||!room.state.players.some(p=>p.id===socket.data.playerId))throw new Error('观战模式不能操作对局');room.state=dispatch(room.state,socket.data.playerId,action);changed(room);return {};}));
  socket.on('closeRoom',guarded(payload=>{
    const room=rooms.get(socket.data.code);
    if(!room||payload.code!==room.state.code)throw new Error('房间已变化，请刷新后重试');
    if(socket.data.playerId!==room.state.hostId)throw new Error('只有房主可以关闭房间');
    closeRoom(room,'房主已关闭房间，可以重新进入大厅开局');return {};
  }));
  socket.on('leave',()=>{access.cancelRequester(socket);leave(socket,true);});
  socket.on('disconnect',()=>{access.cancelRequester(socket);leave(socket);});
});
const botNext=new Map<string,number>();
setInterval(()=>{
  for(const room of rooms.values()){
    if(trackEmptyRoom(room)){dirty=true;if(room.state.sharedRoom)io.emit('lobbyStatus',lobbyStatus(rooms));}
    if(emptyRoomExpired(room)&&!access.hasPending(room.state.code)){closeRoom(room,'所有真人离线满 2 分钟，空房间已自动释放');continue;}
    const s=room.state;if(pruneLobby(room)){log(s,'大厅已释放超过 60 秒未重连的离线席位');changed(room);}if(s.status!=='playing')continue;
    if(expireCasino(s))changed(room);
    if(s.auction&&Date.now()>=s.auction.endsAt){settleAuction(s);changed(room);continue;}
    if(Date.now()<(botNext.get(s.code)??0))continue;
    const bots=s.players.filter(p=>!p.casino&&(p.bot||!p.connected&&Date.now()-s.turnStarted>60000));
    for(const p of bots){const action=botAction(room.state,p.id);if(action){try{room.state=dispatch(room.state,p.id,action);changed(room);}catch{if(action.type==='accept'){room.state.trades=room.state.trades.filter(t=>t.id!==action.tradeId);changed(room);}}botNext.set(s.code,Date.now()+1800);break;}}
  }
},500);
setInterval(()=>void save(),1500);
setInterval(()=>{for(const [code,r] of rooms)if(Date.now()-r.updated>7*86400000){rooms.delete(code);dirty=true;}},60000);
const port=Number(process.env.PORT??3001);http.listen(port,'0.0.0.0',()=>console.log(`资本之城服务器：http://localhost:${port}`));
async function shutdown(){dirty=true;await save();http.close();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
