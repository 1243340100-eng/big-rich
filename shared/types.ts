import type {CharacterSkin} from './characters';

export type Job = '程序员' | '银行家' | '房地产商' | '投资经理' | '企业家' | '公务员';
export type TileType = 'start' | 'property' | 'bank' | 'exchange' | 'tax' | 'event' | 'transport' | 'casino';
export type PropertyArchetype = 'standard' | 'speculative' | 'anchor';
export interface Tile { id: number; name: string; type: TileType; district: string; price: number; rent: number; color: string; x: number; z: number; archetype?: PropertyArchetype; }
export interface Property { tileId: number; owner: string | null; level: number; mortgage: number; }
export interface Holding { qty: number; cost: number; }
export interface Settlement { interest:number; tax:number; upkeep:number; depositIncome:number; operatingIncome:number; rentIncome?:number; rentPaid?:number; total:number; id?:string; round?:number; }
export interface CasinoSession {id:string;stake:number;pot:number;spins:number;lastSector:number|null;}
export interface CasinoOutcome extends CasinoSession {status:'active'|'bust'|'limit'|'cashout'|'leave'|'timeout'|'restart';payout:number;ended:boolean;}
export interface Player { id: string; name: string; color: string; skin?: CharacterSkin; job: Job; cash: number; position: number; stocks: Record<string, Holding>; debt: number; deposit: number; credit: string; lastFlow: number; lastSettlement?:Settlement; rentIncomeSinceSettlement?:number; rentPaidSinceSettlement?:number; casinoEligible?:boolean; casino?:CasinoSession; casinoActive?:boolean; casinoDisconnectedAt?:number; lastCasino?:CasinoOutcome; bot: boolean; connected: boolean; defaults: number; path: number[]; lastStockTradeRound?:number; bridgeLoan?:{principal:number;dueRound:number}; bridgeLoanUsed?:boolean; insiderUsed?:number; }
export interface StockEvent { round:number; kind:'global'|'city'|'report'|'dividend'|'revaluation'|'exhibition'; title:string; description:string; price:number; amount?:number; impact?:number; }
export interface StockReport { round:number; verdict:'beat'|'miss'|'inline'; summary:string; impact:number; }
export interface Stock { id: string; name: string; sector: string; price: number; previous: number; history: number[]; dividend: number; closes?:{round:number;price:number}[]; events?:StockEvent[]; valuation?:'low'|'fair'|'high'; development?:'early'|'growing'|'mature'; report?:StockReport; }
export interface Trade { id: string; from: string; to: string; giveCash: number; wantCash: number; giveProperty: number | null; wantProperty: number | null; giveStock: string | null; giveQty: number; wantStock: string | null; wantQty: number; expires: number; }
export interface Auction { tileId: number; highest: number; bidder: string | null; passed: string[]; endsAt: number; foreclosure: boolean; }
export interface RentReceipt {payer:string;recipient:string;gross:number;net:number;tileId:number;}
export interface CityEventResult { id:string; drawId?:string; tileId:number; playerId:string; title:string; description:string; rarity:'common'|'uncommon'|'rare'; amount:number; effectText:string; global:boolean; impacts:Record<string,number>; }
export interface Log { id: string; round: number; text: string; kind: 'info' | 'trade' | 'event' | 'alert'; rent?:RentReceipt; cityEvent?:CityEventResult; privateTo?:string; }
export interface Chat { id: string; from: string; to: string | null; text: string; name: string; }
export interface Rules { rounds: number; cash: number; eventEvery: number; }
export interface Reservation { ownerId:string; paid:number; total:number; deposit:number; installment:number; dueRound:number; schedule:number[]; }
export interface Exhibition { ownerId:string; boostId:string; diluteId:string; boost:number; dilute:number; round:number; boostPrice:number; dilutePrice:number; }
export interface InsiderTip { round:number; title:string; description:string; eventId:string|null; }
export interface GameState { sharedRoom?:boolean; code: string; hostId: string; status: 'lobby' | 'playing' | 'finished'; players: Player[]; properties: Property[]; stocks: Stock[]; turn: number; round: number; phase: 'roll' | 'buy' | 'manage' | 'auction'; dice: number[]; pendingTile: number | null; auction: Auction | null; auctionQueue: number[]; trades: Trade[]; logs: Log[]; chats: Chat[]; rules: Rules; economy: { cycle: number; propertyIndex: number; baseRate: number; event: string; headline?: string; description: string }; version: number; turnStarted: number; startedAt?: number; finishedAt?: number; marketVersion?:number; lastMarketRound?:number; sectorPremium?:Record<string,number>; sectorRevaluationTiles?:number[]; nextEventId?:string; exhibition?:Exhibition; exhibitionCooldown?:Record<string,number>; insider?:Record<string,InsiderTip>; reservations?:Record<number,Reservation>; }
export interface Action { type: string; [key: string]: unknown; }
