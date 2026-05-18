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


def _price_on_or_before(hist: pd.DataFrame, target: date) -> float | None:
    try:
        target_ts = pd.Timestamp(target.isoformat())
        if hist.index.tz is not None:
            target_ts = target_ts.tz_localize(hist.index.tz)
        past = hist[hist.index <= target_ts]
        return float(past["Close"].iloc[-1]) if not past.empty else None
    except Exception:
        return None


def get_all_price_histories(tickers: list[str]) -> dict[str, PriceData]:
    """Batch-fetch 1-year price history, with a 5-minute in-memory cache."""
    if not tickers:
        return {}

    now = time.monotonic()
    today = date.today()
    empty = PriceData(current=0.0, week_ago=None, month_ago=None, ytd_start=None,
                      week52_high=None, week52_low=None, rsi14=None, volume=None, avg_volume_10d=None,
                      macd_line=None, macd_signal=None, macd_hist=None, ma50=None, ma200=None,
                      bb_upper=None, bb_lower=None, bb_pct=None, atr14=None)

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

    fetched: dict[str, PriceData] = {}
    for ticker in stale:
        try:
            hist = raw[ticker].dropna(subset=["Close"])
            if hist.empty:
                fetched[ticker] = empty
                continue
            current = float(hist["Close"].iloc[-1])

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

            data = PriceData(
                current=current,
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
