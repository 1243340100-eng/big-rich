import {SECTORS,sectorColor} from '../../shared/casino';
export function Roulette({rotation,spinning,reduced}:{rotation:number;spinning:boolean;reduced:boolean}) {
  const at=(angle:number,r:number)=>[160+Math.sin(angle)*r,160-Math.cos(angle)*r];
  return <div className={`roulette ${spinning?'is-spinning':''}`} aria-label="20 格牛熊轮盘"><div className="roulette-pointer"/><svg viewBox="0 0 320 320" role="img" aria-label="5 格崩盘、6 格微涨、4 格上涨、3 格大涨、2 格暴涨"><circle cx="160" cy="160" r="157" fill="#a28149"/><g className="roulette-disc" style={{transform:`rotate(${rotation}deg)`,transition:spinning&&!reduced?'transform 3.5s cubic-bezier(.12,.65,.1,1)':'none'}}>{SECTORS.map((factor,i)=>{
    const angle=i*Math.PI/10,a=at(angle-Math.PI/20,149),b=at(angle+Math.PI/20,149),label=at(angle,124);
    return <g key={i}><path d={`M160 160 L${a.join(' ')} A149 149 0 0 1 ${b.join(' ')} Z`} fill={sectorColor(factor)} stroke="#be9b5b" strokeWidth=".8"/><text x={label[0]} y={label[1]} transform={`rotate(${i*18},${label[0]},${label[1]})`} textAnchor="middle" dominantBaseline="middle" fill={factor>=1.4?'#302719':'#fff0cd'} fontSize="11" fontWeight="700">{factor===0?'崩盘':`${factor.toFixed(1)}×`}</text></g>;
  })}</g><circle cx="160" cy="160" r="75" fill="#1c342e" stroke="#bc9752" strokeWidth="3"/><circle cx="160" cy="160" r="64" fill="none" stroke="#b28a4b" strokeWidth="1"/><text x="160" y="152" fill="#ead09b" textAnchor="middle" fontSize="18" fontWeight="700">牛熊轮盘</text><text x="160" y="177" fill="#a89b7e" textAnchor="middle" fontSize="10" letterSpacing="3">STARPORT</text></svg></div>;
}
