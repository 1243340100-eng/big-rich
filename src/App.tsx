import type {LobbyStatus} from '../shared/lobby';
import type {ActiveRoom,RoomRequest,RoomRequestResult} from '../shared/roomAccess';
import {ExternalRoomCard,RoomRequestDialog} from './game/RoomAccess';
import {SpectatorView} from './game/SpectatorView';
import {PurchaseConfirmation} from './game/PurchaseConfirmation';
import {TimeOfDaySelector} from './scene/TimeOfDaySelector';
import {TimeOfDayContext} from './scene/timeOfDay';
import {MatchTimeIndicator} from './scene/MatchTimeIndicator';
import {matchTime} from '../shared/worldTime';
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { ArrowRight, Building2, ChevronRight, CircleHelp, Copy, Dice1, Gavel, Landmark, Leaf, LogOut, Maximize2, MessageCircle, MoreHorizontal, Plus, Radio, Send, ShieldCheck, TrendingUp, Trophy, Users, Wallet, X } from 'lucide-react';
const Board=lazy(()=>import('./Board'));
import { Market, MarketStrip } from './market/Market';
import { CYCLES, JOB_DESCRIPTIONS, JOBS, TILES } from '../shared/catalog';
import { credit, loanLimit, loanRate, money, netWorth, propertyOperatingIncome, propertyRent, propertyValue, totalDebt, tradeSettlementQuote, upgradeCost } from '../shared/finance';
import { eventHeatText } from '../shared/districts';
import type { Action, GameState, Player, Trade } from '../shared/types';
import {Dialog as Modal} from './game/Dialog';
import {TurnActionBar} from './game/TurnActionBar';
import {TileInfoPanel} from './game/TileInfoPanel';
import {CashflowPanel} from './game/CashflowPanel';
import {SettlementReceipt} from './game/SettlementReceipt';
import {VictoryOverlay,useVictory} from './game/VictoryOverlay';
import {CashRescue} from './game/CashRescue';
import {PropertyUpgrade} from './game/PropertyUpgrade';
import {CashNumber,unlockAudio,useGameFeedback} from './game/feedback';
import {EventBanner,useGlobalEventBanner} from './game/EventBanner';
import {ChatNotifications} from './game/ChatNotice';
import {CityEventDraw,useCityEventDraw} from './game/CityEventDraw';
import {setPerformanceMode,setReducedMotion,usePerformanceMode,useReducedMotion} from './game/preferences';
import {PropertyFinance} from './game/PropertyFinance';
import {Bank} from './game/BankPanel';
import {AuctionPanel} from './game/AuctionPanel';
import {Casino,CasinoEntry} from './casino/Casino';
import {readCharacterPreference,saveCharacterPreference} from './game/characterPreference';
const CharacterWardrobe=lazy(()=>import('./game/CharacterWardrobe').then(module=>({default:module.CharacterWardrobe})));
import {characterFor,type CharacterSkin} from '../shared/characters';

const socket=io({autoConnect:false});
const fmt=(n:number)=>new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n);
type Session={code:string;token:string;playerId:string};
type Reply={ok:boolean;error?:string;state?:GameState;spectator?:boolean;request?:RoomRequest}&Partial<Session>;
function readSession():Session|null{try{return JSON.parse(sessionStorage.getItem('capital-session')??'null');}catch{return null;}}
function IconButton({label,children,onClick}:{label:string;children:ReactNode;onClick:()=>void}){return <button className="icon-button" aria-label={label} title={label} onClick={onClick}>{children}</button>;}

