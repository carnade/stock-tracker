from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import Session, select

from database import create_db, get_session
from models import Stock, StockGroup
from stock_service import (
    build_links,
    get_all_price_histories,
    lookup_ticker,
    pct_change,
    resolve_avanza,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db()
    yield


app = FastAPI(title="Stock Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── request models ────────────────────────────────────────────────────

class AddStockRequest(BaseModel):
    ticker: str
    source_notes: str = ""
    group_id: int | None = None


class GroupRequest(BaseModel):
    name: str


class UpdateStockRequest(BaseModel):
    group_id: int | None = None
    source_notes: str = ""


# ── groups ────────────────────────────────────────────────────────────

@app.get("/groups")
def list_groups(session: Session = Depends(get_session)):
    return session.exec(select(StockGroup)).all()


@app.post("/groups", status_code=201)
def create_group(req: GroupRequest, session: Session = Depends(get_session)):
    if session.exec(select(StockGroup).where(StockGroup.name == req.name)).first():
        raise HTTPException(status_code=409, detail=f"Group '{req.name}' already exists")
    group = StockGroup(name=req.name)
    session.add(group)
    session.commit()
    session.refresh(group)
    return group


@app.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: int, session: Session = Depends(get_session)):
    group = session.get(StockGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if session.exec(select(Stock).where(Stock.group_id == group_id)).first():
        raise HTTPException(status_code=409, detail="Cannot delete a group that still has stocks")
    session.delete(group)
    session.commit()


# ── stocks ────────────────────────────────────────────────────────────

@app.get("/stocks")
def list_stocks(session: Session = Depends(get_session)):
    stocks = session.exec(select(Stock)).all()
    if not stocks:
        return []

    tickers = [s.ticker for s in stocks]
    prices = get_all_price_histories(tickers)

    result = []
    for stock in stocks:
        p = prices.get(stock.ticker)
        current = p.current if p else 0.0
        links = build_links(stock.ticker, stock.avanza_id, stock.avanza_slug)
        result.append(
            {
                **stock.model_dump(),
                "current_price": current,
                "week_change_pct": pct_change(current, p.week_ago) if p else None,
                "month_change_pct": pct_change(current, p.month_ago) if p else None,
                "ytd_change_pct": pct_change(current, p.ytd_start) if p else None,
                "week52_high": round(p.week52_high, 2) if p and p.week52_high else None,
                "week52_low": round(p.week52_low, 2) if p and p.week52_low else None,
                "rsi14": round(p.rsi14, 1) if p and p.rsi14 is not None else None,
                "volume": p.volume if p else None,
                "avg_volume_10d": round(p.avg_volume_10d) if p and p.avg_volume_10d else None,
                "macd_line": p.macd_line if p else None,
                "macd_signal": p.macd_signal if p else None,
                "macd_hist": p.macd_hist if p else None,
                "ma50": p.ma50 if p else None,
                "ma200": p.ma200 if p else None,
                "bb_upper": p.bb_upper if p else None,
                "bb_lower": p.bb_lower if p else None,
                "bb_pct": p.bb_pct if p else None,
                "atr14": p.atr14 if p else None,
                **links,
            }
        )
    return result


@app.get("/stocks/preview")
async def preview_stock(ticker: str):
    ticker = ticker.upper().strip()
    try:
        info = lookup_ticker(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    avanza = await resolve_avanza(ticker)
    links = build_links(ticker, avanza.id if avanza else None, avanza.slug if avanza else None)

    return {
        "ticker": info.ticker,
        "name": info.name,
        "industry": info.industry,
        "sector": info.sector,
        "current_price": info.current_price,
        "currency": info.currency,
        "avanza_id": avanza.id if avanza else None,
        **links,
    }


@app.post("/stocks", status_code=201)
async def add_stock(req: AddStockRequest, session: Session = Depends(get_session)):
    ticker = req.ticker.upper().strip()

    if session.exec(select(Stock).where(Stock.ticker == ticker)).first():
        raise HTTPException(status_code=409, detail=f"{ticker} is already tracked")

    try:
        info = lookup_ticker(ticker)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    avanza = await resolve_avanza(ticker)

    stock = Stock(
        ticker=ticker,
        name=info.name,
        industry=info.industry,
        sector=info.sector,
        added_date=date.today(),
        added_price=info.current_price,
        currency=info.currency,
        avanza_id=avanza.id if avanza else None,
        avanza_slug=avanza.slug if avanza else None,
        source_notes=req.source_notes,
        group_id=req.group_id,
    )
    session.add(stock)
    session.commit()
    session.refresh(stock)
    return stock


@app.patch("/stocks/{stock_id}")
def update_stock(stock_id: int, req: UpdateStockRequest, session: Session = Depends(get_session)):
    stock = session.get(Stock, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    stock.group_id = req.group_id
    stock.source_notes = req.source_notes
    session.add(stock)
    session.commit()
    session.refresh(stock)
    return stock


@app.delete("/stocks/{stock_id}", status_code=204)
def delete_stock(stock_id: int, session: Session = Depends(get_session)):
    stock = session.get(Stock, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")
    session.delete(stock)
    session.commit()
