# CoinDCX 1H Rejection / Reclaim Scanner

This version is **CoinDCX-only**. It does not use Binance symbols or Binance candles.

## What it scans
- CoinDCX active **USDT spot markets** are fetched live from CoinDCX.
- No hard-coded 720-coin list.
- The market count shown by the scanner is the current count returned by CoinDCX.
- 5m is read directly from CoinDCX.
- 10m is built by combining two closed 5m CoinDCX candles.

CoinDCX's official API documents `/exchange/v1/markets` as the endpoint that returns currently active markets, and `/market_data/candles` for candle data.

## Signal rule
🔴 Bearish:
- Previous completed 1H High is the reference.
- Closed 5m/10m candle High goes above that High.
- The same closed candle closes back below that High.
- Signal.

🟢 Bullish:
- Previous completed 1H Low is the reference.
- Closed 5m/10m candle Low goes below that Low.
- The same closed candle closes back above that Low.
- Signal.

Wick + return close is required. A simple breakout close is NOT a signal.

## Render
Service type: Web Service
Build Command: `npm install`
Start Command: `npm start`
