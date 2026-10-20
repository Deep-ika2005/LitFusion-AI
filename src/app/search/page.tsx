"use client";

import { Suspense } from "react";
import { SearchResults } from "@/components/search/SearchResults";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" /></div>}>
      <SearchResults />
    </Suspense>
  );
}
