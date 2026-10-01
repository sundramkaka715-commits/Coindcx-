const express=require('express');
const https=require('https');
const crypto=require('crypto');
const path=require('path');
const app=express();
const PORT=process.env.PORT||3000;
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

function getJSON(url, options={}){return new Promise((resolve,reject)=>{
  const req=https.get(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json',...(options.headers||{})}},res=>{
    let b='';res.setEncoding('utf8');res.on('data',c=>b+=c);
    res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error('CoinDCX HTTP '+res.statusCode));try{resolve(JSON.parse(b));}catch(e){reject(new Error('Invalid CoinDCX JSON response'));}});
  });
  req.setTimeout(15000,()=>req.destroy(new Error('CoinDCX request timeout')));req.on('error',reject);
});}
function postJSON(url,body,headers={}){return new Promise((resolve,reject)=>{
  const payload=JSON.stringify(body);
  const u=new URL(url);
  const req=https.request({hostname:u.hostname,path:u.pathname+u.search,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload),...(headers||{})}},res=>{
    let b='';res.setEncoding('utf8');res.on('data',c=>b+=c);res.on('end',()=>{let d;try{d=JSON.parse(b)}catch(e){return reject(new Error('Invalid CoinDCX JSON response'))}if(res.statusCode<200||res.statusCode>=300)return reject(new Error(d?.message||d?.error||'CoinDCX HTTP '+res.statusCode));resolve(d);});
  });
  req.setTimeout(15000,()=>req.destroy(new Error('CoinDCX request timeout')));req.on('error',reject);req.write(payload);req.end();
});}
function sign(body){const key=process.env.COINDCX_API_KEY||'';const secret=process.env.COINDCX_API_SECRET||'';if(!key||!secret)throw new Error('COINDCX_API_KEY / COINDCX_API_SECRET not configured');const payload=JSON.stringify(body);return {key,sig:crypto.createHmac('sha256',secret).update(payload).digest('hex')};}
async function privatePost(url,body){const {key,sig}=sign(body);return postJSON(url,body,{'X-AUTH-APIKEY':key,'X-AUTH-SIGNATURE':sig});}

