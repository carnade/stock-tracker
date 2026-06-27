import logging
import re
import time
from datetime import date, timedelta
from dataclasses import dataclass

import httpx
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

_price_cache: dict = {}
_CACHE_TTL = 300  # seconds


@dataclass
class StockPreview:
    ticker: str
    name: str
    industry: str
    sector: str
    current_price: float
    currency: str


@dataclass
class AvanzaInfo:
    id: int
    slug: str


@dataclass
class PriceData:
    current: float
    prev_close: float | None
    week_ago: float | None
    month_ago: float | None
    ytd_start: float | None
    week52_high: float | None
    week52_low: float | None
    rsi14: float | None
    volume: int | None
    avg_volume_10d: float | None
    macd_line: float | None
    macd_signal: float | None
    macd_hist: float | None
    ma50: float | None
    ma200: float | None
    bb_upper: float | None
    bb_lower: float | None
    bb_pct: float | None
    atr14: float | None
    stoch_k: float | None
    stoch_d: float | None
    adx14: float | None
    adx_plus_di: float | None
    adx_minus_di: float | None
    obv_slope: float | None
    ema9: float | None
    ema21: float | None
    prev_macd_hist: float | None
    prev_rsi14: float | None
    golden_cross_days: int | None
    death_cross_days: int | None


def lookup_ticker(ticker: str) -> StockPreview:
    """Fetch stock metadata via Yahoo Finance. Raises ValueError for unknown tickers."""
    stock = yf.Ticker(ticker)
    info = stock.info
    name = info.get("shortName") or info.get("longName")
    if not name:
        raise ValueError(f"Ticker '{ticker}' not found on Yahoo Finance")
    price = (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("ask")
        or 0.0
    )
    return StockPreview(
        ticker=ticker,
        name=name,
        industry=info.get("industry") or "",
        sector=info.get("sector") or "",
        current_price=float(price),
        currency=info.get("currency") or "USD",
    )


