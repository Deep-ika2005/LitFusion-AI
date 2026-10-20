"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function FilterSection({ title, children, defaultOpen = true }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-5 border-b border-gray-100 pb-5 last:mb-0 last:border-0 last:pb-0">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h4 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">{title}</h4>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-primary-100 py-1 pl-3 pr-2 text-xs font-medium text-primary-700">
      <span className="truncate">{label}</span>
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary-200 hover:text-primary-900">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
