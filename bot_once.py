"""
GitHub Actions version: ek baar chalta hai, check karta hai, khatam.
Token/Chat ID GitHub Secrets se aate hain (code mein kuch mat likhna).
"""
import os
import sys
import time
import requests

TG_TOKEN = os.environ["TG_TOKEN"]
TG_CHAT_ID = os.environ["TG_CHAT_ID"]
BASE_URL = os.getenv("BASE_URL", "https://api.india.delta.exchange")

COINS = ["BTC", "SOL", "NEAR", "US", "XRP", "RLC", "BZ", "HYPE", "WLD"]
LOWER_TFS = ["3m", "5m"]
TF_SECONDS = {"1m": 60, "3m": 180, "5m": 300, "1h": 3600}

RSI_PERIOD = 14
PIVOT_N = 2
LOOKBACK = 60
# Sirf wahi signal bhejo jo pichle itne seconds mein confirm hua (duplicate rokne ke liye)
FRESH_SECONDS = 330

session = requests.Session()


def tg_send(text):
    r = session.post(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data={"chat_id": TG_CHAT_ID, "text": text},
        timeout=15,
    )
    if r.status_code != 200:
        print("Telegram error:", r.text)


def resolve_symbols():
    r = session.get(f"{BASE_URL}/v2/products", timeout=20)
    r.raise_for_status()
    products = r.json().get("result", [])
    found, missing = {}, []
    for coin in COINS:
        match = None
        for p in products:
            under = (p.get("underlying_asset") or {}).get("symbol", "")
            if (
                under.upper() == coin.upper()
                and p.get("contract_type") == "perpetual_futures"
                and p.get("state", "live") == "live"
            ):
                match = p["symbol"]
                break
        if match:
            found[coin] = match
        else:
            missing.append(coin)
    return found, missing


def get_candles(symbol, tf, count=200):
    now = int(time.time())
    r = session.get(
        f"{BASE_URL}/v2/history/candles",
        params={
            "resolution": tf,
            "symbol": symbol,
            "start": now - TF_SECONDS[tf] * count,
            "end": now,
        },
        timeout=20,
    )
    r.raise_for_status()
    data = r.json().get("result", [])
    data.sort(key=lambda c: c["time"])
    return data


def rsi_series(closes, period=RSI_PERIOD):
    out = [None] * len(closes)
    if len(closes) <= period:
        return out
    g = l = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        g += max(d, 0)
        l += max(-d, 0)
    ag, al = g / period, l / period
    out[period] = 100 - 100 / (1 + ag / al) if al else 100.0
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (period - 1) + max(d, 0)) / period
        al = (al * (period - 1) + max(-d, 0)) / period
        out[i] = 100 - 100 / (1 + ag / al) if al else 100.0
    return out


def pivots(values, n, is_high):
    idx = []
    for i in range(n, len(values) - n):
        w = values[i - n: i + n + 1]
        v = values[i]
        if w.count(v) != 1:
            continue
        if (is_high and v == max(w)) or ((not is_high) and v == min(w)):
            idx.append(i)
    return idx


def is_fresh(candles, pivot_i, tf):
    """Pivot tab confirm hota hai jab uske baad PIVOT_N candles close ho jayein."""
    confirm_close = candles[pivot_i + PIVOT_N]["time"] + TF_SECONDS[tf]
    return 0 <= time.time() - confirm_close <= FRESH_SECONDS


def check_symbol(coin, symbol):
    h1 = get_candles(symbol, "1h", 10)
    cur_hour = int(time.time()) // 3600 * 3600
    prev = [c for c in h1 if c["time"] == cur_hour - 3600]
    if not prev:
        return
    prev_high, prev_low = float(prev[0]["high"]), float(prev[0]["low"])

    for tf in LOWER_TFS:
        candles = get_candles(symbol, tf, 200)[:-1]  # chal rahi candle hata do
        if len(candles) < RSI_PERIOD + LOOKBACK:
            continue
        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        closes = [float(c["close"]) for c in candles]
        rsi = rsi_series(closes)
        last = closes[-1]
        start_i = len(candles) - LOOKBACK

        ph = [i for i in pivots(highs, PIVOT_N, True) if i >= start_i and rsi[i] is not None]
        if len(ph) >= 2:
            p1, p2 = ph[-2], ph[-1]
            if (
                highs[p2] > prev_high
                and highs[p2] > highs[p1]
                and rsi[p2] < rsi[p1]
                and last < prev_high
                and is_fresh(candles, p2, tf)
            ):
                tg_send(
                    f"SELL setup | {coin} ({symbol}) | {tf}\n"
                    f"Price: {last}\n1h High sweep: {prev_high}\n"
                    f"Swing high: {highs[p2]} | RSI {rsi[p1]:.1f} -> {rsi[p2]:.1f}"
                )

        pl = [i for i in pivots(lows, PIVOT_N, False) if i >= start_i and rsi[i] is not None]
        if len(pl) >= 2:
            p1, p2 = pl[-2], pl[-1]
            if (
                lows[p2] < prev_low
                and lows[p2] < lows[p1]
                and rsi[p2] > rsi[p1]
                and last > prev_low
                and is_fresh(candles, p2, tf)
            ):
                tg_send(
                    f"BUY setup | {coin} ({symbol}) | {tf}\n"
                    f"Price: {last}\n1h Low sweep: {prev_low}\n"
                    f"Swing low: {lows[p2]} | RSI {rsi[p1]:.1f} -> {rsi[p2]:.1f}"
                )


def main():
    symbols, missing = resolve_symbols()
    print("Watching:", symbols, "| Missing:", missing)
    if os.getenv("SEND_STARTUP") == "1":
        tg_send("GitHub bot test OK. Watching: " + ", ".join(symbols.values())
                + ("\nNahi mile: " + ", ".join(missing) if missing else ""))
    errors = 0
    for coin, symbol in symbols.items():
        try:
            check_symbol(coin, symbol)
        except Exception as e:
            errors += 1
            print(f"{coin} error:", e)
        time.sleep(0.4)
    if errors == len(symbols):
        sys.exit(1)  # sab fail hue to run red dikhega


if __name__ == "__main__":
    main()
