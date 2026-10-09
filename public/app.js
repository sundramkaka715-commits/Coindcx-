(() => {
"use strict";
// 18-coin watchlist included in this ZIP.
const WATCHLIST = [
 "B-BTC_USDT","B-ETH_USDT","B-SOL_USDT","B-XRP_USDT","B-DOGE_USDT","B-ADA_USDT",
 "B-BNB_USDT","B-AVAX_USDT","B-LINK_USDT","B-DOT_USDT","B-LTC_USDT","B-BCH_USDT",
 "B-TRX_USDT","B-NEAR_USDT","B-SUI_USDT","B-APT_USDT","B-UNI_USDT","B-ZEC_USDT"
];
const $ = id => document.getElementById(id);
let timer = null, busy = false;
const log = msg => { $("log").textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + $("log").textContent; };
const num = v => { const n=Number(v); return Number.isFinite(n)?n:null; };
function normalizeCandle(c) {
 if(Array.isArray(c)) return {time:num(c[0]),open:num(c[1]),high:num(c[2]),low:num(c[3]),close:num(c[4]),volume:num(c[5]??0)};
 return {time:num(c.time??c.t??c.timestamp),open:num(c.open??c.o),high:num(c.high??c.h),low:num(c.low??c.l),close:num(c.close??c.c),volume:num(c.volume??c.v??0)};
}
async function getCandles(pair, interval, limit=220) {
 const end=Date.now(), start=end- Math.max(limit*60*1000, 36*60*60*1000);
 const url=`https://public.coindcx.com/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&startTime=${start}&endTime=${end}`;
 const res=await fetch(url,{cache:"no-store"});
 if(!res.ok) throw new Error(`${pair} ${interval}: HTTP ${res.status}`);
 const raw=await res.json(), arr=Array.isArray(raw)?raw:(raw.data||raw.candles||[]);
 const out=arr.map(normalizeCandle).filter(c=>c.time!==null&&c.open!==null&&c.high!==null&&c.low!==null&&c.close!==null);
 out.forEach(c=>{if(c.time<1e12)c.time*=1000});
 out.sort((a,b)=>a.time-b.time);
 return out.slice(-limit);
}
function rsi(data, period=14) {
 if(data.length<=period)return [];
 const out=Array(data.length).fill(null); let gain=0,loss=0;
 for(let i=1;i<=period;i++){const d=data[i].close-data[i-1].close;gain+=Math.max(0,d);loss+=Math.max(0,-d)}
 let ag=gain/period,al=loss/period;out[period]=al===0?100:100-100/(1+ag/al);
 for(let i=period+1;i<data.length;i++){const d=data[i].close-data[i-1].close;ag=(ag*(period-1)+Math.max(0,d))/period;al=(al*(period-1)+Math.max(0,-d))/period;out[i]=al===0?100:100-100/(1+ag/al)}
 return out;
}
function pivots(data, type, left=2, right=2) {
 const out=[];
 for(let i=left;i<data.length-right;i++){const v=type==="high"?data[i].high:data[i].low;let ok=true;
  for(let j=i-left;j<=i+right;j++){if(j===i)continue;const z=type==="high"?data[j].high:data[j].low;if(type==="high"?z>v:z<v){ok=false;break}}
  if(ok)out.push(i);
 }
 return out;
}
function getDivergence(data) {
 if(data.length<35)return null;
 const rs=rsi(data), hs=pivots(data,"high"), ls=pivots(data,"low");
 if(hs.length>=2){const a=hs[hs.length-2],b=hs[hs.length-1];
  if(data[b].high>data[a].high && rs[b]!==null&&rs[a]!==null&&rs[b]<rs[a]-1.5 && b>=data.length-10)
   return {side:"bear",a,b,rsi:rs[b],reason:"Price higher high, RSI lower high"};
 }
 if(ls.length>=2){const a=ls[ls.length-2],b=ls[ls.length-1];
  if(data[b].low<data[a].low && rs[b]!==null&&rs[a]!==null&&rs[b]>rs[a]+1.5 && b>=data.length-10)
   return {side:"bull",a,b,rsi:rs[b],reason:"Price lower low, RSI higher low"};
 }
 return null;
}
function volumeOK(data) {
 if(data.length<22)return true;
 const recent=data[data.length-2].volume||0, prev=data.slice(-22,-2).map(c=>c.volume||0);
 const avg=prev.reduce((a,b)=>a+b,0)/Math.max(1,prev.length);
 return avg===0 || recent>=avg*0.8;
}
function analyze(pair, h1, lowTf, tfLabel, useVol, direction) {
 if(h1.length<3||lowTf.length<40)return null;
 // Use most recent completed hourly candle as the level candle.
 const levelCandle=h1[h1.length-2], currentH=h1[h1.length-1];
 const last=lowTf[lowTf.length-2]; // completed lower-timeframe candle
 const prior=lowTf.slice(-10,-2);
 const div=getDivergence(lowTf);
 if(!div || (direction!=="both"&&direction!==div.side))return null;
 if(useVol&&!volumeOK(lowTf))return null;
 const price=last.close, sweepHigh=lowTf.slice(-12,-1).some(c=>c.high>levelCandle.high);
 const sweepLow=lowTf.slice(-12,-1).some(c=>c.low<levelCandle.low);
 let stage=null, level=null, invalid=null, entry=null, reason=div.reason;
 if(div.side==="bear") {
  level=levelCandle.high; invalid=Math.max(...lowTf.slice(-8,-1).map(c=>c.high));
  const swept=sweepHigh || currentH.high>levelCandle.high;
  const rejected=price<levelCandle.high;
  const swingLow=Math.min(...prior.map(c=>c.low));
  const broke=price<swingLow;
  if(!swept||!rejected)return null;
  stage=broke?"CONFIRMED BREAK":"PRE-BREAK SETUP";
  entry=price; reason += "; 1H high swept/rejected" + (broke?"; recent swing low close broken":"; swing low not yet broken");
 } else {
  level=levelCandle.low; invalid=Math.min(...lowTf.slice(-8,-1).map(c=>c.low));
  const swept=sweepLow || currentH.low<levelCandle.low;
  const reclaimed=price>levelCandle.low;
  const swingHigh=Math.max(...prior.map(c=>c.high));
  const broke=price>swingHigh;
  if(!swept||!reclaimed)return null;
  stage=broke?"CONFIRMED BREAK":"PRE-BREAK SETUP";
  entry=price; reason += "; 1H low swept/reclaimed" + (broke?"; recent swing high close broken":"; swing high not yet broken");
 }
 return {pair,stage,side:div.side,reason,level,rsi:div.rsi,tf:tfLabel,entry,invalid,time:last.time};
}
function fmt(n){return n==null?"—":Number(n).toLocaleString("en-US",{maximumFractionDigits:8})}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(rows, checked, errors) {
 const shown=rows.filter(r=>r.stage==="CONFIRMED BREAK"||$("early").checked);
 $("nchecked").textContent=checked;$("nsetup").textContent=rows.filter(r=>r.stage==="PRE-BREAK SETUP").length;
 $("nconfirm").textContent=rows.filter(r=>r.stage==="CONFIRMED BREAK").length;$("nerrors").textContent=errors;
 $("results").innerHTML=shown.length?shown.sort((a,b)=>(a.stage==="CONFIRMED BREAK"?-1:1)).map(r=>`<tr>
 <td><b>${escapeHtml(r.pair.replace(/^B-/,"").replace("_USDT","/USDT"))}</b><small>${new Date(r.time).toLocaleTimeString()}</small></td>
 <td><span class="tag ${r.stage==="CONFIRMED BREAK"?"confirmed":"setup"}">${r.stage}</span></td>
 <td class="${r.side}">${r.side==="bear"?"BEARISH / SHORT":"BULLISH / LONG"}</td>
 <td>${escapeHtml(r.reason)}</td><td>${fmt(r.level)}</td><td>${r.rsi.toFixed(1)} / ${r.tf}</td><td>${fmt(r.entry)}</td><td>${fmt(r.invalid)}</td></tr>`).join(""):'<tr><td colspan="8">No matching setup found in this scan.</td></tr>';
}
async function scan() {
 if(busy)return;busy=true;$("scan").disabled=true;$("state").textContent="Scanning 18 coins…";
 const direction=$("direction").value, tf=$("tf").value, useVol=$("vol").checked;
 let checked=0, errors=0, rows=[];
 const chosen=tf==="both"?["3m","5m"]:[tf==="3"?"3m":"5m"];
 for(const pair of WATCHLIST) {
  try {
   const h1=await getCandles(pair,"1h",100);
   for(const interval of chosen) {
    try {
     const low=await getCandles(pair,interval,180);
     const r=analyze(pair,h1,low,interval.toUpperCase(),useVol,direction);
     if(r && !rows.some(x=>x.pair===r.pair&&x.side===r.side&&x.stage===r.stage))rows.push(r);
    } catch(e){errors++;log(e.message)}
    await new Promise(r=>setTimeout(r,80));
   }
   checked++;
  } catch(e){errors++;log(e.message)}
  $("nchecked").textContent=checked;
 }
 render(rows,checked,errors);
 $("state").textContent=rows.length?`${rows.length} setup(s) found`:"Scan complete — no matching setup";
 $("last").textContent=`Last scan: ${new Date().toLocaleString()} · ${checked} coins checked`;
 log(`Scan complete: ${checked} checked, ${rows.length} signals, ${errors} data errors.`);
 $("scan").disabled=false;busy=false;
}
function restartTimer(){
 if(timer){clearInterval(timer);timer=null}
 const mins=Number($("poll").value);
 if(mins>0){timer=setInterval(scan,mins*60000);log(`Auto scan enabled: every ${mins} minute(s).`)}
}
$("scan").addEventListener("click",scan);
$("poll").addEventListener("change",restartTimer);
$("stop").addEventListener("click",()=>{if(timer)clearInterval(timer);timer=null;$("poll").value="0";log("Auto scan stopped.")});
restartTimer();
})();