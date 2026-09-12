const socket = io();

let coins = {};
let selectedCoin = null;
let priceChart = null;
let rsiChart = null;

const list = document.getElementById("list");
const divergenceList = document.getElementById("divergenceList");
const signal = document.getElementById("signal");
const resolution = document.getElementById("resolution");
const refreshBtn = document.getElementById("refresh");

function esc(x) {
  return String(x ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function formatPct(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "0.0000%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(4)}%`;
}

function render() {
  const arr = Object.values(coins);

  // सबसे हाल में जिस coin में movement हुआ वही #1
  arr.sort((a, b) => {
    return (b.movedAt || 0) - (a.movedAt || 0);
  });

  list.innerHTML = arr.map((c, i) => {
    const pct = Number(c.movePct ?? c.pc ?? 0);
    const cls = pct >= 0 ? "up" : "down";
    const div = c.divergence;

    return `
      <div class="coinRow" onclick="openCoin('${esc(c.symbol)}')">
        <div class="rank">${i + 1}</div>
        <div class="coinName">${esc(c.symbol)}</div>
        <div class="${cls}">
          ${formatPct(pct)}
        </div>
        ${div ? `<div class="${div.type === "BULLISH" ? "bullText" : "bearText"}">
          ${esc(div.type)}
        </div>` : ""}
      </div>
    `;
  }).join("");

  renderDivergence();
}

function renderDivergence() {
  const arr = Object.values(coins)
    .filter(c => c.divergence);

  if (!arr.length) {
    divergenceList.innerHTML =
      `<div class="empty">No confirmed RSI divergence</div>`;
    return;
  }

  divergenceList.innerHTML = arr.map(c => {
    const d = c.divergence;
    const bull = d.type === "BULLISH";

    return `
      <div class="divRow" onclick="openCoin('${esc(c.symbol)}')">
        <b>${esc(c.symbol)}</b>
        <span class="${bull ? "bullText" : "bearText"}">
          ${bull ? "BULLISH" : "BEARISH"}
        </span>
        <span>${formatPct(c.movePct ?? c.pc)}</span>
      </div>
    `;
  }).join("");
}

// Initial prices
async function loadPrices() {
  try {
    const r = await fetch("/api/prices");
    const data = await r.json();

    const arr = Array.isArray(data)
      ? data
      : (data.prices || data.data || []);

    arr.forEach(x => {
      const symbol =
        x.symbol || x.pair || x.instrument || x.coindcx_name;

      if (!symbol) return;

      if (!coins[symbol]) {
        coins[symbol] = {
          symbol,
          price: x.price ?? x.ltp,
          pc: x.pc ?? x.change,
          movePct: x.movePct ?? x.pc ?? 0,
          movedAt: Date.now()
        };
      } else {
        coins[symbol].price = x.price ?? x.ltp;
        coins[symbol].pc = x.pc ?? x.change;
      }
    });

    render();
  } catch (e) {
    console.error("Price loading error:", e);
  }
}

// Live CoinDCX movement
socket.on("tick", tick => {
  const symbol = tick.symbol || tick.pair;
  if (!symbol) return;

  const old = coins[symbol];

  const price = Number(tick.price);
  const oldPrice = old ? Number(old.price) : NaN;

  let moved = false;

  if (Number.isFinite(price) && Number.isFinite(oldPrice)) {
    moved = price !== oldPrice;
  } else if (tick.movePct !== undefined) {
    moved = Number(tick.movePct) !== 0;
  }

  if (!coins[symbol]) {
    coins[symbol] = {
      symbol,
      price,
      movePct: Number(tick.movePct || 0),
      movedAt: Date.now()
    };
  } else {
    coins[symbol].price = price;

    if (tick.movePct !== undefined) {
      coins[symbol].movePct = Number(tick.movePct);
    }

    if (tick.pc !== undefined) {
      coins[symbol].pc = Number(tick.pc);
    }

    // कोई भी छोटा movement = तुरंत #1
    if (moved) {
      coins[symbol].movedAt =
        Number(tick.movedAt) || Date.now();
    }
  }

  render();
});

// पुराने server के scanner event के लिए भी
socket.on("scanner", data => {
  const arr = Array.isArray(data)
    ? data
    : (data.prices || data.data || []);

  arr.forEach(x => {
    const symbol = x.symbol || x.pair;
    if (!symbol) return;

    if (!coins[symbol]) {
      coins[symbol] = {
        symbol,
        price: x.price,
        pc: x.pc,
        movePct: x.movePct ?? x.pc ?? 0,
        movedAt: Date.now()
      };
    } else {
      coins[symbol].price = x.price ?? coins[symbol].price;
      coins[symbol].pc = x.pc ?? coins[symbol].pc;
      coins[symbol].movePct =
        x.movePct ?? coins[symbol].movePct;
    }
  });

  render();
});

async function openCoin(symbol) {
  selectedCoin = symbol;

  signal.textContent = `${symbol} — Loading chart...`;

  try {
    const res = await fetch(
      `/api/candles?pair=${encodeURIComponent(symbol)}&resolution=${resolution.value}`
    );

    const data = await res.json();

    const candles = Array.isArray(data)
      ? data
      : (data.candles || data.data || []);

    drawCharts(candles, symbol);
  } catch (e) {
    console.error(e);
    signal.textContent = `${symbol} — Chart loading error`;
  }
}

function calculateRSI(closes, period = 14) {
  const rsi = new Array(closes.length).fill(null);

  if (closes.length <= period) return rsi;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;

  rsi[period] =
    avgLoss === 0
      ? 100
      : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];

    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    avgGain = ((avgGain * (period - 1)) + g) / period;
    avgLoss = ((avgLoss * (period - 1)) + l) / period;

    rsi[i] =
      avgLoss === 0
        ? 100
        : 100 - (100 / (1 + avgGain / avgLoss));
  }

  return rsi;
}

function drawCharts(candles, symbol) {
  if (!candles.length) {
    signal.textContent = `${symbol} — No candle data`;
    return;
  }

  const labels = [];
  const closes = [];

  candles.forEach(c => {
    const t = c.time ?? c.timestamp ?? c[0];
    const close = Number(c.close ?? c.c ?? c[4]);

    labels.push(new Date(Number(t) < 10000000000
      ? Number(t) * 1000
      : Number(t)).toLocaleTimeString());

    closes.push(close);
  });

  const rsi = calculateRSI(closes, 14);

  if (priceChart) priceChart.destroy();
  if (rsiChart) rsiChart.destroy();

  const pc = document.getElementById("priceChart");
  const rc = document.getElementById("rsiChart");

  priceChart = new Chart(pc, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: symbol,
        data: closes,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });

  rsiChart = new Chart(rc, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "RSI 14",
        data: rsi,
        tension: 0.2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: 100
        }
      }
    }
  });

  signal.textContent = `${symbol} — RSI(14)`;
}

refreshBtn?.addEventListener("click", loadPrices);

resolution?.addEventListener("change", () => {
  if (selectedCoin) openCoin(selectedCoin);
});

loadPrices();

setInterval(loadPrices, 10000);
