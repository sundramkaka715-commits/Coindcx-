const FOUR_H = [
"CARV","SKY","AKE","AIN","MON","LSK","UNI","LTC","PEPE","HBAR","FET","HYPE","BNB","ARB","AAVE","POL","XLM","ETC","STRK","ETH","PENGU","SUI","ETHFI","XRP","DOGE","DOT","XMR","BTC","XAU","TAO","ADA","LINK","MORPHO","SOL","ASTER","DIA","VIRTUAL","ONDO","JUP","USELESS","MAGMA","PARTI","NEAR","LDO","AVAX","CHIP","ZEC","INJ","QNT","TIA","APT","NIGHT"
];
const ONE_H = ["BTC","ETH","XAU","SOL","ZEC","RLC","XRP","BR","BZ","HYPER","CL","NEAR","ORCA","DOGE","ADA","SUI","BNB","QUNT"];

const $ = id => document.getElementById(id);
const fmt = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined,{maximumFractionDigits:10}) : "-";
const ist = ms => new Date(ms).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",hour12:false,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let instrumentMap = new Map();

async function loadInstruments(){
  const data = await fetch("/api/instruments").then(r=>r.json());
  if(!Array.isArray(data)) throw new Error("CoinDCX instruments unavailable");
  instrumentMap = new Map();
  for(const pair of data){
    const base = pair.replace(/^.*?-/, "").split("_")[0].toUpperCase();
    if(!instrumentMap.has(base)) instrumentMap.set(base,pair);
  }
}

function renderRows(id, list, results, tf){
  const tbody=$(id); tbody.innerHTML="";
  const rows = list.filter(s => results[s] && results[s].signal);
  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="8" class="empty">Is scan mein koi confirmed ${tf} fakeout nahi mila.</td></tr>`;
    return;
  }
  for(const symbol of rows){
    const r=results[symbol];
    const cls=r.signal==="BUY"?"signal-buy":"signal-sell";
    const refStart=ist(r.referenceStart), refEnd=ist(r.referenceEnd);
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${symbol}</td><td>${r.levelType} ${fmt(r.level)}</td><td>${fmt(r.sweep)}</td><td>${fmt(r.close)}</td><td>${r.confirmTf}</td><td class="${cls}">${r.signal}</td><td>${ist(r.signalTime)}</td><td>${refStart} → ${refEnd}</td>`;
    tbody.appendChild(tr);
  }
}

function aggregate4h(candles){
  // 4H blocks are aligned to UTC 00/04/08/12/16/20, which is 05:30/09:30/13:30/17:30/21:30 IST.
  const sorted=candles.map(c=>({open:+c.open,high:+c.high,low:+c.low,close:+c.close,time:+c.time})).sort((a,b)=>a.time-b.time);
  const groups=new Map();
  for(const c of sorted){
    const d=new Date(c.time);
    const start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),Math.floor(d.getUTCHours()/4)*4,0,0,0);
    if(!groups.has(start)) groups.set(start,[]);
    groups.get(start).push(c);
  }
  const out=[];
  for(const [time,g] of groups){
    if(g.length<4) continue;
    out.push({open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[g.length-1].close,time, end:time+4*3600000});
  }
  return out;
}

function isClosed(c, durationMs){ return c.time + durationMs <= Date.now()+5000; }

function latestCompleted(candles, durationMs){
  const sorted=candles.slice().sort((a,b)=>a.time-b.time);
  const closed=sorted.filter(c=>isClosed(c,durationMs));
  return closed.length ? closed[closed.length-1] : null;
}

function findFakeout(reference, confirmationCandles, confirmMs, confirmTf){
  if(!reference) return null;
  const after=confirmationCandles.slice().sort((a,b)=>a.time-b.time).filter(c=>
    c.time >= reference.end && isClosed(c,confirmMs)
  );
  let latest=null;
  for(const c of after){
    // Bearish fakeout: sweep above reference high, then close back below it.
    if(c.high > reference.high && c.close < reference.high){
      latest={signal:"SELL",levelType:"HIGH",level:reference.high,sweep:c.high,close:c.close,signalTime:c.time,confirmTf,referenceStart:reference.time,referenceEnd:reference.end};
    }
    // Bullish fakeout: sweep below reference low, then close back above it.
    if(c.low < reference.low && c.close > reference.low){
      const candidate={signal:"BUY",levelType:"LOW",level:reference.low,sweep:c.low,close:c.close,signalTime:c.time,confirmTf,referenceStart:reference.time,referenceEnd:reference.end};
      if(!latest || candidate.signalTime>=latest.signalTime) latest=candidate;
    }
  }
  return latest;
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

async function scanOne(symbol,timeframe){
  const pair=instrumentMap.get(symbol.toUpperCase());
  if(!pair) return {error:"CoinDCX futures pair not found"};
  if(timeframe==="4H"){
    const hourly=await getCandles(pair,"60",24*8);
    const refs=aggregate4h(hourly);
    if(refs.length<1) return null;
    const reference=refs[refs.length-1];
    // 15m confirmation after the just-completed 4H candle.
    const confirm=await getCandles(pair,"15",24*2);
    return findFakeout(reference,confirm,15*60000,"15m");
  }
  // 1H reference + 5m confirmation after the just-completed 1H candle.
  const hourly=await getCandles(pair,"60",24*4);
  const hSorted=hourly.map(c=>({open:+c.open,high:+c.high,low:+c.low,close:+c.close,time:+c.time,end:+c.time+3600000})).sort((a,b)=>a.time-b.time);
  const reference=latestCompleted(hSorted,3600000);
  const confirm=await getCandles(pair,"5",24);
  return findFakeout(reference,confirm,5*60000,"5m");
}

async function scanList(list,timeframe){
  const out={};
  for(const symbol of list){
    try{ out[symbol]=await scanOne(symbol,timeframe); }
    catch(e){ out[symbol]={error:"Data error"}; }
    await sleep(70);
  }
  return out;
}

async function scan(){
  $("status").textContent="Scanning… sirf naye/current fakeout signals dikhaye ja rahe hain.";
  $("scanBtn").disabled=true;
  try{
    await loadInstruments();
    const [r4,r1]=await Promise.all([scanList(FOUR_H,"4H"),scanList(ONE_H,"1H")]);
    renderRows("table4h",FOUR_H,r4,"4H");
    renderRows("table1h",ONE_H,r1,"1H");
    const found4=Object.values(r4).filter(x=>x&&x.signal).length;
    const found1=Object.values(r1).filter(x=>x&&x.signal).length;
    $("status").innerHTML=`Scan complete: <b>${ist(Date.now())} IST</b> • 4H fakeouts: <b>${found4}</b> • 1H fakeouts: <b>${found1}</b>`;
  }catch(e){ $("status").textContent="Scanner error: "+e.message; }
  finally{ $("scanBtn").disabled=false; }
}
function clock(){ $("clock").textContent=new Date().toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour12:false})+" IST"; }
$("scanBtn").addEventListener("click",scan);
setInterval(clock,1000); clock();
// No automatic scanning. User clicks SCAN NOW at 09:45/10:00, then after each 1H close as desired.
scan();
