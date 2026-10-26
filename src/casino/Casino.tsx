import {useEffect,useRef,useState} from 'react';
import type {Action,CasinoOutcome,GameState,Player} from '../../shared/types';
import {casinoEntryReason,casinoLimits,MAX_SPINS,MAX_MULTIPLIER,sectorName,SECTORS} from '../../shared/casino';
import {Dialog} from '../game/Dialog';
import {CashNumber,playCue,unlockAudio} from '../game/feedback';
import {fmt} from '../game/CashflowPanel';
import {useReducedMotion} from '../game/preferences';
import {Roulette} from './Roulette';

export function CasinoEntry({state,me,blocked,onOpen}:{state:GameState;me:Player;blocked:string;onOpen:()=>void}) {
  const reason=blocked||casinoEntryReason(state,me);
  return <div className="casino-entry"><p>现金入场 · 25% 崩盘概率 / 转<br/>单转理论庄家优势 4% · 最多 10 转</p><button className="secondary" disabled={!!reason&&!me.casino} onClick={onOpen}>{me.casino?'返回轮盘':'进入赌场'}</button>{reason&&!me.casino&&<p className="disabled-reason">{reason}</p>}</div>;
}
export function Casino({state,me,act,blocked,onClose,sound,onSound,volume}:{state:GameState;me:Player;act:(a:Action)=>void;blocked:string;onClose:()=>void;sound:boolean;onSound:(value:boolean)=>void;volume:number}) {
  const reduced=useReducedMotion(),limits=casinoLimits(state,me),[stake,setStake]=useState(Math.max(10,Math.min(20,limits.max)));
  const initial=me.casinoEligible?undefined:me.lastCasino;
  const [shown,setShown]=useState<CasinoOutcome|undefined>(initial),[spinning,setSpinning]=useState(false),[rotation,setRotation]=useState(-(me.casino?.lastSector??initial?.lastSector??0)*18),[leaving,setLeaving]=useState(false),[failure,setFailure]=useState('');
  const [revealed,setRevealed]=useState(false);
  const requested=useRef(false),seen=useRef(initial?`${initial.id}:${initial.spins}:${initial.status}`:''),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),before=useRef({pot:0,cash:me.cash,spins:0}),liveAudio=useRef({sound,volume}),wasBlocked=useRef(false);
  liveAudio.current={sound,volume};
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  useEffect(()=> {
    const result=me.lastCasino;if(!result)return;
    const key=`${result.id}:${result.spins}:${result.status}`;if(seen.current===key)return;seen.current=key;
    if(!requested.current){if(!me.casinoEligible)setShown(result);setRotation(-(result.lastSector??0)*18);return;}
    requested.current=false;
    const finish=()=>{setShown(result);setRevealed(true);setSpinning(false);if(liveAudio.current.sound)playCue(result.status==='bust'?'casinoBust':SECTORS[result.lastSector??0]===1.8?'casinoJackpot':'casinoSafe',liveAudio.current.volume);};
    setRotation(previous=>Math.ceil(previous/360)*360+1440-(result.lastSector??0)*18);
    if(reduced)finish();else timer.current=setTimeout(finish,3550);
  },[me.lastCasino,me.casinoEligible,reduced]);
  useEffect(()=>{if(leaving&&!me.casino){onClose();return;}if(wasBlocked.current&&!blocked){if(requested.current){requested.current=false;setSpinning(false);setFailure('操作未完成，请检查提示后重试。');}if(leaving&&me.casino){setLeaving(false);setFailure('落袋未完成，会话仍保留，请重试。');}}wasBlocked.current=!!blocked;},[blocked,me.casino,leaving,onClose]);
  useEffect(()=>{if(reduced&&spinning&&!requested.current){if(timer.current)clearTimeout(timer.current);setShown(me.lastCasino);setSpinning(false);}},[reduced]);
  useEffect(()=>{if(!spinning||!sound)return;const tick=setInterval(()=>playCue('casinoTick',volume),350);return()=>clearInterval(tick);},[spinning,sound,volume]);
  const entryReason=casinoEntryReason(state,me),stakeReason=!Number.isFinite(stake)||stake<10||stake%10!==0||stake>limits.max?'筹码须为 10 万的整数倍，且不超过当前上限':'';
  const reason=blocked|| (spinning?'轮盘转动中，请等待停稳':leaving?'正在落袋离场':'');
  const session=me.casino,ended=!!shown?.ended&&!session&&!me.casinoEligible;
  const start=(enter=false)=> {
    if(reason||enter&&(entryReason||stakeReason))return;
    before.current={pot:enter?stake:session?.pot??0,cash:enter?me.cash-stake:me.cash,spins:enter?0:session?.spins??0};setFailure('');setRevealed(false);requested.current=true;setSpinning(true);
    act(enter?{type:'casinoEnter',stake,spin:true}:{type:'casinoSpin',sessionId:session?.id,spins:session?.spins});
  };
  const leave=()=>{if(reason)return;if(session){setLeaving(true);act({type:'casinoLeave',sessionId:session.id,spins:session.spins});}else onClose();};
  const cashout=()=>{if(!session||reason)return;setLeaving(true);act({type:'casinoCashout',sessionId:session.id,spins:session.spins});};
  const pot=spinning?before.current.pot:session?.pot??(ended?0:shown?.pot??0),cash=spinning?before.current.cash:me.cash,spins=spinning?before.current.spins:session?.spins??shown?.spins??0;
  return <Dialog title="星港赌场 · 牛熊轮盘" className="casino-dialog" closeDisabled={!!reason} onClose={leave}><div className="casino-tools"><span>海湾文旅 · STARPORT</span><button className="casino-mute" aria-pressed={!sound} onClick={async()=>{if(sound)onSound(false);else if(await unlockAudio())onSound(true);else setFailure('当前浏览器无法启用音效');}}>{sound?'音效开启':'静音'}</button></div><div className={`casino-layout ${shown?.status==='bust'&&!spinning?'casino-bust':''}`}><div className="casino-wheel-area"><Roulette rotation={rotation} spinning={spinning} reduced={reduced}/><div className="casino-result" role="status">{spinning?'市场情绪转动中…':shown&&!me.casinoEligible?shown.status==='bust'?'崩盘 · 本次筹码归零':shown.ended?`已结算 ${fmt(shown.payout)} 万 · 本次访问结束`:`${sectorName(SECTORS[shown.lastSector??0])} · 当前筹码 ${fmt(shown.pot)} 万`:'每一转独立 · 可选择不入场'}</div></div>{revealed&&shown&&!reduced&&<div key={`${shown.id}-${shown.spins}`} className={`casino-particles ${shown.status==='bust'?'chips-fall':'chips-rise'}`} aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i} style={{'--chip-x':`${(i-3.5)*22}px`,'--chip-y':`${shown.status==='bust'?70+i%3*12:-55-i%3*17}px`,animationDelay:`${i*.035}s`} as React.CSSProperties}/>)}</div>}<div className="casino-controls"><dl className="casino-metrics"><div><dt>可用现金</dt><dd>{fmt(cash)} 万</dd></div><div><dt>场内筹码</dt><dd><CashNumber value={pot} reduced={reduced||spinning}/> 万</dd></div><div><dt>已转次数</dt><dd>{spins} / {MAX_SPINS}</dd></div><div><dt>当前倍率</dt><dd>{session||shown&&!me.casinoEligible?((spinning?pot:session?.pot??shown?.pot??0)/(session?.stake??shown?.stake??stake)).toFixed(2):'—'}×</dd></div><div><dt>立即落袋后现金</dt><dd>{fmt(cash+pot)} 万</dd></div><div><dt>单局上限</dt><dd>{MAX_MULTIPLIER}× · 自动落袋</dd></div></dl>{!session&&!ended&&!spinning&&<div className="casino-stake"><label>入场筹码（万）<input aria-label="入场筹码" type="number" min="10" max={limits.max} step="10" value={stake} onChange={e=>setStake(Number(e.target.value))}/></label><small>当前上限 {limits.max} 万 · 最高 200 万<br/>保留金 {fmt(limits.reserve)} 万；仅使用扣除保留金后现金的 25%。</small></div>}<div className="casino-buttons">{spinning?<button className="secondary" disabled>轮盘转动中</button>:session?session.spins===0?<button className="secondary" disabled={!!reason} onClick={()=>start()}>转动一次</button>:<><button className="primary casino-cashout" disabled={!!reason} onClick={cashout}>落袋 {fmt(session.pot)} 万</button><button className="casino-risk" disabled={!!reason} onClick={()=>start()}>再转一次 · 全部筹码承担风险</button></>:ended?<button className="secondary" onClick={onClose}>离开赌场</button>:<button className="secondary" disabled={!!(reason||entryReason||stakeReason)} onClick={()=>start(true)}>入座并转动 {fmt(stake)} 万</button>}{!spinning&&!ended&&<button className="casino-leave" disabled={!!reason} onClick={leave}>{session?'落袋并离开':'不入场，返回棋盘'}</button>}</div>{(reason||!session&&!ended&&(entryReason||stakeReason)||failure)&&<p className="casino-error" role="status">{reason||(!session&&!ended?(entryReason||stakeReason):'')||failure}</p>}</div></div><footer className="casino-disclosure">每转 25% 崩盘，当前全部筹码归零；单转理论期望 0.96。继续转动会重新承担全部风险。</footer><details className="casino-rules"><summary>查看概率与完整规则</summary><p>20 格固定轮盘：崩盘 5 格（归零），微涨 6 格（×1.10），上涨 4 格（×1.20），大涨 3 格（×1.40），暴涨 2 格（×1.80）。每转独立，结果由服务器决定。</p><p>每次停留仅一次入场，筹码以 10 万为单位，最多 200 万、10 转、10 倍。庄家理论优势 4%/转，逐次按分取整和收益上限会影响实际回报。长期重复参与的数学期望低于本金。</p><p>场内筹码不可支付其他资产操作，场内不能融资或追加筹码。刷新恢复会话，断线超过 45 秒、主动离开房间或服务恢复会自动落袋。游戏仅使用虚拟现金，不涉及真实货币或提现。</p></details></Dialog>;
}
