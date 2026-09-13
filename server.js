const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { io: coinIO } = require("socket.io-client");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const old = new Map();
let count = 0;

async function instruments() {
  let a = [];
  for (const c of ["USDT", "INR"]) {
    try {
      const r = await axios.get(
        "https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=" + c
      );
      if (Array.isArray(r.data)) a.push(...r.data);
    } catch (e) {
      console.log("instrument error:", e.message);
    }
  }
  const s = new Set();
  return a.map(x => typeof x === "string" ? x : (x.instrument_name || x.pair || x.symbol))
    .filter(x => x && !s.has(x) && (s.add(x), true));
}

// Current Futures prices: pc = CoinDCX price-change percent.
app.get("/api/prices", async (req, res) => {
  try {
    const r = await axios.get("https://public.coindcx.com/market_data/v3/current_prices/futures/rt");
    res.json(r.data);
  } catch (e) {
    res.status(502).json({error: e.message});
  }
});

// Futures candlesticks for RSI/chart.
app.get("/api/candles", async (req, res) => {
  const pair = String(req.query.pair || "");
  const resolution = String(req.query.resolution || "5");
  const allowed = new Set(["1", "5", "60", "1D"]);
  if (!pair || !allowed.has(resolution)) return res.status(400).json({error:"Invalid pair/resolution"});

  const now = Math.floor(Date.now()/1000);
  const from = now - (resolution === "1" ? 3600 : resolution === "5" ? 5*3600 : resolution === "60" ? 7*24*3600 : 90*24*3600);
  try {
    const r = await axios.get("https://public.coindcx.com/market_data/candlesticks", {
      params: { pair, from, to: now, resolution, pcode: "f" }
    });
    res.json(r.data);
  } catch (e) {
    res.status(502).json({error: e.message});
  }
});

(async () => {
  const ps = await instruments();
  count = ps.length;
  console.log("Futures:", count);

  const s = coinIO("https://stream.coindcx.com", {
    transports:["websocket"], reconnection:true
  });

  s.on("connect", () => {
    console.log("CoinDCX stream connected");
    ps.forEach(p => s.emit("join", {channelName:p+"@prices-futures"}));
    io.emit("status", {ok:true, count});
  });

  s.on("disconnect", () => io.emit("status", {ok:false, count}));

  // Forward real-time price changes to browser.
  s.on("price-change", r => {
    const d = r && r.data || r || {};
    const sym = d.s || d.pair || d.symbol;
    const p = Number(d.p ?? d.price);
    if (!sym || !p) return;
    const o = old.get(sym);
    old.set(sym, p);
    if (o !== undefined && p !== o) {
      io.emit("tick", {symbol:sym, price:p, previous:o, tickPct:(p-o)/o*100, ts:Date.now()});
    }
  });
})().catch(console.error);

server.listen(process.env.PORT || 3000, () => console.log("Server started"));