function readWatch(){try{return sessionStorage.getItem('capital-watch');}catch{return null;}}
export default function App(){
  const watchRef=useRef<string|null>(readWatch());
  const [spectator,setSpectator]=useState(!!watchRef.current);
  const [activeRoom,setActiveRoom]=useState<ActiveRoom|null>(null),[roomRequest,setRoomRequest]=useState<RoomRequest|null>(null);
  const [state,setState]=useState<GameState|null>(null),[session,setSession]=useState<Session|null>(readSession),[connected,setConnected]=useState(false),[toast,setToast]=useState(''),[busy,setBusy]=useState(false);
  const [viewTools,setViewTools]=useState(false);
  const [closeRoomConfirm,setCloseRoomConfirm]=useState(false);
  const [lobby,setLobby]=useState<LobbyStatus|null>(null),[lobbyError,setLobbyError]=useState('');
  const [name,setName]=useState('城市投资人'),[job,setJob]=useState(JOBS[0]),[selected,setSelected]=useState<number|null>(null),[tab,setTab]=useState('overview'),[reset,setReset]=useState(0),[follow,setFollow]=useState(true);
  const [help,setHelp]=useState(false),[cityOverview,setCityOverview]=useState(false),[chat,setChat]=useState(false),[chatText,setChatText]=useState(''),[chatTo,setChatTo]=useState(''),[shortcut,setShortcut]=useState(false),[clock,setClock]=useState(Date.now()),[confirm,setConfirm]=useState<{text:string;action:Action}|null>(null),[exitConfirm,setExitConfirm]=useState(false);
  const [unreadChats,setUnreadChats]=useState(0);const chatSeen=useRef<{code:string;id:string|null}>({code:'',id:null});const chatLogRef=useRef<HTMLDivElement|null>(null);
  const [labelMode,setLabelMode]=useState<'smart'|'all'>('smart'),[highlightMine,setHighlightMine]=useState(false),[drawer,setDrawer]=useState<'players'|'assets'|null>(null);
  const [overlay,setOverlay]=useState<'more'|'flow'|'rescue'|null>(null),[sound,setSound]=useState(false),[volume,setVolume]=useState(.5);
  const [purchaseTile,setPurchaseTile]=useState<number|null>(null);
  const [casinoOpen,setCasinoOpen]=useState(false);
  const [hoveredTile,setHoveredTile]=useState<number|null>(null);
  const clearTileInfo=useCallback(()=>{setSelected(null);setHoveredTile(null);},[]);
  useEffect(()=>{setHoveredTile(null);},[state?.code]);
  const [characterOpen,setCharacterOpen]=useState(false),[preferredSkin,setPreferredSkin]=useState<CharacterSkin>(readCharacterPreference);
  const reduced=useReducedMotion(),performance=usePerformanceMode(),pendingPurchase=useRef<number|null>(null);
  const serverOffset=useRef(0);
  const sessionRef=useRef(session);const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const notify=(text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),4500);};
  const remember=(r:Reply)=>{if(r.request)setRoomRequest(r.request);if(r.spectator&&r.code){watchRef.current=r.code;setSpectator(true);sessionRef.current=null;setSession(null);try{sessionStorage.removeItem('capital-session');sessionStorage.setItem('capital-watch',r.code);}catch{}}if(r.code&&r.token&&r.playerId){watchRef.current=null;setSpectator(false);try{sessionStorage.removeItem('capital-watch');}catch{}const s={code:r.code,token:r.token,playerId:r.playerId};sessionRef.current=s;setSession(s);try{sessionStorage.setItem('capital-session',JSON.stringify(s));}catch{notify('浏览器禁止保存身份，刷新后可能无法重连');}}if(r.state)setState(r.state);};
  useEffect(()=>{
    let active=true;
    const clearRoom=()=>{watchRef.current=null;setSpectator(false);sessionRef.current=null;setSession(null);setState(null);setSelected(null);setRoomRequest(null);setOverlay(null);setDrawer(null);setCloseRoomConfirm(false);setExitConfirm(false);setChat(false);setCityOverview(false);setCasinoOpen(false);setCharacterOpen(false);setConfirm(null);try{sessionStorage.removeItem('capital-session');sessionStorage.removeItem('capital-watch');}catch{}};
    socket.on('activeRoom',setActiveRoom);
    socket.on('roomRequest',(request:RoomRequest)=>{setRoomRequest(request);setOverlay(null);setDrawer(null);setCloseRoomConfirm(false);setExitConfirm(false);setChat(false);setCityOverview(false);setCasinoOpen(false);setCharacterOpen(false);setHelp(false);setConfirm(null);});
    socket.on('roomRequestResult',(result:RoomRequestResult)=>{setRoomRequest(current=>current?.id===result.id?null:current);notify(result.message);});
    socket.on('takeoverGranted',(reply:Reply)=>remember(reply));
    socket.on('identityTaken',(event:{reason:string})=>{clearRoom();notify(event.reason);});
    socket.on('connect',()=>{
      socket.timeout(5000).emit('activeRoom',{},(err:Error|null,r:{ok:boolean;room:ActiveRoom|null})=>{if(!err&&r.ok)setActiveRoom(r.room);});
      if(watchRef.current&&!sessionRef.current)socket.timeout(7000).emit('watchRoom',{code:watchRef.current},(err:Error|null,r:Reply)=>{if(err){notify('观战重连超时，请刷新重试');return;}if(r.ok)remember(r);else{clearRoom();notify(r.error??'观战已结束');}});
    });
    const receiveLobby=(value:LobbyStatus)=>{setLobby(value);setLobbyError('');};
    const syncClock=()=>{if(!socket.connected)return;const sent=Date.now();socket.timeout(5000).emit('clock',{},(err:Error|null,r:{ok:boolean;serverNow?:number})=>{if(!err&&r.ok&&typeof r.serverNow==='number'&&Number.isFinite(r.serverNow)){serverOffset.current=r.serverNow-(sent+Date.now())/2;setClock(Date.now()+serverOffset.current);}});};
    const onConnect=()=>{setConnected(true);setLobby(null);setLobbyError('');syncClock();void fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(h=>{if(active&&socket.connected&&h&&(h.sharedLobby!==1||h.externalRoomAccess!==1))setLobbyError('游戏服务尚未加载最新房间功能，请重启游戏服务后刷新页面。');}).catch(()=>{});socket.timeout(5000).emit('lobbyStatus',{},(err:Error|null,r:{ok:boolean;lobby?:LobbyStatus})=>{if(!active)return;if(!err&&r?.ok&&r.lobby)receiveLobby(r.lobby);else if(socket.connected)setLobbyError(current=>current||'大厅暂未响应，请重新检查连接；仍无响应时重启游戏服务。');});const s=sessionRef.current;if(s)socket.timeout(7000).emit('join',s,(err:Error|null,r:Reply)=>{if(err){notify('重连超时，请稍后刷新');return;}if(r.ok)remember(r);else{notify(r.error??'重连失败');sessionRef.current=null;setSession(null);setState(null);setSelected(null);sessionStorage.removeItem('capital-session');}});};
    socket.on('roomClosed',(event:{code:string;reason:string})=>{if(sessionRef.current?.code!==event.code&&watchRef.current!==event.code)return;clearRoom();sessionRef.current=null;setSession(null);setState(null);setSelected(null);setOverlay(null);setDrawer(null);setCloseRoomConfirm(false);setExitConfirm(false);setChat(false);setCityOverview(false);setCasinoOpen(false);setConfirm(null);try{sessionStorage.removeItem('capital-session');}catch{}notify(event.reason);});socket.on('lobbyStatus',receiveLobby);socket.on('connect',onConnect);socket.on('disconnect',()=>{setConnected(false);setLobby(null);setActiveRoom(null);setRoomRequest(null);});socket.on('state',setState);socket.on('replaced',()=>{notify('此玩家已在另一连接登录');sessionRef.current=null;setSession(null);setState(null);sessionStorage.removeItem('capital-session');});socket.connect();
    const timer=setInterval(()=>setClock(Date.now()+serverOffset.current),500),syncTimer=setInterval(syncClock,30000);return ()=>{active=false;socket.off();socket.disconnect();clearInterval(timer);clearInterval(syncTimer);};
  },[]);
  const send=(event:string,payload:unknown,onSuccess?:()=>void)=>{if(!connected){notify('正在连接服务器，请稍候');return;}setBusy(true);socket.timeout(7000).emit(event,payload,(err:Error|null,r:Reply)=>{setBusy(false);if(err){pendingPurchase.current=null;const message=event==='enter'?'进入大厅超时，请刷新后重试；若仍无响应，请重启游戏服务。':'服务器没有响应，请检查网络';if(event==='enter')setLobbyError(message);notify(message);return;}if(!r.ok){pendingPurchase.current=null;notify(r.error??'操作失败');}else{if(event!=='action')remember(r);onSuccess?.();}});};
  const act=(a:Action)=>{if(spectator||busy||!connected)return;if(state?.players.find(p=>p.id===session?.playerId)?.casino&&!a.type.startsWith('casino')){notify('请先离开赌场');return;}if(a.type==='buy'){setPurchaseTile(state?.pendingTile??null);return;}send('action',a,a.type==='auction'?()=>{setTab('overview');setDrawer('assets');requestAnimationFrame(()=>document.querySelector('.right-rail .panel-content')?.scrollTo({top:0}));}:undefined);};
  const me=state?.players.find(p=>p.id===session?.playerId),active=state?.players[state.turn],isMine=!!me&&active?.id===me.id,playing=state?.status==='playing';
  const chatLatestId=state?.chats.length?state.chats[state.chats.length-1].id:null;
  const unreadChatLabel=unreadChats>9?'9+':String(unreadChats);
  useEffect(()=>{
    if(!state){chatSeen.current={code:'',id:null};setUnreadChats(0);return;}
    const latest=chatLatestId;
    const seen=chatSeen.current;
    if(seen.code!==state.code){chatSeen.current={code:state.code,id:latest};setUnreadChats(0);return;}
    if(chat){chatSeen.current={code:state.code,id:latest};setUnreadChats(0);return;}
    let fresh=state.chats;
    if(seen.id){const at=state.chats.findIndex(item=>item.id===seen.id);if(at>=0)fresh=state.chats.slice(at+1);}
    const incoming=fresh.reduce((count,item)=>count+(item.from===session?.playerId?0:1),0);
    if(incoming)setUnreadChats(value=>Math.min(99,value+incoming));
    chatSeen.current={code:state.code,id:latest};
  },[state,chat,session?.playerId]);
  useEffect(()=>{
    if(!chat)return;
    const frame=requestAnimationFrame(()=>{const log=chatLogRef.current;if(log)log.scrollTop=log.scrollHeight;});
    return()=>cancelAnimationFrame(frame);
  },[chat,chatLatestId]);
  useEffect(()=>{if(!state||state.phase!=='buy'||!isMine||state.pendingTile!==purchaseTile||state.status!=='playing')setPurchaseTile(null);},[state?.phase,state?.pendingTile,state?.status,isMine,purchaseTile]);
  const currentCharacter=me?characterFor(me.skin,state?.players.findIndex(p=>p.id===me.id)??0):characterFor(preferredSkin);
  const chooseCharacter=(skin:CharacterSkin)=>{const finish=()=>{setPreferredSkin(skin);saveCharacterPreference(skin);setCharacterOpen(false);};if(state)send('action',{type:'skin',skin},finish);else finish();};
  const blocked=!connected?'连接已断开，请等待重连':busy?'正在等待服务器确认':'';
  const {feedback,receipt,dismissReceipt}=useGameFeedback(state,me,sound,volume);
  const {banner:globalEvent,dismiss:dismissGlobalEvent}=useGlobalEventBanner(state);
  const {card:cityEventCard,dismiss:dismissCityEvent}=useCityEventDraw(state,me?.id);
  const {open:victoryOpen,dismiss:dismissVictory}=useVictory(state);
  useEffect(()=>{if(me?.casino){setCasinoOpen(true);setSelected(19);setDrawer(null);setOverlay(null);setConfirm(null);}},[!!me?.casino]);
  useEffect(()=>{if(me?.casinoEligible&&isMine&&me.position===19)setSelected(19);},[me?.casinoEligible,isMine,me?.position]);
  useEffect(()=>{const id=pendingPurchase.current;if(id!==null&&state?.properties.some(a=>a.tileId===id&&a.owner===me?.id)){setSelected(id);setDrawer(null);pendingPurchase.current=null;}},[state,me?.id]);
  const property=state?.properties.find(p=>p.tileId===selected),tile=selected===null?null:TILES[selected];
  const infoTileId=hoveredTile??selected;
  const income=me&&state?netWorth(state,me)-state.rules.cash:0;
  const heatText=state?eventHeatText(state.economy.event):'';
  const openAssets=(nextTab?:string)=>{if(nextTab)setTab(nextTab);setDrawer('assets');};
  const openPlayers=()=>setDrawer('players');
  useEffect(()=>{setShortcut(false);},[state?.turn,state?.round]);
  useEffect(()=>{if(!state)setDrawer(null);},[state]);
  useEffect(()=>{
    if(!drawer)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setDrawer(null);};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[drawer]);
  const exit=()=>{socket.emit('leave');watchRef.current=null;setSpectator(false);setRoomRequest(null);try{sessionStorage.removeItem('capital-watch');}catch{};sessionStorage.removeItem('capital-session');sessionRef.current=null;setSession(null);setState(null);setSelected(null);setHighlightMine(false);setExitConfirm(false);setDrawer(null);setOverlay(null);pendingPurchase.current=null;setCasinoOpen(false);setCharacterOpen(false);};
  const worldTime=state&&state.status!=='lobby'?matchTime(state,clock):null;
  return <TimeOfDayContext.Provider value={worldTime?.time??null}><div className={`app ${state?(spectator?'watching':'in-room'):'landing'} ${reduced?'reduce-motion':''} ${performance?'performance-mode':''}`}>
    {state&&me&&!spectator&&<ChatNotifications key={`${state.code}:${me.id}`} state={state} viewerId={me.id} chatOpen={chat} onOpen={()=>setChat(true)}/>}
    <header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setReset(v=>v+1);}}><span className="brand-mark"><Building2 size={25}/></span><span>资本之城<small>CAPITAL CITY</small></span></a>
      <div className="top-center">{state&&<span className="room-chip"><Radio size={13}/> {state.sharedRoom?'联机大厅':'独立对局'}{state.sharedRoom&&<button aria-label="复制联机链接" onClick={()=>{const link=new URL('/',window.location.href).href;navigator.clipboard.writeText(link).then(()=>notify('联机链接已复制，好友打开后进入同一大厅')).catch(()=>notify(`联机网址：${link}`));}}><Copy size={13}/></button>}</span>}</div>
      <div className="top-actions">{state&&!spectator&&<span className="mobile-global-menu"><IconButton label={unreadChats?`打开游戏菜单，${unreadChats} 条未读消息`:'打开游戏菜单'} onClick={()=>setOverlay('more')}><MoreHorizontal size={22}/>{unreadChats>0&&<span className="chat-unread-badge" aria-hidden="true">{unreadChatLabel}</span>}</IconButton></span>}{state&&!spectator&&<IconButton label="更换角色皮肤" onClick={()=>setCharacterOpen(true)}><span aria-hidden="true" style={{fontSize:23}}>{currentCharacter.emoji}</span></IconButton>}<a className="city-model-link" href="/models.html" target="_blank" rel="noopener" title="近距离探索建筑与街区"><Building2 size={17}/><span>城市典藏</span></a><span className={`connection ${connected?'':'offline'}`}><i/>{connected?'已连接':'连接中'}</span>{state&&!spectator&&<IconButton label={unreadChats?`城市会客厅，${unreadChats} 条未读消息`:'城市会客厅'} onClick={()=>setChat(true)}><MessageCircle size={19}/>{unreadChats>0&&<span className="chat-unread-badge" aria-hidden="true">{unreadChatLabel}</span>}</IconButton>}<IconButton label="游戏指南" onClick={()=>setHelp(true)}><CircleHelp size={20}/></IconButton>{state&&!spectator&&<IconButton label="离开房间" onClick={()=>setExitConfirm(true)}><LogOut size={18}/></IconButton>}</div>
    </header>
    {!state?<main className="lobby-home">
      <section className="lobby-city"><Suspense fallback={<div role="status" style={{padding:24,color:'#65786d'}}>正在加载城市场景…</div>}><Board state={null} selected={null} onSelect={()=>{}} reset={reset} follow={false} labels={false} showcase/></Suspense><TimeOfDaySelector className="lobby-time"/><div className="canvas-hint">拖动观察 · 滚轮缩放</div></section>
      <section className="entry-layer" aria-label="开始游戏">
        <div className="entry-card">
          <div className="entry-head"><h1>开始游戏</h1></div>
          {activeRoom&&<ExternalRoomCard key={activeRoom.code} room={activeRoom} disabled={busy||!connected||!!roomRequest} onWatch={()=>send('watchRoom',{code:activeRoom.code})} onRequest={(kind,targetId)=>send('requestRoom',{code:activeRoom.code,kind,targetId,name})}/>} 
          <p className="entry-setup-hint">先取个名字、挑选皮肤，再选一个擅长的职业。不同职业有不同技能。</p>
          <label>你的名字<input maxLength={16} value={name} onChange={e=>setName(e.target.value)} placeholder="输入昵称"/></label>
          <fieldset className="entry-jobs"><legend>选择职业 <span>技能一览 · 任选其一</span></legend><div className="entry-job-grid">{JOBS.map((j,i)=><label className="entry-job-choice" key={j}><input type="radio" name="entry-job" value={j} checked={job===j} onChange={()=>setJob(j)}/><strong>{j}</strong><span>{JOB_DESCRIPTIONS[i].replace('（MVP 特性）','')}</span></label>)}</div></fieldset>
          <button className="character-trigger" type="button" onClick={()=>setCharacterOpen(true)} aria-label="选择角色皮肤"><span aria-hidden="true">{currentCharacter.emoji}</span><span><small>角色皮肤 · 点击更换</small><b>{currentCharacter.name}</b></span><span className="character-trigger-hint">8 款可选</span><ChevronRight size={15}/></button>
          <button className="primary" disabled={busy||!connected||!lobby||!!lobbyError||!name.trim()||lobby?.status==='playing'||!!lobby&&lobby.players>=lobby.capacity} onClick={()=>send('enter',{name,job,skin:preferredSkin})}>{busy?'正在进入大厅…':'进入联机大厅'} <ArrowRight size={18}/></button>
          <p className="shared-lobby-status" role="status">{!connected?'正在连接游戏服务器…':busy?'正在申请大厅席位，请稍候…':lobbyError||(!lobby?'正在同步联机大厅…':lobby?.status==='playing'?(lobby.emptyExpiresAt?`当前房间暂无真人在线，约 ${Math.max(0,Math.ceil((lobby.emptyExpiresAt-clock)/1000))} 秒后自动释放；原玩家仍可重连。`:'对局进行中，可从上方进入观战、申请替换身份或申请关闭房间。'):lobby&&lobby.players>=lobby.capacity?'大厅已满，请等待空位。':lobby?.players?`大厅已有 ${lobby.players} / ${lobby.capacity} 位玩家，进入后一起准备开局。`:'打开同一个网址，就进入同一个联机大厅。')}</p>
          {lobbyError&&<button className="secondary" onClick={()=>window.location.reload()}>重新检查连接</button>}
          <button className="secondary practice-entry" disabled={busy||!connected} onClick={()=>send('create',{name,job,skin:preferredSkin,solo:true})}>单人练习（3 位 AI）</button>
          <p className="entry-hint">联机满 2 人后由房主开始 · 无需房间码</p>
        </div>
      </section>
    </main>:spectator?<SpectatorView state={state} connected={connected} onExit={exit}/>:<>
    <MarketStrip stocks={state.stocks} round={state.round}/>
    {globalEvent&&<EventBanner key={globalEvent.id} state={state} event={globalEvent} onClose={dismissGlobalEvent}/>}
    {cityEventCard&&<CityEventDraw key={cityEventCard.drawId??cityEventCard.id} result={cityEventCard} reduced={reduced} onClose={dismissCityEvent}/>}
    <main className="game-layout">
      <aside className={`left-rail floating-drawer ${drawer==='players'?'open':''}`} aria-hidden={drawer!=='players'} inert={drawer!=='players'}><div className="drawer-head"><strong>玩家</strong><div className="drawer-head-actions"><button className="drawer-text" onClick={()=>setCityOverview(true)}>概况</button><IconButton label="关闭玩家面板" onClick={()=>setDrawer(null)}><X size={17}/></IconButton></div></div><div className="section-label">城市投资人 <span>{state.players.length} / 8</span></div><div className="player-list">{state.players.map((p,i)=><div key={p.id} role="button" tabIndex={0} title="点击定位角色" aria-label={`${p.name}，点击定位角色`} onClick={()=>{setSelected(p.position);setHighlightMine(false);setDrawer(null);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p.position);setHighlightMine(false);setDrawer(null);}}} className={`player-card ${active?.id===p.id&&playing?'active':''}`} style={{'--player-color':p.color} as React.CSSProperties}><div className="player-top"><span className="avatar character-avatar" title={characterFor(p.skin,i).name}>{characterFor(p.skin,i).emoji}</span><span className="player-name">{p.name}{p.id===me?.id&&<small>你</small>}<em>{characterFor(p.skin,i).name} · {p.job} · {p.bot?'AI':p.connected?'在线':'离线'}</em></span>{active?.id===p.id&&playing&&<span className="turn-dot"/>}</div><div className="player-money"><small>净资产</small><b>{fmt(netWorth(state,p))}<em>万</em></b></div><div className="player-foot"><span>现金 {fmt(p.cash)}</span><span>{credit(state,p)}</span></div></div>)}</div>
      <div className="economy-card"><div className="section-label"><Leaf size={14}/> 城市经济</div><div className="cycle"><span>{CYCLES[state.economy.cycle]}</span><small>基准利率 {(state.economy.baseRate*100).toFixed(0)}%</small></div><div className="cycle-track">{CYCLES.map((c,i)=><span key={c} className={i===state.economy.cycle?'lit':''} title={c}/>)}</div><h4>{state.economy.headline??state.economy.event}</h4><p>{state.economy.description}</p><small>{state.economy.event} · 房产指数 ×{state.economy.propertyIndex.toFixed(2)}</small>{heatText&&<div className="district-heat">当前风口：{heatText}</div>}</div>
      <button className={`chat-button ${unreadChats?'has-unread':''}`} aria-label={unreadChats?`城市会客厅，${unreadChats} 条未读消息`:'城市会客厅'} onClick={()=>setChat(true)}><MessageCircle size={17}/> 城市会客厅 <span>{unreadChats>0?unreadChatLabel:state.chats.length}</span></button>
      <div className="drawer-legend"><span><i style={{background:'#87ad91'}}/>花园住区</span><span><i style={{background:'#d8ab62'}}/>中央商区</span><span><i style={{background:'#a293c8'}}/>海湾文旅</span><span><i style={{background:'#78abbc'}}/>未来产业</span></div>
      </aside>
      <section className={`board-area ${viewTools?'view-tools-open':''}`}>
        <div className="stage-hud stage-hud-left">
          <button className="hud-card player-hud" onClick={openPlayers} aria-expanded={drawer==='players'} aria-label="打开玩家面板">
            <span className="hud-avatar character-avatar" style={{background:active?.color??'#8a9b8b'}}>{active?characterFor(active.skin,state.turn).emoji:'—'}</span>
            <span className="hud-copy"><small>{playing?`第 ${state.round} / ${state.rules.rounds} 轮`:`${state.players.length} / 8 人`}</small><b>{playing?(isMine?'你的回合':`${active?.name??''} 的回合`):state.status==='lobby'?'等待开局':'对局结束'}</b></span>
            <ChevronRight size={15}/>
          </button>
          <span className="hud-dots" aria-hidden="true">{state.players.map(p=><i key={p.id} style={{background:p.color}}/>)}</span>
        </div>
        <div className="stage-hud stage-hud-right">
          {me&&<button className="hud-card portfolio-hud" onClick={()=>openAssets()} aria-expanded={drawer==='assets'} aria-label="打开资产面板">
            <span><small>净资产</small><b>{fmt(netWorth(state,me))}<em>万</em></b></span>
            <span className="hud-cash"><small>现金</small><b><CashNumber value={me.cash} reduced={reduced}/></b></span>
            <ChevronRight size={15}/>
          </button>}
          <button className="mobile-view-toggle" aria-expanded={viewTools} onClick={()=>setViewTools(v=>!v)}><Maximize2 size={15}/>{viewTools?'收起视角':'视角'}</button>
          <div className="board-tools stage-tools floating-card">
            <IconButton label="重置视角" onClick={()=>{setReset(v=>v+1);setSelected(null);setHighlightMine(false);}}><Maximize2 size={17}/></IconButton>
            <button aria-pressed={labelMode==='all'} title="只显示当前落点与鼠标悬浮的地块；点击切换全部地名" onClick={()=>setLabelMode(labelMode==='smart'?'all':'smart')}>{labelMode==='smart'?'地名':'全开'}</button>
            <button className={highlightMine?'selected':''} aria-pressed={highlightMine} onClick={()=>{const owned=state.properties.filter(p=>p.owner===me?.id);if(!owned.length){notify('你还没有地产，买入后可快速定位');return;}setHighlightMine(!highlightMine);setSelected(highlightMine?null:owned[0].tileId);}}>我的地产</button>
            <button className={follow?'selected':''} title={follow?'镜头跟随当前玩家；点击切换自由视角':'镜头固定；点击开启跟拍'} onClick={()=>setFollow(!follow)}>{follow?'跟随':'自由'}</button>
          </div>
        </div>
        {worldTime&&<MatchTimeIndicator value={worldTime} finished={state.status==='finished'}/>}
        <Suspense fallback={<div role="status" style={{padding:24,color:"#65786d"}}>正在加载城市场景…</div>}><Board state={state} selected={selected} onSelect={setSelected} onHoverChange={setHoveredTile} onClearSelection={clearTileInfo} reset={reset} follow={follow} labelMode={labelMode} viewerId={me?.id} highlightMine={highlightMine}/></Suspense>
        {infoTileId!==null&&!receipt&&<TileInfoPanel state={state} tileId={infoTileId} viewerId={me?.id} pinned={infoTileId===selected} onClose={clearTileInfo}>
          {infoTileId===selected&&property?.owner===me?.id&&property&&me&&<><PropertyUpgrade state={state} me={me} property={property} act={act} blocked={blocked}/><button className="small-button" onClick={()=>openAssets('assets')}>管理这项资产 <ChevronRight size={13}/></button></>}
          {infoTileId===selected&&tile?.type==='casino'&&me&&<CasinoEntry state={state} me={me} blocked={blocked} onOpen={()=>setCasinoOpen(true)}/>}
        </TileInfoPanel>}
        <div className="stage-dock floating-card" aria-label="快捷面板">
          <button className={drawer==='players'?'active':''} title="玩家" aria-label="打开玩家面板" onClick={openPlayers}><Users size={18}/></button>
          <button className={drawer==='assets'?'active':''} title="资产" aria-label="打开资产面板" onClick={()=>openAssets()}>{state.trades.some(t=>t.to===me?.id)&&<i className="dock-badge"/>}<Wallet size={18}/></button>
          <button title="行情" aria-label="打开股票行情" onClick={()=>openAssets('market')}><TrendingUp size={18}/></button>
          <button title={unreadChats?`会客厅 · ${unreadChats} 条未读`:'会客厅'} aria-label={unreadChats?`打开城市会客厅，${unreadChats} 条未读消息`:'打开城市会客厅'} onClick={()=>setChat(true)}>{unreadChats>0&&<i className="dock-badge chat-dock-badge">{unreadChatLabel}</i>}<MessageCircle size={18}/></button>
        </div>
        {me&&<TurnActionBar state={state} me={me} selected={selected} clock={clock} blocked={blocked} shortcut={shortcut} setShortcut={setShortcut} act={act} onMore={()=>setOverlay('more')} onCashflow={()=>setOverlay('flow')} onRescue={()=>setOverlay('rescue')} onAssets={()=>openAssets('assets')} onRanking={()=>openAssets('ranking')} onHome={()=>setExitConfirm(true)} sound={sound} volume={volume} reduced={reduced}/>}
        {feedback&&<div key={feedback.id} className={`game-feedback feedback-${feedback.tone}`} role="status">{feedback.text}</div>}
        {receipt&&me&&<SettlementReceipt key={receipt.id??receipt.round} settlement={receipt} playerName={me.name} round={receipt.round??state.round} cash={me.cash} deposit={me.deposit} reduced={reduced} onClose={dismissReceipt}/>}
      </section>
      <aside className={`right-rail floating-drawer ${tab==='market'?'market-drawer':''} ${drawer==='assets'?'open':''}`} aria-hidden={drawer!=='assets'} inert={drawer!=='assets'}><div className="drawer-head"><strong>资产</strong><IconButton label="关闭资产面板" onClick={()=>setDrawer(null)}><X size={17}/></IconButton></div>{me&&<><div className="portfolio-head"><span className="credit-badge"><ShieldCheck size={12}/>{credit(state,me)}</span><h3>{fmt(netWorth(state,me))}<small>万元</small></h3><span className={income>=0?'positive':'negative'}>{income>=0?'+':''}{fmt(income)} 万 <small className="muted">相较初始资产</small></span><div className="cash-line"><Wallet size={15}/> 可用现金 <strong>{fmt(me.cash)} 万</strong></div></div>
      <nav className="tabs" aria-label="资产面板">{[['overview','总览'],['assets','地产'],['market','股票'],['bank','银行'],['trade','交易']].map(([key,label])=><button key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}{key==='trade'&&state.trades.some(t=>t.to===me.id)&&<i/>}</button>)}</nav>
      <div className="panel-content">
        {state.status==='lobby'&&<div className="settings"><h3>房间规则</h3><label>对局轮数<select disabled={me.id!==state.hostId} value={state.rules.rounds} onChange={e=>act({type:'rules',...state.rules,rounds:Number(e.target.value)})}>{[15,30,50].map(n=><option key={n} value={n}>{n} 轮</option>)}</select></label><label>初始现金<select disabled={me.id!==state.hostId} value={state.rules.cash} onChange={e=>act({type:'rules',...state.rules,cash:Number(e.target.value)})}>{[150,200,300].map(n=><option key={n} value={n}>{n} 万</option>)}</select></label><label>经济事件<select disabled={me.id!==state.hostId} value={state.rules.eventEvery} onChange={e=>act({type:'rules',...state.rules,eventEvery:Number(e.target.value)})}>{[2,3,4].map(n=><option key={n} value={n}>每 {n} 轮</option>)}</select></label><p className="muted">好友打开同一个网址，点击「进入联机大厅」即可加入。准备好后由房主开始。</p></div>}
        {me.cash<0&&playing&&<div className="distress"><b>现金缺口 {fmt(-me.cash)} 万</b><button className="secondary" onClick={()=>{setDrawer(null);setOverlay('rescue');}}>查看补现金建议</button></div>}
        {state.auction&&<AuctionPanel state={state} me={me} clock={clock} act={act} busy={busy||!connected}/>}
        {state.status!=='lobby'&&(tab==='ranking'||state.status==='finished')?<div className="ranking"><div className="section-label">最终净资产排名</div>{[...state.players].sort((a,b)=>netWorth(state,b)-netWorth(state,a)).map((p,i)=><div key={p.id}><span className={i===0?'gold':''}>{i===0?<Trophy size={20}/>:String(i+1).padStart(2,'0')}</span><b>{p.name}</b><strong>{fmt(netWorth(state,p))}<small>万</small></strong></div>)}<button className="secondary" onClick={()=>setExitConfirm(true)}>返回首页</button></div>:
        state.status!=='lobby'&&<>
          {tab==='overview'&&<><div className="section-label">资产配置 <span>万元</span></div><div className="allocation">{[['现金与存款',me.cash+me.deposit,'#6ec2a0'],['不动产',state.properties.filter(p=>p.owner===me.id).reduce((n,p)=>n+propertyValue(state,p),0),'#d5a74e'],['股票市值',state.stocks.reduce((n,s)=>n+(me.stocks[s.id]?.qty??0)*s.price,0),'#a596c9'],['总负债',totalDebt(state,me),'#d4745b']].map(([label,value,color])=><div key={label}><span><i style={{background:String(color)}}/>{label}</span><b>{fmt(Number(value))}</b></div>)}</div><div className="flow-card"><span>最近一次回合结算</span><b className={me.lastFlow>=0?'positive':'negative'}>{me.lastFlow>=0?'+':''}{fmt(me.lastFlow)} <small>万</small></b></div><div className="section-label">城市动态 <span>LIVE</span></div><div className="activity-feed">{state.logs.slice(0,20).map(l=><div key={l.id} className={`activity ${l.kind}`}><i/><div><small>ROUND {String(l.round).padStart(2,'0')}</small><p>{l.text}</p></div></div>)}</div></>}
          {tab==='assets'&&<><div className="section-label">我的地产 <span>{state.properties.filter(p=>p.owner===me.id).length} 处</span></div>{state.properties.filter(p=>p.owner===me.id).length===0?<Empty icon={<Building2 size={30}/>} text="暂无地产"/>:state.properties.filter(p=>p.owner===me.id).map(p=><div className="asset-card" key={p.tileId}><div className="asset-card-title" onClick={()=>{setSelected(p.tileId);setDrawer(null);}}><span className="asset-icon" style={{background:TILES[p.tileId].color}}><Building2 size={19}/></span><span><h4>{TILES[p.tileId].name}</h4><small>{TILES[p.tileId].district} · Lv.{p.level} · 经营 +{fmt(propertyOperatingIncome(state,p))}/回合</small></span><ChevronRight size={14}/></div><div className="asset-metrics"><span>估值<b>{fmt(propertyValue(state,p))}</b></span><span>租金<b>{fmt(propertyRent(state,p))} 万/次</b></span><span>抵押债务<b>{fmt(p.mortgage)}</b></span></div><div className="asset-actions"><PropertyUpgrade state={state} me={me} property={p} act={act} blocked={blocked}/><PropertyFinance state={state} me={me} property={p} blocked={blocked} confirm={(text,action)=>setConfirm({text,action})}/></div></div>)}<p className="panel-note">普通地产抵押获得市值的 60%，三级为 75%，期间暂停收租和经营收益。赎回需偿还抵押本金及 5% 手续费。</p></>}
          {tab==='market'&&<Market state={state} me={me} act={act} busy={busy||!connected}/>}
          {tab==='bank'&&<Bank state={state} me={me} act={act} busy={busy||!connected}/>}
          {tab==='trade'&&<TradePanel state={state} me={me} act={act} busy={busy||!connected}/>}
        </>}
      </div></>}</aside>
    </main>
    {drawer&&<button className="drawer-scrim" aria-label="关闭面板" onClick={()=>setDrawer(null)}/>}
    {victoryOpen&&<VictoryOverlay state={state} me={me} reduced={reduced} sound={sound} volume={volume} onClose={dismissVictory} onHome={()=>{dismissVictory();setExitConfirm(true);}}/>}
    </>}
    {characterOpen&&<Suspense fallback={<Modal title="角色衣橱" onClose={()=>setCharacterOpen(false)}><p role="status">正在加载角色预览…</p></Modal>}><CharacterWardrobe value={currentCharacter.id} color={me?.color} onChoose={chooseCharacter} onClose={()=>setCharacterOpen(false)} blocked={state?blocked:''}/></Suspense>}
    {casinoOpen&&state&&me&&<Casino state={state} me={me} act={act} blocked={blocked} onClose={()=>setCasinoOpen(false)} sound={sound} onSound={setSound} volume={volume}/>}
    {overlay&&state&&me&&<Modal title={overlay==='more'?'更多操作':overlay==='flow'?'现金流仪表盘':'补现金建议'} onClose={()=>setOverlay(null)}>{overlay==='flow'?<CashflowPanel state={state} me={me} onRescue={()=>setOverlay('rescue')}/>:overlay==='rescue'?<CashRescue state={state} me={me} act={act} blocked={blocked}/>:<div className="more-menu">{state.phase==='buy'&&isMine&&[34,35].includes(state.pendingTile??-1)&&!state.reservations?.[state.pendingTile!]&&<button className="secondary" disabled={!!blocked} onClick={()=>{act({type:'reserve'});setOverlay(null);}}>预定地块 · 30% 定金</button>}{[["玩家与城市概况",()=>{setOverlay(null);setCityOverview(true);}],['地产',()=>{setOverlay(null);openAssets('assets');}],['股票',()=>{setOverlay(null);openAssets('market');}],['银行',()=>{setOverlay(null);openAssets('bank');}],['交易',()=>{setOverlay(null);openAssets('trade');}],[unreadChats?`城市会客厅 · ${unreadChatLabel}`:'城市会客厅',()=>{setOverlay(null);setChat(true);}],['游戏指南',()=>{setOverlay(null);setHelp(true);}],['离开房间',()=>{setOverlay(null);setExitConfirm(true);}]].map(([label,run])=><button className="secondary" key={String(label)} onClick={run as ()=>void}>{String(label)}</button>)}{state.status==='lobby'&&me.id===state.hostId&&<><button className="secondary" onClick={()=>{setOverlay(null);openAssets();}}>房间设置</button><button className="secondary" disabled={!!blocked||state.players.length>=8} onClick={()=>act({type:'addBot'})}>加 AI</button>{(blocked||state.players.length>=8)&&<p className="disabled-reason">{blocked||'房间已满'}</p>}</>}<div className="feedback-settings"><h3>反馈与性能</h3><label><input type="checkbox" checked={sound} onChange={async e=>{if(!e.target.checked){setSound(false);return;}if(await unlockAudio())setSound(true);else notify('当前浏览器无法启用音效');}}/>启用游戏音效（默认静音）</label><label>音量<input aria-label="游戏音量" type="range" min="0" max="1" step=".05" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label><label><input type="checkbox" checked={reduced} onChange={e=>setReducedMotion(e.target.checked)}/>减少动态效果</label><small>减少动态效果会暂停城市装饰动画并简化升级反馈；系统减少动态效果设置优先。静音独立控制。</small><label><input type="checkbox" checked={performance} onChange={e=>setPerformanceMode(e.target.checked)}/>性能模式（移动端省电）</label><small>降低棋盘渲染分辨率、关闭动态阴影和城市装饰动画，适合手机发热或掉帧时开启。</small></div></div>}</Modal>}
    {toast&&<div className="toast" role="status">{toast}<button aria-label="关闭提示" onClick={()=>setToast('')}><X size={15}/></button></div>}
    {cityOverview&&state&&<Modal title="城市概况" onClose={()=>setCityOverview(false)}><div className="help-content"><div className="economy-card"><div className="cycle"><span>{CYCLES[state.economy.cycle]}</span><small>基准利率 {(state.economy.baseRate*100).toFixed(0)}%</small></div><h4>{state.economy.headline??state.economy.event}</h4><p>{state.economy.description}</p><small>{state.economy.event} · 房产指数 ×{state.economy.propertyIndex.toFixed(2)}</small>{heatText&&<div className="district-heat">当前风口：{heatText}</div>}</div><div className="ranking">{[...state.players].sort((a,b)=>netWorth(state,b)-netWorth(state,a)).map((p,i)=><div key={p.id}><span style={{color:p.color}}>{i+1}</span><b>{p.name}<small className="ranking-job">{p.job} · {p.bot?'AI':p.connected?'在线':'离线'} · {credit(state,p)}</small></b><strong>{fmt(netWorth(state,p))}<small>万</small></strong></div>)}</div></div></Modal>}
    {help&&<Modal title="游戏指南" onClose={()=>setHelp(false)}><div className="help-content"><p>完成设定轮数后，<b>净资产最高者获胜</b>。</p><div className="help-step"><span>01</span><div><h3>掷骰，发现机会</h3><p>掷一枚骰子沿主环前进。经过起点领取税后工资。在金融入口或商业入口及其前后一格出发，可拐入内街。</p></div></div><div className="help-step"><span>02</span><div><h3>买地，打造现金流</h3><p>停在空地可按市价买入、按基础地价的 70% 起拍供全员竞价，或跳过不买。商业地块的定金预定在「更多操作」中办理。买下后每个个人回合自动获得经营收益，受街区景气和当前事件风口影响；对手踩中另付租金。同街区连片持有可提高租金，从第三块起新增地产需付反垄断税，拍卖和交易同样计税。升级至 Lv.3 可享抗周期、估值抗跌与 75% 抵押率；关联板块首次封顶会触发股市重估。</p></div></div><div className="help-step"><span>03</span><div><h3>别人的回合，你也能投资</h3><p>股票、银行服务、玩家交易、聊天和竞拍始终开放。贷款利息按每次个人回合计收；地产抵押后停止收租和经营收益。</p></div></div><div className="help-step"><span>04</span><div><h3>管理风险，赢得终局</h3><p>每轮更新股价，定期发生全球事件。税收与债务持续消耗现金。现金不足可筹资，或在自己回合重组继续游戏。</p></div></div><div className="help-formula">净资产 = 现金 + 存款 + 房产市值 + 股票市值 − 全部债务</div><p className="muted">金额单位均为“万元”，利率为游戏内每回合利率。所有玩家各完成一个回合为一轮。离线超过 60 秒会由机器人临时代管，原标签页刷新可重连。机器人会回应交易提案。</p></div></Modal>}
    {chat&&state&&me&&<Modal title="城市会客厅" onClose={()=>setChat(false)}><div className="chat-log" ref={chatLogRef} aria-live="polite">{state.chats.length===0?<Empty icon={<MessageCircle size={30}/>} text="暂无消息"/>:state.chats.map(c=><div key={c.id} className={c.from===me.id?'own-message':''}><small>{c.name} {c.to?`→ ${state.players.find(p=>p.id===c.to)?.name} · 私聊`:'· 全体'}</small><p>{c.text}</p></div>)}</div><form className="chat-form" onSubmit={e=>{e.preventDefault();if(chatText.trim()){act({type:'chat',text:chatText,to:chatTo||null});setChatText('');}}}><select aria-label="聊天对象" value={chatTo} onChange={e=>setChatTo(e.target.value)}><option value="">所有人</option>{state.players.filter(p=>p.id!==me.id&&!p.bot).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input autoFocus placeholder="输入消息…" maxLength={240} value={chatText} onChange={e=>setChatText(e.target.value)}/><button className="primary" disabled={busy||!chatText.trim()} aria-label="发送消息"><Send size={17}/></button></form></Modal>}
    {purchaseTile!==null&&state&&me&&state.properties.find(p=>p.tileId===purchaseTile)&&<PurchaseConfirmation state={state} me={me} property={state.properties.find(p=>p.tileId===purchaseTile)!} blocked={blocked} onClose={()=>setPurchaseTile(null)} onConfirm={()=>{pendingPurchase.current=purchaseTile;send('action',{type:'buy'},()=>setPurchaseTile(null));}}/>}
    {confirm&&<Modal title="确认资产操作" onClose={()=>setConfirm(null)}><p className="confirmation-copy">{confirm.text}</p><div className="modal-buttons"><button className="secondary" onClick={()=>setConfirm(null)}>取消</button><button className="primary" disabled={!!blocked} onClick={()=>{act(confirm.action);setConfirm(null);}}>确认执行</button></div>{blocked&&<p className="disabled-reason">{blocked}</p>}</Modal>}
    {closeRoomConfirm&&state&&<Modal title="关闭整个房间？" onClose={()=>setCloseRoomConfirm(false)}><p className="confirmation-copy">这会终止当前对局，所有玩家返回首页，当前进度无法恢复。关闭后即可重新进入大厅开始新一局。</p><div className="modal-buttons"><button className="secondary" onClick={()=>setCloseRoomConfirm(false)}>保留房间</button><button className="primary" disabled={busy||!connected} onClick={()=>send('closeRoom',{code:state.code},()=>setCloseRoomConfirm(false))}>确认关闭房间</button></div></Modal>}
    {exitConfirm&&<Modal title="离开当前房间？" onClose={()=>setExitConfirm(false)}><p className="confirmation-copy">离开会清除本标签页的玩家身份。仍有真人在线时，对局继续；所有真人离线满 2 分钟后，联机房间自动关闭。房主也可立即关闭整个房间。</p><div className="modal-buttons"><button className="secondary" onClick={()=>setExitConfirm(false)}>继续对局</button><button className="primary" onClick={exit}>仅自己离开</button>{state&&me?.id===state.hostId&&<button className="secondary" onClick={()=>{setExitConfirm(false);setCloseRoomConfirm(true);}}>关闭整个房间</button>}</div></Modal>}
    {roomRequest&&<RoomRequestDialog key={roomRequest.id} request={roomRequest} clock={clock} player={!!me&&!spectator} disabled={busy||!connected} onRespond={reject=>send('respondRoom',{code:roomRequest.code,id:roomRequest.id,...(me&&!spectator?{reject}:{cancel:true})})}/>}
  </div></TimeOfDayContext.Provider>;
}

