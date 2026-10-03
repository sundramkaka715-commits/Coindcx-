# 1H High / Low Rejection & Reclaim Scanner

## Exact signal logic

### 🔴 Bearish signal
पिछले **completed 1-hour candle** का High reference level है.

Latest closed **5m/10m candle** में:
1. उसका **High पिछले 1H High से ऊपर जाए**
2. और उसी candle का **Close पिछले 1H High से नीचे हो**

तो **BEARISH REJECTION** signal आएगा.

Formula:
`5m/10m High > Previous 1H High`
AND
`5m/10m Close < Previous 1H High`

### 🟢 Bullish signal
पिछले **completed 1-hour candle** का Low reference level है.

Latest closed **5m/10m candle** में:
1. उसका **Low पिछले 1H Low से नीचे जाए**
2. और उसी candle का **Close पिछले 1H Low से ऊपर हो**

तो **BULLISH RECLAIM** signal आएगा.

Formula:
`5m/10m Low < Previous 1H Low`
AND
`5m/10m Close > Previous 1H Low`

### Important
- केवल close breakout पर signal नहीं.
- पहले 1H level के बाहर जाना जरूरी है.
- फिर उसी 5m/10m candle में वापस 1H level के अंदर close होना जरूरी है.
- Running candle को signal में नहीं लिया जाता.
- 5m या 10m scan interval UI से चुना जा सकता है.

## GitHub Pages
`index.html`, `style.css`, `app.js`, `README.md` को repository root में upload करें और Settings → Pages → Deploy from branch → `main` → `/ (root)` चुनें.
