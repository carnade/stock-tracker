"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const path = usePathname();
  return (
    <nav className="bg-bg border-b border-border px-8 py-4 flex items-center gap-8">
      <span className="text-[10px] tracking-[0.3em] text-muted/50 uppercase font-mono select-none">
        Stock Tracker
      </span>
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className={`text-[11px] tracking-[0.25em] font-mono uppercase transition-colors ${
            path === "/" ? "text-accent" : "text-muted hover:text-[#c8c4bc]"
          }`}
        >
          Portfolio
        </Link>
        <Link
          href="/analysis"
          className={`text-[11px] tracking-[0.25em] font-mono uppercase transition-colors ${
            path === "/analysis" ? "text-accent" : "text-muted hover:text-[#c8c4bc]"
          }`}
        >
          Analysis
        </Link>
        <Link
          href="/signals"
          className={`text-[11px] tracking-[0.25em] font-mono uppercase transition-colors ${
            path === "/signals" ? "text-accent" : "text-muted hover:text-[#c8c4bc]"
          }`}
        >
          Signals
        </Link>
      </div>
    </nav>
  );
}
