const $ = id => document.getElementById(id);
let markets = [];
let timer = null;
let busy = false;

const RSI_PERIOD = 14;
const TFS = ["1m","5m","15m"];

function rsi(values, period=14){
  if(values.length <= period) return Array(values.length).fill(null);
  const out = Array(values.length).fill(null);
  let gain=0, loss=0;
  for(let i=1;i<=period;i++){ const d=values[i]-values[i-1]; gain+=Math.max(d,0); loss+=Math.max(-d,0); }
  let avgG=gain/period, avgL=loss/period;
  out[period] = avgL===0 ? 100 : 100-(100/(1+avgG/avgL));
  for(let i=period+1;i<values.length;i++){
    const d=values[i]-values[i-1];
    avgG=(avgG*(period-1)+Math.max(d,0))/period;
    avgL=(avgL*(period-1)+Math.max(-d,0))/period;
    out[i]=avgL===0?100:100-(100/(1+avgG/avgL));
  }
  return out;
}

function pivots(arr, left=2, right=2){
  const lows=[], highs=[];
  for(let i=left;i<arr.length-right;i++){
    let lo=true, hi=true;
    for(let j=1;j<=left;j++){ if(arr[i]>=arr[i-j]) lo=false; if(arr[i]<=arr[i-j]) hi=false; }
    for(let j=1;j<=right;j++){ if(arr[i]>arr[i+j]) lo=false; if(arr[i]<arr[i+j]) hi=false; }
    if(lo) lows.push(i); if(hi) highs.push(i);
  }
  return {lows, highs};
}

function detect(candles, minGap=15, maxGap=20){
  const c=[...candles].sort((a,b)=>a.time-b.time);
  if(c.length < 40) return null;
  const closes=c.map(x=>Number(x.close));
  const rsis=rsi(closes,RSI_PERIOD);
  const pp=pivots(closes,2,2);
  const validLow=pp.lows.filter(i=>rsis[i]!=null);
  const validHigh=pp.highs.filter(i=>rsis[i]!=null);

  // Only the newest confirmed pivot is used as the second pivot.
  const lastLow=validLow.at(-1);
  if(lastLow!=null){
    for(let k=validLow.length-2;k>=0;k--){
      const prev=validLow[k], gap=lastLow-prev;
      if(gap>maxGap) break;
      if(gap>=minGap && closes[lastLow] < closes[prev] && rsis[lastLow] > rsis[prev]){
        return {side:"BULLISH",type:"Regular bullish divergence",a:prev,b:lastLow,price:closes[lastLow],rsi:rsis[lastLow],gap,time:c[lastLow].time};
      }
    }
  }
  const lastHigh=validHigh.at(-1);
  if(lastHigh!=null){
    for(let k=validHigh.length-2;k>=0;k--){
      const prev=validHigh[k], gap=lastHigh-prev;
      if(gap>maxGap) break;
      if(gap>=minGap && closes[lastHigh] > closes[prev] && rsis[lastHigh] < rsis[prev]){
        return {side:"BEARISH",type:"Regular bearish divergence",a:prev,b:lastHigh,price:closes[lastHigh],rsi:rsis[lastHigh],gap,time:c[lastHigh].time};
      }
    }
  }
  return null;
}

async function getCandles(pair, interval){
  const r=await fetch(`/api/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=100`);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function mapLimit(items, concurrency, fn){
  const out=[]; let idx=0;
  async function worker(){
    while(true){
      const i=idx++; if(i>=items.length) return;
      try{ const v=await fn(items[i],i); if(v) out.push(v); }catch(e){}
      await sleep(80);
    }
  }
  await Promise.all(Array.from({length:concurrency},worker));
  return out;
}

function formatTime(ms){return new Date(Number(ms)).toLocaleString("en-IN",{hour12:false});}
function fmt(n){return Number(n).toPrecision(8).replace(/\.?0+$/,"");}

async function loadMarkets(){
  const r=await fetch("/api/markets"); if(!r.ok) throw new Error("Markets load failed");
  markets=await r.json();
  $("coins").textContent=markets.length;
}

async function scan(){
  if(busy) return;
  busy=true; $("scanBtn").disabled=true; $("status").textContent="Scanning…";
  try{
    if(!markets.length) await loadMarkets();
    const lim=$("marketLimit").value;
    let list=[...markets];
    if(lim!=="all") list=list.slice(0,Number(lim));
    const tf=$("tf").value==="all"?TFS:[$("tf").value];
    const minGap=15, maxGap=Number($("gap").value);
    const jobs=[];
    for(const m of list) for(const t of tf) jobs.push({m,t});
    const signals=await mapLimit(jobs,4,async ({m,t})=>{
      const c=await getCandles(m.pair,t);
      const d=detect(c,minGap,maxGap);
      return d?{...d,symbol:m.symbol,pair:m.pair,tf:t}:null;
    });
    signals.sort((a,b)=>Number(b.time)-Number(a.time));
    render(signals);
    $("updated").textContent="Updated: "+new Date().toLocaleTimeString("en-IN");
    $("status").textContent=`Done • ${signals.length} signal(s)`;
  }catch(e){ $("status").textContent="Error: "+e.message; }
  finally{busy=false;$("scanBtn").disabled=false;}
}

function render(rows){
  $("total").textContent=rows.length;
  $("bull").textContent=rows.filter(x=>x.side==="BULLISH").length;
  $("bear").textContent=rows.filter(x=>x.side==="BEARISH").length;
  const body=$("rows");
  if(!rows.length){body.innerHTML='<tr><td colspan="7" class="empty">15–20 candle gap वाला confirmed RSI divergence अभी नहीं मिला.</td></tr>';return;}
  body.innerHTML=rows.map(x=>`<tr>
    <td><b>${x.symbol}</b></td>
    <td>${x.tf}</td>
    <td class="${x.side==="BULLISH"?"bull":"bear"}">${x.side}<br><small>${x.type}</small></td>
    <td>${fmt(x.price)}</td>
    <td>${Number(x.rsi).toFixed(2)}</td>
    <td>${x.gap} candles</td>
    <td>${formatTime(x.time)}</td>
  </tr>`).join("");
}

function resetTimer(){
  if(timer) clearInterval(timer);
  timer=setInterval(scan,Number($("refresh").value));
}

$("scanBtn").onclick=scan;
$("refresh").onchange=resetTimer;
$("marketLimit").onchange=()=>{ $("status").textContent="Setting changed"; };
$("tf").onchange=()=>{ $("status").textContent="Timeframe changed"; };
$("gap").onchange=()=>{ $("status").textContent="Pivot gap changed"; };

(async()=>{try{await loadMarkets();await scan();resetTimer();}catch(e){$("status").textContent=e.message;}})();
