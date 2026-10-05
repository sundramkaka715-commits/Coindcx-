# CoinDCX Sweep Radar V18.1 FIXED

## Important fix
CoinDCX `/exchange/v1/markets` returns symbols such as `BTCUSDT`. The candle API expects `B-BTC_USDT`. V18.1 converts them correctly. This was the reason the previous V18 screen could show zero setups without an obvious error.

## Features
- CoinDCX only, active USDT markets
- Previous completed 1H High/Low
- 1m data aggregated locally to 5m and 10m
- WATCHING -> CONFIRMED -> STRONG CONFIRMED
- 90+ = Elite Setup
- Body, rejection, sweep depth, volume, RSI, EMA and BTC alignment scoring
- Automatic Entry / SL / T1 / T2 / T3
- 5M chart + RSI 14 with 30/50/70
- Automatic 60-second scan
- Visible diagnostic status so API problems do not look like an empty scanner

## Render
Build: `npm install`
Start: `npm start`
Node: 18+
