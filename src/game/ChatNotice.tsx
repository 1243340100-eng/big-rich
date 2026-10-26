import {useEffect,useRef,useState} from 'react';
import {MessageCircle,X} from 'lucide-react';
import type {Chat,GameState} from '../../shared/types';

export const CHAT_NOTICE_MS=5000;

/** Initial/other-room snapshots are history; private messages belong to both parties. */
export function newChatMessages(previous:GameState|null,state:GameState|null,viewerId:string){
  if(!previous||!state||previous.code!==state.code)return [];
  const seen=new Set(previous.chats.map(message=>message.id));
  return state.chats.filter(message=>!seen.has(message.id)&&(!message.to||message.from===viewerId||message.to===viewerId));
}

export function ChatNotice({message,viewerId,recipient,waiting,onOpen,onClose}:{
  message:Chat;viewerId:string;recipient?:string;waiting:number;onOpen:()=>void;onClose:()=>void;
}){
  const audience=message.to?(message.from===viewerId?`私聊 → ${recipient??'对方'}`:'私聊给你'):'全体消息';
  return <aside className="chat-notice" role="status" aria-live="polite" aria-atomic="true" aria-label="会客厅新消息" data-message-id={message.id}>
    <button className="chat-notice-open" type="button" onClick={onOpen} aria-label="打开城市会客厅查看消息">
      <MessageCircle size={20} className="chat-notice-icon" aria-hidden="true"/>
      <span className="chat-notice-copy">
        <span className="chat-notice-heading"><strong>{message.from===viewerId?'你':message.name}</strong><small>{audience}</small></span>
        <span className="chat-notice-text">{message.text}</span>
        <span className="chat-notice-hint">点击查看会客厅{waiting>0?` · 另有 ${waiting} 条消息`:''}</span>
      </span>
    </button>
    <button type="button" className="chat-notice-close" onClick={onClose} aria-label="关闭消息提示"><X size={16}/></button>
  </aside>;
}

export function ChatNotifications({state,viewerId,chatOpen,onOpen}:{state:GameState;viewerId:string;chatOpen:boolean;onOpen:()=>void}){
  const previous=useRef<GameState|null>(null);
  const [queue,setQueue]=useState<Chat[]>([]);
  useEffect(()=>{
    const old=previous.current;previous.current=state;
    if(!old||old.code!==state.code){setQueue([]);return;}
    const fresh=newChatMessages(old,state,viewerId);
    if(fresh.length)setQueue(current=>[...current,...fresh]);
  },[state,viewerId]);
  const current=queue[0];
  // Keep each message for five seconds on the main screen. Queued arrivals and
  // unrelated state broadcasts must not restart the current message's timer.
  useEffect(()=>{
    if(!current||chatOpen)return;
    const timer=setTimeout(()=>setQueue(items=>items[0]?.id===current.id?items.slice(1):items),CHAT_NOTICE_MS);
    return()=>clearTimeout(timer);
  },[current?.id,chatOpen]);
  if(!current||chatOpen)return null;
  const dismiss=()=>setQueue(items=>items.slice(1));
  return <ChatNotice key={current.id} message={current} viewerId={viewerId} recipient={state.players.find(player=>player.id===current.to)?.name} waiting={queue.length-1} onClose={dismiss} onOpen={()=>{dismiss();onOpen();}}/>;
}
