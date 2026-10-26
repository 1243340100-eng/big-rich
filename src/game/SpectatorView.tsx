import {lazy,Suspense,useState} from 'react';
import type {GameState} from '../../shared/types';
import {netWorth} from '../../shared/finance';
import {MarketStrip} from '../market/Market';
const Board=lazy(()=>import('../Board'));
export function SpectatorView({state,connected,onExit}:{state:GameState;connected:boolean;onExit:()=>void}){
  const [selected,setSelected]=useState<number|null>(null),[reset,setReset]=useState(0);
  return <main className="spectator-view">
    <div className="spectator-toolbar"><strong>观战 · 第 {state.round} 轮 · {state.status==='finished'?'对局结束':`${state.players[state.turn]?.name??''} 的回合`}</strong><span>{connected?'实时同步 · 只读':'连接中断，正在重连…'}</span><button className="secondary" onClick={()=>setReset(v=>v+1)}>重置视角</button><button className="primary" onClick={onExit}>退出观战</button></div>
    <MarketStrip stocks={state.stocks} round={state.round}/>
    <section className="spectator-board" aria-label="观战棋盘"><Suspense fallback={<p role="status">正在加载观战棋盘…</p>}><Board state={state} selected={selected} onSelect={setSelected} reset={reset} follow labels/></Suspense></section>
    <section className="spectator-details"><div><h3>玩家与公开资产</h3>{state.players.map(p=><p key={p.id}><b>{p.name}</b> · {p.bot?'AI':p.connected?'在线':'离线'} · 现金 {p.cash.toFixed(2)} 万 · 净资产 {netWorth(state,p).toFixed(2)} 万</p>)}</div><div><h3>公共聊天</h3>{state.chats.length?state.chats.slice(-15).map(c=><p key={c.id}><b>{c.name}：</b>{c.text}</p>):<p>暂无公共消息</p>}</div><div><h3>城市动态</h3>{state.logs.slice(0,10).map(l=><p key={l.id}>{l.text}</p>)}</div></section>
  </main>;
}