function isUSDT(x){const p=String(x.pair||'').toUpperCase(),n=String(x.coindcx_name||'').toUpperCase(),s=String(x.symbol||'').toUpperCase();const st=String(x.status||'active').toLowerCase();return st==='active'&&(p.endsWith('_USDT')||n.endsWith('USDT')||s.endsWith('USDT'));}
function normalizeCandles(d){const arr=Array.isArray(d)?d:(Array.isArray(d?.data)?d.data:[]);return arr.map(x=>({open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume||0),time:Number(x.time)})).filter(x=>[x.time,x.open,x.high,x.low,x.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);}
function aggregate5m(candles){const map=new Map();for(const c of candles){const bucket=Math.floor(c.time/300000)*300000;let a=map.get(bucket);if(!a)a={open:c.open,high:c.high,low:c.low,close:c.close,volume:0,time:bucket,count:0};a.high=Math.max(a.high,c.high);a.low=Math.min(a.low,c.low);a.close=c.close;a.volume+=c.volume;a.count++;map.set(bucket,a);}return [...map.values()].filter(x=>x.count>=5).sort((a,b)=>a.time-b.time);}
function calcRSI(v){const p=14,o=Array(v.length).fill(null);if(v.length<=p)return o;let g=0,l=0;for(let i=1;i<=p;i++){const d=v[i]-v[i-1];g+=Math.max(d,0);l+=Math.max(-d,0)}let ag=g/p,al=l/p;o[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<v.length;i++){const d=v[i]-v[i-1];ag=(ag*(p-1)+Math.max(d,0))/p;al=(al*(p-1)+Math.max(-d,0))/p;o[i]=al===0?100:100-100/(1+ag/al)}return o;}
function pivots(c){const lows=[],highs=[];for(let i=2;i<c.length-2;i++){if(c[i].low<c[i-1].low&&c[i].low<=c[i+1].low&&c[i].low<c[i-2].low&&c[i].low<=c[i+2].low)lows.push(i);if(c[i].high>c[i-1].high&&c[i].high>=c[i+1].high&&c[i].high>c[i-2].high&&c[i].high>=c[i+2].high)highs.push(i)}return{lows,highs};}
function findDivergence(c,minGap=1,maxGap=18){if(c.length<70)return null;const r=calcRSI(c.map(x=>x.close)),p=pivots(c),last=c.length-3;
  for(let b=p.lows.length-1;b>=0;b--){const s=p.lows[b];if(s>last||r[s]==null)continue;for(let a=b-1;a>=0;a--){const f=p.lows[a],gap=s-f;if(gap>maxGap)break;if(gap>=minGap&&c[s].low<c[f].low&&r[s]>r[f])return{side:'BULLISH',pivotIndex:s,pivotTime:c[s].time,pivotPrice:c[s].low,rsi:r[s],gap};}}
  for(let b=p.highs.length-1;b>=0;b--){const s=p.highs[b];if(s>last||r[s]==null)continue;for(let a=b-1;a>=0;a--){const f=p.highs[a],gap=s-f;if(gap>maxGap)break;if(gap>=minGap&&c[s].high>c[f].high&&r[s]<r[f])return{side:'BEARISH',pivotIndex:s,pivotTime:c[s].time,pivotPrice:c[s].high,rsi:r[s],gap};}}
  return null;
}
function findSwingBreak(c,div){if(!div)return null;const p=pivots(c);const from=div.pivotIndex+1;const lastClosed=c.length-2;
  if(div.side==='BULLISH'){const swings=p.highs.filter(i=>i>=from&&i<=lastClosed);if(!swings.length)return null;const s=swings[swings.length-1],level=c[s].high; if(c[lastClosed].close>level)return{side:'BULLISH',swingIndex:s,swingTime:c[s].time,swingLevel:level,breakTime:c[lastClosed].time,entry:c[lastClosed].close};}
  else {const swings=p.lows.filter(i=>i>=from&&i<=lastClosed);if(!swings.length)return null;const s=swings[swings.length-1],level=c[s].low;if(c[lastClosed].close<level)return{side:'BEARISH',swingIndex:s,swingTime:c[s].time,swingLevel:level,breakTime:c[lastClosed].time,entry:c[lastClosed].close};}
  return null;
}
function setupFromCandles(c,sideFilter='BOTH'){const d=findDivergence(c,1,18);if(!d|| (sideFilter!=='BOTH'&&d.side!==sideFilter))return null;const br=findSwingBreak(c,d);if(!br)return null;const p=pivots(c);let sl;if(d.side==='BULLISH'){const lows=p.lows.filter(i=>i<=d.pivotIndex);if(!lows.length)return null;sl=c[lows[lows.length-1]].low;}else{const highs=p.highs.filter(i=>i<=d.pivotIndex);if(!highs.length)return null;sl=c[highs[highs.length-1]].high;}if((d.side==='BULLISH'&&sl>=br.entry)||(d.side==='BEARISH'&&sl<=br.entry))return null;const riskDist=Math.abs(br.entry-sl);const target=d.side==='BULLISH'?br.entry+riskDist*1.1:br.entry-riskDist*1.1;return{...d,...br,sl,target,riskDistance:riskDist,key:`${d.side}:${d.pivotTime}:${br.swingTime}:${br.breakTime}`};}

