'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const allowed = new Set(['B-BTC_USDT','B-ETH_USDT','B-SOL_USDT','B-XRP_USDT','B-DOGE_USDT','B-ADA_USDT','B-BNB_USDT','B-AVAX_USDT','B-LINK_USDT','B-DOT_USDT','B-LTC_USDT','B-BCH_USDT','B-TRX_USDT','B-NEAR_USDT','B-SUI_USDT','B-APT_USDT','B-UNI_USDT','B-ZEC_USDT']);
const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon'};
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(typeof body==='string'?body:JSON.stringify(body));}
async function candles(pair,resolution,hours){
  const to=Math.floor(Date.now()/1000), from=to-hours*3600;
  const url=new URL('https://public.coindcx.com/market_data/candlesticks');
  url.searchParams.set('pair',pair);url.searchParams.set('from',String(from));url.searchParams.set('to',String(to));url.searchParams.set('resolution',resolution);url.searchParams.set('pcode','f');
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{'Accept':'application/json','User-Agent':'CoinDCX-Hourly-RSI-Scanner/2.0'}});
    const raw=await r.text();
    if(!r.ok) throw new Error(`CoinDCX HTTP ${r.status}: ${raw.slice(0,180)}`);
    let j;try{j=JSON.parse(raw)}catch{throw new Error('CoinDCX returned non-JSON data')}
    const arr=Array.isArray(j)?j:(j.data||[]);
    if(!Array.isArray(arr)) throw new Error('Unexpected candle response');
    return arr.map(c=>({time:Number(c.time??c.t),open:Number(c.open??c.o),high:Number(c.high??c.h),low:Number(c.low??c.l),close:Number(c.close??c.c),volume:Number(c.volume??c.v??0)}))
      .filter(c=>[c.time,c.open,c.high,c.low,c.close].every(Number.isFinite))
      .map(c=>({...c,time:c.time<1e12?c.time*1000:c.time}))
      .sort((a,b)=>a.time-b.time);
  } finally {clearTimeout(timer)}
}
const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/health'){return send(res,200,{ok:true,service:'CoinDCX Hourly Sweep RSI Scanner',mode:'manual scan after each completed 1H candle'});}
  if(u.pathname==='/api/test'){try{const sample=await candles('B-BTC_USDT','60',4);if(!sample.length)throw new Error('CoinDCX returned no BTC futures candles');return send(res,200,{ok:true,message:'CoinDCX futures API connection is working',candles:sample.length,latestCandleTime:sample[sample.length-1].time});}catch(e){return send(res,502,{ok:false,error:e.message||'CoinDCX API connection failed'});}}
  if(u.pathname==='/api/candles'){
    const pair=u.searchParams.get('pair');
    if(!allowed.has(pair)) return send(res,400,{error:'Pair not in allowed watchlist'});
    try{
      const [one,five,hour]=await Promise.all([candles(pair,'1',8),candles(pair,'5',30),candles(pair,'60',72)]);
      if(!one.length||!five.length||!hour.length) throw new Error(`Empty candles: 1m=${one.length}, 5m=${five.length}, 1h=${hour.length}`);
      return send(res,200,{pair,one,five,hour,serverTime:Date.now()});
    }catch(e){return send(res,502,{error:e.name==='AbortError'?'CoinDCX request timed out':(e.message||'Could not fetch candles')});}
  }
  let pathname=decodeURIComponent(u.pathname); if(pathname==='/') pathname='/public/index.html';
  const file=path.resolve(ROOT,'.'+pathname);
  if(!file.startsWith(ROOT+path.sep)) return send(res,403,'Forbidden','text/plain; charset=utf-8');
  fs.readFile(file,(err,data)=>{if(err)return send(res,404,'Not found','text/plain; charset=utf-8');send(res,200,data.toString(),mime[path.extname(file)]||'application/octet-stream');});
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Scanner running on port ${PORT}`));
