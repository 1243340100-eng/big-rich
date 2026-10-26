import {TimeOfDaySelector} from './scene/TimeOfDaySelector';
import {LIGHTING,useTimeOfDay} from './scene/timeOfDay';
import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowLeft, Building2, ChevronRight, Maximize2, Eye, Layers, Play, Radio, RotateCcw, Trophy} from 'lucide-react';
import Board from './Board';
import {TILES} from '../shared/catalog';
import type {CityEventResult,GameState,Player} from '../shared/types';
import {EventBanner} from './game/EventBanner';
import {CityEventDraw} from './game/CityEventDraw';
import {VictoryOverlay} from './game/VictoryOverlay';
import './model-viewer.css';
import './game/event-banner.css';
import './game/city-event-draw.css';
import './game/victory.css';
import { PROPERTY_DESCRIPTIONS } from './scene/propertyDescriptions';

const descriptions:Record<string,{title:string;body:string;details:string[]}>={
  '花园住区':{title:'街角的生活痕迹',body:'灰绿色瓦面、奶油色墙体与细窄黄铜构件，延续温暖的花园住宅气质。',details:['七道屋面瓦线与四条脊缝','落水管、固定卡箍、后窗与窗台','庭院铁栏、入户石板、信箱与花箱']},
  '中央商区':{title:'城市的黄金年代',body:'保留阶梯式体量，用装饰艺术风格的檐口、壁柱和铜色金属细节塑造商业街。',details:['侧后立面分层窗框与装饰檐齿','屋顶栏杆、设备百叶与店外设施','缓步行人、绿植与嵌缝人行道']},
  '海湾文旅':{title:'灯光下的假日',body:'柔和的灰紫色屋顶与琥珀色窗光，搭配临街的咖啡桌椅和条纹遮阳伞。',details:['塔楼周边细栏杆与背立面窗组','露台桌椅、八片拼色遮阳伞与花箱','石质台阶、边界铺装与暖色壁灯']},
  '未来产业':{title:'井然有序的生产',body:'蓝绿色金属、奶油色厂房与暖色安全标识，让管线和检修设施成为建筑的一部分。',details:['外置服务管线、法兰与管道卡环','逐级检修梯、屋面压条与通风格栅','装卸区斜纹、堆放箱体与设备风扇']},
  '公共设施':{title:'落地的城市公共建筑',body:'银行门廊、证券行情塔与市场公告亭各有独立结构。雨棚、吊牌与屋顶都有明确支撑。',details:['银行列柱、连续檐梁与完整坡屋顶','证券交易所的阶梯冠部与贴墙行情屏','市场公告亭的落地立柱与固定公告栏']},
  'center':{title:'六柱门廊与穹顶钟楼',body:'星海城市银行以六根通高石柱、三角山花和双侧翼楼迎接城市来客。铜色穹顶与四面钟塔成为广场的新地标。',details:['六柱凹槽门廊、涡卷柱头与城市徽章','四面完整表盘、采光鼓座与铜肋穹顶','前后拱窗、侧翼坡顶和金属屋面拼缝','宽台阶、石栏杆、花钵与双侧旗幡','马赛克铺地、动态喷泉、行人与飞鸟']},
};
const modelDistrict=(id:number)=>TILES[id]?.type!=='property'?'公共设施':[1,3,5,7].includes(id)?'花园住区':[17,18,20,21].includes(id)?'海湾文旅':[23,24,26,28,31].includes(id)?'未来产业':'中央商区';
const initialParams=new URLSearchParams(window.location.search);
const requestedId=Number(initialParams.get('building'));
const initialBuilding=initialParams.has('building')&&(requestedId===-1||TILES.some(t=>t.id===requestedId))?requestedId:null;
const requestedLevel=Number(initialParams.get('level')??2);
const initialLevel=[0,1,2,3].includes(requestedLevel)?requestedLevel:2;
const victoryPlayers:Player[]=[
  {id:'preview-1',name:'城市投资人',color:'#66d9bc',job:'投资经理',cash:812.4,position:0,stocks:{},debt:0,deposit:18.6,credit:'AAA',lastFlow:0,bot:false,connected:true,defaults:0,path:[]},
  {id:'preview-2',name:'林 · 稳健派',color:'#c3a5ff',job:'银行家',cash:640.2,position:0,stocks:{},debt:0,deposit:42.1,credit:'AA',lastFlow:0,bot:true,connected:true,defaults:0,path:[]},
  {id:'preview-3',name:'周 · 增长派',color:'#ffb678',job:'程序员',cash:512.8,position:0,stocks:{},debt:0,deposit:6.4,credit:'AA',lastFlow:0,bot:true,connected:true,defaults:0,path:[]},
  {id:'preview-4',name:'陈 · 地产派',color:'#77b9ff',job:'房地产商',cash:386.5,position:0,stocks:{},debt:0,deposit:0,credit:'A',lastFlow:0,bot:true,connected:true,defaults:0,path:[]},
];
const drawSamples:{label:string;result:CityEventResult}[]=[
  {label:'普通 · 市政补贴到账',result:{id:'municipal-subsidy',tileId:2,playerId:'preview',title:'市政补贴到账',description:'市财政拨付街区更新补贴，款项直接打到你的账户。',rarity:'common',amount:10.8,effectText:'税后 +10.8 万',global:false,impacts:{}}},
  {label:'少见 · 海湾音乐节',result:{id:'park-music',tileId:16,playerId:'preview',title:'海湾音乐节',description:'音乐节带来客流，按你持有的海湾文旅地块每块补贴 6 万，上限 30 万。',rarity:'uncommon',amount:10.8,effectText:'海湾文旅 2 块，税后 +10.8 万（上限 30 万）',global:false,impacts:{}}},
  {label:'稀有 · 公园彩票亭',result:{id:'park-lottery',tileId:16,playerId:'preview',title:'公园彩票亭',description:'你随手买的彩票中了头奖，税前 35 万，扣 10% 后到账。',rarity:'rare',amount:31.5,effectText:'税后 +31.5 万',global:false,impacts:{}}},
  {label:'稀有 · 做空报告',result:{id:'market-short',tileId:27,playerId:'preview',title:'做空报告',description:'匿名做空报告点名一家公司，随机一只股票 -12%。',rarity:'rare',amount:0,effectText:'星海银行 -12%',global:false,impacts:{bank:-.12}}},
  {label:'全城 · 建城纪念日',result:{id:'municipal-festival',tileId:2,playerId:'preview',title:'建城纪念日',description:'全城庆典，市政向每位投资人发放 8 万消费红包。',rarity:'rare',amount:7.2,effectText:'全体玩家各 +7.2 万（税后）',global:true,impacts:{}}},
  {label:'负面 · 古树倒伏',result:{id:'park-tree',tileId:16,playerId:'preview',title:'古树倒伏',description:'暴雨吹倒古树砸中车辆，赔偿与清理费共 15 万。',rarity:'rare',amount:-15,effectText:'支付 15 万',global:false,impacts:{}}},
];
const bannerSamples:{label:string;event:string;headline:string;description:string;cycle:number;propertyIndex:number}[]=[
  {label:'金融危机 · 开战与运输链中断',event:'金融危机',headline:'A、B 两国开战，全球运输链中断',description:'风险偏好回落，成长股承压，防守消费相对抗跌，房价 -15%。',cycle:4,propertyIndex:.85},
  {label:'AI 技术革命 · 算力抢购潮',event:'AI 技术革命',headline:'大模型突破引爆算力抢购潮',description:'AI 需求扩张，科技行业受益，传统能源短期承压。',cycle:1,propertyIndex:1},
  {label:'央行降息 · 意外降息',event:'央行降息',headline:'央行意外降息，按揭利率同步下调',description:'基准利率降低 1 个百分点，房价 +5%，地产与成长行业融资环境改善。',cycle:0,propertyIndex:1.05},
  {label:'经济繁荣 · 港口昼夜运转',event:'经济繁荣',headline:'新能源订单爆发，港口昼夜运转',description:'企业信心回升，地产与消费行业受益，房价 +8%。',cycle:1,propertyIndex:1.08},
];