async function marketDetails(){const d=await getJSON('https://api.coindcx.com/exchange/v1/markets_details');return(Array.isArray(d)?d:[]).filter(isUSDT).map(x=>({symbol:x.coindcx_name||x.symbol||x.pair,pair:x.pair||x.coindcx_name||x.symbol,targetPrecision:Number(x.target_currency_precision||8),minQty:Number(x.min_quantity||x.min_market_orders_qty||0),maxQty:Number(x.max_quantity_market||x.max_quantity||Infinity)})).filter(x=>x.pair&&x.symbol);}
app.get('/api/health',(q,r)=>r.json({ok:true,service:'RSI Divergence Auto Trade Scanner',version:'6.0.0'}));
app.get('/api/markets',async(q,r)=>{try{const m=await marketDetails();if(!m.length)throw new Error('No active USDT markets returned by CoinDCX');r.json(m);}catch(e){r.status(502).json({error:e.message});}});
app.get('/api/candles',async(q,r)=>{try{const pair=String(q.query.pair||''),interval=String(q.query.interval||'1m');if(!pair)return r.status(400).json({error:'Missing pair'});if(!['1m','5m','15m'].includes(interval))return r.status(400).json({error:'Invalid interval'});let apiInterval=interval,limit=200;if(interval==='5m'){apiInterval='1m';limit=500;}const u='https://api.coindcx.com/market_data/candles?pair='+encodeURIComponent(pair)+'&interval='+apiInterval+'&limit='+limit;const d=normalizeCandles(await getJSON(u));const out=interval==='5m'?aggregate5m(d):d;r.json(out.slice(-200));}catch(e){r.status(502).json({error:e.message});}});
app.get('/api/futures-price',async(q,r)=>{try{const d=await getJSON('https://public.coindcx.com/market_data/v3/current_prices/futures/rt');r.json(d);}catch(e){r.status(502).json({error:e.message});}});
app.get('/api/usdt-inr',async(q,r)=>{try{const d=await getJSON('https://api.coindcx.com/exchange/ticker');const x=(Array.isArray(d)?d:[]).find(a=>String(a.market).toUpperCase()==='USDTINR');if(!x)throw new Error('USDTINR price unavailable');r.json({price:Number(x.last_price)});}catch(e){r.status(502).json({error:e.message});}});
app.post('/api/auto-trade',async(q,r)=>{try{const {pair,side,entry,sl,target,quantity,leverage=1,paper=true}=q.body||{};if(!pair||!side||![entry,sl,target,quantity].every(Number.isFinite))return r.status(400).json({error:'Invalid trade setup'});if(paper)return r.json({mode:'PAPER',status:'accepted',pair,side,entry,sl,target,quantity,leverage});
  const body={timestamp:Date.now(),side:side==='BULLISH'?'buy':'sell',pair,order_type:'market',price:null,stop_price:null,total_quantity:quantity,leverage:Number(leverage),notification:'no_notification'};
  const order=await privatePost('https://api.coindcx.com/exchange/v1/derivatives/futures/orders/create',body);
  return r.json({mode:'LIVE',status:'entry_submitted',order});
}catch(e){r.status(500).json({error:e.message});}});
app.post('/api/auto-trade/tpsl',async(q,r)=>{try{const {positionId,sl,target,paper=true}=q.body||{};if(paper)return r.json({mode:'PAPER',status:'tpsl-ready',sl,target});if(!positionId)return r.status(400).json({error:'Missing positionId'});const body={timestamp:Date.now(),id:positionId,take_profit:{stop_price:String(target),order_type:'take_profit_market'},stop_loss:{stop_price:String(sl),order_type:'stop_market'}};const out=await privatePost('https://api.coindcx.com/exchange/v1/derivatives/futures/positions/create_tpsl',body);r.json({mode:'LIVE',status:'tpsl_submitted',result:out});}catch(e){r.status(500).json({error:e.message});}});
app.get('/api/account-status',(q,r)=>r.json({liveConfigured:Boolean(process.env.COINDCX_API_KEY&&process.env.COINDCX_API_SECRET)}));
app.get('*',(q,r)=>r.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('RSI Divergence Auto Trade Scanner running on port '+PORT));
