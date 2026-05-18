import { Stock } from "@/lib/api";

export default function StockLinks({ stock }: { stock: Stock }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted font-mono">
      <a
        href={stock.yahoo_url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ticker transition-colors"
        title="Yahoo Finance"
      >
        YF
      </a>
      <a
        href={stock.tradingview_url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ticker transition-colors"
        title="TradingView"
      >
        TV
      </a>
      {stock.avanza_url && (
        <a
          href={stock.avanza_url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ticker transition-colors"
          title="Avanza"
        >
          AV
        </a>
      )}
    </div>
  );
}
