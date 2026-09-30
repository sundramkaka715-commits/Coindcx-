# CoinDCX Confirmed RSI Divergence Scanner V3

This version keeps the same interface but fixes the CoinDCX Spot API routing.

## Features
- CoinDCX active USDT spot markets
- 1m, 5m, 15m scanner
- RSI 14 regular bullish/bearish divergence
- 15–20 candle pivot gap
- Confirmed pivot: two candles to the right
- 5m candles are built from CoinDCX 1m candles
- Same mobile/laptop responsive interface
- No fakeout scanner and no liquidity sweep module

## Render
Build Command:
`npm install`

Start Command:
`npm start`

Node 18+ recommended.

Important: CoinDCX Spot REST candles are requested from `api.coindcx.com`. The 5m option is aggregated locally from 1m candles because the documented Spot candle intervals include 1m and 15m rather than a direct 5m endpoint.
