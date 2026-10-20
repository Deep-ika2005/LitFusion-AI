"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { GitCompare, ArrowLeft, Search } from "lucide-react";
import { CompareTable } from "@/components/papers/CompareTable";
import { CompareAnalysis } from "@/components/papers/CompareAnalysis";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Paper } from "@/types";

export default function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ idsKey: string; papers: Paper[] } | null>(null);

  const idsKey = searchParams.get("ids")?.split(",").filter(Boolean).join(",") ?? "";
  const hasIds = idsKey.length > 0;
  const isLoading = hasIds && loaded?.idsKey !== idsKey;
  const papers = hasIds ? (loaded?.idsKey === idsKey ? loaded.papers : []) : [];

  useEffect(() => {
    if (!hasIds) return;

    let cancelled = false;

    async function fetchPapers() {
      const fetched: Paper[] = [];
      for (const id of idsKey.split(",")) {
        try {
          const res = await fetch(`/api/papers/${id}`);
          if (res.ok) {
            const paper = await res.json();
            fetched.push(paper);
          }
        } catch (e) {
          console.error(`Failed to fetch paper ${id}:`, e);
        }
      }
      if (cancelled) return;
      setLoaded({ idsKey, papers: fetched });
    }

    fetchPapers();
    return () => {
      cancelled = true;
    };
  }, [hasIds, idsKey]);

  const handleRemove = useCallback((paperId: string) => {
    setLoaded((prev) =>
      prev ? { ...prev, papers: prev.papers.filter((p) => p.id !== paperId) } : prev
    );
  }, []);

  return (
    <div className="min-h-full bg-gray-50/50">
      <PageContainer className="py-6 sm:py-8">
        <PageHeader
          icon={GitCompare}
          title="Compare Papers"
          description={
            papers.length > 0
              ? `Comparing ${papers.length} paper${papers.length > 1 ? "s" : ""}`
              : "Select papers to compare side by side"
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : papers.length === 0 ? (
          <EmptyState
            icon={GitCompare}
            title="No papers selected for comparison"
            description='Search for papers and use the "Compare" button or checkboxes to select papers for side-by-side comparison.'
            action={
              <Link
                href="/search"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                <Search className="h-4 w-4" />
                Search Papers
              </Link>
            }
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <CompareTable papers={papers} onRemove={handleRemove} />
            </div>
            {papers.length >= 2 && <CompareAnalysis paperIds={papers.map((p) => p.id)} />}
          </>
        )}

        {papers.length > 0 && papers.length < 5 && (
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/search")}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Add more papers to compare
            </button>
          </div>
        )}
      </PageContainer>
    </div>
  );
}