# CoinDCX RSI Divergence Auto Trade Scanner

## Features
- 1m / 5m / 15m RSI(14) divergence
- 1–18 candle pivot gap
- Confirmed pivots (2 candles to the right)
- Swing-break entry: bullish = close above post-divergence swing high; bearish = close below post-divergence swing low
- Position size from ₹20 risk and actual SL distance
- Risk:Reward default 1:1.1
- Bullish only / Bearish only / Both
- Paper/Test mode enabled by default
- LIVE Futures order endpoints are wired server-side; API secrets are never placed in frontend code

## Render
Build: `npm install`
Start: `npm start`

For LIVE mode set these Render Environment Variables:
- `COINDCX_API_KEY`
- `COINDCX_API_SECRET`

The live order uses CoinDCX Futures market order. TP/SL creation is available through the Futures position TP/SL endpoint; because the entry must fill first and return a position id, production live deployment should verify the returned position before attaching TP/SL.

**Safety:** Keep Paper/Test mode until you have manually verified signals, quantity, minimum order size, leverage, and TP/SL behavior. ₹20 is the planned gross stop-loss risk before fees/slippage; actual realized loss can differ.
