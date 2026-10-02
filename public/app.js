
let market={}, priceChart=null, rsiChart=null;
const movement=new Map(), move15=new Map(), divCache=new Map();
const $=id=>document.getElementById(id);

function fmt(n){if(!Number.isFinite(n))return "-";return n>=1?n.toLocaleString(undefined,{maximumFractionDigits:6}):n.toPrecision(6)}
function pct(n){return Number.isFinite(n)?`${n>=0?"+":""}${n.toFixed(2)}%`:"-"}
function resolutionValue(){return $("resolution").value}

async function loadPrices(){
  try{const j=await (await fetch("/api/prices")).json();market=j.prices||{};render();$("status").textContent=`Live • ${Object.keys(market).length} Futures`;}
  catch(e){$("status").textContent="Data error"}
}
async function load15m(){
  try{const j=await (await fetch("/api/movers15")).json();move15.clear();for(const [s,v] of Object.entries(j.movers||{}))move15.set(s,v);render();return true;}
  catch(e){return false}
}

function render(){
  const arr=Object.entries(market).map(([symbol,d])=>{
    const m=move15.get(symbol), mv=movement.get(symbol);
    return {symbol,price:Number(d.ls??d.mp??0),m15:m?.move15, movedAt:mv?.movedAt||m?.movedAt||0};
  }).filter(x=>x.price>0)
    .sort((a,b)=>{
      // Latest real movement first — even a tiny movement.
      if(a.movedAt!==b.movedAt)return b.movedAt-a.movedAt;
      const aa=Math.abs(a.m15??-Infinity),bb=Math.abs(b.m15??-Infinity);
      return bb-aa;
    });

  const confirmed=[...divCache.entries()].filter(([,s])=>s?.type).sort((a,b)=>(b[1].time||0)-(a[1].time||0));
  $("divergenceList").innerHTML=confirmed.length?confirmed.map(([symbol,s])=>{
    const m=move15.get(symbol)?.move15;
    return `<div class="divRow" data-pair="${symbol}">
      <b>${symbol.replace(/^B-/,"")}</b>
      <span class="${s.type==='bull'?'bullText':'bearText'}">${s.type==='bull'?'🟢 BULLISH DIVERGENCE':'🔴 BEARISH DIVERGENCE'}</span>
      <strong class="m15 ${m>=0?'up':'down'}">${pct(m)}</strong><small>${resolutionValue()} • confirmed</small>
    </div>`;
  }).join(""):'<div class="none">कोई confirmed RSI divergence नहीं मिली</div>';

  $("list").innerHTML=arr.map((x,i)=>{
    const s=divCache.get(x.symbol), cls=s?.type==='bull'?'bull':s?.type==='bear'?'bear':'';
    const badge=s?`<span class="badge ${cls}">${s.type==='bull'?'🟢 BULL DIV':'🔴 BEAR DIV'}</span>`:"";
    const active=movement.get(x.symbol)?.movedAt && Date.now()-movement.get(x.symbol).movedAt<15000;
    const moveClass=(x.m15??0)>=0?'up':'down';
    const moveText=Number.isFinite(x.m15)?pct(x.m15):"warming…";
    return `<div class="row ${s?'has-divergence ':''}${active?'fresh':''}" data-pair="${x.symbol}">
      <span class="rank">#${i+1}</span><span class="symbol">${x.symbol.replace(/^B-/,'')}</span>
      <span class="price">${fmt(x.price)}</span><span class="m15 ${moveClass}">${moveText}</span>${badge}</div>`;
  }).join("");
  document.querySelectorAll(".row,.divRow").forEach(el=>el.onclick=()=>openChart(el.dataset.pair));
}

function rsi(values,period=14){
  const out=Array(values.length).fill(null);let g=0,l=0;
  if(values.length<=period)return out;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)g+=d;else l-=d}
  let ag=g/period,al=l/period;out[period]=al===0?100:100-100/(1+ag/al);
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1],gg=Math.max(d,0),ll=Math.max(-d,0);ag=(ag*(period-1)+gg)/period;al=(al*(period-1)+ll)/period;out[i]=al===0?100:100-100/(1+ag/al);}
  return out;
}

function aggregate3(candles){
  const out=[];
  for(let i=0;i<candles.length;i+=3){
    const g=candles.slice(i,i+3); if(g.length<3)continue;
    out.push({time:g[0].time,open:Number(g[0].open),high:Math.max(...g.map(x=>Number(x.high))),low:Math.min(...g.map(x=>Number(x.low))),close:Number(g[g.length-1].close)});
  }
  return out;
}

