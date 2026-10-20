"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, BookOpen, GitCompare, X } from "lucide-react";
import { AuthButtons } from "@/components/auth/AuthButtons";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search Papers", icon: Search },
  { href: "/saved", label: "My Library", icon: BookOpen },
  { href: "/compare", label: "Compare", icon: GitCompare },
];

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-fadeIn flex-col bg-navy-900 shadow-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-navy-700 px-5 py-4">
          <span className="text-sm font-bold text-white">Menu</span>
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-navy-300 transition-colors hover:bg-navy-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
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
      </div>
    </div>
  );
}