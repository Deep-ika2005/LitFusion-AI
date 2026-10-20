"use client";

import { selectControlClass } from "@/components/ui/controls";

interface ResultCountSelectorProps {
  value: number;
  onChange: (value: number) => void;
}

const OPTIONS = [
  { label: "10", value: 10 },
  { label: "25", value: 25 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
  { label: "200", value: 200 },
  { label: "500", value: 500 },
];

export function ResultCountSelector({ value, onChange }: ResultCountSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">Show</span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className={selectControlClass}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span className="text-sm text-gray-500">results</span>
    </div>
  );
}
