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
          return reject(new Error(`CoinDCX HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Invalid CoinDCX JSON`));
        }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error("CoinDCX request timeout")));
    req.on("error", reject);
  });
}

function isUSDTMarket(x) {
  const pair = String(x.pair || "").toUpperCase();
  const name = String(x.coindcx_name || "").toUpperCase();
  const symbol = String(x.symbol || "").toUpperCase();
  const status = String(x.status || "active").toLowerCase();
  if (status !== "active") return false;
  return pair.endsWith("_USDT") || name.endsWith("USDT") || symbol.endsWith("USDT");
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "RSI Divergence Scanner V3" });
});

app.get("/api/markets", async (req, res) => {
  try {
    const data = await getJSON("https://api.coindcx.com/exchange/v1/markets_details");
    const arr = Array.isArray(data) ? data : [];

    const markets = arr
      .filter(isUSDTMarket)
      .map(x => {
        const pair = x.pair || x.coindcx_name || x.symbol;
        const symbol = x.coindcx_name || x.symbol || pair;
        return {
          symbol,
          pair,
          base: x.base_currency_short_name || "",
          quote: "USDT"
        };
      })
      .filter(x => x.symbol && x.pair);

    if (!markets.length) throw new Error("CoinDCX returned no active USDT markets");
    res.json(markets);
  } catch (e) {
    console.error("MARKETS ERROR", e);
    res.status(502).json({ error: e.message });
  }
}

function aggregate5m(raw) {
  const c = [...raw]
    .map(x => ({
      open: Number(x.open), high: Number(x.high), low: Number(x.low),
      close: Number(x.close), volume: Number(x.volume || 0), time: Number(x.time)
    }))
    .filter(x => Number.isFinite(x.time) && Number.isFinite(x.close))
    .sort((a, b) => a.time - b.time);

  const groups = new Map();
  for (const x of c) {
    const bucket = Math.floor(x.time / 300000) * 300000;
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push(x);
  }

  return [...groups.entries()].map(([time, g]) => ({
    open: g[0].open,
    high: Math.max(...g.map(x => x.high)),
    low: Math.min(...g.map(x => x.low)),
    close: g[g.length - 1].close,
    volume: g.reduce((s, x) => s + x.volume, 0),
    time
  })).sort((a, b) => a.time - b.time);
}

app.get("/api/candles", async (req, res) => {
  try {
    const pair = String(req.query.pair || "");
    const interval = String(req.query.interval || "1m");
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 50), 500);

    if (!pair || !["1m", "5m", "15m"].includes(interval)) {
      return res.status(400).json({ error: "Invalid pair or interval" });
    }

    // CoinDCX Spot REST candles are served from api.coindcx.com.
    // CoinDCX documents 1m and 15m; 5m is built locally from 1m candles.
    const sourceInterval = interval === "5m" ? "1m" : interval;
    const sourceLimit = interval === "5m" ? Math.min(500, Math.max(100, limit * 5 + 10)) : limit;

    const url =
      `https://api.coindcx.com/market_data/candles?pair=${encodeURIComponent(pair)}` +
      `&interval=${sourceInterval}&limit=${sourceLimit}`;

    const data = await getJSON(url);
    const candles = Array.isArray(data) ? data : [];

    if (interval === "5m") {
      return res.json(aggregate5m(candles).slice(-limit));
    }

    res.json(candles.slice(0, limit));
  } catch (e) {
    console.error("CANDLE ERROR", e);
    res.status(502).json({ error: e.message });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`RSI scanner V3 listening on ${PORT}`));
