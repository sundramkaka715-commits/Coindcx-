let market = {};
let priceChart = null;
let rsiChart = null;

const movement = new Map();
const divCache = new Map();

const $ = id => document.getElementById(id);

const resolutionMap = {
  "1": "1",
  "3": "3",
  "5": "5",
  "15": "15",
  "60": "60",
  "1D": "1D"
};

function fmt(n) {
  if (!Number.isFinite(Number(n))) return "-";
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: 8
  });
}

async function loadPrices() {
  try {
    const r = await fetch("/api/prices", {
      cache: "no-store"
    });

    const j = await r.json();

    market = j.prices || {};

    $("status").textContent =
      `Live • ${Object.keys(market).length} Futures`;

    render();

  } catch (e) {
    console.error(e);

    $("status").textContent =
      "Data error";
  }
}


/* =========================================================
   MAIN LIST
   ========================================================= */

function render() {

  const arr = Object.entries(market)
    .map(([symbol, d]) => ({
      symbol,
      price: Number(d?.ls ?? d?.p ?? d?.pc)
    }))
    .filter(x =>
      x.symbol &&
      Number.isFinite(x.price) &&
      x.price > 0
    );

  /*
   IMPORTANT:
   Live movement time decides #1.
   24h percentage does NOT decide ranking.
  */

  arr.sort((a, b) => {

    const am =
      movement.get(a.symbol)?.movedAt || 0;

    const bm =
      movement.get(b.symbol)?.movedAt || 0;

    if (am !== bm) {
      return bm - am;
    }

    /*
      If neither coin has live movement yet,
      keep 24h percentage only as initial display order.
    */

    const ap =
      Number(market[a.symbol]?.pc) || 0;

    const bp =
      Number(market[b.symbol]?.pc) || 0;

    return Math.abs(bp) - Math.abs(ap);
  });


  /* =======================================================
     CONFIRMED RSI DIVERGENCE LIST
     ======================================================= */

  const confirmed = [...divCache.entries()]
    .filter(([symbol, sig]) =>
      sig &&
      (sig.type === "bull" || sig.type === "bear")
    )
    .sort((a, b) =>
      Number(b[1].time || 0) -
      Number(a[1].time || 0)
    );


  if ($("divergenceList")) {

    $("divergenceList").innerHTML =
      confirmed.length

        ? confirmed.map(([symbol, s]) => {

            const m = market[symbol] || {};

            const pc =
              Number(m.pc);

            const mv =
              Number.isFinite(pc)
                ? `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%`
                : "-";

            const text =
              s.type === "bull"
                ? "🟢 BULLISH RSI DIVERGENCE"
                : "🔴 BEARISH RSI DIVERGENCE";

            return `
              <div class="divRow"
                   data-pair="${symbol}">
                <b>${symbol.replace(/_USDT|_INR/g, "")}</b>
                <span>${text}</span>
                <strong>${mv}</strong>
              </div>
            `;

          }).join("")

        : `<div class="none">
             कोई confirmed RSI divergence नहीं मिली
           </div>`;
  }


  /* =======================================================
     MAIN COIN LIST
     ======================================================= */

  if ($("list")) {

    $("list").innerHTML =
      arr.map((x, i) => {

        const symbol = x.symbol;

        const d =
          divCache.get(symbol);

        const badge =
          d?.type === "bull"
            ? `<span class="badge bull">
                 🟢 BULL DIV
               </span>`
            : d?.type === "bear"
            ? `<span class="badge bear">
                 🔴 BEAR DIV
               </span>`
            : "";


        const pc =
          Number(market[symbol]?.pc);

        const move24 =
          Number.isFinite(pc)
            ? `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%`
            : "-";


        const mv =
          movement.get(symbol);

        const tickPct =
          Number(mv?.tickPct);

        const tickText =
          Number.isFinite(tickPct)
            ? `${tickPct >= 0 ? "+" : ""}${tickPct.toFixed(4)}%`
            : "";


        const moveClass =
          tickPct > 0
            ? "up"
            : tickPct < 0
            ? "down"
            : "";


        const fifteen =
          mv?.move15;

        const fifteenText =
          Number.isFinite(fifteen)
            ? `${fifteen >= 0 ? "+" : ""}${fifteen.toFixed(2)}%`
            : "-";


        return `
          <div class="row ${d ? "has-div" : ""}"
               data-pair="${symbol}">

            <span class="rank">
              #${i + 1}
            </span>

            <span class="symbol">
              ${symbol.replace(/_USDT|_INR/g, "")}
            </span>

            <span class="price">
              ${fmt(x.price)}
            </span>

            <span class="move15">
              15m:
              <b class="${fifteen >= 0 ? "up" : "down"}">
                ${fifteenText}
              </b>
            </span>

            <span class="liveMove ${moveClass}">
              ${tickText}
            </span>

            <span class="pc ${pc >= 0 ? "up" : "down"}">
              ${move24}
            </span>

            ${badge}

          </div>
        `;
      }).join("");


    document
      .querySelectorAll(".row")
      .forEach(row => {

        row.onclick = () => {
          openChart(
            row.dataset.pair
          );
        };

      });


    document
      .querySelectorAll(".divRow")
      .forEach(row => {

        row.onclick = () => {
          openChart(
            row.dataset.pair
          );
        };

      });

  }
}


