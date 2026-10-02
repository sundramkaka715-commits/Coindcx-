CoinDCX Futures RSI Scanner — mobile/PWA build

This project is based on the uploaded CoinDCX Futures server files.

Features:
- Active Futures market price list
- Sort by CoinDCX price-change %
- Real-time price tick updates
- Tap a coin to open Futures candlestick data
- RSI(14)
- Bullish/Bearish RSI divergence detection
- Mobile Chrome/PWA-ready UI

Run:
  npm install
  npm start

Open the HTTPS deployment URL in Chrome.
For Android-style installation: Chrome menu -> Add to Home screen / Install app
(availability depends on the browser/device).

Important:
This app does not place trades. It only reads public market data.
Do not put CoinDCX private API secrets in browser code.

CoinDCX documents the public Futures current-price endpoint and Futures candlestick endpoint.


RSI DIVERGENCE FILTER (v2):
Only confirmed pivot-based divergences are shown. No DIV badge is shown when the conditions are not met. The scanner uses completed pivot points and requires a small price separation plus at least 2 RSI points difference to reduce noisy/false signals. This is a technical filter, not a guarantee of future price movement.
