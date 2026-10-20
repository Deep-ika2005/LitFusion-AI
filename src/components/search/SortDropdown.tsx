"use client";

import { ArrowUpDown } from "lucide-react";
import { selectControlClass } from "@/components/ui/controls";

interface SortDropdownProps {
  value: string;
  onChange: (value: string) => void;
}

const SORT_OPTIONS = [
  { label: "High Priority First", value: "relevance" },
  { label: "Best Match (Hybrid)", value: "best_match" },
  { label: "Highest Quartile", value: "quartile_desc" },
  { label: "Newest First", value: "newest" },
  { label: "Oldest First", value: "oldest" },
  { label: "Most Cited", value: "citations_desc" },
  { label: "Least Cited", value: "citations_asc" },
  { label: "Title A-Z", value: "title_asc" },
  { label: "Title Z-A", value: "title_desc" },
];

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  return (
    <div className="flex items-center gap-2">
      <ArrowUpDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectControlClass}
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