function Empty({icon,text}:{icon:ReactNode;text:string}){return <div className="empty">{icon}<p>{text}</p></div>;}
function TradePanel({state,me,act,busy}:{state:GameState;me:Player;act:(a:Action)=>void;busy:boolean}){
  const others=state.players.filter(p=>p.id!==me.id);const [to,setTo]=useState(others[0]?.id??''),[giveCash,setGiveCash]=useState(20),[wantCash,setWantCash]=useState(0),[giveProperty,setGiveProperty]=useState(''),[wantProperty,setWantProperty]=useState(''),[giveStock,setGiveStock]=useState(''),[wantStock,setWantStock]=useState(''),[giveQty,setGiveQty]=useState(0),[wantQty,setWantQty]=useState(0);
  const target=state.players.find(p=>p.id===to);
  const leg=(cash:number,prop:number|null,stock:string|null,qty:number)=>[cash?`${cash} 万`:'',prop!==null?TILES[prop].name:'',stock&&qty?`${state.stocks.find(s=>s.id===stock)?.name} ${qty} 股`:''].filter(Boolean).join(' + ')||'无';
  const draft={from:me.id,to,giveCash,wantCash,giveProperty:giveProperty===''?null:Number(giveProperty),wantProperty:wantProperty===''?null:Number(wantProperty),giveStock:giveStock||null,wantStock:wantStock||null,giveQty:giveStock?giveQty:0,wantQty:wantStock?wantQty:0};
  const settlement=tradeSettlementQuote(state,draft);
  const settlementReason=(q:ReturnType<typeof tradeSettlementQuote>)=>q.fromCash<q.fromReserved||q.toCash<q.toReserved?'成交后现金不足以支付税费或保留竞拍资金':'';
  const taxSummary=(t:typeof draft)=>{const q=tradeSettlementQuote(state,t);return <p className="purchase-tax">反垄断税：{state.players.find(p=>p.id===t.from)?.name} {fmt(q.fromTax)} 万，{state.players.find(p=>p.id===t.to)?.name} {fmt(q.toTax)} 万（支付银行）<br/>股票手续费：{fmt(q.fromStockFee)} / {fmt(q.toStockFee)} 万；盈利税：{fmt(q.fromStockTax)} / {fmt(q.toStockTax)} 万<br/>成交后现金：{fmt(q.fromCash)} / {fmt(q.toCash)} 万{settlementReason(q)&&<span className="disabled-reason"> · {settlementReason(q)}</span>}</p>;};
  const counter=(t:Trade)=>{setTo(t.from);setGiveCash(t.wantCash);setWantCash(t.giveCash);setGiveProperty(t.wantProperty===null?'':String(t.wantProperty));setWantProperty(t.giveProperty===null?'':String(t.giveProperty));setGiveStock(t.wantStock??'');setWantStock(t.giveStock??'');setGiveQty(t.wantQty);setWantQty(t.giveQty);act({type:'reject',tradeId:t.id});};
  return <><div className="section-label">交易提案 <span>{state.trades.length} 笔</span></div>{state.trades.map(t=><div className="trade-card" key={t.id}><b>{state.players.find(p=>p.id===t.from)?.name} → {state.players.find(p=>p.id===t.to)?.name}</b><p>付出：{leg(t.giveCash,t.giveProperty,t.giveStock,t.giveQty)}<br/>换取：{leg(t.wantCash,t.wantProperty,t.wantStock,t.wantQty)}</p>{taxSummary(t)}<small>第 {t.expires} 轮后失效</small><div className="asset-actions">{t.to===me.id&&<><button disabled={busy||!!settlementReason(tradeSettlementQuote(state,t))} onClick={()=>act({type:'accept',tradeId:t.id})}>接受</button><button disabled={busy} onClick={()=>counter(t)}>还价</button></>}<button disabled={busy} onClick={()=>act({type:'reject',tradeId:t.id})}>{t.from===me.id?'撤回':'拒绝'}</button></div></div>)}<form className="trade-form" onSubmit={e=>{e.preventDefault();act({type:'offer',to,giveCash,wantCash,giveProperty:giveProperty===''?null:Number(giveProperty),wantProperty:wantProperty===''?null:Number(wantProperty),giveStock:giveStock||null,wantStock:wantStock||null,giveQty:giveStock?giveQty:0,wantQty:wantStock?wantQty:0});}}><h3>发起一笔交易</h3><label>交易对象<select value={to} onChange={e=>{setTo(e.target.value);setWantProperty('');setWantStock('');setWantQty(0);}}>{others.map(p=><option key={p.id} value={p.id}>{p.name}{p.bot?'（AI）':''}</option>)}</select></label>{[{title:'你付出',cash:giveCash,setCash:setGiveCash,prop:giveProperty,setProp:setGiveProperty,stock:giveStock,setStock:setGiveStock,qty:giveQty,setQty:setGiveQty,player:me},{title:'你换取',cash:wantCash,setCash:setWantCash,prop:wantProperty,setProp:setWantProperty,stock:wantStock,setStock:setWantStock,qty:wantQty,setQty:setWantQty,player:target}].map(l=><fieldset key={l.title}><legend>{l.title}</legend><label>现金（万）<input type="number" min="0" step=".01" value={l.cash} onChange={e=>l.setCash(Number(e.target.value))}/></label><label>地产<select value={l.prop} onChange={e=>l.setProp(e.target.value)}><option value="">不包含地产</option>{state.properties.filter(p=>p.owner===l.player?.id&&!p.mortgage).map(p=><option key={p.tileId} value={p.tileId}>{TILES[p.tileId].name}</option>)}</select></label><label>股票<select value={l.stock} onChange={e=>l.setStock(e.target.value)}><option value="">不包含股票</option>{state.stocks.filter(s=>(l.player?.stocks[s.id]?.qty??0)>0).map(s=><option key={s.id} value={s.id}>{s.name}（{l.player?.stocks[s.id].qty} 股）</option>)}</select></label>{l.stock&&<label>股数<input type="number" min="1" value={l.qty} onChange={e=>l.setQty(Number(e.target.value))}/></label>}</fieldset>)}{taxSummary(draft)}<button className="secondary" disabled={busy||!to||!!settlementReason(settlement)}>发送提案 <Send size={15}/></button></form><p className="panel-note">交易须双方同意，成交时重新校验所有资产。提案有效期 2 轮。地产受让方额外向银行缴纳反垄断税。股票按即时市值结算：双方收手续费，转出方盈利收 10% 税；赠与和交换同样计税，接收成本按市值与接收手续费入账。资产未锁定，可随时撤回。</p></>;
}
