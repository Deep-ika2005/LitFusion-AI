"use client";

import Link from "next/link";
import { Menu, Search, Sparkles } from "lucide-react";

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

export function MobileHeader({ onMenuToggle }: MobileHeaderProps) {
  return (
    <div className="flex h-14 flex-shrink-0 items-center gap-3 bg-navy-900 px-4 md:hidden">
      <button
        onClick={onMenuToggle}
        aria-label="Open navigation menu"
        className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="truncate text-sm font-bold text-white">LitFusion AI</span>
      </div>
      <Link
        href="/search"
        aria-label="Search papers"
        className="-mr-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-navy-200 transition-colors hover:bg-navy-800 hover:text-white"
      >
        <Search className="h-5 w-5" />
      </Link>
    </div>
  );
}
