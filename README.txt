1H Fakeout Scanner (GitHub Pages)

Files: index.html

How to use:
1. GitHub repository open karein, Add file > Upload files.
2. index.html upload karke Commit changes.
3. Settings > Pages > Deploy from branch > main / root > Save.
4. Website link kholkar Scan karein.

Logic:
- Bullish: 5m candle low goes below previous completed 1h low, then closes above that low.
- Bearish: 5m candle high goes above previous completed 1h high, then closes below that high.

Note: Browser public CoinDCX candle endpoint use karta hai. Availability/CORS/pair naming may vary. Scanner checks the previous 5m candle to avoid using a still-forming candle. This is an experimental signal tool, not trading advice.
