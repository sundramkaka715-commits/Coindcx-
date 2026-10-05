const express=require("express");
const path=require("path");
const app=express();
const PORT=process.env.PORT||10000;
const API="https://api.coindcx.com";
const cache=new Map();

app.use(express.static(__dirname));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dcx(p){
  const r=await fetch(API+p,{headers:{"User-Agent":"Mozilla/5.0 CoinDCX-Sweep-Radar/18.1"}});
  if(!r.ok) throw new Error("CoinDCX API "+r.status);
  return r.json();
}
function sma(a,n){return a.length<n?null:a.slice(-n).reduce((x,y)=>x+y,0)/n}
function ema(a,n){if(!a.length)return null;let e=a[0],k=2/(n+1);for(let i=1;i<a.length;i++)e=a[i]*k+e*(1-k);return e}
function rsi(a,n=14){if(a.length<n+1)return null;let g=0,l=0;for(let i=a.length-n;i<a.length;i++){let d=a[i]-a[i-1];if(d>0)g+=d;else l-=d}return l?100-100/(1+g/l):100}
function atr(c,n=14){if(c.length<n+1)return null;let t=[];for(let i=1;i<c.length;i++)t.push(Math.max(c[i].h-c[i].l,Math.abs(c[i].h-c[i-1].c),Math.abs(c[i].l-c[i-1].c)));return sma(t,n)}
function agg(rows,mins){
  const ms=mins*60000,out=[];
  for(const z of rows){
    const t=Math.floor(z.t/ms)*ms,last=out[out.length-1];
    if(!last||last.t!==t)out.push({t,o:z.o,h:z.h,l:z.l,c:z.c,v:z.v});
    else{last.h=Math.max(last.h,z.h);last.l=Math.min(last.l,z.l);last.c=z.c;last.v+=z.v}
  }
  return out;
}
async function candles(pair,interval,limit){
  const key=pair+"|"+interval+"|"+limit,old=cache.get(key);
  if(old&&Date.now()-old.at<15000)return old.v;
  const raw=await dcx("/market_data/candles?pair="+encodeURIComponent(pair)+"&interval="+interval+"&limit="+limit);
  const a=(Array.isArray(raw)?raw:[]).map(x=>({
    t:+x.time,o:+x.open,h:+x.high,l:+x.low,c:+x.close,v:+(x.volume||0)
  })).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.c)).sort((a,b)=>a.t-b.t);
  cache.set(key,{at:Date.now(),v:a}); return a;
}

/* IMPORTANT FIX:
   /exchange/v1/markets returns symbols such as BTCUSDT, not B-BTC_USDT.
   Candle API uses B-BTC_USDT. */
async function marketList(){
  const a=await dcx("/exchange/v1/markets");
  return [...new Set(a.filter(x=>typeof x==="string"&&/^[A-Z0-9]+USDT$/.test(x))
    .map(x=>"B-"+x.slice(0,-4)+"_USDT"))];
}

function completed(a,ms){return a.filter(x=>x.t+ms<=Date.now())}

function evaluate(side,level,tc,btcBias){
  if(tc.length<25)return null;
  let sweep=-1,conf=-1;
  for(let i=0;i<tc.length;i++){
    const z=tc[i];
    const swept=side==="BULLISH"?z.l<level:z.h>level;
    if(sweep<0 && swept){sweep=i;continue}
    if(sweep>=0 && i>sweep){
      const confirmed=side==="BULLISH"?z.c>level:z.c<level;
      if(confirmed){conf=i;break}
      /* invalidate only after a decisive move through the opposite side is not used here;
         keep watching for several closed candles */
    }
    if(sweep>=0 && i-sweep>12)break;
  }
  if(sweep<0)return null;

  const last=tc[tc.length-1];
  const idx=conf>=0?conf:tc.length-1;
  const c=tc[idx];
  const av=atr(tc.slice(0,idx+1))||Math.max(Math.abs(level)*0.002,1e-8);
  const range=Math.max(c.h-c.l,1e-12);
  const body=Math.abs(c.c-c.o)/range;
  const rejection=side==="BULLISH"?(Math.min(c.o,c.c)-c.l)/range:(c.h-Math.max(c.o,c.c))/range;
  const depth=side==="BULLISH"?(level-tc[sweep].l)/av:(tc[sweep].h-level)/av;
  const baseVol=sma(tc.slice(Math.max(0,idx-20),idx).map(x=>x.v),20)||c.v;
  const vr=baseVol?c.v/baseVol:1;
  const rr=rsi(tc.slice(0,idx+1).map(x=>x.c));
  const closes=tc.slice(0,idx+1).map(x=>x.c);
  const e20=ema(closes,20),e50=ema(closes,50);
  const emaAlign=side==="BULLISH"?c.c>e20&&e20>e50:c.c<e20&&e20<e50;
  const btcAlign=btcBias==="NEUTRAL"||btcBias===side;

  let score=30;
  score+=Math.min(18,body*18);
  score+=Math.min(12,rejection*12);
  score+=Math.min(14,Math.max(0,depth)*3.5);
  score+=Math.min(10,Math.max(0,vr-1)*12);
  if((side==="BULLISH"&&rr>=50&&rr<=72)||(side==="BEARISH"&&rr<=50&&rr>=28))score+=5;
  if(emaAlign)score+=5;
  if(btcAlign)score+=6;
  if(conf>=0)score+=8; else score-=3;
  if(conf>=0)score-=Math.max(0,conf-sweep-1)*2;
  score=Math.max(0,Math.min(100,Math.round(score)));

  const strong=conf>=0 && score>=70 && body>=0.45 && vr>=1.05 && (emaAlign||btcAlign);
  return {
    status:conf<0?"WATCHING":strong?"STRONG CONFIRMED":"CONFIRMED",
    side,level,score,strong,
    sweepIndex:sweep,confirmIndex:conf,
    sweepCandle:tc[sweep],confirmCandle:conf>=0?tc[conf]:null,
    rsi:rr==null?null:+rr.toFixed(1),
    volumeRatio:+vr.toFixed(2),
    body:+body.toFixed(2),rejection:+rejection.toFixed(2),
    depth:+depth.toFixed(2),atr:av,emaAlign,btcAlign
  };
}

