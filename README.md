# CoinDCX Hourly Sweep + RSI Divergence Scanner

## Important: deploy as a Render **Web Service**
This app uses `server.js` as a same-origin proxy to retrieve public CoinDCX futures candles. It will not work correctly if deployed as a Render Static Site or as GitHub Pages alone.

## Deploy
1. Extract the ZIP.
2. Upload all files/folders inside `CoinDCX_Hourly_Sweep_RSI_Scanner` to the root of a GitHub repository (keep `public/`, `server.js`, `package.json`, and `render.yaml`).
3. In Render choose **New + → Web Service** and connect the repository. If prompted, choose Node runtime.
4. Build command: `npm install`
5. Start command: `npm start`
6. After deploy, open the Render URL and click **Test API connection**. Wait for the success message before scanning.
7. Click **Scan now** after each completed 1H candle. In India, hourly candles may close at :30 depending on the exchange candle alignment; use the candle close time shown by your chart.

## What it checks
- Watchlist: BTC, ETH, SOL, XRP, DOGE, ADA, BNB, AVAX, LINK, DOT, LTC, BCH, TRX, NEAR, SUI, APT, UNI, ZEC (USDT futures pairs).
- A completed 1H candle must sweep the previous completed 1H candle's high/low and close back inside that level.
- It then checks matching-direction RSI divergence on closed 3M bars (aggregated from 1M data) or closed 5M bars.
- Old divergences formed before the detected sweep candle are rejected.
- Only matching setups are shown; no trade is placed automatically.

## Troubleshooting
- If API test returns an error, confirm this is a Render **Web Service**, not a Static Site.
- Open Render → service → Logs. A temporary CoinDCX outage/rate limit may still cause data errors.
- GitHub Pages alone cannot run `server.js`; use the Render Web Service URL.
