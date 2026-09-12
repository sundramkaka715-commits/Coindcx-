let market={}, priceChart=null, rsiChart=null;
const movement=new Map();
const $=id=>document.getElementById(id);
const resolutionMap={1:"1",5:"5",60:"60","1D":"1D"};
const divCache=new Map();

function fmt(n){if(!Number.isFinite(n))return "-";return n>=1?n.toLocaleString(undefined,{maximumFractionDigits:4}):n.toPrecision(5)}

async function loadPrices(){
  try{
    const r=await fetch("/api/prices"),j=await r.json();
    market=j.prices||{}; render();
    $("status").textContent=`Live • ${Object.keys(market).length} Futures`;
  }catch(e){$("status").textContent="Data error"}
}

function render(){
  const arr=Object.entries(market).map(([symbol,d])=>({
    symbol,price:Number(d.ls??d.mp??0),pc:Number(d.pc??0)
  })).filter(x=>x.price>0).sort((a,b)=>{
    // Sabse haal ka price movement hamesha #1.
    // Koi threshold nahi: ek tick ka chhota movement bhi count hoga.
    const am=movement.get(a.symbol)?.movedAt||0, bm=movement.get(b.symbol)?.movedAt||0;
    if(am!==bm) return bm-am;
    return Math.abs(b.pc)-Math.abs(a.pc);
  });

  const confirmed=[...divCache.entries()].map(([symbol,s])=>({symbol,s}))
    .filter(x=>x.s && x.s.type).sort((a,b)=>b.s.time-a.s.time);
  $("divergenceList").innerHTML=confirmed.length ? confirmed.map(x=>{
    const m=market[x.symbol];
    const pc=Number(m?.pc||0);
    const mv=(pc>=0?'+':'')+pc.toFixed(2)+'%';
    return `<div class="divRow" data-pair="${x.symbol}">
      <b>${x.symbol.replace(/^B-/,'')}</b>
      <span class="${x.s.type==='bull'?'bullText':'bearText'}">${x.s.type==='bull'?'🟢 BULLISH DIVERGENCE':'🔴 BEARISH DIVERGENCE'}</span>
      <strong class="${pc>=0?'up':'down'}">${mv}</strong>
      <small>${$("resolution").value}</small>
    </div>`;
  }).join("") : '<div class="none">कोई confirmed RSI divergence नहीं मिली</div>';

  $("list").innerHTML=arr.map((x,i)=>{
    const s=divCache.get(x.symbol);
    const badge=s?.type==='bull'?'<span class="badge bull">🟢 BULL DIV</span>':
      s?.type==='bear'?'<span class="badge bear">🔴 BEAR DIV</span>':'';
    const mv=movement.get(x.symbol);
    const moveClass=x.pc>=0?'up':'down';
    const move=(x.pc>=0?'+':'')+x.pc.toFixed(2)+'%';
    const tickMove=mv && Number.isFinite(mv.tickPct) ? ` • tick ${mv.tickPct>=0?'+':''}${mv.tickPct.toFixed(5)}%` : "";
    return `<div class="row ${s?'has-divergence':''}" data-pair="${x.symbol}">
      <span class="rank">#${i+1}</span>
      <span class="symbol">${x.symbol.replace(/^B-/,'')}</span>
      <span class="price">${fmt(x.price)}</span>
      <span class="${moveClass}">${move}</span>
      <small>${tickMove}</small>
      ${badge}</div>`;
  }).join("");
  document.querySelectorAll(".row,.divRow").forEach(el=>el.onclick=()=>openChart(el.dataset.pair));
}

function rsi(values,period=14){
  const out=Array(values.length).fill(null);let g=0,l=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)g+=d;else l-=d}
  let ag=g/period,al=l/period;out[period]=al===0?100:100-100/(1+ag/al);
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1],gg=Math.max(d,0),ll=Math.max(-d,0);
    ag=(ag*(period-1)+gg)/period;al=(al*(period-1)+ll)/period;
    out[i]=al===0?100:100-100/(1+ag/al);
  }return out;
}

/* Strict confirmed regular divergence:
   - completed pivot needs 3 candles on BOTH sides
   - compares the latest two confirmed pivots
   - price difference >= 0.1%
   - RSI difference >= 2 points
   - otherwise returns null, so no signal is displayed
*/
function divergence(closes,rsis){
  const w=3,H=[],L=[];
  for(let i=w;i<closes.length-w;i++){
    let hi=true,lo=true;
    for(let k=1;k<=w;k++){
      if(closes[i]<=closes[i-k]||closes[i]<=closes[i+k])hi=false;
      if(closes[i]>=closes[i-k]||closes[i]>=closes[i+k])lo=false;
    }
    if(rsis[i]!=null){if(hi)H.push(i);if(lo)L.push(i)}
  }
  const a=H.at(-2),b=H.at(-1),c=L.at(-2),d=L.at(-1);
  if(a!=null&&b!=null&&closes[b]>closes[a]*(1.001)&&rsis[b]<rsis[a]-2)
    return {type:"bear",pivotIndex:b,time:b};
  if(c!=null&&d!=null&&closes[d]<closes[c]*(0.999)&&rsis[d]>rsis[c]+2)
    return {type:"bull",pivotIndex:d,time:d};
  return null;
}

