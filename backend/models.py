from datetime import date
from sqlmodel import Field, SQLModel


class StockGroup(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)


class Stock(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True)
    name: str
    industry: str = ""
    sector: str = ""
    added_date: date
    added_price: float
    currency: str = "USD"
    avanza_id: int | None = None
    avanza_slug: str | None = None
    source_notes: str = ""
    owned: bool = Field(default=False)
    group_id: int | None = Field(default=None, foreign_key="stockgroup.id")
