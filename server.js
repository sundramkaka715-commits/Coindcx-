const express=require("express");
const https=require("https");
const path=require("path");
const app=express();
const PORT=process.env.PORT||3000;
app.use(express.static(path.join(__dirname,"public")));
function getJSON(url){return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}},res=>{let b="";res.setEncoding("utf8");res.on("data",c=>b+=c);res.on("end",()=>{if(res.statusCode<200||res.statusCode>=300)return reject(new Error("CoinDCX HTTP "+res.statusCode));try{resolve(JSON.parse(b));}catch(e){reject(new Error("Invalid CoinDCX JSON response"));}})});req.setTimeout(15000,()=>req.destroy(new Error("CoinDCX request timeout")));req.on("error",reject);});}
function isUSDT(x){const p=String(x.pair||"").toUpperCase(),n=String(x.coindcx_name||"").toUpperCase(),s=String(x.symbol||"").toUpperCase(),st=String(x.status||"active").toLowerCase();return st==="active"&&(p.endsWith("_USDT")||n.endsWith("USDT")||s.endsWith("USDT"));}
app.get("/api/health",(q,r)=>r.json({ok:true,service:"RSI Divergence Scanner",version:"4.0.0"}));
app.get("/api/markets",async(q,r)=>{try{const d=await getJSON("https://api.coindcx.com/exchange/v1/markets_details");const m=(Array.isArray(d)?d:[]).filter(isUSDT).map(x=>({symbol:x.coindcx_name||x.symbol||x.pair||"",pair:x.pair||x.coindcx_name||x.symbol||""})).filter(x=>x.symbol&&x.pair);if(!m.length)throw new Error("No active USDT markets returned by CoinDCX");r.json(m);}catch(e){r.status(502).json({error:e.message});}});
app.get("/api/candles",async(q,r)=>{try{const pair=String(q.query.pair||""),interval=String(q.query.interval||"1m"),limit=Math.min(Math.max(Number(q.query.limit||100),50),500);if(!pair)return r.status(400).json({error:"Missing pair"});if(!["1m","5m","15m"].includes(interval))return r.status(400).json({error:"Invalid interval"});const u="https://api.coindcx.com/market_data/candles?pair="+encodeURIComponent(pair)+"&interval="+interval+"&limit="+limit;const d=await getJSON(u);r.json(Array.isArray(d)?d:[]);}catch(e){r.status(502).json({error:e.message});}});
app.get("*",(q,r)=>r.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log("RSI Divergence Scanner running on port "+PORT));