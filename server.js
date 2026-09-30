const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "RSI Divergence server is running",
    time: new Date().toISOString()
  });
});

// Market candles
app.get("/api/klines", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").toUpperCase();
    const interval = String(req.query.interval || "1h");

    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "200", 10), 50),
      1000
    );

    const allowedIntervals = new Set([
      "1m",
      "3m",
      "5m",
      "15m",
      "30m",
      "1h",
      "2h",
      "4h",
      "6h",
      "8h",
      "12h",
      "1d",
      "3d",
      "1w",
      "1M"
    ]);

    if (!/^[A-Z0-9]{5,20}$/.test(symbol)) {
      return res.status(400).json({
        error: "Invalid symbol"
      });
    }

    if (!allowedIntervals.has(interval)) {
      return res.status(400).json({
        error: "Invalid interval"
      });
    }

    const url =
      "https://api.binance.com/api/v3/klines" +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${encodeURIComponent(interval)}` +
      `&limit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();

      return res.status(response.status).json({
        error: "Binance API error",
        details: body
      });
    }

    const data = await response.json();

    const candles = data.map((candle) => ({
      time: candle[0],
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5])
    }));

    res.json(candles);

  } catch (error) {
    console.error("Klines error:", error);

    res.status(500).json({
      error: "Failed to fetch market data",
      details: error.message
    });
  }
});

// Frontend
const distPath = path.join(__dirname, "dist");
const publicPath = path.join(__dirname, "public");

let frontendPath = null;

if (fs.existsSync(path.join(distPath, "index.html"))) {
  frontendPath = distPath;
} else if (fs.existsSync(path.join(publicPath, "index.html"))) {
  frontendPath = publicPath;
}

if (frontendPath) {

  app.use(express.static(frontendPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    res.sendFile(
      path.join(frontendPath, "index.html")
    );
  });

} else {

  app.get("/", (req, res) => {
    res.send(`
      <h2>RSI Divergence Server</h2>
      <p>Server is running.</p>
      <p>Frontend build not found.</p>
    `);
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RSI Divergence server running on port ${PORT}`
  );
});
