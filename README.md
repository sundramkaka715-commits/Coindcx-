# CoinDCX Pre-Break RSI Scanner

## Included
- `index.html` — GitHub Pages entry point
- `public/index.html` — copy of the page for hosts that publish the `public` folder
- `public/app.js` — scanner logic
- `package.json` — optional static-server scripts

## 18-coin watchlist in this ZIP
BTC, ETH, SOL, XRP, DOGE, ADA, BNB, AVAX, LINK, DOT, LTC, BCH, TRX, NEAR, SUI, APT, UNI, ZEC (USDT pairs).

If this differs from the exact list you sent earlier, edit `WATCHLIST` in `public/app.js`.

## GitHub Pages
1. Extract ZIP.
2. Upload `index.html`, `package.json`, and the `public` folder to the repository root.
3. In GitHub: Settings → Pages → deploy from branch → `main` → `/ (root)`.
4. Open the published Pages URL.

## Notes
This is a client-side prototype using CoinDCX public candle data. Browser CORS restrictions or API format changes may prevent candles from loading; check the Scan log. It does not place trades and does not guarantee signals. Test with paper trading first.