async function btcBias(){
  try{
    const b=completed(await candles("B-BTC_USDT","1h",40),3600000);
    if(b.length<2)return "NEUTRAL";
    const z=b[b.length-1];
    const e20=ema(b.map(x=>x.c),20);
    if(z.c>z.o && (!e20||z.c>=e20))return "BULLISH";
    if(z.c<z.o && (!e20||z.c<=e20))return "BEARISH";
    return "NEUTRAL";
  }catch{return "NEUTRAL"}
}

async function scanOne(pair,btc){
  try{
    const [h1raw,mraw]=await Promise.all([
      candles(pair,"1h",80),
      candles(pair,"1m",900)
    ]);
    const h1=completed(h1raw,3600000);
    const m1=completed(mraw,60000);
    if(h1.length<25||m1.length<100)return null;
    const ref=h1[h1.length-1];
    const t5=agg(m1,5),t10=agg(m1,10);
    const tests=[
      evaluate("BULLISH",ref.l,t5,btc),
      evaluate("BEARISH",ref.h,t5,btc),
      evaluate("BULLISH",ref.l,t10,btc),
      evaluate("BEARISH",ref.h,t10,btc)
    ].filter(Boolean);
    if(!tests.length)return null;
    const best=tests.sort((a,b)=>b.score-a.score)[0];
    const entry=best.confirmCandle?.c||m1[m1.length-1].c;
    const risk=best.atr*1.2;
    const sl=best.side==="BULLISH"?entry-risk:entry+risk;
    const r=Math.abs(entry-sl);
    return {
      pair,side:best.side,status:best.status,score:best.score,
      entry,sl,
      t1:best.side==="BULLISH"?entry+r*1.5:entry-r*1.5,
      t2:best.side==="BULLISH"?entry+r*2.5:entry-r*2.5,
      t3:best.side==="BULLISH"?entry+r*4:entry-r*4,
      rsi:best.rsi,volumeRatio:best.volumeRatio,body:best.body,
      rejection:best.rejection,depth:best.depth,btcBias:btc,
      level:best.level,sweepCandle:best.sweepCandle,confirmCandle:best.confirmCandle
    };
  }catch(e){return null}
}

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/health",(req,res)=>res.json({ok:true,version:"18.1.0",exchange:"CoinDCX"}));

app.get("/api/scan",async(req,res)=>{
  const started=Date.now();
  try{
    const markets=await marketList();
    const btc=await btcBias();
    const out=[];let cursor=0,errors=0;
    const worker=async()=>{
      while(true){
        const i=cursor++;
        if(i>=markets.length)return;
        const x=await scanOne(markets[i],btc);
        if(x)out.push(x);
        else errors++;
        await sleep(40);
      }
    };
    await Promise.all(Array.from({length:8},worker));
    out.sort((a,b)=>b.score-a.score);
    res.json({ok:true,marketCount:markets.length,signalCount:out.length,errors,btcBias:btc,elapsedMs:Date.now()-started,signals:out,time:Date.now()});
  }catch(e){
    res.status(500).json({ok:false,error:e.message,elapsedMs:Date.now()-started});
  }
});

app.get("/api/debug",async(req,res)=>{
  try{
    const markets=await marketList();
    const btc=await candles("B-BTC_USDT","1m",5);
    res.json({ok:true,marketCount:markets.length,sampleMarkets:markets.slice(0,10),btcCandleCount:btc.length});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.get("/api/chart",async(req,res)=>{
  try{
    const pair=req.query.pair;
    if(!/^B-[A-Z0-9]+_USDT$/.test(pair))throw Error("Invalid pair");
    const m=completed(await candles(pair,"1m",900),60000);
    const c=agg(m,5);
    res.json({ok:true,candles:c,rsi:c.map((_,i)=>rsi(c.slice(0,i+1).map(z=>z.c)))});
  }catch(e){res.status(500).json({ok:false,error:e.message})}
});

app.listen(PORT,"0.0.0.0",()=>console.log("CoinDCX Sweep Radar V18.1 FIXED on "+PORT));