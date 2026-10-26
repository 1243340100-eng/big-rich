import {randomInt,randomUUID} from 'node:crypto';
import type {Action,GameState,Player,CasinoOutcome} from '../shared/types';
import {CASINO_GRACE_MS,MAX_STAKE,MIN_STAKE,casinoEntryReason,casinoLimits,sectorName,SECTORS,spinResult} from '../shared/casino';
import {credit,money} from '../shared/finance';

function check(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function note(s:GameState,p:Player,text:string){s.logs.unshift({id:randomUUID(),round:s.round,text,kind:'info',privateTo:p.id});s.logs=s.logs.slice(0,100);}
export function settleCasino(s:GameState,p:Player,reason:'cashout'|'leave'|'timeout'|'restart'|'limit'='cashout') {
  const c=p.casino;check(c,'没有正在进行的赌场会话');
  const outcome:CasinoOutcome={...c,status:reason,payout:c.pot,ended:true};
  p.cash=money(p.cash+c.pot);p.lastCasino=outcome;delete p.casino;p.casinoActive=false;p.casinoEligible=false;delete p.casinoDisconnectedAt;
  p.credit=credit(s,p);
  note(s,p,`星港赌场：${reason==='timeout'?'断线超时自动落袋':reason==='restart'?'服务恢复自动落袋':reason==='limit'?'达到上限自动落袋':'落袋离场'} ${outcome.payout} 万；本次净变化 ${money(outcome.payout-outcome.stake)} 万`);
  return outcome;
}
export function casinoAction(s:GameState,p:Player,a:Action,randomSector=()=>randomInt(0,20)) {
  if(a.type==='casinoEnter') {
    check(!casinoEntryReason(s,p),casinoEntryReason(s,p));
    const stake=a.stake;check(typeof stake==='number'&&Number.isFinite(stake)&&stake>=MIN_STAKE&&stake<=MAX_STAKE&&stake%10===0&&stake<=casinoLimits(s,p).max,'筹码须为 10 万的整数倍且不超过当前上限');
    p.cash=money(p.cash-stake);p.casino={id:randomUUID(),stake,pot:stake,spins:0,lastSector:null};p.casinoActive=true;p.casinoEligible=false;delete p.lastCasino;
    note(s,p,`星港赌场：兑换 ${stake} 万场内筹码`);
    // One explicitly requested initial spin can share the entry transaction.
    if(a.spin===true)spin(s,p,randomSector());
    return;
  }
  const c=p.casino;check(c,'没有正在进行的赌场会话');
  check(s.status==='playing'&&s.players[s.turn]?.id===p.id&&s.phase==='manage'&&!s.auction&&p.position===19,'当前不能操作赌场会话');
  check(a.sessionId===c.id&&a.spins===c.spins,'赌场状态已更新，请刷新本次操作');
  if(a.type==='casinoSpin'){spin(s,p,randomSector());return;}
  if(a.type==='casinoCashout'){check(c.spins>0,'第一次转动前不可落袋，可取消入座离开');settleCasino(s,p);return;}
  if(a.type==='casinoLeave'){settleCasino(s,p,'leave');return;}
  throw new Error('赌场操作无效');
}
function spin(s:GameState,p:Player,sector:number) {
  const c=p.casino!;check(c.spins<10,'已达转动上限');
  const result=spinResult(c.stake,c.pot,c.spins,sector);
  c.pot=result.pot;c.spins=result.spins;c.lastSector=sector;
  p.lastCasino={...c,status:result.status,payout:0,ended:result.ended};
  note(s,p,`牛熊轮盘第 ${c.spins} 转：${sectorName(SECTORS[sector])}，筹码 ${c.pot} 万`);
  if(result.status==='bust'){delete p.casino;p.casinoActive=false;delete p.casinoDisconnectedAt;}
  else if(result.ended)settleCasino(s,p,'limit');
}
export function expireCasino(s:GameState,now=Date.now(),grace=CASINO_GRACE_MS) {
  let changed=false;
  for(const p of s.players)if(p.casino&&!p.connected&&p.casinoDisconnectedAt!==undefined&&now-p.casinoDisconnectedAt>=grace){settleCasino(s,p,'timeout');changed=true;}
  if(changed)s.version++;return changed;
}
export function recoverCasinos(s:GameState) {
  let changed=false;
  for(const p of s.players){
    if(p.casino) {
      const c=p.casino;
      check(typeof c.id==='string'&&Number.isFinite(c.stake)&&c.stake>=10&&c.stake<=200&&Number.isFinite(c.pot)&&c.pot>=0&&c.pot<=c.stake*10&&Number.isInteger(c.spins)&&c.spins>=0&&c.spins<=10,'存档赌场会话无效');
      settleCasino(s,p,'restart');changed=true;
    }
    delete p.casinoDisconnectedAt;p.casinoActive=false;
  }
  if(changed)s.version++;return changed;
}
