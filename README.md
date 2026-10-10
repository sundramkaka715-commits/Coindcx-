# CoinDCX Hourly Sweep + RSI Divergence Scanner (v3)

## Behaviour
- Default mode is MANUAL. Click **Scan now after each completed 1-hour candle** (for example, if the 1H candle closes at 6:30 in your chart/session, scan after it closes).
- It checks 18 USDT futures pairs. A coin appears only when the most recently completed 1H candle sweeps the previous completed 1H high/low and matching 3M or 5M RSI divergence is present.
- Only fully closed 1H, 3M and 5M candles are used. 3M candles are built from completed 1M futures candles.
- The Test API connection button helps diagnose CoinDCX connectivity.
- This is a signal scanner only; it never places orders.

## Deploy to Render (important)
1. Extract this ZIP. Upload the contents of the `CoinDCX_Hourly_Sweep_RSI_Scanner` folder into the ROOT of your GitHub repository. Keep `server.js`, `package.json`, `README.md` and the `public` folder together.
2. In Render choose **New + → Web Service** (NOT Static Site) and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy and open the Render `onrender.com` URL. Click **Test API connection** first. If it reports an error, open Render → your service → Logs and review the server error.

## Important API details
The backend uses CoinDCX's documented public futures candles endpoint: `https://public.coindcx.com/market_data/candlesticks` with `resolution=1`, `5`, and `60`, and `pcode=f`. Network availability or exchange rate limits can still interrupt data.

## Watchlist
BTC, ETH, SOL, XRP, DOGE, ADA, BNB, AVAX, LINK, DOT, LTC, BCH, TRX, NEAR, SUI, APT, UNI, ZEC.
