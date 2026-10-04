const express=require("express");
const path=require("path");
const app=express();
const PORT=process.env.PORT||10000;
const API="https://api.coindcx.com";
app.use(express.static(__dirname));
async function dcx(p){
 const r=await fetch(API+p,{headers:{"User-Agent":"CoinDCX-Sweep-Radar-V15-PRO/15.0"}});
 if(!r.ok)throw new Error("CoinDCX API "+r.status);
 return r.json();
}
app.get("/",(_,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.get("/api/markets",async(_,res)=>{
 try{
  const m=await dcx("/exchange/v1/markets");
  const symbols=[...new Set(m.filter(x=>typeof x==="string"&&/^[A-Z0-9]+USDT$/.test(x)))].sort();
  res.json({exchange:"CoinDCX",quote:"USDT",count:symbols.length,symbols});
 }catch(e){res.status(502).json({error:e.message});}
});
app.get("/api/candles",async(req,res)=>{
 try{
  const pair=String(req.query.pair||"");
  const interval=String(req.query.interval||"1m");
  const limit=Math.min(Math.max(Number(req.query.limit||700),2),1000);
  if(!/^B-[A-Z0-9]+_USDT$/.test(pair))return res.status(400).json({error:"Invalid CoinDCX USDT pair"});
  if(!["1m","1h"].includes(interval))return res.status(400).json({error:"Only 1m and 1h are supported"});
  res.json(await dcx(`/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`));
 }catch(e){res.status(502).json({error:e.message});}
});
app.get("/health",(_,res)=>res.json({ok:true,exchange:"CoinDCX",version:"15.0.0"}));
app.listen(PORT,"0.0.0.0",()=>console.log("CoinDCX V15 PRO on "+PORT));
