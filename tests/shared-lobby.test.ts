import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {io,type Socket} from 'socket.io-client';
import {addPlayer,createGame} from '../server/engine';
import {trackEmptyRoom,emptyRoomExpired,EMPTY_ROOM_GRACE_MS,assignLobbyHost,lobbyStatus,pruneLobby,removeLobbyPlayer,sharedRoom,type Room} from '../server/sharedLobby';

function room(code='SHARED'):Room {const state=createGame(code);state.sharedRoom=true;addPlayer(state,'甲');addPlayer(state,'乙');return {state,tokens:{first:state.players[0].id,second:state.players[1].id},updated:Date.now()};}

test('shared lobby explicit leave removes only that seat and token and transfers the host',()=>{
  const r=room(),other=r.state.players[1];assert.ok(removeLobbyPlayer(r,r.state.hostId));assert.deepEqual(r.state.players,[other]);assert.deepEqual(r.tokens,{second:other.id});assert.equal(r.state.hostId,other.id);
  assert.ok(removeLobbyPlayer(r,other.id));assert.equal(r.state.hostId,'');assert.equal(r.state.players.length,0);
});
test('shared lobby disconnects reserve a seat for 60 seconds, while ongoing games never prune players',()=>{
  const r=room(),p=r.state.players[0];p.connected=false;r.lobbyDisconnects={[p.id]:100};
  assert.equal(pruneLobby(r,60099),false);assert.equal(pruneLobby(r,60100),true);assert.equal(r.state.players.length,1);
  const playing=room();playing.state.status='playing';playing.state.players[0].connected=false;playing.lobbyDisconnects={[playing.state.hostId]:0};assert.equal(pruneLobby(playing,100000),false);assert.equal(playing.state.players.length,2);
});
test('only a shared unfinished room is advertised, and a connected human can inherit host authority',()=>{
  const privateRoom=room('PRIVATE');delete privateRoom.state.sharedRoom;
  const done=room('DONE');done.state.status='finished';const shared=room('LOBBY');
  const rooms=new Map([['PRIVATE',privateRoom],['DONE',done],['LOBBY',shared]]);assert.equal(sharedRoom(rooms),shared);assert.deepEqual(lobbyStatus(rooms),{status:'lobby',players:2,capacity:8});
  shared.state.players[0].connected=false;assignLobbyHost(shared);assert.equal(shared.state.hostId,shared.state.players[1].id);
});