function ModelViewer(){
  const time=useTimeOfDay();
  const [selected,setSelected]=useState<number|null>(initialBuilding),[level,setLevel]=useState(initialLevel),[labels,setLabels]=useState(false),[reset,setReset]=useState(0),[upgradeReplay,setUpgradeReplay]=useState(0),[category,setCategory]=useState(initialBuilding!==null&&initialBuilding>=0?modelDistrict(initialBuilding):'花园住区');
  const [drawIndex,setDrawIndex]=useState(0),[bannerIndex,setBannerIndex]=useState(0),[drawPreview,setDrawPreview]=useState<{result:CityEventResult;key:number}|null>(null),[bannerPreview,setBannerPreview]=useState<{sample:typeof bannerSamples[number];key:number}|null>(null),[victoryPreview,setVictoryPreview]=useState<number|null>(null);
  const state=useMemo<GameState>(()=>({code:'MODEL',hostId:'',status:'lobby',players:[],properties:TILES.filter(t=>t.type==='property').map(t=>({tileId:t.id,owner:'display',level,mortgage:0})),stocks:[],turn:0,round:1,phase:'roll',dice:[],pendingTile:null,auction:null,auctionQueue:[],trades:[],logs:[],chats:[],rules:{rounds:30,cash:200,eventEvery:3},economy:{cycle:0,propertyIndex:1,baseRate:.03,event:'',description:''},version:0,turnStarted:0}),[level]);
  const victoryState=useMemo<GameState>(()=>({...state,status:'finished',players:victoryPlayers,finishedAt:1750000000000}),[state]);
  const tile=selected===null||selected===-1?null:TILES[selected];
  const district=selected===-1?'center':tile?modelDistrict(tile.id):category;
  const propertyDetail=tile?PROPERTY_DESCRIPTIONS[tile.id]:undefined;
  const detail=tile?.id===19?{title:'星港 · 黄铜与墨绿的夜生活地标',body:'三层对称主楼、拱廊入口和穹顶塔楼，屋顶二十格轮盘缓慢转动。',details:['深墨绿立面、黄铜线条、暖金玻璃门厅','支撑式雨棚、红毯、天鹅绒围栏与吊灯','屋顶轮盘、慢速灯泡、棕榈盆栽和小喷泉','独立特殊地标，不可购买或升级']}:propertyDetail??descriptions[district]??descriptions.center;
  const tiles=TILES.filter(t=>modelDistrict(t.id)===category);
  const choose=(id:number)=>{setSelected(id);if(TILES[id])setCategory(modelDistrict(id));};
  return <main className="model-shell"><header><a href="/"><ArrowLeft size={16}/> 返回游戏</a><span>CAPITAL CITY <i>/</i> 城市典藏</span><small>INTERACTIVE DIORAMA</small></header>
    <aside className="model-sidebar"><span className="model-eyebrow">THE DETAILS MAKE THE CITY</span><h1>一座城市，<br/>值得细看。</h1><p className="model-lead">暖灯、石墙、黄铜。<br/>把城市故事藏在每一处细节里。</p><div className="model-mode"><button className={selected===null?'chosen':''} onClick={()=>setSelected(null)}><Maximize2 size={15}/>城市全景</button><button className={selected===-1?'chosen':''} onClick={()=>choose(-1)}><Building2 size={15}/>中央广场</button></div>
    <h2>探索街区</h2><div className="district-buttons">{Object.keys(descriptions).filter(k=>k!=='center').map(d=><button className={category===d?'chosen':''} key={d} onClick={()=>{setCategory(d);setSelected(TILES.find(t=>modelDistrict(t.id)===d)!.id);}}>{d}<ChevronRight size={13}/></button>)}</div>
    <label className="model-select">建筑<select value={tile?.id??''} onChange={e=>choose(Number(e.target.value))}><option value="" disabled>选择一栋建筑</option>{tiles.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <h2><Layers size={13}/> 建筑成长</h2><div className="level-buttons">{[0,1,2,3].map(l=><button key={l} disabled={tile?.id===19} className={level===l?'chosen':''} onClick={()=>setLevel(l)}>Lv.{l}</button>)}</div>
    <button className="level-preview" disabled={!propertyDetail||level===0} onClick={()=>setUpgradeReplay(v=>v+1)}><RotateCcw size={13}/>重播升级动画</button>
    <h2><Play size={13}/> 效果预览</h2>
    <label className="model-select">抽卡样例<select value={drawIndex} onChange={e=>setDrawIndex(Number(e.target.value))}>{drawSamples.map((sample,index)=><option key={sample.label} value={index}>{sample.label}</option>)}</select></label>
    <button className="level-preview" onClick={()=>setDrawPreview({result:drawSamples[drawIndex].result,key:Date.now()})}><Play size={13}/>播放抽卡动画</button>
    <label className="model-select">横幅样例<select value={bannerIndex} onChange={e=>setBannerIndex(Number(e.target.value))}>{bannerSamples.map((sample,index)=><option key={sample.label} value={index}>{sample.label}</option>)}</select></label>
    <button className="level-preview" onClick={()=>setBannerPreview({sample:bannerSamples[bannerIndex],key:Date.now()})}><Radio size={13}/>播放事件横幅</button>
    <button className="level-preview" onClick={()=>setVictoryPreview(Date.now())}><Trophy size={13}/>播放胜利动画</button>
    <p className="model-note">测试入口，不影响对局与存档。</p>
    <div className="model-copy"><h3>{detail.title}</h3><p>{detail.body}</p><ul>{detail.details.map(d=><li key={d}>{d}</li>)}</ul></div><p className="model-note">独立模型预览，不影响你的对局与存档。</p></aside>
    <section className="model-stage"><Board state={state} selected={selected} onSelect={choose} reset={reset} follow={false} labels={labels} inspect={selected!==null} upgradeReplay={upgradeReplay}/><div className="model-caption"><span>THE CITY COLLECTION / 2026</span><h2>{selected===null?`资本之城 · ${LIGHTING[time].caption}全景`:selected===-1?'星海城市银行与中央广场':tile?.name}</h2>{propertyDetail&&<p className="model-growth" aria-live="polite">Lv.{level} · {propertyDetail.growth[level]}</p>}</div><div className="model-tools"><button onClick={()=>setLabels(v=>!v)} className={labels?'chosen':''}><Eye size={15}/>{labels?'隐藏地名':'显示地名'}</button><button onClick={()=>setReset(v=>v+1)}><RotateCcw size={15}/>重置镜头</button></div><TimeOfDaySelector className="model-time"/><div className="model-controls">左键旋转 · 滚轮近看{selected!==null?' · 右键平移':''}<span>{selected===null?'点击建筑查看近景':'切换等级，查看建筑成长细节'}</span></div></section>
    {drawPreview&&<CityEventDraw key={drawPreview.key} result={drawPreview.result} reduced={false} onClose={()=>setDrawPreview(null)}/>}
    {bannerPreview&&<EventBanner key={bannerPreview.key} state={{...state,economy:{...state.economy,event:bannerPreview.sample.event,headline:bannerPreview.sample.headline,description:bannerPreview.sample.description,cycle:bannerPreview.sample.cycle,propertyIndex:bannerPreview.sample.propertyIndex}}} event={{id:`preview-${bannerPreview.key}`,round:12,text:'全球事件 · 预览',kind:'event'}} onClose={()=>setBannerPreview(null)}/>}
    {victoryPreview!==null&&<VictoryOverlay key={victoryPreview} state={victoryState} me={victoryPlayers[0]} reduced={false} sound={false} volume={.5} onClose={()=>setVictoryPreview(null)} onHome={()=>{setVictoryPreview(null);window.location.href='/';}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ModelViewer/></React.StrictMode>);
