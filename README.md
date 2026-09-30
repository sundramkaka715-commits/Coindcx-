# CoinDCX Confirmed RSI Divergence Scanner

## Structure
- `package.json` and `server.js` stay in the ROOT.
- `public/index.html`, `public/app.js`, `public/style.css` stay inside `public/`.

## Logic
- CoinDCX USDT markets
- RSI 14
- 1m / 5m / 15m
- RSI divergence gap: **1 to 20 candles**
- Bullish: price lower-low + RSI higher-low
- Bearish: price higher-high + RSI lower-high
- Confirmed signal: the second swing must have at least 2 candles closed to its right
- Checks all qualifying pivot pairs in the 1–20 window, not only one fixed 15–20 pair

## Render
Build Command: `npm install`
Start Command: `npm start`
