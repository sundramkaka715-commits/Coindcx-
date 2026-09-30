const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "https://api.coindcx.com";

app.use(express.static(path.join(__dirname, "public")));

async function api(url) {
  const r = await fetch(url, { headers: { "User-Agent": "RSI-Divergence-Scanner/1.0" } });
  if (!r.ok) throw new Error(`CoinDCX HTTP ${r.status}`);
  return r.json();
}

app.get("/api/markets", async (req, res) => {
  try {
    const data = await api(`${BASE}/exchange/v1/markets_details`);
    const markets = (Array.isArray(data) ? data : [])
      .filter(x => String(x.quote_currency_short_name || x.base_currency_short_name || "").toUpperCase() === "USDT")
      .filter(x => String(x.status || "active").toLowerCase() === "active")
      .map(x => ({
        pair: x.symbol || x.market || x.pair,
        symbol: x.symbol || x.market || x.pair,
        base: x.base_currency_short_name || x.base_currency || "",
        quote: x.quote_currency_short_name || x.quote_currency || "USDT",
        status: x.status || "active"
      }))
      .filter(x => x.pair);
    res.json(markets);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/candles", async (req, res) => {
  try {
    const pair = String(req.query.pair || "");
    const interval = String(req.query.interval || "1m");
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 20), 500);
    if (!pair || !["1m","5m","15m"].includes(interval)) {
      return res.status(400).json({ error: "Invalid pair or interval" });
    }
    const url = `${BASE}/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`;
    const data = await api(url);
    res.json(Array.isArray(data) ? data : []);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`RSI scanner running on port ${PORT}`));
