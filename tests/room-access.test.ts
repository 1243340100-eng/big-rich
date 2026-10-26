import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {io,type Socket} from 'socket.io-client';
import {ROOM_REQUEST_MS} from '../server/roomAccess';

test('external room requests: veto, full ten-second window, replacement credentials and read-only spectators',async t=>{
  assert.equal(ROOM_REQUEST_MS,10000);
  await mkdir('artifacts',{recursive:true});const dir=await mkdtemp(path.resolve('artifacts/room-access-test-'));
  const port=37000+Math.floor(Math.random()*1000),url=`http://127.0.0.1:${port}`,clients:Socket[]=[];
  let server:ChildProcess|undefined;
  t.after(async()=>{clients.forEach(c=>c.disconnect());if(server){const done=new Promise<void>(resolve=>server!.once('exit',()=>resolve()));server.kill();await done;server.stdout?.destroy();server.stderr?.destroy();}});
  server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});
  for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  async function client(){const s=io(url,{transports:['websocket'],reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});return s;}
  const emit=(s:Socket,event:string,payload:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(5000).emit(event,payload,(err:Error|null,r:any)=>err?reject(err):resolve(r)));
  const event=(s:Socket,name:string,timeout=13000):Promise<any>=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(name,done);reject(Error(`Missing ${name}`));},timeout);function done(value:any){clearTimeout(timer);resolve(value);}s.once(name,done);});
  const host=await client(),friend=await client(),outside=await client(),observer=await client();
  const h=await emit(host,'enter',{name:'房主'}),f=await emit(friend,'enter',{name:'朋友'}),code=h.code;
  assert.equal((await emit(outside,'watchRoom',{code})).ok,false,'only ongoing shared games are exposed');
  await emit(host,'action',{type:'start'});
  const room=(await emit(outside,'activeRoom',{})).room;
  assert.equal(room.code,code);assert.equal(room.players.length,2);assert.ok(!JSON.stringify(room).includes(h.token));
  await emit(host,'action',{type:'chat',to:f.playerId,text:'private-test-message'});
  await emit(host,'action',{type:'chat',text:'public-test-message'});
  const watch=await emit(observer,'watchRoom',{code});assert.ok(watch.ok&&watch.spectator);assert.equal(watch.playerId,undefined);assert.equal(watch.token,undefined);
  assert.ok(!JSON.stringify(watch).includes('private-test-message'));assert.ok(JSON.stringify(watch).includes('public-test-message'));
  assert.deepEqual(watch.state.insider,{});assert.deepEqual(watch.state.trades,[]);
  for(const type of ['roll','start','chat','skin'])assert.equal((await emit(observer,'action',{type,text:'forged',skin:'lucky-cat'})).ok,false);
  assert.equal((await emit(observer,'closeRoom',{code})).ok,false);
  // A spectator receives live public snapshots without taking a seat.
  const update=event(observer,'state');await emit(friend,'action',{type:'chat',text:'new-public-message'});assert.ok((await update).chats.some((c:any)=>c.text==='new-public-message'));
  assert.equal((await emit(outside,'activeRoom',{})).room.players.length,2);
  const popup=event(friend,'roomRequest');const close=await emit(outside,'requestRoom',{code,kind:'close',name:'访客'});assert.ok(close.ok);assert.equal((await popup).id,close.request.id);
  assert.equal((await emit(observer,'respondRoom',{code,id:close.request.id,reject:true})).ok,false);
  assert.equal((await emit(host,'requestRoom',{code,kind:'close',name:'冒充外部'})).ok,false);
  const rival=await client();assert.equal((await emit(rival,'requestRoom',{code,kind:'replace',targetId:f.playerId,name:'并发'})).ok,false);
  const veto=event(outside,'roomRequestResult');assert.ok((await emit(friend,'respondRoom',{code,id:close.request.id,reject:true})).ok);assert.equal((await veto).accepted,false);
  assert.equal((await emit(friend,'respondRoom',{code,id:close.request.id,reject:true})).ok,false);
  // Target player can veto replacement too.
  const rejected=await emit(outside,'requestRoom',{code,kind:'replace',targetId:f.playerId,name:'接替者'});
  assert.ok((await emit(friend,'respondRoom',{code,id:rejected.request.id,reject:true})).ok);
  assert.equal((await emit(outside,'requestRoom',{code,kind:'replace',targetId:'missing',name:'错误'})).ok,false);
  // Refresh/reconnect during a proposal still receives the active popup.
  const accepted=await emit(outside,'requestRoom',{code,kind:'replace',targetId:f.playerId,name:'接替者'});assert.ok(accepted.ok);
  friend.disconnect();const resumed=await client(),replayed=event(resumed,'roomRequest');await emit(resumed,'join',{code,token:f.token});assert.equal((await replayed).id,accepted.request.id);
  const started=Date.now(),granted=event(outside,'takeoverGranted'),removed=event(resumed,'identityTaken');
  await emit(host,'respondRoom',{code,id:accepted.request.id,reject:false});await emit(resumed,'respondRoom',{code,id:accepted.request.id,reject:false});
  const replacement=await granted;await removed;assert.ok(Date.now()-started>=9500,'agreement must not execute early');
  assert.equal(replacement.playerId,f.playerId);assert.notEqual(replacement.token,f.token);assert.equal(replacement.state.players.find((p:any)=>p.id===f.playerId).cash,200);
  assert.equal((await emit(resumed,'action',{type:'roll'})).ok,false);
  assert.equal((await emit(resumed,'join',{code,token:f.token})).ok,false,'old credential is revoked');
  assert.ok((await emit(resumed,'watchRoom',{code})).ok,'replaced user can immediately spectate');
  assert.ok((await emit(outside,'join',{code,token:replacement.token})).ok);
  // A requester leaving must cancel, not later close the room.
  const abandoned=await emit(rival,'requestRoom',{code,kind:'close',name:'离线申请人'});assert.ok(abandoned.ok);
  const canceled=event(host,'roomRequestResult');rival.disconnect();assert.equal((await canceled).accepted,false);
  const finisher=await client();const withdrawn=await emit(finisher,'requestRoom',{code,kind:'close',name:'撤回'});
  assert.ok((await emit(finisher,'respondRoom',{code,id:withdrawn.request.id,cancel:true})).ok);
  const noReply=await emit(finisher,'requestRoom',{code,kind:'close',name:'关闭申请人'});assert.ok(noReply.ok);
  const hostClosed=event(host,'roomClosed'),spectatorClosed=event(observer,'roomClosed'),result=event(finisher,'roomRequestResult');
  assert.equal((await result).accepted,true);assert.equal((await hostClosed).code,code);assert.equal((await spectatorClosed).code,code);
  assert.equal((await emit(finisher,'activeRoom',{})).room,null);
  assert.equal((await emit(outside,'join',{code,token:replacement.token})).ok,false);
});