/* =========================================================
   RSI 14
   ========================================================= */

function rsi(values, period = 14) {

  const out =
    Array(values.length).fill(null);

  if (
    !Array.isArray(values) ||
    values.length <= period
  ) {
    return out;
  }


  let gain = 0;
  let loss = 0;


  for (
    let i = 1;
    i <= period;
    i++
  ) {

    const diff =
      values[i] - values[i - 1];

    if (diff >= 0)
      gain += diff;
    else
      loss -= diff;
  }


  gain /= period;
  loss /= period;


  let rs =
    loss === 0
      ? Infinity
      : gain / loss;


  out[period] =
    loss === 0
      ? 100
      : 100 - (100 / (1 + rs));


  for (
    let i = period + 1;
    i < values.length;
    i++
  ) {

    const diff =
      values[i] - values[i - 1];

    const g =
      diff > 0 ? diff : 0;

    const l =
      diff < 0 ? -diff : 0;


    gain =
      ((gain * (period - 1)) + g) /
      period;

    loss =
      ((loss * (period - 1)) + l) /
      period;


    rs =
      loss === 0
        ? Infinity
        : gain / loss;


    out[i] =
      loss === 0
        ? 100
        : 100 - (100 / (1 + rs));
  }


  return out;
}


/* =========================================================
   20-MINUTE RSI DIVERGENCE
   ========================================================= */

