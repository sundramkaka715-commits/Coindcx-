# CoinDCX AUTO PILOT V19

A GitHub/Render-ready CoinDCX-only scanner. You do not need to search coins manually: the robot discovers active USDT markets and scans them automatically.

## What it does
- CoinDCX only
- Previous completed 1H High/Low as reference
- 1-minute data aggregated locally into 5M and 10M
- Wick sweep + same/later candle reclaim confirmation
- Strong confirmation scoring 0-100
- Elite setup at 90+
- RSI 14, EMA20/50, volume and BTC 1H alignment
- Automatic Entry / SL / T1 / T2 / T3 levels
- Top setups ranked automatically
- Bullish / Bearish / Both filter
- Auto scan every 60 seconds
- Chart + RSI when you open a setup
- /health and /api/status diagnostics

## Render
Build command: `npm install`
Start command: `npm start`
Node: 18+

## GitHub
Upload these files directly into the repository root: `package.json`, `server.js`, `index.html`, `README.md`.

## Important
This version is a signal scanner, not an auto-order executor. It does not place trades on your CoinDCX account.

The scanner intentionally shows no trade when setup quality is weak. Entry/SL/targets are rule-based estimates, not financial advice.
