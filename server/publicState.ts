import type {GameState} from '../shared/types';
export const publicState=(s:GameState,id:string):GameState=>({...s,
  players:s.players.map(p=>p.id===id?p:{...p,casino:undefined,lastCasino:undefined,casinoDisconnectedAt:undefined,bridgeLoan:p.bridgeLoan?{principal:p.bridgeLoan.principal,dueRound:p.bridgeLoan.dueRound}:undefined}),
  logs:s.logs.filter(l=>!l.privateTo||l.privateTo===id),
  chats:s.chats.filter(c=>!c.to||c.from===id||c.to===id),
  trades:s.trades.filter(t=>t.to===id||t.from===id),
  // 内幕只回传给购买者本人。
  insider:s.insider&&s.insider[id]?{[id]:s.insider[id]}:{},
});