function divergence(closes, rsis) {

  /*
    We use approximately the last 20 one-minute candles.

    Pivot confirmation:
    A pivot needs candles on both sides.

    No requirement that RSI must be above 70
    or below 30.

    Therefore divergence between 30 and 70
    is also detected.
  */

  if (
    !Array.isArray(closes) ||
    closes.length < 18
  ) {
    return null;
  }


  const start =
    Math.max(
      0,
      closes.length - 20
    );


  const lows = [];
  const highs = [];


  /*
    2 candles left + 2 candles right
    = confirmed local pivot.
  */

  for (
    let i = start + 2;
    i < closes.length - 2;
    i++
  ) {

    if (
      !Number.isFinite(rsis[i])
    ) {
      continue;
    }


    const p =
      closes[i];

    const r =
      rsis[i];


    const isLow =
      p < closes[i - 1] &&
      p <= closes[i + 1] &&
      p <= closes[i - 2] &&
      p <= closes[i + 2];


    const isHigh =
      p > closes[i - 1] &&
      p >= closes[i + 1] &&
      p >= closes[i - 2] &&
      p >= closes[i + 2];


    if (isLow) {

      lows.push({
        index: i,
        price: p,
        rsi: r
      });

    }


    if (isHigh) {

      highs.push({
        index: i,
        price: p,
        rsi: r
      });

    }
  }


  /* =======================================================
     BULLISH
     ======================================================= */

  if (lows.length >= 2) {

    const a =
      lows[lows.length - 2];

    const b =
      lows[lows.length - 1];


    const priceLowerLow =
      b.price < a.price;


    const rsiHigherLow =
      b.rsi > a.rsi;


    /*
      Small tolerance prevents meaningless
      microscopic differences.
    */

    const priceDifference =
      Math.abs(
        (b.price - a.price) /
        a.price
      ) * 100;


    const rsiDifference =
      Math.abs(
        b.rsi - a.rsi
      );


    if (
      priceLowerLow &&
      rsiHigherLow &&
      priceDifference >= 0.05 &&
      rsiDifference >= 1
    ) {

      return {
        type: "bull",
        index: b.index,
        pivotIndex: b.index,
        price1: a.price,
        price2: b.price,
        rsi1: a.rsi,
        rsi2: b.rsi,
        time: Date.now()
      };
    }
  }


  /* =======================================================
     BEARISH
     ======================================================= */

  if (highs.length >= 2) {

    const a =
      highs[highs.length - 2];

    const b =
      highs[highs.length - 1];


    const priceHigherHigh =
      b.price > a.price;


    const rsiLowerHigh =
      b.rsi < a.rsi;


    const priceDifference =
      Math.abs(
        (b.price - a.price) /
        a.price
      ) * 100;


    const rsiDifference =
      Math.abs(
        b.rsi - a.rsi
      );


    if (
      priceHigherHigh &&
      rsiLowerHigh &&
      priceDifference >= 0.05 &&
      rsiDifference >= 1
    ) {

      return {
        type: "bear",
        index: b.index,
        pivotIndex: b.index,
        price1: a.price,
        price2: b.price,
        rsi1: a.rsi,
        rsi2: b.rsi,
        time: Date.now()
      };
    }
  }


  return null;
}


/* =========================================================
   GET 1-MINUTE CANDLES
   ========================================================= */

async function getOneMinuteCandles(pair) {

  try {

    const now =
      Math.floor(Date.now() / 1000);


    /*
      40 minutes gives RSI enough
      candles + 20-minute divergence window.
    */

    const from =
      now - (40 * 60);


    const url =
      `/api/candles?pair=${encodeURIComponent(pair)}` +
      `&resolution=1` +
      `&from=${from}` +
      `&to=${now}`;


    const r =
      await fetch(
        url,
        { cache: "no-store" }
      );


    const j =
      await r.json();


    const candles =
      Array.isArray(j?.data)
        ? j.data
        : Array.isArray(j)
        ? j
        : [];


    return candles
      .sort(
        (a, b) =>
          Number(a.time) -
          Number(b.time)
      );

  } catch (e) {

    return [];
  }
}


/* =========================================================
   15-MINUTE MOVEMENT
   ========================================================= */

async function get15mMove(pair) {

  try {

    const candles =
      await getOneMinuteCandles(pair);


    if (
      candles.length < 2
    ) {
      return null;
    }


    const closes =
      candles
        .map(c =>
          Number(
            c.close ??
            c.c ??
            c[4]
          )
        )
        .filter(Number.isFinite);


    if (
      closes.length < 2
    ) {
      return null;
    }


    /*
      Last 15 one-minute candles.
    */

    const firstIndex =
      Math.max(
        0,
        closes.length - 15
      );


    const first =
      closes[firstIndex];

    const last =
      closes[closes.length - 1];


    if (
      !Number.isFinite(first) ||
      !Number.isFinite(last) ||
      first === 0
    ) {
      return null;
    }


    return (
      (last - first) /
      first
    ) * 100;

  } catch (e) {

    return null;
  }
}


/* =========================================================
   SCAN ONE COIN FOR RSI
   ========================================================= */

async function scanCoin(pair) {

  try {

    const candles =
      await getOneMinuteCandles(pair);


    if (
      candles.length < 18
    ) {
      return null;
    }


    const closes =
      candles.map(c =>
        Number(
          c.close ??
          c.c ??
          c[4]
        )
      );


    if (
      closes.some(
        x => !Number.isFinite(x)
      )
    ) {
      return null;
    }


    const rsis =
      rsi(
        closes,
        14
      );


    return divergence(
      closes,
      rsis
    );

  } catch (e) {

    return null;
  }
}


