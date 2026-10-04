const $ = id => document.getElementById(id);
let symbols = [];
let results = [];

function num(n){
  n = Number(n);
  if(n >= 1000) return n.toFixed(2);
  if(n >= 1) return n.toFixed(4);
  if(n >= 0.1) return n.toFixed(5);
  return n.toPrecision(7);
}
function fmt(t){return new Date(Number(t)).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
async function api(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// CoinDCX candles are returned newest-first; normalize to oldest-first.
function normalize(a){
  return [...a].sort((x,y)=>Number(x.time)-Number(y.time));
}

// Build a 10-minute candle from two closed 5-minute candles.
function make10(c5){
  const out=[];
  for(let i=0;i+1<c5.length;i+=2){
    const a=c5[i],b=c5[i+1];
    if(Math.floor(Number(a.time)/600000)!==Math.floor(Number(b.time)/600000)) continue;
    out.push({
      time:Number(a.time),
      open:Number(a.open),
      high:Math.max(Number(a.high),Number(b.high)),
      low:Math.min(Number(a.low),Number(b.low)),
      close:Number(b.close),
      end:Number(b.time)+300000
    });
  }
  return out;
}

async function check(symbol, tf){
  const pair = `B-${symbol.slice(0,-4)}_USDT`;
  const [hRaw,sRaw] = await Promise.all([
    api(`/api/candles?pair=${encodeURIComponent(pair)}&interval=1h&limit=4`),
    api(`/api/candles?pair=${encodeURIComponent(pair)}&interval=5m&limit=10`)
  ]);
  const h = normalize(hRaw);
  const s5 = normalize(sRaw);
  const now=Date.now();

  const closedH = h.filter(c=>Number(c.time)+3600000<=now);
  if(closedH.length<1) return null;
  const ref=closedH[closedH.length-1];

  let small;
  if(tf==="5m"){
    small=s5.filter(c=>Number(c.time)+300000<=now).map(c=>({...c,time:Number(c.time),end:Number(c.time)+300000}));
  }else{
    const closed5=s5.filter(c=>Number(c.time)+300000<=now).map(c=>({...c,time:Number(c.time),end:Number(c.time)+300000}));
    small=make10(closed5).filter(c=>c.end<=now);
  }
  if(!small.length) return null;

  // Only test the latest closed scan candle, and only after the reference 1H candle closed.
  const c=small[small.length-1];
  if(c.end<=Number(ref.time)+3600000) return null;

  const H=Number(ref.high), L=Number(ref.low);
  const hi=Number(c.high), lo=Number(c.low), close=Number(c.close);
  const bearish=hi>H && close<H;
  const bullish=lo<L && close>L;
  if(!bearish&&!bullish) return null;

  return {
    symbol,
    time:c.end,
    bull:bullish,
    signal:bullish?"BULLISH RECLAIM":"BEARISH REJECTION",
    close,
    level:bullish?L:H,
    wick:bullish?lo:hi
  };
}

function draw(){
  const q=$("filter").value.trim().toUpperCase();
  const rows=results.filter(x=>!q||x.symbol.includes(q)).sort((a,b)=>b.time-a.time);
  $("rows").innerHTML="";
  if(!rows.length){
    $("rows").innerHTML='<tr><td colspan="7">इस scan में कोई signal नहीं मिला.</td></tr>';
    return;
  }
  for(const r of rows){
    const tr=document.createElement("tr");
    const chart=`https://coindcx.com/trade/${r.symbol}`;
    tr.innerHTML=`<td>${fmt(r.time)}</td>
      <td><b>${r.symbol.slice(0,-4)}/USDT</b></td>
      <td class="${r.bull?"bullCell":"bearCell"}">${r.signal}</td>
      <td>${num(r.close)}</td><td>${num(r.level)}</td><td>${num(r.wick)}</td>
      <td><a href="${chart}" target="_blank" rel="noopener">CoinDCX ↗</a></td>`;
    $("rows").appendChild(tr);
  }
}

async function loadMarkets(){
  const data=await api("/api/markets");
  symbols=data.symbols;
  $("total").textContent=data.count;
  $("status").textContent="Ready";
}

async function scan(){
  const btn=$("scan");
  btn.disabled=true;
  results=[];
  $("signals").textContent="0";
  $("status").textContent="Scanning…";
  const tf=$("interval").value;
  const batch=8;

  try{
    for(let i=0;i<symbols.length;i+=batch){
      const part=symbols.slice(i,i+batch);
      const got=await Promise.all(part.map(s=>check(s,tf).catch(()=>null)));
      results.push(...got.filter(Boolean));
      $("scanned").textContent=Math.min(i+batch,symbols.length);
      $("signals").textContent=results.length;
      $("status").textContent=`${Math.min(i+batch,symbols.length)}/${symbols.length}`;
      draw();
    }
    $("status").textContent="Complete";
  }catch(e){
    console.error(e);
    $("status").textContent="Error";
  }finally{
    btn.disabled=false;
  }
}

$("scan").addEventListener("click",scan);
$("filter").addEventListener("input",draw);
loadMarkets().catch(e=>{$("status").textContent="CoinDCX API Error";console.error(e);});