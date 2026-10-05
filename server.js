const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const BASE = 'https://api.coindcx.com';
const CACHE_MS = 45000;
const SCAN_MS = 60000;
const MAX_COINS = Number(process.env.MAX_COINS || 220);
const WORKERS = Number(process.env.WORKERS || 6);
const cache = new Map();
const state = new Map();
let lastScan = {at:0, elapsed:0, marketCount:0, signalCount:0, errors:0, btcBias:'NEUTRAL', busy:false};
let markets = [];
let latestSignals = [];

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function num(x){const n=Number(x);return Number.isFinite(n)?n:null;}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;}
function ema(vals,p){if(!vals.length)return []; const k=2/(p+1); let e=vals[0]; const out=[e]; for(let i=1;i<vals.length;i++){e=vals[i]*k+e*(1-k);out.push(e)} return out;}
function rsi(vals,p=14){const out=Array(vals.length).fill(null); if(vals.length<=p)return out; let g=0,l=0; for(let i=1;i<=p;i++){const d=vals[i]-vals[i-1]; if(d>=0)g+=d;else l-=d;} let ag=g/p, al=l/p; out[p]=al===0?100:100-100/(1+ag/al); for(let i=p+1;i<vals.length;i++){const d=vals[i]-vals[i-1]; const gain=Math.max(0,d), loss=Math.max(0,-d); ag=(ag*(p-1)+gain)/p; al=(al*(p-1)+loss)/p; out[i]=al===0?100:100-100/(1+ag/al);} return out;}
function atr(c,p=14){if(c.length<p+1)return null; let tr=[]; for(let i=1;i<c.length;i++)tr.push(Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close))); return avg(tr.slice(-p));}
function parseCandles(raw){
  if(!Array.isArray(raw)) return [];
  const out=[];
  for(const x of raw){
    let t,o,h,l,c,v;
    if(Array.isArray(x)){[t,o,h,l,c,v]=x;} else {t=x.time??x.timestamp??x.t;o=x.open??x.o;h=x.high??x.h;l=x.low??x.l;c=x.close??x.c;v=x.volume??x.v;}
    t=Number(t); if(t<1e12)t*=1000; o=num(o);h=num(h);l=num(l);c=num(c);v=num(v)||0;
    if([t,o,h,l,c].every(Number.isFinite)) out.push({time:t,open:o,high:h,low:l,close:c,volume:v});
  }
  out.sort((a,b)=>a.time-b.time); return out;
}
function aggregate1m(candles, mins){
  const out=[]; const step=mins*60*1000; let cur=null, bucket=null;
  for(const c of candles){const b=Math.floor(c.time/step)*step; if(bucket===null||b!==bucket){if(cur)out.push(cur); bucket=b; cur={time:b,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume};} else {cur.high=Math.max(cur.high,c.high);cur.low=Math.min(cur.low,c.low);cur.close=c.close;cur.volume+=c.volume;}}
  if(cur)out.push(cur); return out;
}
function completed(c){if(!c.length)return c; const now=Date.now(); return c.filter(x=>x.time+60*1000<=now);}
async function api(pathname){
  const u=BASE+pathname; const hit=cache.get(u); if(hit&&Date.now()-hit.at<CACHE_MS)return hit.data;
  const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),12000);
  try{const r=await fetch(u,{signal:ctl.signal,headers:{'User-Agent':'CoinDCX-AutoPilot-V19/1.0'}}); if(!r.ok)throw new Error('HTTP '+r.status); const d=await r.json(); cache.set(u,{at:Date.now(),data:d}); return d;} finally{clearTimeout(tm)}
}
function toPair(symbol){if(/^B-[A-Z0-9]+_USDT$/.test(symbol))return symbol; if(/^[A-Z0-9]+USDT$/.test(symbol))return 'B-'+symbol.slice(0,-4)+'_USDT'; if(/^[A-Z0-9]+\/USDT$/.test(symbol))return 'B-'+symbol.replace('/USDT','_USDT'); return null;}
async function discover(){
  let raw=await api('/exchange/v1/markets'); let arr=[];
  if(Array.isArray(raw)) arr=raw; else if(raw&&Array.isArray(raw.markets))arr=raw.markets;
  let pairs=arr.map(x=>typeof x==='string'?x:(x.symbol||x.market||x.pair||'')).map(toPair).filter(Boolean);
  pairs=[...new Set(pairs)].filter(x=>x.endsWith('_USDT')).slice(0,MAX_COINS);
  return pairs;
}
async function candles(pair,interval,limit){
  const raw=await api('/market_data/candles?pair='+encodeURIComponent(pair)+'&interval='+interval+'&limit='+limit); return parseCandles(raw?.data||raw);
}
function directionFilter(sig,f){return f==='BOTH'||sig.direction===f;}
function setupFor(pair,h1,tf,btcBias){
  if(h1.length<3||tf.length<25)return null;
  const ref=h1[h1.length-1];
  const closes=tf.map(x=>x.close), rs=rsi(closes), e20=ema(closes,20), e50=ema(closes,50), at=atr(tf,14)||Math.abs(ref.high-ref.low)*0.2;
  let found=[];
  for(let i=Math.max(20,tf.length-80);i<tf.length-1;i++){
    const x=tf[i];
    const bearSweep=x.high>ref.high;
    const bullSweep=x.low<ref.low;
    if(!bearSweep&&!bullSweep)continue;
    for(let j=i;j<=Math.min(tf.length-1,i+6);j++){
      const y=tf[j];
      if(y.time<=x.time){}
      const bear=bearSweep && y.close<ref.high;
      const bull=bullSweep && y.close>ref.low;
      if(!bear&&!bull)continue;
      const dir=bear?'BEARISH':'BULLISH';
      const level=bear?ref.high:ref.low;
      const sweepDepth=bear?Math.max(0,x.high-level):Math.max(0,level-x.low);
      const range=Math.max(y.high-y.low,1e-12), body=Math.abs(y.close-y.open)/range;
      const rej=bear?Math.max(0,y.high-Math.max(y.open,y.close))/range:Math.max(0,Math.min(y.open,y.close)-y.low)/range;
      const recentVol=avg(tf.slice(Math.max(0,j-20),j).map(z=>z.volume)); const vr=recentVol>0?y.volume/recentVol:1;
      const r=rs[j]??50; const em20=e20[j], em50=e50[j];
      const emaAlign=dir==='BULLISH'?(em20>em50?1:0):(em20<em50?1:0);
      const rsiAlign=dir==='BULLISH'?(r>=50&&r<=72?1:0):(r<=50&&r>=28?1:0);
      const btcAlign=btcBias==='NEUTRAL'?0.5:(btcBias===dir?1:0);
      const depthScore=clamp((sweepDepth/Math.max(at,1e-12))*18,0,18);
      const score=Math.round(clamp(24*body+18*rej+depthScore+14*clamp(vr/2,0,1)+10*rsiAlign+10*emaAlign+8*btcAlign+6*(j===i?1:0),0,100));
      const strong=score>=78 && body>=0.45 && (vr>=0.9) && ((dir==='BULLISH'&&r>45)||(dir==='BEARISH'&&r<55));
      const elite=score>=90 && strong && emaAlign===1 && btcAlign>=0.5;
      const entry=y.close;
      const risk=Math.max(at*0.75,Math.abs(entry-level)*0.7,entry*0.003);
      const sl=dir==='BULLISH'?Math.min(x.low,y.low)-risk*0.15:Math.max(x.high,y.high)+risk*0.15;
      const rr=entry-sl; const t1=dir==='BULLISH'?entry+Math.abs(entry-sl)*1.0:entry-Math.abs(entry-sl)*1.0; const t2=dir==='BULLISH'?entry+Math.abs(entry-sl)*1.8:entry-Math.abs(entry-sl)*1.8; const t3=dir==='BULLISH'?entry+Math.abs(entry-sl)*2.7:entry-Math.abs(entry-sl)*2.7;
      found.push({pair,direction:dir,stage:elite?'ELITE':strong?'STRONG CONFIRMED':'CONFIRMED',score,elite,strong,level,sweepTime:x.time,confirmTime:y.time,entry,sl,t1,t2,t3,rsi:r,ema20:em20,ema50:em50,volumeRatio:vr,sweepDepth,body,rejection:rej,btcBias,tf:tf===tf?'5M/10M':'',reasons:[bear?'1H High swept':'1H Low swept',j===i?'same-candle reclaim':'later-candle reclaim',body>=0.55?'strong body':'body acceptable',rej>=0.2?'rejection wick':'rejection modest',vr>=1.2?'volume support':'volume normal',rsiAlign?'RSI aligned':'RSI neutral',emaAlign?'EMA aligned':'EMA mixed',btcBias===dir?'BTC aligned':btcBias==='NEUTRAL'?'BTC neutral':'BTC opposite']});
      break;
    }
  }
  if(!found.length)return null; found.sort((a,b)=>b.score-a.score); return found[0];
}
function btcBiasFrom(h1){if(h1.length<3)return 'NEUTRAL';const c=h1.map(x=>x.close),e20=ema(c,20),e50=ema(c,50),x=h1[h1.length-1]; if(e20.at(-1)>e50.at(-1)&&x.close>e20.at(-1))return 'BULLISH'; if(e20.at(-1)<e50.at(-1)&&x.close<e20.at(-1))return 'BEARISH'; return 'NEUTRAL';}
async function scanOne(pair,btcBias){
  try{const [h1,m1]=await Promise.all([candles(pair,'1h',40),candles(pair,'1m',760)]); const hc=completed(h1), mc=completed(m1); const c5=aggregate1m(mc,5), c10=aggregate1m(mc,10); const a=setupFor(pair,hc,c5,btcBias), b=setupFor(pair,hc,c10,btcBias); let s=[a,b].filter(Boolean).sort((x,y)=>y.score-x.score)[0]; if(!s)return null; const key=pair+'|'+s.direction+'|'+Math.round(s.level*1e8); const old=state.get(key); s.ageScans=(old?.ageScans||0)+1; state.set(key,{ageScans:s.ageScans,last:s}); return s;}catch(e){return {error:String(e.message||e),pair};}
}
async function runScan(){if(lastScan.busy)return;lastScan.busy=true; const started=Date.now(); let errors=0; try{markets=await discover(); let btcBias='NEUTRAL'; try{const b=completed(await candles('B-BTC_USDT','1h',60));btcBias=btcBiasFrom(b);}catch{} const out=[]; let idx=0; async function worker(){while(true){const i=idx++; if(i>=markets.length)return; const r=await scanOne(markets[i],btcBias); if(r?.error)errors++; else if(r)out.push(r); await sleep(25);}} await Promise.all(Array.from({length:WORKERS},worker)); out.sort((a,b)=>b.score-a.score||b.confirmTime-a.confirmTime); latestSignals=out.slice(0,25); lastScan={at:Date.now(),elapsed:Date.now()-started,marketCount:markets.length,signalCount:out.length,errors,btcBias,busy:false};}catch(e){lastScan={...lastScan,elapsed:Date.now()-started,errors:errors+1,busy:false,error:String(e.message||e)};}}
function json(res,obj,code=200){const body=JSON.stringify(obj);res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body);}
function serve(res,file){fs.readFile(path.join(__dirname,file),(e,d)=>{if(e){res.writeHead(404);res.end('Not found');}else{const ct=file.endsWith('.html')?'text/html':'text/plain';res.writeHead(200,{'Content-Type':ct});res.end(d);}})}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost'); if(u.pathname==='/health')return json(res,{ok:true,version:'V19 AUTO PILOT',scan:lastScan}); if(u.pathname==='/api/status')return json(res,{version:'V19 AUTO PILOT',scan:lastScan,signals:latestSignals}); if(u.pathname==='/api/chart'){const pair=u.searchParams.get('pair'); if(!pair)return json(res,{error:'pair required'},400); Promise.all([candles(pair,'1h',40),candles(pair,'1m',500)]).then(([h,m])=>json(res,{pair,h1:completed(h),m5:aggregate1m(completed(m),5),rsi:rsi(aggregate1m(completed(m),5).map(x=>x.close))})).catch(e=>json(res,{error:e.message},500));return;} if(u.pathname==='/api/scan'){runScan().then(()=>json(res,{ok:true,scan:lastScan,signals:latestSignals}));return;} if(u.pathname==='/'||u.pathname==='/index.html')return serve(res,'index.html'); res.writeHead(404);res.end('Not found');});
server.listen(PORT,()=>{console.log('CoinDCX AUTO PILOT V19 running on '+PORT); runScan(); setInterval(runScan,SCAN_MS);});
