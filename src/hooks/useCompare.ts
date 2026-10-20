"use client";

import { useState, useCallback } from "react";
import type { Paper } from "@/types";

const MAX_PAPERS = 5;

export function useCompare() {
  const [selected, setSelected] = useState<Paper[]>([]);

  const toggleSelect = useCallback((paper: Paper) => {
    setSelected((prev) => {
      const exists = prev.find((p) => p.id === paper.id);
      if (exists) return prev.filter((p) => p.id !== paper.id);
      if (prev.length >= MAX_PAPERS) return prev;
      return [...prev, paper];
    });
  }, []);

  const clearSelection = useCallback(() => setSelected([]), []);

  const isSelected = useCallback(
    (paperId: string) => selected.some((p) => p.id === paperId),
    [selected]
  );

  return {
    selected,
    toggleSelect,
    clearSelection,
    isSelected,
    canAdd: selected.length < MAX_PAPERS,
    count: selected.length,
  };
}