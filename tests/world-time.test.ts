import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {ensureMatchClock,matchTime,TIME_OF_DAY_MS} from '../shared/worldTime';
import {TimeOfDayContext,useTimeOfDay} from '../src/scene/timeOfDay';

function game(){const state=createGame('CLOCK1');addPlayer(state,'甲');addPlayer(state,'乙');return dispatch(state,state.hostId,{type:'start'});}

test('real elapsed time cycles through morning, dusk and night and wraps to the next day',()=>{
  const state=game(),start=state.startedAt!;
  for(const [elapsed,time,day,remaining] of [
    [0,'morning',1,90000],[89999,'morning',1,1],[90000,'dusk',1,90000],
    [179999,'dusk',1,1],[180000,'night',1,90000],[269999,'night',1,1],
    [270000,'morning',2,90000],[540000,'morning',3,90000],
  ] as const){const value=matchTime(state,start+elapsed);assert.deepEqual([value.time,value.day,value.remaining],[time,day,remaining]);}
  assert.equal(matchTime(state,start+2*TIME_OF_DAY_MS).next,'morning');
  assert.equal(matchTime(state,start-1000).time,'morning');
  assert.equal(matchTime(state,NaN).time,'morning');
});

test('room epoch survives turn changes, serialization and attempts to submit a client clock',()=>{
  let state=game();const epoch=state.startedAt;
  state=dispatch(state,state.hostId,{type:'roll',startedAt:0,finishedAt:1},{diceRandom:()=>1});
  assert.equal(state.startedAt,epoch);assert.equal(state.finishedAt,undefined);
  state.phase='manage';state=dispatch(state,state.hostId,{type:'end'});
  assert.equal(state.startedAt,epoch);
  const restored=JSON.parse(JSON.stringify(state));assert.equal(ensureMatchClock(restored),false);
  assert.deepEqual(matchTime(restored,epoch!+200000),matchTime(state,epoch!+200000));
});

test('old snapshots gain one stable epoch without changing the room, players or turn timer',()=>{
  const state=game();delete state.startedAt;const before=structuredClone(state);
  assert.equal(ensureMatchClock(state),true);assert.equal(state.startedAt,before.turnStarted);
  assert.deepEqual(state,{...before,startedAt:before.turnStarted});
  state.turnStarted+=10000;assert.equal(ensureMatchClock(state),false);assert.equal(state.startedAt,before.turnStarted);
  const lobby=createGame('WAIT01');assert.equal(ensureMatchClock(lobby),false);assert.equal(lobby.startedAt,undefined);
});

test('game completion records a server finish time and freezes the final scene',()=>{
  let state=game();state.round=state.rules.rounds;state.turn=state.players.length-1;state.phase='manage';
  state.startedAt=Date.now()-200000;
  state=dispatch(state,state.players[state.turn].id,{type:'end',finishedAt:0});
  assert.equal(state.status,'finished');assert.ok(state.finishedAt!>=state.startedAt!);
  assert.deepEqual(matchTime(state,state.finishedAt!),matchTime(state,state.finishedAt!+1000000));
});

test('match lighting context overrides the manual preview only within its own tree',()=>{
  const Read=()=>createElement('span',null,useTimeOfDay());
  const preview=()=>renderToStaticMarkup(createElement(Read));
  assert.equal(preview(),'<span>dusk</span>');
  assert.equal(renderToStaticMarkup(createElement(TimeOfDayContext.Provider,{value:'night'},createElement(Read))),'<span>night</span>');
  assert.equal(preview(),'<span>dusk</span>');
});