/* Confirmed regular divergence:
   3 candles on both sides confirm the pivot; compares the latest two
   confirmed highs/lows; price >=0.1% and RSI >=2 points.
   No signal unless every condition is satisfied.
*/
function divergence(closes,rsis){
  const w=3,H=[],L=[];
  for(let i=w;i<closes.length-w;i++){
    let hi=true,lo=true;
    for(let k=1;k<=w;k++){if(closes[i]<=closes[i-k]||closes[i]<=closes[i+k])hi=false;if(closes[i]>=closes[i-k]||closes[i]>=closes[i+k])lo=false;}
    if(rsis[i]!=null){if(hi)H.push(i);if(lo)L.push(i);}
  }
  const a=H.at(-2),b=H.at(-1),c=L.at(-2),d=L.at(-1);
  if(a!=null&&b!=null&&closes[b]>closes[a]*1.001&&rsis[b]<rsis[a]-2)return {type:"bear",pivotIndex:b,time:Date.now()};
  if(c!=null&&d!=null&&closes[d]<closes[c]*0.999&&rsis[d]>rsis[c]+2)return {type:"bull",pivotIndex:d,time:Date.now()};
  return null;
}

async function getCandles(pair, res){
  let apiRes=res;
  if(res==="3")apiRes="1";
  const j=await (await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&resolution=${apiRes}`)).json();
  let c=(j.data||[]).slice().sort((a,b)=>a.time-b.time).map(x=>({...x,time:Number(x.time)}));
  if(res==="3")c=aggregate3(c);
  // Use a focused 1m/3m window for fast confirmed signals.
  return c.slice(-80);
}

async function scanCoin(pair){
  try{
    const c=await getCandles(pair,resolutionValue());
    if(c.length<30)return null;
    const closes=c.map(x=>Number(x.close)),rsis=rsi(closes,14);
    const s=divergence(closes,rsis);
    if(s)s.pivotTime=c[s.pivotIndex]?.time;
    return s;
  }catch(e){return null}
}

async function scanVisible(){
  $("scanStatus").textContent="15m movers + RSI scan चल रहा है…";
  await load15m();
  const pairs=Object.keys(market);
  // Only coins that have a non-zero 15m movement are RSI candidates.
  const active=pairs.filter(p=>Math.abs(move15.get(p)?.move15||0)>1e-12)
    .sort((a,b)=>Math.abs(move15.get(b)?.move15||0)-Math.abs(move15.get(a)?.move15||0));
  const top=active.slice(0,80);
  for(const p of top){
    const s=await scanCoin(p);
    if(s)divCache.set(p,s); else divCache.delete(p);
  }
  $("scanStatus").textContent=`15m movers: ${active.length} • RSI scan: ${top.length}`;
  render();
}

function markerData(values,idx){return values.map((v,i)=>i===idx?v:null)}

async function openChart(pair){
  $("chartBox").classList.remove("hidden");$("title").textContent=pair+" • "+resolutionValue();$("signal").textContent="Checking confirmed RSI divergence…";
  try{
    const c=await getCandles(pair,resolutionValue()); if(c.length<30)throw Error("not enough");
    const closes=c.map(x=>Number(x.close)),rsis=rsi(closes,14),sig=divergence(closes,rsis);
    if(sig){sig.pivotTime=c[sig.pivotIndex]?.time;divCache.set(pair,sig);$("signal").textContent=(sig.type==="bull"?"🟢 BULLISH RSI DIVERGENCE":"🔴 BEARISH RSI DIVERGENCE")+" • Confirmed";}
    else{$("signal").textContent="No confirmed RSI divergence";divCache.delete(pair)}
    render();
    const labels=c.map(x=>new Date(x.time*1000).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
    const idx=sig?.pivotIndex;
    if(priceChart)priceChart.destroy();if(rsiChart)rsiChart.destroy();
    priceChart=new Chart($("priceChart"),{type:"line",data:{labels,datasets:[{label:"Price",data:closes,pointRadius:0,tension:.15},...(sig?[{label:sig.type==="bull"?"🟢 Bullish divergence":"🔴 Bearish divergence",data:markerData(closes,idx),showLine:false,pointRadius:7}]:[])]},options:{responsive:true}});
    rsiChart=new Chart($("rsiChart"),{type:"line",data:{labels,datasets:[{label:"RSI (14)",data:rsis,pointRadius:0,tension:.15},...(sig?[{label:sig.type==="bull"?"🟢 RSI higher low":"🔴 RSI lower high",data:markerData(rsis,idx),showLine:false,pointRadius:7}]:[])]},options:{responsive:true,scales:{y:{min:0,max:100}}}});
  }catch(e){$("signal").textContent="Chart data unavailable"}
}

$("close").onclick=()=>$("chartBox").classList.add("hidden");
$("refresh").onclick=async()=>{divCache.clear();await loadPrices();await scanVisible()};
$("resolution").onchange=async()=>{divCache.clear();await scanVisible()};
loadPrices().then(scanVisible);
setInterval(loadPrices,10000);
setInterval(load15m,15000);
setInterval(scanVisible,60000);

const socket=io();
socket.on("connect",()=>{$("status").textContent="Live socket connected"});
socket.on("tick",t=>{
  if(!t?.symbol||!Number.isFinite(Number(t.price)))return;
  if(market[t.symbol])market[t.symbol].ls=t.price;
  movement.set(t.symbol,{movedAt:Number(t.movedAt)||Date.now(),tickPct:Number(t.tickPct)||0,dir:t.dir});
  render();
});
