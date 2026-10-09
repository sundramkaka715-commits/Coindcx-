# CoinDCX 1H Fakeout + RSI Divergence Scanner

## GitHub Pages upload

Upload these 3 files to the repository root:

- `index.html`
- `style.css`
- `script.js`

Then enable **Settings → Pages → Deploy from branch → main → / (root)**.

## What it does

- Monitors the 18 selected coins.
- Checks 1H fakeout.
- Checks RSI divergence on 3-minute and 5-minute candles.
- Checks relative volume (RVOL).
- Automatically scans every 3 or 5 minutes.
- Shows a browser notification + sound when a new divergence is detected.
- Avoids repeating the same alert during the same minute.

## Important

CoinDCX public candle endpoints and browser CORS rules can change. If GitHub Pages cannot fetch candles directly, the UI will show `API ERROR`. In that case the scanner needs a small backend/proxy (for example on Replit) to fetch the public data and send it to the page.

This scanner is a technical-alert tool, not financial advice.
