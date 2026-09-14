const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { io: coinIO } = require("socket.io-client");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let count = 0;
let subscribed = false;
const old = new Map();

async function getCurrentPrices() {
  const r = await axios.get(
    "https://public.coindcx.com/market_data/v3/current_prices/futures/rt",
    { timeout: 15000 }
  );
  return r.data;
}

async function getPairs() {
  try {
    const j = await getCurrentPrices();
    const prices = j && j.prices ? j.prices : {};
    const pairs = Object.keys(prices).filter(Boolean);

    if (pairs.length) return pairs;
  } catch (e) {
    console.log("current prices error:", e.message);
  }

  const out = [];

  for (const c of ["USDT", "INR"]) {
    try {
      const r = await axios.get(
        "https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments",
        {
          params: {
            "margin_currency_short_name[]": c
          },
          timeout: 15000
        }
      );

      if (Array.isArray(r.data)) {
        out.push(
          ...r.data.map(x =>
            typeof x === "string"
              ? x
              : (x.instrument_name || x.pair || x.symbol)
          )
        );
      }
    } catch (e) {
      console.log("instrument error:", e.message);
    }
  }

  return [...new Set(out.filter(Boolean))];
}

app.get("/api/prices", async (req, res) => {
  try {
    res.json(await getCurrentPrices());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/candles", async (req, res) => {
  const pair = String(req.query.pair || "");
  const resolution = String(req.query.resolution || "5");

  if (
    !pair ||
    !new Set(["1", "5", "60", "1D"]).has(resolution)
  ) {
    return res.status(400).json({
      error: "Invalid pair/resolution"
    });
  }

  const now = Math.floor(Date.now() / 1000);

  const from =
    now -
    (
      resolution === "1"
        ? 3600
        : resolution === "5"
        ? 5 * 3600
        : resolution === "60"
        ? 7 * 86400
        : 90 * 86400
    );

  try {
    const r = await axios.get(
      "https://public.coindcx.com/market_data/candlesticks",
      {
        params: {
          pair,
          from,
          to: now,
          resolution,
          pcode: "f"
        },
        timeout: 15000
      }
    );

    res.json(r.data);
  } catch (e) {
    res.status(502).json({
      error: e.message
    });
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    futures: count,
    subscribed
  });
});

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

(async () => {
  const pairs = await getPairs();

  count = pairs.length;

  console.log("Futures:", count);

  const s = coinIO(
    "https://stream.coindcx.com",
    {
      transports: ["websocket"],
      reconnection: true
    }
  );

  s.on("connect", () => {
    console.log(
      "CoinDCX Futures trade stream connected"
    );

    pairs.forEach(pair => {
      s.emit("join", {
        channelName: pair + "@trades-futures"
      });
    });

    subscribed = true;

    io.emit("status", {
      ok: true,
      count
    });
  });

  s.on("disconnect", () => {
    subscribed = false;

    io.emit("status", {
      ok: false,
      count
    });
  });

  s.on("new-trade", r => {
    const d = (r && r.data) || r || {};

    const symbol =
      d.s ||
      d.pair ||
      d.symbol;

    const price =
      Number(d.p ?? d.price);

    if (
      !symbol ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return;
    }

    const previous = old.get(symbol);

    old.set(symbol, price);

    // Smallest movement also counts
    if (
      previous !== undefined &&
      price !== previous
    ) {
      const tickPct =
        ((price - previous) / previous) * 100;

      const now = Date.now();

      io.emit("tick", {
        symbol,
        price,
        previous,
        tickPct,
        dir: tickPct > 0 ? "UP" : "DOWN",
        movedAt: now,
        ts: now
      });
    }
  });

})().catch(e =>
  console.error("startup error:", e)
);

const port =
  Number(process.env.PORT || 10000);

server.listen(
  port,
  "0.0.0.0",
  () => {
    console.log(
      "Server started on",
      port
    );
  }
);
