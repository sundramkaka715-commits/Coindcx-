const els = {
  scanBtn: document.getElementById("scanBtn"),
  scanTf: document.getElementById("scanTf"),
  market: document.getElementById("market"),
  search: document.getElementById("search"),
  autoRefresh: document.getElementById("autoRefresh"),
  results: document.getElementById("results"),
  scanned: document.getElementById("scanned"),
  signals: document.getElementById("signals"),
  lastScan: document.getElementById("lastScan"),
  resultNote: document.getElementById("resultNote"),
  statusDot: document.getElementById("statusDot"),
  statusText: document.getElementById("statusText")
};

let symbols = [];
let timer = null;

function setStatus(type, text) {
  els.statusDot.className = "dot " + (type || "");
  els.statusText.textContent = text;
}

function fmtPrice(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.1) return n.toFixed(5);
  if (n >= 0.01) return n.toFixed(6);
  return n.toPrecision(6);
}

function fmtTime(ms) {
  return new Date(ms).toLocaleString("en-IN", {
    day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"
  });
}

async function getJson(url) {
  const r = await fetch(url, {cache:"no-store"});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function loadSymbols() {
  const base = els.market.value === "futures"
    ? "https://fapi.binance.com"
    : "https://api.binance.com";

  const path = els.market.value === "futures"
    ? "/fapi/v1/exchangeInfo"
    : "/api/v3/exchangeInfo";

  const data = await getJson(base + path);
  symbols = data.symbols
    .filter(s => s.status === "TRADING" && s.quoteAsset === "USDT")
    .map(s => s.symbol)
    .sort();
  return {base, symbols};
}

async function klines(base, symbol, interval, limit=4) {
  const path = els.market.value === "futures" ? "/fapi/v1/klines" : "/api/v3/klines";
  const url = `${base}${path}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  return getJson(url);
}

/*
  IMPORTANT:
  We compare the latest CLOSED scan candle with the PREVIOUS completed 1H candle.
  A candle is [openTime, open, high, low, close, ... closeTime].
  Binance returns the newest candle too, but that candle may still be running.
  We therefore use index -2 for the scan candle and index -2 for the 1H candle
  when the latest candle is still open.
*/
async function scanSymbol(base, symbol, scanTf) {
  const [h1, scan] = await Promise.all([
    klines(base, symbol, "1h", 4),
    klines(base, symbol, scanTf, 6)
  ]);

  if (h1.length < 3 || scan.length < 3) return null;

  const now = Date.now();

  // Last fully closed 1H candle.
  const h1Closed = h1.filter(k => Number(k[6]) < now);
  // Last fully closed scan candle.
  const scanClosed = scan.filter(k => Number(k[6]) < now);

  if (!h1Closed.length || !scanClosed.length) return null;

  const hour = h1Closed[h1Closed.length - 1];
  const c = scanClosed[scanClosed.length - 1];

  const hourHigh = Number(hour[2]);
  const hourLow = Number(hour[3]);

  const open = Number(c[1]);
  const high = Number(c[2]);
  const low = Number(c[3]);
  const close = Number(c[4]);

  // Avoid using a scan candle that belongs to a later 1H candle than the
  // selected completed 1H reference. It is valid only if its close is after
  // the reference hour candle close.
  if (Number(c[0]) <= Number(hour[6])) return null;

  // EXACT USER RULE:
  // Bearish: 5m/10m candle goes ABOVE previous 1H High,
  // then closes BACK BELOW that 1H High.
  const bearish = high > hourHigh && close < hourHigh;

  // Bullish: 5m/10m candle goes BELOW previous 1H Low,
  // then closes BACK ABOVE that 1H Low.
  const bullish = low < hourLow && close > hourLow;

  if (!bearish && !bullish) return null;

  const type = bearish ? "🔴 BEARISH REJECTION" : "🟢 BULLISH RECLAIM";
  const level = bearish ? hourHigh : hourLow;
  const wick = bearish ? high : low;

  return {
    symbol,
    type,
    open, high, low, close,
    level,
    wick,
    time: Number(c[6]),
    hourOpenTime: Number(hour[0])
  };
}

function render(rows) {
  const q = els.search.value.trim().toUpperCase();
  const filtered = q ? rows.filter(x => x.symbol.includes(q)) : rows;

  els.results.innerHTML = "";
  if (!filtered.length) {
    els.results.innerHTML = `<tr><td colspan="7" class="empty">इस scan में कोई signal नहीं मिला.</td></tr>`;
    return;
  }

  for (const r of filtered.sort((a,b) => b.time - a.time)) {
    const bull = r.type.startsWith("BULLISH");
    const url = `https://www.tradingview.com/chart/?symbol=BINANCE:${r.symbol}.P`;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${fmtTime(r.time)}</td>
      <td class="symbol">${r.symbol}</td>
      <td><span class="badge ${bull ? "bull" : "bear"}">${r.type}</span></td>
      <td>${fmtPrice(r.close)}</td>
      <td>${fmtPrice(r.level)}</td>
      <td>${fmtPrice(r.wick)}</td>
      <td><a class="chart" href="${url}" target="_blank" rel="noopener">TradingView ↗</a></td>
    `;
    els.results.appendChild(row);
  }
}

async function scan() {
  if (els.scanBtn.disabled) return;

  els.scanBtn.disabled = true;
  setStatus("busy", "Scanning...");
  els.resultNote.textContent = "Market data पढ़ा जा रहा है...";

  try {
    const {base, symbols: allSymbols} = await loadSymbols();
    const scanTf = els.scanTf.value;

    const rows = [];
    // Small batches reduce browser/API pressure and make the scanner more stable.
    const batchSize = 8;

    for (let i = 0; i < allSymbols.length; i += batchSize) {
      const batch = allSymbols.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(s => scanSymbol(base, s, scanTf).catch(() => null))
      );
      rows.push(...results.filter(Boolean));

      els.scanned.textContent = Math.min(i + batch.length, allSymbols.length);
      els.signals.textContent = rows.length;
      els.resultNote.textContent = `Scanning ${Math.min(i + batch.length, allSymbols.length)}/${allSymbols.length} symbols...`;

      // Tiny pause between batches.
      await new Promise(r => setTimeout(r, 120));
    }

    render(rows);
    els.scanned.textContent = allSymbols.length;
    els.signals.textContent = rows.length;
    els.lastScan.textContent = new Date().toLocaleTimeString("en-IN");
    els.resultNote.textContent = rows.length
      ? `${rows.length} signal मिला`
      : "कोई signal नहीं मिला";
    setStatus("ok", "Scan complete");
  } catch (err) {
    console.error(err);
    setStatus("err", "API error");
    els.resultNote.textContent = "Binance API से data नहीं मिल पाया. Internet/CORS/API status check करें.";
  } finally {
    els.scanBtn.disabled = false;
  }
}

function setupTimer() {
  if (timer) clearInterval(timer);
  const mins = Number(els.autoRefresh.value);
  if (mins > 0) timer = setInterval(scan, mins * 60 * 1000);
}

els.scanBtn.addEventListener("click", scan);
els.search.addEventListener("input", () => {
  // Search only filters the current table; it does not start a new API scan.
});
els.autoRefresh.addEventListener("change", setupTimer);
els.market.addEventListener("change", () => {
  els.resultNote.textContent = "Market बदल गया — Scan Now दबाएँ.";
  els.results.innerHTML = `<tr><td colspan="7" class="empty">नया market scan करने के लिए Scan Now दबाएँ.</td></tr>`;
});
els.scanTf.addEventListener("change", () => {
  els.resultNote.textContent = `${els.scanTf.value} candle selected — Scan Now दबाएँ.`;
});

setStatus("", "Ready");
