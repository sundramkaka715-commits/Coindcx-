/*
  CoinDCX 1H Fakeout + RSI Divergence Scanner
  Upload index.html, style.css and script.js to GitHub Pages.

  IMPORTANT:
  Public browser endpoints can be blocked by CORS. If CoinDCX blocks browser
  requests, use a small server/proxy (e.g. Replit) rather than exposing API keys.
*/

const COINS = [
  "BTC","ETH","XAU","SOL","ZEC","RLC","XRP","BR","BZ",
  "HYPER","CL","NEAR","ORCA","DOGE","ADA","SUI","BNB","QUNT"
];

const SYMBOLS = Object.fromEntries(COINS.map(c => [c, c === "XAU" ? "XAUUSDT" : `${c}USDT`]));
const API = "https://public.coindcx.com";
const state = {
  lastScan: null,
  signals: [],
  seen: new Set(),
  timer: null
};

const $ = id => document.getElementById(id);

function setStatus(t){ $("status").textContent=t; }
function fmtTime(d){ return new Date(d).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"}); }

function beep(){
  if(!$("soundToggle").checked) return;
  try{
    const C=window.AudioContext||window.webkitAudioContext;
    if(!C) return;
    const c=new C(),o=c.createOscillator(),g=c.createGain();
    o.frequency.value=880; g.gain.value=.05; o.connect(g);g.connect(c.destination);
    o.start();o.stop(c.currentTime+.18);
  }catch(e){}
}

function notify(title, body){
  beep();
  if(Notification.permission==="granted") new Notification(title,{body});
}

async function getCandles(pair, interval, limit=120){
  // CoinDCX's public candle endpoint has changed across API versions.
  // Try the current public market-data route first.
  const urls = [
    `${API}/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`,
    `${API}/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}`
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{cache:"no-store"});
      if(!r.ok) continue;
      const j=await r.json();
      const a=Array.isArray(j)?j:(j.data||j.candles||[]);
      if(Array.isArray(a) && a.length) return a;
    }catch(e){}
  }
  throw new Error("Candle API unavailable");
}

function normalize(x){
  return {
    t:Number(x.time ?? x.timestamp ?? x.T ?? x[0]),
    o:Number(x.open ?? x.o ?? x[1]),
    h:Number(x.high ?? x.h ?? x[2]),
    l:Number(x.low ?? x.l ?? x[3]),
    c:Number(x.close ?? x.c ?? x[4]),
    v:Number(x.volume ?? x.v ?? x[5] ?? 0)
  };
}

function rsi(closes,n=14){
  if(closes.length<n+1) return [];
  let gains=0,losses=0;
  for(let i=1;i<=n;i++){
    const d=closes[i]-closes[i-1];
    gains+=Math.max(d,0); losses+=Math.max(-d,0);
  }
  let ag=gains/n, al=losses/n;
  const out=Array(n).fill(null);
  out.push(al===0?100:100-100/(1+ag/al));
  for(let i=n+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(n-1)+Math.max(d,0))/n;
    al=(al*(n-1)+Math.max(-d,0))/n;
    out.push(al===0?100:100-100/(1+ag/al));
  }
  return out;
}

function pivots(a,look=3){
  const lows=[],highs=[];
  for(let i=look;i<a.length-look;i++){
    let lo=true,hi=true;
    for(let k=1;k<=look;k++){
      if(a[i]>=a[i-k] || a[i]>=a[i+k]) lo=false;
      if(a[i]<=a[i-k] || a[i]<=a[i+k]) hi=false;
    }
    if(lo) lows.push(i);
    if(hi) highs.push(i);
  }
  return {lows,highs};
}

function divergence(c){
  const closes=c.map(x=>x.c), rs=rsi(closes);
  const {lows,highs}=pivots(closes,3);
  let bull=false,bear=false;
  if(lows.length>=2){
    const a=lows[lows.length-2],b=lows[lows.length-1];
    bull=closes[b]<closes[a] && rs[b]>rs[a] && rs[b]<55;
  }
  if(highs.length>=2){
    const a=highs[highs.length-2],b=highs[highs.length-1];
    bear=closes[b]>closes[a] && rs[b]<rs[a] && rs[b]>45;
  }
  return {bull,bear,rsi:rs.at(-1)};
}

function fakeout(h){
  if(h.length<3) return {bull:false,bear:false};
  const prev=h[h.length-2], cur=h[h.length-1];
  // Current closed 1H candle sweeps previous high/low and closes back inside.
  return {
    bull:cur.l<prev.l && cur.c>prev.l,
    bear:cur.h>prev.h && cur.c<prev.h
  };
}

