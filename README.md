# Render upload files

Render service type: **Web Service**
Build Command: `npm install`
Start Command: `npm start`

Signal rules:
- Bearish: 5m/10m High > previous completed 1H High AND Close < that 1H High.
- Bullish: 5m/10m Low < previous completed 1H Low AND Close > that 1H Low.
Signals are based on closed 5m/10m candles only.
