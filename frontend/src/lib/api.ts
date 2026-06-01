const BASE = "/api";

export interface Group {
  id: number;
  name: string;
}

export interface Stock {
  id: number;
  ticker: string;
  name: string;
  industry: string;
  sector: string;
  added_date: string;
  added_price: number;
  currency: string;
  avanza_id: number | null;
  source_notes: string;
  group_id: number | null;
  current_price: number;
  day_change_pct: number | null;
  week_change_pct: number | null;
  month_change_pct: number | null;
  ytd_change_pct: number | null;
  week52_high: number | null;
  week52_low: number | null;
  rsi14: number | null;
  volume: number | null;
  avg_volume_10d: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  ma50: number | null;
  ma200: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  bb_pct: number | null;
  atr14: number | null;
  stoch_k: number | null;
  stoch_d: number | null;
  adx14: number | null;
  adx_plus_di: number | null;
  adx_minus_di: number | null;
  obv_slope: number | null;
  ema9: number | null;
  ema21: number | null;
  yahoo_url: string;
  tradingview_url: string;
  avanza_url: string | null;
}

export interface StockPreview {
  ticker: string;
  name: string;
  industry: string;
  sector: string;
  current_price: number;
  currency: string;
  avanza_id: number | null;
  yahoo_url: string;
  tradingview_url: string;
  avanza_url: string | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const fetchStocks = () => request<Stock[]>("/stocks");

export const analyzeStocks = (tickers: string) =>
  request<Stock[]>(`/stocks/analyze?tickers=${encodeURIComponent(tickers)}`);

export const previewStock = (ticker: string) =>
  request<StockPreview>(`/stocks/preview?ticker=${encodeURIComponent(ticker)}`);

export const addStock = (ticker: string, source_notes: string, group_id?: number | null) =>
  request<Stock>("/stocks", {
    method: "POST",
    body: JSON.stringify({ ticker, source_notes, group_id: group_id ?? null }),
  });

export const deleteStock = (id: number) =>
  request<void>(`/stocks/${id}`, { method: "DELETE" });

export const updateStock = (id: number, data: { group_id: number | null; source_notes: string }) =>
  request<Stock>(`/stocks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const fetchGroups = () => request<Group[]>("/groups");

export const createGroup = (name: string) =>
  request<Group>("/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const deleteGroup = (id: number) =>
  request<void>(`/groups/${id}`, { method: "DELETE" });
