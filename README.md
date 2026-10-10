# CoinDCX Hourly Sweep + RSI Divergence Scanner

This version keeps the same dark interface and fixes candle retrieval by moving CoinDCX requests to a same-origin Node.js server proxy. It scans an 18-coin USDT futures watchlist and only lists a coin when the latest hourly candle sweeps the previous completed hourly candle's high/low and a matching 3-minute or 5-minute RSI divergence is found. The 3-minute bars are aggregated from official 1-minute futures candles.

## Deploy on Render (important)
1. Upload the entire ZIP contents to a GitHub repository (keep `server.js`, `package.json`, `README.md`, and `public/` at repository root).
2. In Render choose **New + → Web Service** and connect that GitHub repository. Do **not** choose Static Site for this version.
3. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
4. Deploy and open the Render URL. Test `/health` at the end of the URL; it should return `{"ok":true,...}`.
5. Open the scanner and click **Scan now** after the 1H candle you want to inspect has completed. It does not place trades.

## Signals
- **Early / pre-break:** sweep + same-side RSI divergence exists, but swing level has not broken.
- **Break confirmed:** latest lower-timeframe close has broken the setup's trigger level.
- Empty results are normal when no coin meets both conditions. A data error is not a no-signal result; check the Scan log and Render logs.

Public data only; no API keys. CoinDCX candle API availability or rate limits can still temporarily affect scans. The 18-coin list is in `public/app.js`.
