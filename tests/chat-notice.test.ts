import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame} from '../server/engine';
import type {Chat} from '../shared/types';
import {ChatNotice,newChatMessages} from '../src/game/ChatNotice';

const message=(id:string,from='other',to:string|null=null):Chat=>({id,from,to,name:'小猫',text:`消息 ${id}`});

test('chat notices ignore history, unchanged state and other-room snapshots',()=>{
  const state=createGame('CHAT');state.chats=[message('old')];
  assert.deepEqual(newChatMessages(null,state,'me'),[]);
  assert.deepEqual(newChatMessages(state,state,'me'),[]);
  assert.deepEqual(newChatMessages(state,{...state,code:'OTHER'},'me'),[]);
  assert.deepEqual(newChatMessages(state,null,'me'),[]);
  const next={...state,chats:[...state.chats,message('one'),message('two','me')]};
  assert.deepEqual(newChatMessages(state,next,'me').map(m=>m.id),['one','two']);
});

test('private notices belong only to sender and recipient; batches retain order after history truncation',()=>{
  const old=createGame('CHAT');old.chats=[message('removed'),message('retained')];
  const next={...old,chats:[message('retained'),message('public'),message('incoming','other','me'),message('outgoing','me','other'),message('secret','other','third')]};
  assert.deepEqual(newChatMessages(old,next,'me').map(m=>m.id),['public','incoming','outgoing']);
  assert.deepEqual(newChatMessages(old,next,'').map(m=>m.id),['public']);
});

test('notice labels private direction, escapes user text, and exposes open and close controls',()=>{
  const render=(chat:Chat)=>renderToStaticMarkup(createElement(ChatNotice,{message:chat,viewerId:'me',recipient:'小猪',waiting:2,onOpen:()=>{},onClose:()=>{}}));
  const incoming=render({...message('a','other','me'),text:'<script>alert(1)</script>'});
  assert.match(incoming,/私聊给你/);assert.ok(incoming.includes('&lt;script&gt;'));
  assert.ok(!incoming.includes('<script>'));assert.match(incoming,/另有 2 条消息/);
  assert.match(incoming,/打开城市会客厅查看消息/);assert.match(incoming,/关闭消息提示/);
  assert.match(render(message('b','me','other')),/私聊 → 小猪/);
  assert.match(render(message('c')),/全体消息/);
});
