# CoinDCX 1H Sweep + Confirmation Scanner V5

- CoinDCX active USDT spot markets only (loaded dynamically from CoinDCX public markets API).
- Reference is the latest completed 1H candle.
- Bearish: 5m/10m candle sweeps above previous 1H High; same candle OR any later closed 5m/10m candle closing below that High confirms.
- Bullish: 5m/10m candle sweeps below previous 1H Low; same candle OR any later closed candle closing above that Low confirms.
- Sweep setup stays armed across later candles until confirmation.
- 5m/10m candles are built locally from CoinDCX 1m candles.
- Signal chart shows candles, 1H level, sweep, confirmation and RSI.

Render:
Build Command: npm install
Start Command: npm start
Node 18+ required.
