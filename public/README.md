# CoinDCX RSI Divergence Scanner

## What it detects
- 1 minute, 5 minute and 15 minute candles
- Regular bullish RSI divergence: price lower-low + RSI higher-low
- Regular bearish RSI divergence: price higher-high + RSI lower-high
- The two confirmed swing pivots must be 15–20 candles apart
- RSI period = 14
- Signal appears after the second pivot is confirmed (2 candles to the right)

## Replit
1. Create a new Node.js Repl.
2. Upload `package.json`, `server.js`, and the whole `public` folder.
3. Run the project.
4. Open the generated web link. It can be opened on phone and laptop.

## Important
This is a scanner, not an auto-trading bot. It does not place orders.
The CoinDCX public candle API is used through the server so the browser does not need an API key.