/* =========================================================
   SCAN COINS
   ========================================================= */

async function scanVisible() {

  const pairs =
    Object.keys(market);


  $("scanStatus").textContent =
    "15m movement + RSI scan चल रहा है…";


  /*
    Scan coins in batches.
    This prevents 539 requests
    from hitting the server at once.
  */

  const batchSize = 20;

  const results = [];


  for (
    let i = 0;
    i < pairs.length;
    i += batchSize
  ) {

    const batch =
      pairs.slice(
        i,
        i + batchSize
      );


    const vals =
      await Promise.all(
        batch.map(
          async pair => {

            const [
              move15,
              div
            ] =
              await Promise.all([
                get15mMove(pair),
                scanCoin(pair)
              ]);


            return {
              pair,
              move15,
              div
            };
          }
        )
      );


    results.push(
      ...vals
    );


    /*
      Update screen while scanning.
    */

    for (const x of vals) {

      const oldMove =
        movement.get(x.pair) || {};


      movement.set(
        x.pair,
        {
          ...oldMove,
          move15:
            Number.isFinite(x.move15)
              ? x.move15
              : oldMove.move15
        }
      );


      if (x.div) {

        divCache.set(
          x.pair,
          x.div
        );

      } else {

        /*
          Do not immediately erase a
          confirmed signal because the
          next candle can temporarily
          change the pivot.
        */

        const oldDiv =
          divCache.get(x.pair);


        if (
          oldDiv &&
          Date.now() - Number(oldDiv.time || 0)
            > 30 * 60 * 1000
        ) {
          divCache.delete(
            x.pair
          );
        }
      }
    }


    render();
  }


  const movers =
    results.filter(
      x =>
        Number.isFinite(x.move15)
    );


  const divs =
    results.filter(
      x => x.div
    );


  $("scanStatus").textContent =
    `15m movers: ${movers.length} • RSI scan: ${divs.length}`;


  render();
}


/* =========================================================
   CHART
   ========================================================= */

function markerData(
  values,
  idx
) {

  return values.map(
    (_, i) =>
      i === idx
        ? values[i]
        : null
  );
}


