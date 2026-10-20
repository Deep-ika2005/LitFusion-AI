"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, BookOpen, GitCompare, Home, Sparkles } from "lucide-react";
import { AuthButtons } from "@/components/auth/AuthButtons";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search Papers", icon: Search },
  { href: "/saved", label: "My Library", icon: BookOpen },
  { href: "/compare", label: "Compare", icon: GitCompare },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-64 flex-shrink-0 flex-col bg-navy-900 text-white md:flex">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-navy-700 px-6 py-5">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight">LitFusion</h1>
          <p className="truncate text-xs text-navy-300">AI Research Platform</p>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-navy-200 hover:bg-navy-800 hover:text-white"
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-navy-700 px-3 py-4">
        <AuthButtons />
      </div>
    </aside>
  );
}