async function scanCoin(pair){
  try{
    const resolution=resolutionMap[$("resolution").value];
    const j=await (await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&resolution=${resolution}`)).json();
    const candles=(j.data||[]).slice().sort((a,b)=>a.time-b.time);
    if(candles.length<30)return null;
    const closes=candles.map(x=>Number(x.close)),rsis=rsi(closes,14);
    return divergence(closes,rsis);
  }catch(e){return null}
}

async function scanVisible(){
  const pairs=Object.keys(market).sort((a,b)=>Math.abs(Number(market[b]?.pc||0))-Math.abs(Number(market[a]?.pc||0))).slice(0,50);
  $("scanStatus").textContent="Divergence scan चल रहा है…";
  for(const p of pairs){
    const s=await scanCoin(p);
    if(s)divCache.set(p,s); else divCache.delete(p);
  }
  $("scanStatus").textContent=`Confirmed divergence: ${divCache.size}`;
  render();
}

function markerData(values, idx){return values.map((v,i)=>i===idx?v:null)}

async function openChart(pair){
  $("chartBox").classList.remove("hidden");
  $("title").textContent=pair+" • "+$("resolution").value;
  $("signal").textContent="Checking confirmed RSI divergence…";
  const resolution=resolutionMap[$("resolution").value];
  try{
    const j=await (await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&resolution=${resolution}`)).json();
    const candles=(j.data||[]).slice().sort((a,b)=>a.time-b.time);
    if(candles.length<30)throw new Error("Not enough candles");
    const closes=candles.map(x=>Number(x.close)),rsis=rsi(closes,14),sig=divergence(closes,rsis);
    if(sig){
      const text=sig.type==='bull'?"🟢 BULLISH RSI DIVERGENCE":"🔴 BEARISH RSI DIVERGENCE";
      $("signal").textContent=text+" • Confirmed";
      divCache.set(pair,sig);
    } else {$("signal").textContent="No confirmed RSI divergence";divCache.delete(pair)}
    render();
    const labels=candles.map(x=>new Date(x.time).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));
    const idx=sig?.pivotIndex;
    if(priceChart)priceChart.destroy();if(rsiChart)rsiChart.destroy();
    priceChart=new Chart($("priceChart"),{type:"line",data:{labels,datasets:[
      {label:"Price",data:closes,pointRadius:0,tension:.15},
      ...(sig?[{label:sig.type==='bull'?"🟢 Bullish divergence point":"🔴 Bearish divergence point",data:markerData(closes,idx),showLine:false,pointRadius:7,pointHoverRadius:9}]:[])
    ]},options:{responsive:true}});
    rsiChart=new Chart($("rsiChart"),{type:"line",data:{labels,datasets:[
      {label:"RSI (14)",data:rsis,pointRadius:0,tension:.15},
      ...(sig?[{label:sig.type==='bull'?"🟢 RSI higher low":"🔴 RSI lower high",data:markerData(rsis,idx),showLine:false,pointRadius:7,pointHoverRadius:9}]:[])
    ]},options:{responsive:true,scales:{y:{min:0,max:100}}}});
  }catch(e){$("signal").textContent="Chart data unavailable"}
}

$("close").onclick=()=>$("chartBox").classList.add("hidden");
$("refresh").onclick=async()=>{divCache.clear();await loadPrices();await scanVisible()};
$("resolution").onchange=async()=>{divCache.clear();await loadPrices();await scanVisible()};
loadPrices().then(scanVisible);
setInterval(loadPrices,10000);
setInterval(scanVisible,60000);

const socket=io();
socket.on("connect",()=>{$("status").textContent="Live socket connected"});
socket.on("tick",t=>{
  if(!t || !t.symbol || !Number.isFinite(Number(t.price))) return;
  // Har real-time price change ko record karo, chahe movement bahut hi chhota ho.
  if(market[t.symbol]) market[t.symbol].ls=t.price;
  movement.set(t.symbol,{movedAt:Number(t.ts)||Date.now(),tickPct:Number(t.tickPct)||0,dir:Number(t.tickPct)>=0?"up":"down"});
  render();
});
