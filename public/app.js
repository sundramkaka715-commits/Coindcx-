const $=id=>document.getElementById(id); let markets=[];
const num=x=>Number(x);
function normalize(rows){return(rows||[]).map(c=>({time:num(c.time),open:num(c.open),high:num(c.high),low:num(c.low),close:num(c.close),volume:num(c.volume)})).sort((a,b)=>a.time-b.time)}
function isClosed(c,ms){return c.time+ms<=Date.now()}
function aggregateMinutes(rows,minutes){
  const ms=minutes*60000, groups=new Map();
  for(const c of rows){const s=Math.floor(c.time/ms)*ms;if(!groups.has(s))groups.set(s,[]);groups.get(s).push(c)}
  const out=[];
  for(const [s,a0] of groups){const a=a0.sort((x,y)=>x.time-y.time);if(a.length!==minutes)continue;let ok=true;for(let i=0;i<minutes;i++)if(a[i].time!==s+i*60000)ok=false;if(!ok)continue;out.push({time:s,open:a[0].open,high:Math.max(...a.map(x=>x.high)),low:Math.min(...a.map(x=>x.low)),close:a[a.length-1].close,volume:a.reduce((z,x)=>z+x.volume,0)})}
  return out.sort((a,b)=>a.time-b.time)
}
async function getJson(u){const r=await fetch(u);if(!r.ok)throw new Error(await r.text());return r.json()}
function fmt(t){return new Date(t).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
function pairFor(s){return `B-${s.slice(0,-4)}_USDT`}
function findSignal(h1Raw,scanRaw){
  const ref=(normalize(h1Raw).filter(c=>isClosed(c,3600000))).at(-1); if(!ref)return null;
  const minutes=Number($("interval").value);
  const scans=scanRaw.filter(c=>isClosed(c,minutes*60000)&&c.time>ref.time).sort((a,b)=>a.time-b.time);
  let bear=null,bull=null;
  for(const c of scans){
    if(!bear&&c.high>ref.high)bear=c; // wick sweep arms bearish
    if(!bull&&c.low<ref.low)bull=c;    // wick sweep arms bullish
    // Confirmation may be same candle, 2nd, 3rd, or any later candle.
    if(bear&&c.close<ref.high)return{type:"BEARISH",time:c.time,close:c.close,level:ref.high,wick:bear.time,confirm:c.time};
    if(bull&&c.close>ref.low)return{type:"BULLISH",time:c.time,close:c.close,level:ref.low,wick:bull.time,confirm:c.time};
  }
  return null;
}
async function scanOne(symbol){const pair=pairFor(symbol);const [h1,m1]=await Promise.all([getJson(`/api/candles?pair=${encodeURIComponent(pair)}&interval=1h&limit=10`),getJson(`/api/candles?pair=${encodeURIComponent(pair)}&interval=1m&limit=1000`)]);const minutes=Number($("interval").value);const signal=findSignal(h1,aggregateMinutes(normalize(m1),minutes));return signal?{...signal,symbol}:null}
async function loadMarkets(){ $("status").textContent="Loading CoinDCX markets…";const d=await getJson("/api/markets");markets=d.symbols||[];$("marketCount").textContent=markets.length }
function render(rs){const tb=$("results");if(!rs.length){tb.innerHTML='<tr><td class="empty" colspan="8">No signal found yet. Scanner is checking CoinDCX active USDT coins.</td></tr>';return}tb.innerHTML=rs.sort((a,b)=>b.time-a.time).map(r=>`<tr><td>${fmt(r.time)}</td><td><b>${r.symbol.replace("USDT","")}</b></td><td class="${r.type==="BEARISH"?"bear":"bull"}">${r.type}</td><td>${r.close}</td><td>${r.level}</td><td>${fmt(r.wick)}</td><td>${fmt(r.confirm)}</td><td><a href="https://coindcx.com/trade/${r.symbol}" target="_blank">Open</a></td></tr>`).join("")}
async function scan(){
  $("scan").disabled=true;$("results").innerHTML="";$("signals").textContent="0";$("scanned").textContent="0";
  try{if(!markets.length)await loadMarkets();const f=$("filter").value.trim().toUpperCase();const list=f?markets.filter(s=>s.includes(f)):markets;let done=0,found=0,rs=[];$("status").textContent=`Scanning 0/${list.length}`;
    for(let i=0;i<list.length;i+=6){const settled=await Promise.allSettled(list.slice(i,i+6).map(scanOne));for(const r of settled){done++;if(r.status==="fulfilled"&&r.value){rs.push(r.value);found++}}$("scanned").textContent=done;$("signals").textContent=found;$("status").textContent=`Scanning ${done}/${list.length}`;render(rs)}
    $("status").textContent=`Done — ${found} signal${found===1?"":"s"}`;
  }catch(e){console.error(e);$("status").textContent="Error: "+e.message}finally{$("scan").disabled=false}
}
$("scan").addEventListener("click",scan);loadMarkets().then(scan).catch(e=>$("status").textContent="Market load error: "+e.message);
