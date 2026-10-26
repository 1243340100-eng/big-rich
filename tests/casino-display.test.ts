import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addPlayer,createGame,dispatch} from '../server/engine';
import {Casino} from '../src/casino/Casino';
import type {GameState} from '../shared/types';
function render(sector:number,cash=300){let s=createGame('UI');addPlayer(s,'甲');addPlayer(s,'乙');s=dispatch(s,s.hostId,{type:'start'});s.players[0].position=19;s.players[0].cash=cash;s.players[0].casinoEligible=true;s.phase='manage';if(cash>=100)s=dispatch(s,s.hostId,{type:'casinoEnter',stake:20,spin:true},{casinoRandom:()=>sector});return renderToStaticMarkup(createElement(Casino,{state:s,me:s.players[0],act:()=>{},blocked:'',onClose:()=>{},sound:false,onSound:()=>{},volume:.5}));}
test('casino disclosure has twenty fixed sectors, 25 percent bust risk, and cashout remains the only primary action after a safe result',()=>{
  const html=render(2);assert.equal((html.match(/<path d="M160 /g)??[]).length,20);assert.match(html,/rotate\(-36deg\)/);assert.ok(html.includes('落袋 24 万'));assert.equal((html.match(/class="primary/g)??[]).length,1);assert.match(html,/class="casino-risk"/);assert.match(html,/25%/);assert.match(html,/0.96/);assert.match(html,/45 秒/);
});
test('bust displays an ended visit with no restart or continue control, and low cash shows a reason for disabled entry',()=>{
  const html=render(0);assert.match(html,/崩盘 · 本次筹码归零/);assert.match(html,/离开赌场/);assert.ok(!html.includes('再转一次 ·'));assert.ok(!html.includes('入座并转动 '));assert.ok(!html.includes('class="primary'));
  const low=render(0,30);assert.match(low,/可用筹码不足 10 万/);assert.match(low,/disabled=""/);
});
