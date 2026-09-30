const $=id=>document.getElementById(id);
let markets=[],busy=false,timer=null;
const TFS=["1m","5m","15m"], RSI_PERIOD=14;

function calcRSI(v,p=14){
  const out=Array(v.length).fill(null);
  if(v.length<=p)return out;
  let g=0,l=0;
  for(let i=1;i<=p;i++){let d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}
  let ag=g/p,al=l/p;
  out[p]=al===0?100:100-100/(1+ag/al);
  for(let i=p+1;i<v.length;i++){
    let d=v[i]-v[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p;
    al=(al*(p-1)+Math.max(-d,0))/p;
    out[i]=al===0?100:100-100/(1+ag/al);
  }
  return out;
}

function pivots(a){
  const lo=[],hi=[];
  for(let i=2;i<a.length-2;i++){
    let L=true,H=true;
    for(let j=1;j<=2;j++){
      if(a[i]>=a[i-j]||a[i]>a[i+j])L=false;
      if(a[i]<=a[i-j]||a[i]<a[i+j])H=false;
    }
    if(L)lo.push(i);
    if(H)hi.push(i);
  }
  return {lo,hi};
}

function detect(raw,maxGap=20){
  const c=[...raw].sort((a,b)=>Number(a.time)-Number(b.time));
  if(c.length<45)return null;
  const close=c.map(x=>Number(x.close));
  const rr=calcRSI(close), p=pivots(close);
  const lows=p.lo.filter(i=>rr[i]!=null), highs=p.hi.filter(i=>rr[i]!=null);
  const lastL=lows.at(-1), lastH=highs.at(-1);

  if(lastL!=null){
    for(let k=lows.length-2;k>=0;k--){
      let q=lows[k],gap=lastL-q;
      if(gap>maxGap)break;
      if(gap>=15 && close[lastL]<close[q] && rr[lastL]>rr[q])
        return {side:"BULLISH",price:close[lastL],rsi:rr[lastL],gap,time:c[lastL].time};
    }
  }
  if(lastH!=null){
    for(let k=highs.length-2;k>=0;k--){
      let q=highs[k],gap=lastH-q;
      if(gap>maxGap)break;
      if(gap>=15 && close[lastH]>close[q] && rr[lastH]<rr[q])
        return {side:"BEARISH",price:close[lastH],rsi:rr[lastH],gap,time:c[lastH].time};
    }
  }
  return null;
}

async function getJSON(u){
  const r=await fetch(u);
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);
  return j;
}

async function loadMarkets(){
  markets=await getJSON("/api/markets");
  $("coins").textContent=markets.length;
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function scan(){
  if(busy)return;
  busy=true;
  $("scanBtn").disabled=true;
  $("status").textContent="Scanning…";

  try{
    if(!markets.length)await loadMarkets();

    let list=[...markets];
    const lim=$("marketLimit").value;
    if(lim!=="all")list=list.slice(0,Number(lim));

    const tf=$("tf").value;
    const tfs=tf==="all"?TFS:[tf];
    const jobs=[];
    for(const m of list)for(const t of tfs)jobs.push({m,tf:t});

    const out=[];
    let idx=0;

    async function worker(){
      while(true){
        const i=idx++;
        if(i>=jobs.length)return;
        const {m,tf}=jobs[i];
        try{
          const c=await getJSON(`/api/candles?pair=${encodeURIComponent(m.pair)}&interval=${tf}&limit=100`);
          const d=detect(c,Number($("gap").value));
          if(d)out.push({...d,symbol:m.symbol,tf});
        }catch(e){}
        await sleep(70);
      }
    }

    await Promise.all([worker(),worker(),worker(),worker()]);
    out.sort((a,b)=>Number(b.time)-Number(a.time));
    render(out);
    $("updated").textContent="Updated "+new Date().toLocaleTimeString("en-IN");
    $("status").textContent=`Done • ${out.length} confirmed signal(s)`;
  }catch(e){
    $("status").textContent="Error: "+e.message;
    $("rows").innerHTML=`<tr><td colspan="7" class="empty">${e.message}</td></tr>`;
  }finally{
    busy=false;
    $("scanBtn").disabled=false;
  }
}

function render(a){
  $("total").textContent=a.length;
  $("bull").textContent=a.filter(x=>x.side==="BULLISH").length;
  $("bear").textContent=a.filter(x=>x.side==="BEARISH").length;

  $("rows").innerHTML=a.length
    ?a.map(x=>`<tr>
      <td><b>${x.symbol}</b></td>
      <td>${x.tf}</td>
      <td class="${x.side==="BULLISH"?"bull":"bear"}">${x.side}</td>
      <td>${Number(x.price).toPrecision(8)}</td>
      <td>${Number(x.rsi).toFixed(2)}</td>
      <td>${x.gap}</td>
      <td>${new Date(Number(x.time)).toLocaleString("en-IN",{hour12:false})}</td>
    </tr>`).join("")
    :'<tr><td colspan="7" class="empty">15–20 candle gap वाला confirmed divergence नहीं मिला.</td></tr>';
}

$("scanBtn").onclick=scan;
$("refresh").onchange=()=>{
  clearInterval(timer);
  const ms=Number($("refresh").value);
  if(ms>0)timer=setInterval(scan,ms);
};

(async()=>{
  try{
    await loadMarkets();
    await scan();
    const ms=Number($("refresh").value);
    if(ms>0)timer=setInterval(scan,ms);
  }catch(e){
    $("status").textContent="Error: "+e.message;
    $("rows").innerHTML=`<tr><td colspan="7" class="empty">${e.message}</td></tr>`;
  }
})();