def _compute_rsi(closes: pd.Series, period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    delta = closes.diff()
    avg_gain = delta.clip(lower=0).tail(period).mean()
    avg_loss = (-delta.clip(upper=0)).tail(period).mean()
    if avg_loss == 0:
        return 100.0
    return round(100 - (100 / (1 + avg_gain / avg_loss)), 2)


def _compute_macd(closes: pd.Series) -> tuple:
    if len(closes) < 26:
        return None, None, None
    ema12 = closes.ewm(span=12, adjust=False).mean()
    ema26 = closes.ewm(span=26, adjust=False).mean()
    line = ema12 - ema26
    signal = line.ewm(span=9, adjust=False).mean()
    hist = line - signal
    return round(float(line.iloc[-1]), 4), round(float(signal.iloc[-1]), 4), round(float(hist.iloc[-1]), 4)


def _compute_bollinger(closes: pd.Series, window: int = 20) -> tuple:
    if len(closes) < window:
        return None, None, None
    sma = float(closes.tail(window).mean())
    std = float(closes.tail(window).std())
    upper = round(sma + 2 * std, 2)
    lower = round(sma - 2 * std, 2)
    current = float(closes.iloc[-1])
    pct = round((current - lower) / (upper - lower) * 100, 1) if upper != lower else None
    return upper, lower, pct


def _compute_atr(hist: pd.DataFrame, period: int = 14) -> float | None:
    if len(hist) < period + 1:
        return None
    prev_close = hist["Close"].shift(1)
    tr = pd.concat([
        hist["High"] - hist["Low"],
        (hist["High"] - prev_close).abs(),
        (hist["Low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    return round(float(tr.tail(period).mean()), 2)


def _compute_stochastic(hist: pd.DataFrame, k_period: int = 14, d_period: int = 3) -> tuple:
    if len(hist) < k_period + d_period:
        return None, None
    low_min  = hist["Low"].rolling(k_period).min()
    high_max = hist["High"].rolling(k_period).max()
    band = high_max - low_min
    k = 100 * (hist["Close"] - low_min) / band.where(band != 0)
    d = k.rolling(d_period).mean()
    k_val, d_val = k.iloc[-1], d.iloc[-1]
    if pd.isna(k_val) or pd.isna(d_val):
        return None, None
    return round(float(k_val), 1), round(float(d_val), 1)


def _compute_adx(hist: pd.DataFrame, period: int = 14) -> tuple:
    if len(hist) < period * 2:
        return None, None, None
    up   = hist["High"].diff()
    down = -hist["Low"].diff()
    plus_dm  = up.where((up > down) & (up > 0), 0.0)
    minus_dm = down.where((down > up) & (down > 0), 0.0)
    prev_close = hist["Close"].shift(1)
    tr = pd.concat([
        hist["High"] - hist["Low"],
        (hist["High"] - prev_close).abs(),
        (hist["Low"]  - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr_s    = tr.ewm(alpha=1 / period, adjust=False).mean()
    plus_di  = 100 * plus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr_s
    minus_di = 100 * minus_dm.ewm(alpha=1 / period, adjust=False).mean() / atr_s
    di_sum   = (plus_di + minus_di).replace(0, float("nan"))
    dx       = 100 * (plus_di - minus_di).abs() / di_sum
    adx      = dx.ewm(alpha=1 / period, adjust=False).mean()
    adx_val, pdi_val, mdi_val = adx.iloc[-1], plus_di.iloc[-1], minus_di.iloc[-1]
    if any(pd.isna(v) for v in [adx_val, pdi_val, mdi_val]):
        return None, None, None
    return round(float(adx_val), 1), round(float(pdi_val), 1), round(float(mdi_val), 1)


def _compute_obv_slope(hist: pd.DataFrame) -> float | None:
    """OBV 10-bar slope normalised to recent average OBV magnitude (positive = accumulation)."""
    if len(hist) < 20 or "Volume" not in hist.columns:
        return None
    direction = hist["Close"].diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
    obv  = (direction * hist["Volume"]).cumsum()
    recent = float(obv.iloc[-1])
    past   = float(obv.iloc[-10])
    avg    = float(obv.abs().tail(20).mean())
    if avg == 0:
        return None
    return round((recent - past) / avg * 100, 1)


def _price_on_or_before(hist: pd.DataFrame, target: date) -> float | None:
    try:
        target_ts = pd.Timestamp(target.isoformat())
        if hist.index.tz is not None:
            target_ts = target_ts.tz_localize(hist.index.tz)
        past = hist[hist.index <= target_ts]
        return float(past["Close"].iloc[-1]) if not past.empty else None
    except Exception:
        return None


def _fetch_intraday_prices(tickers: list[str]) -> dict[str, tuple[float, float | None]]:
    """Batch-fetch 5-day 1-minute bars to get accurate last-traded price and previous session close."""
    if not tickers:
        return {}
    try:
        raw = yf.download(
            tickers,
            period="5d",
            interval="1m",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.warning(f"Intraday download failed: {e}")
        return {}

    result = {}
    for ticker in tickers:
        try:
            hist = raw[ticker].dropna(subset=["Close"]) if len(tickers) > 1 else raw.dropna(subset=["Close"])
            if hist.empty:
                continue
            # Last Close per calendar date, sorted ascending
            by_date = hist.groupby(hist.index.map(lambda x: x.date()))["Close"].last().sort_index()
            if len(by_date) == 0:
                continue
            current   = float(by_date.iloc[-1])
            prev_close = float(by_date.iloc[-2]) if len(by_date) >= 2 else None
            result[ticker] = (current, prev_close)
        except Exception as e:
            logger.warning(f"Intraday parse error for {ticker}: {e}")
    return result


def _detect_ma_cross_days(closes: pd.Series, fast: int = 50, slow: int = 200, lookback: int = 10) -> tuple[int | None, int | None]:
    """Returns (golden_cross_days, death_cross_days) — days since each cross within lookback, else None."""
    if len(closes) < slow + lookback + 1:
        return None, None
    ma_fast = closes.rolling(fast).mean()
    ma_slow = closes.rolling(slow).mean()
    diff = (ma_fast - ma_slow).dropna()
    recent = diff.tail(lookback + 1)
    if len(recent) < 2:
        return None, None
    golden_days: int | None = None
    death_days:  int | None = None
    n = len(recent)
    for i in range(1, n):
        prev_d, curr_d = recent.iloc[i - 1], recent.iloc[i]
        days_ago = n - 1 - i
        if prev_d < 0 and curr_d >= 0 and golden_days is None:
            golden_days = days_ago
        elif prev_d > 0 and curr_d <= 0 and death_days is None:
            death_days = days_ago
    return golden_days, death_days


def get_all_price_histories(tickers: list[str]) -> dict[str, PriceData]:
    """Batch-fetch 1-year price history, with a 5-minute in-memory cache."""
    if not tickers:
        return {}

    now = time.monotonic()
    today = date.today()
    empty = PriceData(current=0.0, prev_close=None, week_ago=None, month_ago=None, ytd_start=None,
                      week52_high=None, week52_low=None, rsi14=None, volume=None, avg_volume_10d=None,
                      macd_line=None, macd_signal=None, macd_hist=None, ma50=None, ma200=None,
                      bb_upper=None, bb_lower=None, bb_pct=None, atr14=None,
                      stoch_k=None, stoch_d=None, adx14=None, adx_plus_di=None, adx_minus_di=None,
                      obv_slope=None, ema9=None, ema21=None,
                      prev_macd_hist=None, prev_rsi14=None,
                      golden_cross_days=None, death_cross_days=None)

    # Serve from cache where possible
    cached: dict[str, PriceData] = {}
    stale: list[str] = []
    for t in tickers:
        entry = _price_cache.get(t)
        if entry and now - entry[0] < _CACHE_TTL:
            cached[t] = entry[1]
        else:
            stale.append(t)

    if not stale:
        return cached

    # Batch-download only the stale tickers
    try:
        raw = yf.download(
            stale,
            period="1y",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.error(f"Batch download failed: {e}")
        return {**cached, **{t: empty for t in stale}}

    # Second pass: accurate current price + prev close from intraday bars
    intraday_prices = _fetch_intraday_prices(stale)

    fetched: dict[str, PriceData] = {}
    for ticker in stale:
        try:
            hist = raw[ticker].dropna(subset=["Close"])
            if hist.empty:
                fetched[ticker] = empty
                continue
            intraday = intraday_prices.get(ticker)
            current = intraday[0] if intraday else float(hist["Close"].iloc[-1])

            try:
                rsi14 = _compute_rsi(hist["Close"])
            except Exception as e:
                logger.warning(f"RSI error for {ticker}: {e}")
                rsi14 = None

            volume = None
            avg_volume_10d = None
            if "Volume" in hist.columns:
                try:
                    vol = hist["Volume"].dropna()
                    if not vol.empty:
                        volume = int(vol.iloc[-1])
                        if len(vol) >= 10:
                            avg_volume_10d = float(vol.tail(10).mean())
                except Exception as e:
                    logger.warning(f"Volume error for {ticker}: {e}")

            try:
                macd_line, macd_signal, macd_hist = _compute_macd(hist["Close"])
            except Exception as e:
                logger.warning(f"MACD error for {ticker}: {e}")
                macd_line = macd_signal = macd_hist = None

            try:
                bb_upper, bb_lower, bb_pct = _compute_bollinger(hist["Close"])
            except Exception as e:
                logger.warning(f"Bollinger error for {ticker}: {e}")
                bb_upper = bb_lower = bb_pct = None

            try:
                atr14 = _compute_atr(hist)
            except Exception as e:
                logger.warning(f"ATR error for {ticker}: {e}")
                atr14 = None

            ma50 = round(float(hist["Close"].tail(50).mean()), 2) if len(hist) >= 50 else None
            ma200 = round(float(hist["Close"].tail(200).mean()), 2) if len(hist) >= 200 else None

            prev_close = intraday[1] if intraday else (float(hist["Close"].iloc[-2]) if len(hist) >= 2 else None)

            try:
                stoch_k, stoch_d = _compute_stochastic(hist)
            except Exception as e:
                logger.warning(f"Stochastic error for {ticker}: {e}")
                stoch_k = stoch_d = None

            try:
                adx14, adx_plus_di, adx_minus_di = _compute_adx(hist)
            except Exception as e:
                logger.warning(f"ADX error for {ticker}: {e}")
                adx14 = adx_plus_di = adx_minus_di = None

            try:
                obv_slope = _compute_obv_slope(hist)
            except Exception as e:
                logger.warning(f"OBV error for {ticker}: {e}")
                obv_slope = None

            try:
                ema9  = round(float(hist["Close"].ewm(span=9,  adjust=False).mean().iloc[-1]), 2) if len(hist) >= 9  else None
                ema21 = round(float(hist["Close"].ewm(span=21, adjust=False).mean().iloc[-1]), 2) if len(hist) >= 21 else None
            except Exception as e:
                logger.warning(f"EMA error for {ticker}: {e}")
                ema9 = ema21 = None

            try:
                prev_macd_hist = _compute_macd(hist["Close"].iloc[:-1])[2] if len(hist) > 1 else None
                prev_rsi14_val = _compute_rsi(hist["Close"].iloc[:-1]) if len(hist) > 1 else None
                prev_rsi14 = round(prev_rsi14_val, 1) if prev_rsi14_val is not None else None
            except Exception:
                prev_macd_hist = prev_rsi14 = None

            try:
                golden_cross_days, death_cross_days = _detect_ma_cross_days(hist["Close"])
            except Exception:
                golden_cross_days = death_cross_days = None

            data = PriceData(
                current=current,
                prev_close=prev_close,
                week_ago=_price_on_or_before(hist, today - timedelta(days=7)),
                month_ago=_price_on_or_before(hist, today - timedelta(days=30)),
                ytd_start=_price_on_or_before(hist, date(today.year, 1, 1)),
                week52_high=float(hist["High"].max()),
                week52_low=float(hist["Low"].min()),
                rsi14=rsi14,
                volume=volume,
                avg_volume_10d=avg_volume_10d,
                macd_line=macd_line,
                macd_signal=macd_signal,
                macd_hist=macd_hist,
                ma50=ma50,
                ma200=ma200,
                bb_upper=bb_upper,
                bb_lower=bb_lower,
                bb_pct=bb_pct,
                atr14=atr14,
                stoch_k=stoch_k,
                stoch_d=stoch_d,
                adx14=adx14,
                adx_plus_di=adx_plus_di,
                adx_minus_di=adx_minus_di,
                obv_slope=obv_slope,
                ema9=ema9,
                ema21=ema21,
                prev_macd_hist=prev_macd_hist,
                prev_rsi14=prev_rsi14,
                golden_cross_days=golden_cross_days,
                death_cross_days=death_cross_days,
            )
            fetched[ticker] = data
            _price_cache[ticker] = (now, data)
        except Exception as e:
            logger.warning(f"Price parse error for {ticker}: {e}")
            fetched[ticker] = empty

    return {**cached, **fetched}


async def resolve_avanza(ticker: str) -> AvanzaInfo | None:
    """Resolve Avanza orderBookId and URL slug via their search API."""
    query = ticker.split(".")[0].replace("-", " ")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(
                "https://www.avanza.se/_api/search/filtered-search",
                json={"query": query, "instrumentTypes": ["STOCK"], "limit": 5},
                headers={"User-Agent": "Mozilla/5.0 (compatible; StockTracker/1.0)"},
            )
            if r.status_code == 200:
                data = r.json()
                hits = data.get("hits") or []
                if hits:
                    first = hits[0]
                    order_book_id = first.get("orderBookId")
                    slug = first.get("urlSlugName") or ""
                    if order_book_id:
                        return AvanzaInfo(id=int(order_book_id), slug=slug)
    except Exception as e:
        logger.debug(f"Avanza lookup failed for {ticker}: {e}")
    return None


def build_avanza_url(avanza_id: int, slug: str) -> str:
    return f"https://www.avanza.se/aktier/om-aktien.html/{avanza_id}/{slug}"


def build_links(ticker: str, avanza_id: int | None, avanza_slug: str | None) -> dict:
    root = ticker.split(".")[0]
    return {
        "yahoo_url": f"https://finance.yahoo.com/quote/{ticker}",
        "tradingview_url": f"https://www.tradingview.com/chart/?symbol={root}",
        "avanza_url": build_avanza_url(avanza_id, avanza_slug or "") if avanza_id else None,
    }


def pct_change(current: float, past: float | None) -> float | None:
    if past is not None and past != 0:
        return round(((current - past) / past) * 100, 2)
    return None
