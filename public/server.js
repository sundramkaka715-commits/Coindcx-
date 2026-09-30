const express = require("express");
const https = require("https");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 RSI-Divergence-Scanner",
        "Accept": "application/json"
      }
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`CoinDCX HTTP ${res.statusCode}: ${body.slice(0,180)}`));
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`Invalid CoinDCX JSON: ${e.message}`)); }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error("CoinDCX request timeout")));
    req.on("error", reject);
  });
}

app.get("/api/health", (req,res) => res.json({ok:true, service:"RSI Divergence Scanner"}));

app.get("/api/markets", async (req,res) => {
  try {
    const data = await getJSON("https://api.coindcx.com/exchange/v1/markets_details");
    const arr = Array.isArray(data) ? data : [];
    const markets = arr
      .filter(x => {
        const q = String(x.quote_currency_short_name || x.quote_currency || "").toUpperCase();
        const status = String(x.status || "active").toLowerCase();
        return q === "USDT" && status !== "inactive";
      })
      .map(x => ({
        symbol: x.symbol || x.market || x.pair || x.coindcx_name,
        pair: x.coindcx_name || x.symbol || x.market || x.pair,
        base: x.base_currency_short_name || x.base_currency || "",
        quote: "USDT"
      }))
      .filter(x => x.symbol && x.pair);
    if (!markets.length) throw new Error("CoinDCX returned no USDT markets");
    res.json(markets);
  } catch(e) {
    console.error("MARKETS ERROR", e);
    res.status(502).json({error:e.message});
  }
});

app.get("/api/candles", async (req,res) => {
  try {
    const pair = String(req.query.pair || "");
    const interval = String(req.query.interval || "1m");
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 50), 500);
    if (!pair || !["1m","5m","15m"].includes(interval)) {
      return res.status(400).json({error:"Invalid pair or interval"});
    }
    const url = `https://public.coindcx.com/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`;
    const data = await getJSON(url);
    res.json(Array.isArray(data) ? data : []);
  } catch(e) {
    console.error("CANDLE ERROR", e);
    res.status(502).json({error:e.message});
  }
});

app.get("*", (req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`RSI scanner listening on ${PORT}`));
