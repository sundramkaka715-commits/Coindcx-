# CoinDCX 1H Sweep Radar V6

Render:
- Build Command: `npm install`
- Start Command: `npm start`
- Node: 18+

Features:
- CoinDCX active USDT spot markets only (loaded dynamically)
- Previous completed 1H High/Low is the reference
- 5m or 10m candles built locally from CoinDCX 1m candles
- Sweep can be confirmed by the same candle or any later closed candle in the available window
- Watching list for swept-but-not-yet-confirmed setups
- Confirmed bullish/bearish lists
- Rule-based setup score
- Click Chart for candle chart + 1H levels + sweep/confirmation marks + RSI 14 with 30/50/70
- Strategy Lab summary
- No CoinDCX API key is required for public market/candle endpoints

Important:
This is a technical scanner, not financial advice. The score is a rule-based quality score, not an AI prediction or guarantee.
