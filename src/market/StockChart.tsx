import { useEffect, useId, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import type { Stock } from '../../shared/types';
import { marketTone, priceText, quoteWindow } from './marketMath';

export function StockChart({stock,round,detail=false,range=30}:{stock:Stock;round:number;detail?:boolean;range?:5|10|30}) {
  const [hover,setHover]=useState<number|null>(null);
  const [size,setSize]=useState({width:detail?720:280,height:detail?240:64});
  const svgRef=useRef<SVGSVGElement>(null);
  const gradient=`quote-${useId().replace(/:/g,'')}`;
  useEffect(()=>{
    const svg=svgRef.current;
    if(!svg)return;
    const measure=()=>{
      const rect=svg.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return;
      const next={width:Math.round(rect.width),height:Math.round(rect.height)};
      setSize(current=>Math.abs(current.width-next.width)<.5&&Math.abs(current.height-next.height)<.5?current:next);
    };
    measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);
    observer.observe(svg);
    return()=>observer.disconnect();
  },[detail]);
  const width=size.width,height=size.height;
  const chart=quoteWindow(stock,round,width,height,range),last=chart.points.at(-1)!;
  const active=hover===null?null:chart.points[Math.min(hover,chart.points.length-1)];
  const events=(stock.events??[]).filter(e=>e.round>=round-range+1&&e.round<=round);
  const markers=chart.points.length<=1?[last]:chart.points.length===2?[chart.points[0],last]:[chart.points[0],chart.points[Math.floor((chart.points.length-1)/2)],last];
  function inspect(event:PointerEvent<SVGSVGElement>) {
    const rect=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-rect.left)/Math.max(1,rect.width)*width;
    setHover(chart.points.length===1?0:Math.max(0,Math.min(chart.points.length-1,Math.round((x-7)/(width-14)*(chart.points.length-1)))));
  }
  function key(event:KeyboardEvent<SVGSVGElement>) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    setHover(index=>event.key==='Home'?0:event.key==='End'?chart.points.length-1:Math.max(0,Math.min(chart.points.length-1,(index??chart.points.length-1)+(event.key==='ArrowLeft'?-1:1))));
  }
  return <div className={`quote-chart ${detail?'quote-chart-detail ':''}${marketTone(stock.price-stock.previous)}`}>
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="stock-chart" role="img" tabIndex={0}
      aria-label={`${stock.name}最近${range}轮行情，最高${priceText(chart.high)}万，最低${priceText(chart.low)}万，昨收${priceText(chart.previous)}万。左右方向键查看价格。`}
      onPointerMove={inspect} onPointerDown={inspect} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover(index=>index??chart.points.length-1)} onBlur={()=>setHover(null)} onKeyDown={key}>
      <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop stopColor="currentColor" stopOpacity=".18"/><stop offset="1" stopColor="currentColor" stopOpacity=".015"/></linearGradient></defs>
      {[.14,.38,.62,.86].map(f=><line className="market-gridline" key={f} x1="3" x2={width-3} y1={f*height} y2={f*height}/>)}
      <path d={chart.area} fill={`url(#${gradient})`}/>
      <line className="market-baseline" x1="3" x2={width-3} y1={chart.baselineY} y2={chart.baselineY}/>
      <text className="market-baseline-label" x="5" y={chart.baselineY<16?chart.baselineY+10:chart.baselineY-4}>昨收 {priceText(chart.previous)}</text>
      <path className="market-line" d={chart.line}/>
      <circle className="quote-pulse" cx={last.x} cy={last.y} r="5"/><circle className="quote-latest" cx={last.x} cy={last.y} r="2.5"/>
      {detail&&events.map((event,i)=>{const point=chart.points.find(p=>p.round===event.round);if(!point)return null;return <g key={`${event.round}-${event.kind}-${i}`} className="stock-event-marker"><title>{`第 ${event.round} 轮 · ${event.title}：${event.description}`}</title><text x={point.x} y={height-8-(event.kind==='report'?16:event.kind==='dividend'?32:event.kind==='revaluation'?48:event.kind==='city'?64:0)} textAnchor="middle">{event.kind==='global'?'●':event.kind==='city'?'◇':event.kind==='report'?'◆':event.kind==='revaluation'?'★':'▲'}</text></g>;})}
      {active&&<g className="quote-crosshair"><line x1={active.x} x2={active.x} y1="3" y2={height-3}/>{detail&&<line x1="3" x2={width-3} y1={active.y} y2={active.y}/>}<circle cx={active.x} cy={active.y} r="3"/></g>}
    </svg>
    {active&&<span className="quote-tooltip" role="status" style={{left:`${Math.max(28,Math.min(72,active.x/width*100))}%`}}>第 {active.round} 轮 · {priceText(active.price)} 万{active.current?' · 最新':''}{detail&&events.filter(e=>e.round===active.round).map(e=>` · ${e.title}`).join('')}</span>}
    {detail&&<>
      <div className={`quote-rounds ${markers.length===1?'quote-rounds-single':''}`}>
        {markers.map((point,index)=><span key={`${point.round}-${point.current}-${index}`}>{point.current?(chart.points.length===1?`第 ${point.round} 轮 · 现价`:'现价'):`第 ${point.round} 轮`}</span>)}
      </div>
      {chart.points.length===1&&<p className="quote-empty">仅有一个行情点，下一轮开始形成走势</p>}
    </>}
    <div className="quote-range"><span>高 {priceText(chart.high)} · 低 {priceText(chart.low)}</span><span>最近 {range} 轮</span></div>
  </div>;
}
