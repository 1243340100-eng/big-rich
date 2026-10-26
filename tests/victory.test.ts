import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame} from '../server/engine';
import {VictoryOverlay,victoryRanking} from '../src/game/VictoryOverlay';

function finished(){
  const s=createGame('VICTORY1');
  addPlayer(s,'甲');addPlayer(s,'乙');addPlayer(s,'丙');
  s.status='finished';s.finishedAt=123456789;
  s.players[0].cash=320;s.players[1].cash=410;s.players[2].cash=180;
  return s;
}

test('final ranking is sorted by net worth and the champion is stable',()=>{
  const s=finished();
  assert.deepEqual(victoryRanking(s).map(player=>player.name),['乙','甲','丙']);
});

test('victory overlay shows the champion, net worth and a full ranking with confetti',()=>{
  const s=finished(),html=renderToStaticMarkup(createElement(VictoryOverlay,{state:s,me:s.players[1],reduced:false,sound:false,volume:.5,onClose:()=>{},onHome:()=>{}}));
  assert.match(html,/FINAL SETTLEMENT/);assert.match(html,/你赢得了这座城/);assert.match(html,/冠军 · 你/);assert.match(html,/410/);
  assert.match(html,/最终净资产排名/);assert.match(html,/乙/);assert.match(html,/甲/);assert.match(html,/丙/);
  assert.equal((html.match(/victory-piece/g)??[]).length,56);
  assert.match(html,/查看棋盘/);assert.match(html,/返回首页/);
});

test('reduced motion removes confetti while keeping the result card',()=>{
  const s=finished(),html=renderToStaticMarkup(createElement(VictoryOverlay,{state:s,me:s.players[0],reduced:true,sound:false,volume:.5,onClose:()=>{},onHome:()=>{}}));
  assert.equal((html.match(/victory-piece/g)??[]).length,0);
  assert.match(html,/冠军 · 乙/);assert.match(html,/对局结束/);
});
