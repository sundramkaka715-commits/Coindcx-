# CoinDCX 1H Sweep Radar V15.1 FIXED

This version specifically fixes the blank/white page problem by:
- serving index.html explicitly from `/`
- showing a visible startup/error panel
- keeping all dashboard HTML visible even if API requests fail
- adding `/health`
- responsive phone/laptop UI
- Bullish / Bearish / Both filters
- BTC 1H aligned filter
- 5m / 10m trigger
- Watching + Confirmed
- Full chart + RSI 14 (70/50/30)
- CoinDCX USDT only

Render:
Build: npm install
Start: npm start
Node: >=18

IMPORTANT:
GitHub repository root must contain these four files directly:
package.json
server.js
index.html
README.md
Do not upload the ZIP itself as the website files.
