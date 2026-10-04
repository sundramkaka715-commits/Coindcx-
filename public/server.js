const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const API = "https://api.coindcx.com";

app.use(express.static(__dirname, { extensions: ["html"] }));

async function dcx(urlPath) {
  const r = await fetch(API + urlPath, {
    headers: { "User-Agent": "CoinDCX-Sweep-Radar-V15.1-Fixed/15.1" }
  });
  if (!r.ok) throw new Error("CoinDCX API " + r.status);
  return r.json();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/markets", async (req, res) => {
  try {
    const markets = await dcx("/exchange/v1/markets");
    const symbols = [...new Set(
      markets.filter(x => typeof x === "string" && /^[A-Z0-9]+USDT$/.test(x))
    )].sort();
    res.json({ ok: true, exchange: "CoinDCX", count: symbols.length, symbols });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

app.get("/api/candles", async (req, res) => {
  try {
    const pair = String(req.query.pair || "");
    const interval = String(req.query.interval || "1m");
    const limit = Math.min(Math.max(Number(req.query.limit || 700), 2), 1000);

    if (!/^B-[A-Z0-9]+_USDT$/.test(pair))
      return res.status(400).json({ ok:false, error:"Invalid CoinDCX USDT pair" });

    if (!["1m","1h"].includes(interval))
      return res.status(400).json({ ok:false, error:"Only 1m and 1h are supported" });

    res.json(await dcx(
      `/market_data/candles?pair=${encodeURIComponent(pair)}&interval=${interval}&limit=${limit}`
    ));
  } catch (e) {
    res.status(502).json({ ok:false, error:e.message });
  }
});

app.get("/health", (req, res) =>
  res.json({ ok:true, exchange:"CoinDCX", version:"15.1.0-fixed" })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Server error: " + err.message);
});

app.listen(PORT, "0.0.0.0", () =>
  console.log("CoinDCX V15.1 FIXED running on port " + PORT)
);
