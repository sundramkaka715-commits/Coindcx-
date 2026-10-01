# CoinDCX Confirmed RSI Divergence Scanner v5

- RSI 14
- 1m / 5m / 15m
- Divergence gap: 1–20 candles
- Bullish: price low lower, RSI higher
- Bearish: price high higher, RSI lower
- Second pivot must have 2 candles closed to its right
- 5m bars are built from completed 1m CoinDCX candles for reliable 5m scanning

Render:
- Build Command: `npm install`
- Start Command: `npm start`

Structure:
- `package.json`, `server.js`, `README.md` in root
- `public/index.html`, `public/app.js`, `public/style.css` inside `public/`
