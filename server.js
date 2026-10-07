const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const COINDCX = "https://public.coindcx.com";
const API = "https://api.coindcx.com";

app.use(express.static(path.join(__dirname, "public")));

async function getJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": "CoinDCX-Fakeout-Scanner/1.0" } });
  if (!r.ok) throw new Error(`CoinDCX HTTP ${r.status}`);
  return r.json();
}

// Active USDT futures instruments. Used to resolve the exact CoinDCX pair.
app.get("/api/instruments", async (req, res) => {
  try {
    const url = API + "/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=USDT";
    const data = await getJSON(url);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Futures candles. CoinDCX futures REST candles support 1m/5m/1h/1d.
// 4H is built in the browser from four consecutive 1H candles.
app.get("/api/candles", async (req, res) => {
  try {
    const { pair, resolution = "60", from, to } = req.query;
    if (!pair || !from || !to) return res.status(400).json({ error: "pair, from and to are required" });

    const url = new URL(COINDCX + "/market_data/candlesticks");
    url.searchParams.set("pair", pair);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("resolution", resolution);
    url.searchParams.set("pcode", "f");

    const data = await getJSON(url.toString());
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => console.log(`Scanner running on port ${PORT}`));