test('real clients share one no-code lobby: concurrency, full seats, practice isolation, reconnect and restart',async t=>{
  await mkdir('artifacts',{recursive:true});const dir=await mkdtemp(path.resolve('artifacts/shared-lobby-network-'));
  const port=34000+Math.floor(Math.random()*1000),url=`http://127.0.0.1:${port}`;const clients:Socket[]=[];
  let server:ChildProcess|undefined,stderr='';
  async function start(){server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});server.stderr!.on('data',d=>stderr+=d);for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(stderr||'Server start timeout');}
  async function stop(){if(!server)return;const done=new Promise<void>(r=>server!.once('exit',()=>r()));server.kill();await done;server.stdout?.destroy();server.stderr?.destroy();server=undefined;}
  async function client(){const socket=io(url,{transports:['websocket'],reconnection:false});clients.push(socket);await new Promise<void>((res,rej)=>{socket.once('connect',res);socket.once('connect_error',rej);});return socket;}
  function emit(s:Socket,event:string,payload:unknown):Promise<any>{return new Promise((res,rej)=>s.timeout(5000).emit(event,payload,(e:Error|null,r:any)=>e?rej(e):res(r)));}
  async function saved(predicate:(data:any[])=>boolean):Promise<any[]>{for(let i=0;i<60;i++){try{const data=JSON.parse(await readFile(path.join(dir,'rooms.json'),'utf8'));if(predicate(data))return data;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Snapshot not ready');}
  t.after(async()=>{clients.forEach(s=>s.disconnect());await stop();});await start();
  const entries:{socket:Socket;reply:any}[]=[];
  const a=await client(),b=await client();
  assert.deepEqual((await emit(a,'lobbyStatus',{})).lobby,{status:'empty',players:0,capacity:8});
  const [ra,rb]=await Promise.all([emit(a,'enter',{name:'甲'}),emit(b,'enter',{name:'乙'})]);assert.ok(ra.ok&&rb.ok);assert.equal(ra.code,rb.code);assert.notEqual(ra.playerId,rb.playerId);assert.equal(rb.state.sharedRoom,true);entries.push({socket:a,reply:ra},{socket:b,reply:rb});
  const repeated=await emit(a,'enter',{name:'重复点击'});assert.equal(repeated.playerId,ra.playerId);assert.equal(repeated.token,ra.token);assert.equal(repeated.state.players.length,2);
  const practice=await client(),rp=await emit(practice,'create',{name:'练习',solo:true});assert.ok(rp.ok);assert.notEqual(rp.code,ra.code);assert.equal(rp.state.status,'playing');assert.equal(rp.state.sharedRoom,undefined);
  const malformed=await client();assert.equal((await emit(malformed,'enter',{name:'错误皮肤',skin:'invalid'})).ok,false);
  const more=await Promise.all(Array.from({length:6},()=>client()));const joined=await Promise.all(more.map((s,i)=>emit(s,'enter',{name:`朋友${i}`})));
  joined.forEach((r,i)=>{assert.ok(r.ok);assert.equal(r.code,ra.code);entries.push({socket:more[i],reply:r});});assert.equal(joined.at(-1).state.players.length,8);
  const ninth=await client(),full=await emit(ninth,'enter',{name:'第九人'});assert.equal(full.ok,false);assert.match(full.error,/已满/);assert.equal((await(await fetch(url+'/api/health')).json()).rooms,2);
  const leaving=entries.pop()!;let afterExitPushes=0;leaving.socket.on('state',()=>afterExitPushes++);leaving.socket.emit('leave');await emit(leaving.socket,'clock',{});assert.equal(afterExitPushes,0,'An explicit exit must not receive a room state that reopens the UI');
  const replacement=await emit(ninth,'enter',{name:'补位'});assert.ok(replacement.ok);assert.equal(replacement.code,ra.code);assert.equal(replacement.state.players.length,8);assert.equal(new Set(replacement.state.players.map((p:any)=>p.color)).size,8);entries.push({socket:ninth,reply:replacement});
  const oldHostId=replacement.state.hostId,oldHost=entries.find(e=>e.reply.playerId===oldHostId)!;oldHost.socket.emit('leave');await emit(oldHost.socket,'clock',{});
  assert.equal((await emit(oldHost.socket,'join',{code:ra.code,token:oldHost.reply.token})).ok,false);
  const fill=await client(),rf=await emit(fill,'enter',{name:'新朋友'});assert.ok(rf.ok);assert.notEqual(rf.state.hostId,oldHostId);entries.push({socket:fill,reply:rf});
  const host=entries.find(e=>e.reply.playerId===rf.state.hostId)!;
  assert.equal((await emit(fill,'action',{type:'start'})).ok,false);assert.equal((await emit(host.socket,'action',{type:'start'})).ok,true);
  const late=await client(),lateReply=await emit(late,'enter',{name:'后来者'});assert.equal(lateReply.ok,false);assert.match(lateReply.error,/等待下一局/);assert.equal((await(await fetch(url+'/api/health')).json()).rooms,2);
  const reconnect=entries.find(e=>e.reply.playerId!==oldHostId&&e.reply.playerId!==host.reply.playerId)!;reconnect.socket.disconnect();const resumed=await client(),rr=await emit(resumed,'join',{code:ra.code,token:reconnect.reply.token});assert.ok(rr.ok);assert.equal(rr.playerId,reconnect.reply.playerId);assert.equal(rr.state.players.length,8);
  const status=await emit(late,'lobbyStatus',{});assert.deepEqual(status.lobby,{status:'playing',players:8,capacity:8});assert.ok(!JSON.stringify(status).includes(ra.code));assert.ok(!JSON.stringify(status).includes(ra.token));
  clients.forEach(s=>s.disconnect());let records=await saved(data=>data.find(r=>r[0]===ra.code)[1].state.players.every((p:any)=>!p.connected));await stop();
  // Exercise completion without advancing hundreds of unrelated game actions.
  const oldShared=records.find(r=>r[0]===ra.code)[1];oldShared.state.status='finished';oldShared.state.finishedAt=Date.now();
  await writeFile(path.join(dir,'rooms.json'),JSON.stringify(records));await start();
  const next=await client(),rn=await emit(next,'enter',{name:'下一局'});assert.ok(rn.ok);assert.notEqual(rn.code,ra.code);assert.equal(rn.state.players.length,1);assert.equal(rn.state.hostId,rn.playerId);
  const returning=await client(),old=await emit(returning,'join',{code:ra.code,token:reconnect.reply.token});assert.ok(old.ok);assert.equal(old.state.status,'finished');assert.equal(old.playerId,reconnect.reply.playerId);
  next.disconnect();returning.disconnect();records=await saved(data=>{const record=data.find(r=>r[0]===rn.code);return record?.[1].lobbyDisconnects?.[rn.playerId]!==undefined;});await stop();
  records.find(r=>r[0]===rn.code)[1].lobbyDisconnects[rn.playerId]=Date.now()-61000;
  await writeFile(path.join(dir,'rooms.json'),JSON.stringify(records));await start();
  const fresh=await client(),final=await emit(fresh,'enter',{name:'席位回收'});assert.ok(final.ok);assert.equal(final.code,rn.code);assert.equal(final.state.players.length,1);assert.equal(final.state.hostId,final.playerId);
  const stale=await client();assert.equal((await emit(stale,'join',{code:rn.code,token:rn.token})).ok,false);assert.equal((await(await fetch(url+'/api/health')).json()).rooms,3);
  const member=await client();assert.ok((await emit(member,'enter',{name:'关闭测试成员'})).ok);
  assert.equal((await emit(stale,'closeRoom',{code:rn.code})).ok,false);
  assert.equal((await emit(member,'closeRoom',{code:rn.code})).ok,false);
  assert.equal((await emit(fresh,'closeRoom',{code:'STALE'})).ok,false);
  const closed=new Promise<any>(resolve=>member.once('roomClosed',resolve));
  assert.ok((await emit(fresh,'closeRoom',{code:final.code})).ok);
  assert.equal((await closed).code,final.code);
  assert.equal((await emit(member,'action',{type:'start'})).ok,false);
  assert.equal((await emit(stale,'join',{code:final.code,token:final.token})).ok,false);
  await saved(data=>!data.some(r=>r[0]===final.code));await stop();
  // A persisted orphan must expire even if bots keep taking actions.
  const orphan=room('ORPHAN');orphan.state.players.forEach(p=>p.connected=false);
  addPlayer(orphan.state,'机器人','程序员',true);orphan.state.status='playing';orphan.emptySince=Date.now()-EMPTY_ROOM_GRACE_MS-1000;
  await writeFile(path.join(dir,'rooms.json'),JSON.stringify([['ORPHAN',orphan]]));await start();
  for(let i=0;i<30;i++){if((await(await fetch(url+'/api/health')).json()).rooms===0)break;await new Promise(r=>setTimeout(r,100));}
  assert.equal((await(await fetch(url+'/api/health')).json()).rooms,0);
  const restored=await client();assert.ok((await emit(restored,'enter',{name:'重新开局'})).ok);

});


test('empty shared games allow reconnects but bots and activity never extend the cleanup deadline',()=>{
 const r=room();r.state.players.forEach(p=>p.connected=false);addPlayer(r.state,'AI','程序员',true);r.state.status='playing';
 assert.ok(trackEmptyRoom(r,100));assert.equal(r.emptySince,100);
 r.updated=999999;assert.equal(trackEmptyRoom(r,10000),false);
 assert.equal(emptyRoomExpired(r,100+EMPTY_ROOM_GRACE_MS-1),false);
 assert.equal(emptyRoomExpired(r,100+EMPTY_ROOM_GRACE_MS),true);
 r.state.players[1].connected=true;assert.ok(trackEmptyRoom(r,200000));assert.equal(r.emptySince,undefined);assert.equal(emptyRoomExpired(r,999999),false);
 r.state.players[1].connected=false;trackEmptyRoom(r,300000);assert.equal(r.emptySince,300000);
 delete r.state.sharedRoom;assert.equal(emptyRoomExpired(r,999999),false);
});
