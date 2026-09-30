const express = require("express");
const https = require("https");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Root folder में index.html, app.js और style.css हैं
app.use(express.static(__dirname));

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 RSI-Divergence-Scanner",
          Accept: "application/json"
        }
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(`CoinDCX HTTP ${res.statusCode}`)
            );
          }

          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error("Invalid CoinDCX JSON"));
          }
        });
      }
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error("CoinDCX request timeout"));
    });

    req.on("error", reject);
  });
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "RSI Divergence Scanner V3"
  });
});

// CoinDCX markets
app.get("/api/markets", async (req, res) => {
  try {
    const data = await getJSON(
      "https://api.coindcx.com/exchange/v1/markets_details"
    );

    const arr = Array.isArray(data) ? data : [];

    const markets = arr
      .filter((x) => {
        const pair = String(x.pair || "").toUpperCase();
        const name = String(x.coindcx_name || "").toUpperCase();
        const symbol = String(x.symbol || "").toUpperCase();
        const status = String(x.status || "active").toLowerCase();

        if (status !== "active") return false;

        return (
          pair.endsWith("_USDT") ||
          name.endsWith("USDT") ||
          symbol.endsWith("USDT")
        );
      })
      .map((x) => {
        const pair = x.pair || x.coindcx_name || x.symbol;
        const symbol = x.coindcx_name || x.symbol || pair;

        return {
          symbol,
          pair,
          base: x.base_currency_short_name || "",
          quote: "USDT"
        };
      })
      .filter((x) => x.symbol && x.pair);

    if (!markets.length) {
      throw new Error("CoinDCX returned no active USDT markets");
    }

    res.json(markets);
  } catch (e) {
    console.error("MARKETS ERROR:", e);

    res.status(502).json({
      error: e.message
    });
  }
});

// 5-minute candle aggregation
function aggregate5m(raw) {
  const candles = [...raw]
    .map((x) => ({
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
      volume: Number(x.volume || 0),
      time: Number(x.time)
    }))
    .filter(
      (x) =>
        Number.isFinite(x.time) &&
        Number.isFinite(x.close)
    )
    .sort((a, b) => a.time - b.time);

  const groups = new Map();

  for (const candle of candles) {
    const bucket =
      Math.floor(candle.time / 300000) * 300000;

    if (!groups.has(bucket)) {
      groups.set(bucket, []);
    }

    groups.get(bucket).push(candle);
  }

  return [...groups.entries()]
    .map(([time, group]) => ({
      open: group[0].open,
      high: Math.max(...group.map((x) => x.high)),
      low: Math.min(...group.map((x) => x.low)),
      close: group[group.length - 1].close,
      volume: group.reduce(
        (sum, x) => sum + x.volume,
        0
      ),
      time
    }))
    .sort((a, b) => a.time - b.time);
}

// CoinDCX candles
app.get("/api/candles", async (req, res) => {
  try {
    const pair = String(req.query.pair || "");
    const interval = String(
      req.query.interval || "1m"
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit || 100),
        50
      ),
      500
    );

    if (
      !pair ||
      !["1m", "5m", "15m"].includes(interval)
    ) {
      return res.status(400).json({
        error: "Invalid pair or interval"
      });
    }

    const sourceInterval =
      interval === "5m" ? "1m" : interval;

    const sourceLimit =
      interval === "5m"
        ? Math.min(
            500,
            Math.max(100, limit * 5 + 10)
          )
        : limit;

    const url =
      "https://api.coindcx.com/market_data/candles" +
      `?pair=${encodeURIComponent(pair)}` +
      `&interval=${sourceInterval}` +
      `&limit=${sourceLimit}`;

    const data = await getJSON(url);

    const candles = Array.isArray(data)
      ? data
      : [];

    if (interval === "5m") {
      return res.json(
        aggregate5m(candles).slice(-limit)
      );
    }

    res.json(candles.slice(0, limit));
  } catch (e) {
    console.error("CANDLE ERROR:", e);

    res.status(502).json({
      error: e.message
    });
  }
});

// Frontend
app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

// Start
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RSI scanner V3 listening on port ${PORT}`
  );
});