async function openChart(pair) {

  $("chartBox")
    ?.classList
    .remove("hidden");


  $("title").textContent =
    pair +
    " • " +
    $("resolution").value;


  $("signal").textContent =
    "Checking confirmed RSI divergence…";


  const resolution =
    resolutionMap[
      $("resolution").value
    ] ||
    $("resolution").value;


  try {

    const r =
      await fetch(
        `/api/candles?pair=${encodeURIComponent(pair)}&resolution=${resolution}`,
        { cache: "no-store" }
      );


    const j =
      await r.json();


    const candles =
      Array.isArray(j?.data)
        ? j.data
        : Array.isArray(j)
        ? j
        : [];


    candles.sort(
      (a, b) =>
        Number(a.time) -
        Number(b.time)
    );


    if (
      candles.length < 15
    ) {

      $("signal").textContent =
        "Chart data unavailable";

      return;
    }


    const closes =
      candles.map(c =>
        Number(
          c.close ??
          c.c ??
          c[4]
        )
      );


    const rsis =
      rsi(
        closes,
        14
      );


    const sig =
      divergence(
        closes,
        rsis
      );


    if (sig) {

      const text =
        sig.type === "bull"
          ? "🟢 BULLISH RSI DIVERGENCE"
          : "🔴 BEARISH RSI DIVERGENCE";


      $("signal").textContent =
        text +
        ` • RSI ${sig.rsi2.toFixed(1)}`;

      divCache.set(
        pair,
        sig
      );

    } else {

      $("signal").textContent =
        "No confirmed RSI divergence";

      /*
        Do not delete a recent confirmed
        scanner signal just because chart
        resolution is different.
      */

    }


    render();


    const labels =
      candles.map(
        c =>
          new Date(
            Number(c.time)
          ).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )
      );


    const div =
      sig;


    const priceBull =
      div?.type === "bull"
        ? markerData(
            closes,
            div.pivotIndex
          )
        : [];


    const priceBear =
      div?.type === "bear"
        ? markerData(
            closes,
            div.pivotIndex
          )
        : [];


    const rsiBull =
      div?.type === "bull"
        ? markerData(
            rsis,
            div.pivotIndex
          )
        : [];


    const rsiBear =
      div?.type === "bear"
        ? markerData(
            rsis,
            div.pivotIndex
          )
        : [];


    if (
      typeof Chart === "undefined"
    ) {
      return;
    }


    if (priceChart)
      priceChart.destroy();


    if (rsiChart)
      rsiChart.destroy();


    priceChart =
      new Chart(
        $("priceChart"),
        {
          type: "line",

          data: {
            labels,

            datasets: [

              {
                label: "Price",
                data: closes,
                tension: 0.15,
                pointRadius: 0
              },

              {
                label:
                  "Bullish divergence point",
                data: priceBull,
                pointRadius: 6,
                showLine: false
              },

              {
                label:
                  "Bearish divergence point",
                data: priceBear,
                pointRadius: 6,
                showLine: false
              }

            ]
          },

          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        }
      );


    rsiChart =
      new Chart(
        $("rsiChart"),
        {
          type: "line",

          data: {
            labels,

            datasets: [

              {
                label: "RSI (14)",
                data: rsis,
                tension: 0.15,
                pointRadius: 0
              },

              {
                label:
                  "Bullish RSI point",
                data: rsiBull,
                pointRadius: 6,
                showLine: false
              },

              {
                label:
                  "Bearish RSI point",
                data: rsiBear,
                pointRadius: 6,
                showLine: false
              }

            ]
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
        }
      );


  } catch (e) {

    console.error(e);

    $("signal").textContent =
      "Chart data unavailable";
  }
}


/* =========================================================
   BUTTONS
   ========================================================= */

$("close")?.addEventListener(
  "click",
  () => {

    $("chartBox")
      ?.classList
      .add("hidden");

  }
);


$("refresh")?.addEventListener(
  "click",
  async () => {

    await loadPrices();
    await scanVisible();

  }
);


$("resolution")?.addEventListener(
  "change",
  async () => {

    divCache.clear();

    await loadPrices();
    await scanVisible();

  }
);


/* =========================================================
   LIVE COIN MOVEMENT
   ========================================================= */

const socket =
  io();


socket.on(
  "connect",
  () => {

    $("status").textContent =
      `Live • ${Object.keys(market).length} Futures • Socket connected`;

  }
);


socket.on(
  "tick",
  t => {

    if (
      !t ||
      !t.symbol ||
      !Number.isFinite(
        Number(t.price)
      )
    ) {
      return;
    }


    const symbol =
      t.symbol;


    const price =
      Number(t.price);


    if (
      market[symbol]
    ) {

      market[symbol].ls =
        price;

    }


    const tickPct =
      Number(t.tickPct);


    /*
      EVERY price movement counts.
      No minimum threshold.
    */

    movement.set(
      symbol,
      {
        movedAt:
          Number(t.movedAt || t.ts) ||
          Date.now(),

        tickPct:
          Number.isFinite(tickPct)
            ? tickPct
            : 0,

        dir:
          tickPct >= 0
            ? "up"
            : "down",

        price,

        /*
          Preserve latest 15m value.
        */

        move15:
          movement.get(symbol)?.move15
      }
    );


    /*
      Immediately re-render.
      Therefore the latest moved coin
      jumps to #1.
    */

    render();

  }
);


/* =========================================================
   START
   ========================================================= */

(async () => {

  await loadPrices();

  await scanVisible();

})();


/*
  Refresh market prices every 10 seconds.
*/

setInterval(
  loadPrices,
  10000
);


/*
  Recalculate 15m movement + RSI
  every 60 seconds.
*/

setInterval(
  scanVisible,
  60000
);
