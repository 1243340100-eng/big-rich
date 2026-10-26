import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { GameState } from '../shared/types';

test('four real Socket.IO clients: rooms, authority, privacy, reconnection and disk recovery',async t=>{
  await mkdir('artifacts',{recursive:true});const dir=await mkdtemp(path.resolve('artifacts/network-'));const port=32000+Math.floor(Math.random()*1000);const url=`http://127.0.0.1:${port}`;
  let server:ChildProcess;let stderr='';const clients:Socket[]=[];
  async function launch(){server=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});server.stderr?.on('data',s=>stderr+=s);for(let i=0;i<100;i++){try{const r=await fetch(url+'/api/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Server failed to start: '+stderr);}
  async function stop(){if(server&&!server.killed){const done=new Promise<void>(r=>server.once('exit',()=>r()));server.kill();await done;}}
  t.after(async()=>{for(const c of clients)c.disconnect();await stop();});
  await launch();
  async function client(){const s=io(url,{transports:['websocket'],reconnection:false});clients.push(s);await new Promise<void>((res,rej)=>{s.once('connect',()=>res());s.once('connect_error',rej);});return s;}
  async function emit(s:Socket,event:string,payload:unknown):Promise<any>{return new Promise((res,rej)=>s.timeout(5000).emit(event,payload,(e:Error|null,r:any)=>e?rej(e):res(r)));}
  const a=await client(),b=await client(),c=await client(),d=await client();
  const beforeClock=Date.now(),clockReply=await emit(a,'clock',{});
  assert.ok(clockReply.ok&&clockReply.serverNow>=beforeClock&&clockReply.serverNow<=Date.now());
  let sa:GameState|undefined,sb:GameState|undefined,sc:GameState|undefined;
  a.on('state',s=>sa=s);b.on('state',s=>sb=s);c.on('state',s=>sc=s);
  const ra=await emit(a,'create',{name:'网络测试A',job:'程序员',skin:'wall-street-wolf'});assert.ok(ra.ok);assert.match(ra.code,/^[0-9A-F]{6}$/);assert.equal(ra.state.players[0].skin,'wall-street-wolf');
  const rb=await emit(b,'join',{code:ra.code,name:'网络测试B'});const rc=await emit(c,'join',{code:ra.code,name:'网络测试C'});const rd=await emit(d,'join',{code:ra.code,name:'网络测试D'});assert.ok(rb.ok&&rc.ok&&rd.ok);
  assert.equal((await emit(b,'action',{type:'start'})).ok,false);assert.ok((await emit(a,'action',{type:'rules',rounds:15,cash:300,eventEvery:2})).ok);assert.ok((await emit(a,'action',{type:'start'})).ok);
  assert.equal((await emit(b,'action',{type:'roll',playerId:ra.playerId})).ok,false);
  assert.ok((await emit(a,'action',{type:'chat',to:rb.playerId,text:'私密测试内容'})).ok);
  assert.ok((await emit(a,'action',{type:'chat',text:'公开测试内容'})).ok);
  await new Promise(r=>setTimeout(r,50));assert.ok(sa?.chats.some(m=>m.text==='私密测试内容'));assert.ok(sb?.chats.some(m=>m.text==='私密测试内容'));assert.ok(!sc?.chats.some(m=>m.text==='私密测试内容'));assert.ok(sc?.chats.some(m=>m.text==='公开测试内容'));assert.ok(!JSON.stringify(sc).includes(ra.token));
  assert.ok((await emit(b,'action',{type:'borrow',amount:20})).ok);assert.ok((await emit(b,'action',{type:'stock',stockId:'food',side:'buy',qty:2})).ok);
  assert.ok((await emit(b,'action',{type:'skin',skin:'abacus-fox'})).ok);
  assert.ok((await emit(a,'action',{type:'offer',to:rb.playerId,giveCash:10,wantCash:0,giveProperty:null,wantProperty:null})).ok);await new Promise(r=>setTimeout(r,50));assert.equal(sc?.trades.length,0);assert.equal(sb?.trades.length,1);
  b.disconnect();const b2=await client();const resumed=await emit(b2,'join',{code:ra.code,token:rb.token});assert.ok(resumed.ok);assert.equal(resumed.playerId,rb.playerId);assert.equal(resumed.state.players.length,4);assert.equal(resumed.state.players[1].stocks.food.qty,2);
  const unknown=await client();assert.equal((await emit(unknown,'join',{code:ra.code,token:'invalid',name:'入侵者'})).ok,false);
  let saved:any;for(let i=0;i<30;i++){try{saved=JSON.parse(await readFile(path.join(dir,'rooms.json'),'utf8'));if(saved[0][1].state.players[1].stocks.food?.qty===2)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(saved[0][1].state.players[1].stocks.food.qty,2);
  const actualSettlement=saved[0][1].state.players[0].lastSettlement;assert.ok(actualSettlement?.id);assert.equal(actualSettlement.total,saved[0][1].state.players[0].lastFlow);
  const roomEpoch=saved[0][1].state.startedAt;assert.ok(Number.isFinite(roomEpoch));assert.equal(resumed.state.startedAt,roomEpoch);assert.equal(resumed.state.players[1].skin,'abacus-fox');
  for(const cl of clients)cl.disconnect();await stop();
  const legacy=saved[0][1].state;delete legacy.marketVersion;delete legacy.lastMarketRound;for(const stock of legacy.stocks){delete stock.closes;delete stock.events;delete stock.valuation;delete stock.development;}
  legacy.players[0].bridgeLoan={principal:40,dueRound:legacy.round+6};delete legacy.players[0].bridgeLoanUsed;
  const oldCash=legacy.players[1].cash,oldCost=legacy.players[1].stocks.food.cost,oldPrice=legacy.stocks.find((st:any)=>st.id==='food').price;
  await writeFile(path.join(dir,'rooms.json'),JSON.stringify(saved));await launch();
  const health=await (await fetch(url+'/api/health')).json();assert.equal(health.marketRules,2);assert.equal(health.economicsRules,3);
  const fresh=await client();const restored=await emit(fresh,'join',{code:ra.code,token:rb.token});assert.ok(restored.ok);assert.equal(restored.state.players[1].stocks.food.qty,2);assert.equal(restored.state.rules.rounds,15);assert.equal(restored.playerId,rb.playerId);assert.ok(restored.state.chats.some((m:any)=>m.text==='私密测试内容'));
  assert.equal(restored.state.marketVersion,2);assert.equal(restored.state.players[1].cash,oldCash);assert.equal(restored.state.players[1].stocks.food.cost,oldCost);assert.equal(restored.state.startedAt,roomEpoch);assert.equal(restored.state.players[0].skin,'wall-street-wolf');assert.equal(restored.state.players[1].skin,'abacus-fox');
  assert.equal(restored.state.stocks.find((st:any)=>st.id==='food').price,oldPrice);assert.deepEqual(restored.state.stocks[0].events,[]);
  assert.equal(restored.state.players[0].bridgeLoanUsed,true);assert.equal(restored.state.players[0].bridgeLoan.principal,40);
  assert.ok(!JSON.stringify(restored.state).includes('fairValue'));
  assert.deepEqual(restored.state.players[0].lastSettlement,actualSettlement);assert.equal(restored.state.players[1].lastSettlement,undefined);
});
