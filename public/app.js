const $ = id => document.getElementById(id);
let latestRows = [];
function price(n){return n>=1000?n.toFixed(2):n>=1?n.toFixed(4):n>=0.1?n.toFixed(5):n.toPrecision(6)}
function time(ms){return new Date(ms).toLocaleString("en-IN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}
async function get(url){const r=await fetch(url);if(!r.ok)throw Error("API "+r.status);return r.json()}
async function candles(base,symbol,interval,limit=5){const path=$("market").value==="futures"?"/fapi/v1/klines":"/api/v3/klines";return get(`${base}${path}?symbol=${symbol}&interval=${interval}&limit=${limit}`)}
async function check(base,symbol,tf){
  const [hour,small]=await Promise.all([candles(base,symbol,"1h",5),candles(base,symbol,tf,5)]);
  const now=Date.now(), hc=hour.filter(k=>+k[6]<now), sc=small.filter(k=>+k[6]<now);
  if(hc.length<2||!sc.length)return null;
  const h=hc[hc.length-1], c=sc[sc.length-1];
  // Scan only candles after the reference 1H candle is complete.
  if(+c[0] < +h[6]+1)return null;
  const hHigh=+h[2],hLow=+h[3],high=+c[2],low=+c[3],close=+c[4];
  const bear=high>hHigh&&close<hHigh;
  const bull=low<hLow&&close>hLow;
  if(!bear&&!bull)return null;
  return {symbol,signal:bear?"BEARISH REJECTION":"BULLISH RECLAIM",bull,close,level:bear?hHigh:hLow,wick:bear?high:low,time:+c[6]};
}
function draw(){
 const q=$("filter").value.trim().toUpperCase();
 const rows=latestRows.filter(r=>!q||r.symbol.includes(q)).sort((a,b)=>b.time-a.time);
 $("rows").innerHTML="";
 if(!rows.length){$("rows").innerHTML='<tr><td colspan="7">कोई signal नहीं मिला.</td></tr>';return}
 for(const r of rows){const tr=document.createElement("tr");const chart="https://www.tradingview.com/chart/?symbol=BINANCE:"+r.symbol+( $("market").value==="futures"?".P":"");tr.innerHTML=`<td>${time(r.time)}</td><td><b>${r.symbol}</b></td><td class="${r.bull?"signal-bull":"signal-bear"}">${r.signal}</td><td>${price(r.close)}</td><td>${price(r.level)}</td><td>${price(r.wick)}</td><td><a target="_blank" rel="noopener" href="${chart}">Chart ↗</a></td>`;$("rows").appendChild(tr)}
}
async function scan(){
 const btn=$("scan");btn.disabled=true;$("status").textContent="Scanning…";latestRows=[];$("count").textContent="0";
 try{
  const futures=$("market").value==="futures",base=futures?"https://fapi.binance.com":"https://api.binance.com";
  const info=await get(base+(futures?"/fapi/v1/exchangeInfo":"/api/v3/exchangeInfo"));
  const symbols=info.symbols.filter(s=>s.status==="TRADING"&&s.quoteAsset==="USDT").map(s=>s.symbol);
  const tf=$("interval").value,batch=8;
  for(let i=0;i<symbols.length;i+=batch){
   const got=await Promise.all(symbols.slice(i,i+batch).map(s=>check(base,s,tf).catch(()=>null)));
   latestRows.push(...got.filter(Boolean));$("scanned").textContent=Math.min(i+batch,symbols.length);$("count").textContent=latestRows.length;$("status").textContent=`${Math.min(i+batch,symbols.length)}/${symbols.length}`;
   draw();await new Promise(resolve=>setTimeout(resolve,150));
  }
  $("status").textContent="Complete";draw();
 }catch(e){console.error(e);$("status").textContent="API error";$("rows").innerHTML='<tr><td colspan="7">API से data नहीं मिला. कुछ देर बाद फिर कोशिश करें.</td></tr>'}
 finally{btn.disabled=false}
}
$("scan").addEventListener("click",scan);$("filter").addEventListener("input",draw);