function rvol(c){
  if(c.length<21) return 0;
  const last=c.at(-1).v;
  const avg=c.slice(-21,-1).reduce((s,x)=>s+x.v,0)/20;
  return avg?last/avg:0;
}

async function scanCoin(coin){
  const pair=SYMBOLS[coin];
  const [h1,c3,c5]=await Promise.all([
    getCandles(pair,"1h",80).then(a=>a.map(normalize)),
    getCandles(pair,"3m",100).then(a=>a.map(normalize)),
    getCandles(pair,"5m",100).then(a=>a.map(normalize))
  ]);
  const fo=fakeout(h1), d3=divergence(c3), d5=divergence(c5);
  const rv=Math.max(rvol(c3),rvol(c5));
  const bull=fo.bull&&(d3.bull||d5.bull);
  const bear=fo.bear&&(d3.bear||d5.bear);
  let status="WAIT";
  if(bull||bear) status=rv>=1.2?"CONFIRMED":"EARLY";
  return {coin,fo,d3,d5,rv,status};
}

function addSignal(x){
  const dir=x.d3.bull||x.d5.bull?"Bullish":"Bearish";
  const tf=x.d3.bull||x.d3.bear?"3m":"5m";
  const key=`${x.coin}-${dir}-${tf}-${new Date().toISOString().slice(0,16)}`;
  if(state.seen.has(key)) return;
  state.seen.add(key);
  state.signals.unshift({time:Date.now(),...x,dir,tf});
  state.signals=state.signals.slice(0,30);
  notify(`RSI Divergence: ${x.coin}`,`${dir} divergence detected on ${tf}. 1H fakeout confirmed.`);
  renderSignals();
}

function renderSignals(){
  $("signalCount").textContent=state.signals.length;
  $("signals").innerHTML=state.signals.length?state.signals.map(s=>`
    <div class="signal ${s.dir==="Bearish"?"bear":""}">
      <div class="top"><span>🔔 ${s.coin} — ${s.dir} RSI Divergence</span><span>${fmtTime(s.time)}</span></div>
      <small>1H Fakeout • ${s.tf} confirmation • RVOL ${s.rv.toFixed(2)}x • ${s.status}</small>
    </div>`).join(""):`<div class="empty">No confirmed RSI divergence yet.</div>`;
}

function renderRows(results){
  $("coinTable").innerHTML=results.map(x=>`
    <tr>
      <td><b>${x.coin}</b></td>
      <td class="${x.fo.bull||x.fo.bear?"ok":""}">${x.fo.bull?"Bullish":x.fo.bear?"Bearish":"—"}</td>
      <td>${x.d3.bull?"🟢 Bull":x.d3.bear?"🔴 Bear":"—"}</td>
      <td>${x.d5.bull?"🟢 Bull":x.d5.bear?"🔴 Bear":"—"}</td>
      <td>${x.rv?x.rv.toFixed(2)+"x":"—"}</td>
      <td class="${x.status==="CONFIRMED"?"ok":x.status==="EARLY"?"wait":"bad"}"><span class="pill">${x.status}</span></td>
    </tr>`).join("");
}

async function scan(){
  setStatus("Scanning…");
  const results=[];
  for(const coin of COINS){
    try{
      const x=await scanCoin(coin);
      results.push(x);
      if(x.status==="CONFIRMED"||x.status==="EARLY") {
        const div=(x.d3.bull||x.d3.bear||x.d5.bull||x.d5.bear);
        if(div) addSignal(x);
      }
    }catch(e){
      results.push({coin,fo:{},d3:{},d5:{},rv:0,status:"API ERROR"});
    }
    renderRows(results);
  }
  state.lastScan=Date.now();
  $("lastScan").textContent=fmtTime(state.lastScan);
  setStatus("Monitoring");
}

function restartTimer(){
  clearInterval(state.timer);
  state.timer=setInterval(scan,Number($("intervalSelect").value));
}
$("scanBtn").onclick=scan;
$("intervalSelect").onchange=restartTimer;
$("enableNotify").onclick=async()=>{
  if("Notification" in window){
    const p=await Notification.requestPermission();
    $("enableNotify").textContent=p==="granted"?"Notifications Enabled":"Notifications Blocked";
  }
};

$("coinCount").textContent=COINS.length;
renderRows(COINS.map(coin=>({coin,fo:{},d3:{},d5:{},rv:0,status:"WAIT"})));
restartTimer();
scan();
