import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {io,type Socket} from 'socket.io-client';
import {addPlayer,createGame,dispatch} from '../server/engine';
import type {GameState} from '../shared/types';
test('real sockets preserve a casino across short reconnect, settle explicit leave, and recover persisted chips exactly once',async t=>{
  await mkdir('artifacts',{recursive:true});const dir=await mkdtemp(path.resolve('artifacts/casino-network-')),port=34000+Math.floor(Math.random()*1000),url=`http://127.0.0.1:${port}`;
  const rooms=['CA5101','CA5102'].map(code=>{let s=createGame(code);addPlayer(s,'赌场网络甲');addPlayer(s,'赌场网络乙');s=dispatch(s,s.hostId,{type:'start'});s.phase='manage';s.players[0].position=19;s.players[0].cash=300;s.players[0].casinoEligible=true;return [code,{state:s,tokens:{'disposable-test-token':s.hostId,'disposable-observer-token':s.players[1].id},updated:Date.now()}];});
  await writeFile(path.join(dir,'rooms.json'),JSON.stringify(rooms));let server:ChildProcess,errors='';const clients:Socket[]=[];
  async function launch(){server=spawn(process.execPath,['--import','tsx','server/index.ts'],{env:{...process.env,PORT:String(port),DATA_DIR:dir},stdio:'pipe'});server.stderr?.on('data',s=>errors+=s);for(let i=0;i<100;i++){try{if((await fetch(url+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error(errors||'server launch failed');}
  async function stop(){if(server&&!server.killed){const done=new Promise<void>(r=>server.once('exit',()=>r()));server.kill();await done;}}
  t.after(async()=>{clients.forEach(c=>c.disconnect());await stop();});
  const emit=(s:Socket,event:string,payload:unknown):Promise<any>=>new Promise((resolve,reject)=>s.timeout(4000).emit(event,payload,(e:Error|null,r:unknown)=>e?reject(e):resolve(r)));
  async function connect(){const s=io(url,{transports:['websocket'],reconnection:false});clients.push(s);await new Promise<void>((resolve,reject)=>{s.once('connect',()=>resolve());s.once('connect_error',reject);});return s;}
  await launch();assert.equal((await (await fetch(url+'/api/health')).json()).casinoRules,1);
  const a=await connect(),observer=await connect();let latest:GameState|undefined,publicView:GameState|undefined;a.on('state',s=>latest=s);observer.on('state',s=>publicView=s);
  await emit(a,'join',{code:'CA5101',token:'disposable-test-token'});await emit(observer,'join',{code:'CA5101',token:'disposable-observer-token'});
  assert.ok((await emit(a,'action',{type:'casinoEnter',stake:20})).ok);const session=latest!.players[0].casino!;assert.equal(latest!.players[0].cash,280);assert.equal(session.pot,20);
  assert.equal((await emit(a,'action',{type:'end'})).ok,false);assert.equal((await emit(a,'action',{type:'borrow',amount:10})).ok,false);
  await new Promise(r=>setTimeout(r,30));assert.equal(publicView!.players[0].casino,undefined);assert.equal(publicView!.players[0].casinoActive,true);assert.ok(!publicView!.logs.some(l=>l.privateTo));
  a.disconnect();const resumed=await connect();const reply=await emit(resumed,'join',{code:'CA5101',token:'disposable-test-token'});assert.deepEqual(reply.state.players[0].casino,session);assert.equal(reply.state.players[0].cash,280);
  resumed.emit('leave');for(let i=0;i<30&&publicView!.players[0].casinoActive;i++)await new Promise(r=>setTimeout(r,20));assert.equal(publicView!.players[0].casinoActive,false);assert.equal(publicView!.players[0].cash,300);assert.ok(!publicView!.logs.some(l=>l.privateTo));
  const b=await connect();await emit(b,'join',{code:'CA5102',token:'disposable-test-token'});assert.ok((await emit(b,'action',{type:'casinoEnter',stake:20})).ok);
  let saved=false;for(let i=0;i<50;i++){try{const data=JSON.parse(await readFile(path.join(dir,'rooms.json'),'utf8'));saved=data.find((r:any)=>r[0]==='CA5102')[1].state.players[0].casino?.pot===20;if(saved)break;}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(saved);
  clients.forEach(c=>c.disconnect());await stop();await launch();const restored=await connect(),r=await emit(restored,'join',{code:'CA5102',token:'disposable-test-token'}),p=r.state.players[0];assert.equal(p.cash,300);assert.equal(p.casino,undefined);assert.equal(p.casinoEligible,false);assert.equal(p.lastCasino.status,'restart');assert.equal(p.lastCasino.payout,20);
  assert.equal((await emit(restored,'action',{type:'casinoCashout',sessionId:session.id,spins:0})).ok,false);
});
