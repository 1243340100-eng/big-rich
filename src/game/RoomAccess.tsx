import {useState} from 'react';
import {createPortal} from 'react-dom';
import type {ActiveRoom,RoomRequest} from '../../shared/roomAccess';
import {Dialog} from './Dialog';
import './room-access.css';

export function ExternalRoomCard({room,disabled,onWatch,onRequest}:{room:ActiveRoom;disabled:boolean;onWatch:()=>void;onRequest:(kind:'close'|'replace',targetId?:string)=>void}){
  const [selecting,setSelecting]=useState(false),[closing,setClosing]=useState(false),[target,setTarget]=useState('');
  return <section className="external-room" aria-label="进行中的房间">
    <strong>朋友们正在第 {room.round} 轮</strong><p>{room.players.length} 位玩家 · 可以观战，或申请接替一个角色</p>
    <div className="external-actions"><button className="primary" disabled={disabled} onClick={onWatch}>进入观战</button><button className="secondary" disabled={disabled} onClick={()=>setSelecting(true)}>加入并替换身份</button><button className="secondary" disabled={disabled} onClick={()=>setClosing(true)}>申请关闭房间</button></div>
    {selecting&&createPortal(<Dialog className="external-room-dialog" title="选择要接替的身份" onClose={()=>setSelecting(false)}><p>接替后使用原角色的名字、职业、资产和位置，原玩家会返回首页。房内任何玩家都可在 10 秒内反对。</p><label>房内玩家<select aria-label="要接替的玩家" value={target} onChange={e=>setTarget(e.target.value)}><option value="">请选择一个角色</option>{room.players.map(p=><option key={p.id} value={p.id}>{p.name} · {p.job} · {p.bot?'AI':p.connected?'在线':'离线'}</option>)}</select></label><button className="primary" disabled={disabled||!room.players.some(p=>p.id===target)} onClick={()=>{setSelecting(false);onRequest('replace',target);}}>发起 10 秒替换申请</button></Dialog>,document.body)}
    {closing&&createPortal(<Dialog className="external-room-dialog" title="申请关闭进行中的房间？" onClose={()=>setClosing(false)}><p>房内玩家会收到 10 秒弹窗。任何一人反对就取消；无人反对则关闭房间，结束本局，所有玩家和观众返回首页。</p><div className="modal-buttons"><button className="secondary" onClick={()=>setClosing(false)}>取消</button><button className="primary" disabled={disabled} onClick={()=>{setClosing(false);onRequest('close');}}>发起 10 秒关闭申请</button></div></Dialog>,document.body)}
  </section>;
}

export function RoomRequestDialog({request,clock,player,disabled,onRespond}:{request:RoomRequest;clock:number;player:boolean;disabled:boolean;onRespond:(reject:boolean)=>void}){
  const [agreed,setAgreed]=useState(false);
  const seconds=Math.min(10,Math.max(0,Math.ceil((request.endsAt-clock)/1000)));
  return <Dialog title={player?'房外操作申请':'等待房内玩家回应'} onClose={()=>onRespond(true)} closeDisabled={disabled} className="room-request-dialog">
    <p><b>{request.requesterName}</b> 申请{request.kind==='close'?'关闭当前房间':`接替「${request.targetName}」的身份`}。</p>
    <div className="request-countdown" role="timer" aria-label="申请剩余时间">{seconds}<small>秒</small></div>
    <p>{request.kind==='close'?'执行后本局结束，所有人返回首页。':'执行后原玩家退出控制，新玩家继承该角色的全部对局进度。'}</p>
    <p className="request-rule">10 秒内任何一位房内玩家反对即取消。无人反对或无人回应，倒计时结束后自动执行。</p>
    {player?<><div className="modal-buttons"><button className="primary" disabled={disabled||seconds===0} onClick={()=>onRespond(true)}>反对，取消申请</button><button className="secondary" disabled={disabled||seconds===0||agreed} onClick={()=>{setAgreed(true);onRespond(false);}}>{agreed?'已同意，仍可反对':'同意'}</button></div><small>关闭此弹窗也视为反对；同意不会提前结束倒计时。</small></>:<button className="secondary" disabled={disabled} onClick={()=>onRespond(true)}>撤回申请</button>}
    {seconds===0&&<p role="status">正在等待服务器确认结果…</p>}
  </Dialog>;
}
