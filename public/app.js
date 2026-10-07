const FOUR_H = [
"CARV","SKY","AKE","AIN","MON","LSK","UNI","LTC","PEPE","HBAR","FET","HYPE","BNB","ARB","AAVE","POL","XLM","ETC","STRK","ETH","PENGU","SUI","ETHFI","XRP","DOGE","DOT","XMR","BTC","XAU","TAO","ADA","LINK","MORPHO","SOL","ASTER","DIA","VIRTUAL","ONDO","JUP","USELESS","MAGMA","PARTI","NEAR","LDO","AVAX","CHIP","ZEC","INJ","QNT","TIA","APT","NIGHT"
];
const ONE_H = ["BTC","ETH","XAU","SOL","ZEC","RLC","XRP","BR","BZ","HYPER","CL","NEAR","ORCA","DOGE","ADA","SUI","BNB","QUNT"];

const $ = id => document.getElementById(id);
const fmt = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined,{maximumFractionDigits:10}) : "-";
const ist = ms => new Date(ms).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour12:false,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const sleep = ms => new Promise(r=>setTimeout(r,ms));

let instruments = [];
let instrumentMap = new Map();

async function loadInstruments(){
  const data = await fetch("/api/instruments").then(r=>r.json());
  instruments = Array.isArray(data) ? data : [];
  instrumentMap = new Map();
  for(const pair of instruments){
    const base = pair.replace(/^.*?-/, "").split("_")[0].toUpperCase();
    if(!instrumentMap.has(base)) instrumentMap.set(base,pair);
  }
}

function renderRows(id,list,results){
  const tbody=$(id); tbody.innerHTML="";
  for(const symbol of list){
    const r=results[symbol];
    const tr=document.createElement("tr");
    if(!r){
      tr.innerHTML=`<td>${symbol}</td><td colspan="6" class="muted">Waiting…</td>`;
    }else if(r.error){
      tr.innerHTML=`<td>${symbol}</td><td colspan="6" class="missing">${r.error}</td>`;
    }else if(!r.signal){
      tr.innerHTML=`<td>${symbol}</td><td>${r.levelType||"-"}</td><td>${fmt(r.sweep)}</td><td>${fmt(r.close)}</td><td class="muted">NO SIGNAL</td><td>-</td><td class="status-ok">Scanned</td>`;
    }else{
      const cls=r.signal==="BUY"?"signal-buy":"signal-sell";
      tr.innerHTML=`<td>${symbol}</td><td>${r.levelType} ${fmt(r.level)}</td><td>${fmt(r.sweep)}</td><td>${fmt(r.close)}</td><td class="${cls}">${r.signal}</td><td>${ist(r.time)}</td><td class="${cls}">CONFIRMED</td>`;
    }
    tbody.appendChild(tr);
  }
}

function aggregate4h(candles){
  // CoinDCX futures REST exposes 1H candles. Group them into native UTC 4H blocks.
  const sorted=candles.map(c=>({open:+c.open,high:+c.high,low:+c.low,close:+c.close,time:+c.time})).sort((a,b)=>a.time-b.time);
  const groups=new Map();
  for(const c of sorted){
    const d=new Date(c.time);
    const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),Math.floor(d.getUTCHours()/4)*4,0,0,0);
    const key=start;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(c);
  }
  const out=[];
  for(const [time,g] of groups){
    if(g.length<4) continue;
    out.push({open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[g.length-1].close,time});
  }
  return out;
}

function findLatestSignal(candles){
  if(candles.length<2) return null;
  const sorted=candles.slice().sort((a,b)=>a.time-b.time);
  // Use only fully closed candles. We fetch historical data and deliberately exclude the latest
  // candle when its time is still inside the current period.
  const now=Date.now();
  const period=sorted.length>1 ? Math.max(60000, sorted[sorted.length-1].time - sorted[sorted.length-2].time) : 3600000;
  const closed=sorted.filter(c=>c.time+period<=now+5000);
  if(closed.length<2) return null;

  let latest=null;
  for(let i=1;i<closed.length;i++){
    const prev=closed[i-1], cur=closed[i];
    if(cur.high>prev.high && cur.close<prev.high){
      latest={signal:"SELL",levelType:"HIGH",level:prev.high,sweep:cur.high,close:cur.close,time:cur.time};
    }
    if(cur.low<prev.low && cur.close>prev.low){
      const candidate={signal:"BUY",levelType:"LOW",level:prev.low,sweep:cur.low,close:cur.close,time:cur.time};
      if(!latest || candidate.time>=latest.time) latest=candidate;
    }
  }
  return latest || {levelType:"Previous",level:closed[closed.length-2].close,sweep:closed[closed.length-1].close,close:closed[closed.length-1].close};
}

async function getCandles(pair,resolution,hoursBack){
  const to=Math.floor(Date.now()/1000);
  const from=to-hoursBack*3600;
  const q=new URLSearchParams({pair,resolution:String(resolution),from:String(from),to:String(to)});
  const data=await fetch("/api/candles?"+q).then(r=>r.json());
  if(data && data.data) return data.data;
  if(Array.isArray(data)) return data;
  throw new Error("No candle data");
}

async function scanList(list, timeframe){
  const out={};
  for(const symbol of list){
    const pair=instrumentMap.get(symbol.toUpperCase());
    if(!pair){
      out[symbol]={error:"CoinDCX futures pair not found"};
      continue;
    }
    try{
      const raw=await getCandles(pair,"60",timeframe==="4H"?24*10:24*5);
      const candles=timeframe==="4H"?aggregate4h(raw):raw;
      out[symbol]=findLatestSignal(candles);
      if(out[symbol]) out[symbol].pair=pair;
    }catch(e){
      out[symbol]={error:"Data error"};
    }
    // Keep requests gentle on the public API.
    await sleep(80);
  }
  return out;
}

async function scan(){
  $("status").textContent="Scanning CoinDCX…";
  $("scanBtn").disabled=true;
  try{
    await loadInstruments();
    const [r4,r1]=await Promise.all([scanList(FOUR_H,"4H"),scanList(ONE_H,"1H")]);
    renderRows("table4h",FOUR_H,r4);
    renderRows("table1h",ONE_H,r1);
    const found4=Object.values(r4).filter(x=>x&&x.signal).length;
    const found1=Object.values(r1).filter(x=>x&&x.signal).length;
    $("status").innerHTML=`Last scan: <b>${ist(Date.now())} IST</b> • 4H signals: <b>${found4}</b> • 1H signals: <b>${found1}</b>`;
  }catch(e){
    $("status").textContent="Scanner error: "+e.message;
  }finally{
    $("scanBtn").disabled=false;
  }
}

function clock(){
  $("clock").textContent=new Date().toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour12:false})+" IST";
}
$("scanBtn").addEventListener("click",scan);
setInterval(clock,1000); clock();
scan();
setInterval(scan,5*60*1000);
