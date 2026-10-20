"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BookOpen, Trash2, Search } from "lucide-react";
import { PaperCard } from "@/components/search/PaperCard";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Paper } from "@/types";

interface SavedPaperEntry {
  id: string;
  paper_id: string;
  paper_data: Paper;
  created_at: string;
}

export default function SavedPage() {
  const [papers, setPapers] = useState<SavedPaperEntry[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const { status } = useSession();

  // `loadedFor` gates the visible list so a previous account's papers are
  // never shown after sign-out/sign-in without a full remount.
  const isLoading = papers === null || loadedFor !== status;

  useEffect(() => {
    // Wait for the session to resolve, then (re)load. Refetching on `status`
    // changes covers sign-out/sign-in: the previous fetch may have run under
    // a different account (or none), so the list must not be stuck showing
    // that stale result.
    if (status === "loading") return;
    let cancelled = false;

    async function loadSavedPapers() {
      try {
        const res = await fetch("/api/papers/saved-list");
        const data = res.ok ? await res.json() : null;
        if (!cancelled) {
          setPapers(data?.papers || []);
          setLoadedFor(status);
        }
      } catch (e) {
        console.error("Failed to fetch saved papers:", e);
        if (!cancelled) {
          setPapers([]);
          setLoadedFor(status);
        }
      }
    }

    loadSavedPapers();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const handleUnsave = useCallback(async (paperId: string) => {
    try {
      const res = await fetch("/api/papers/unsave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperId }),
      });
      if (res.ok) {
        setPapers((prev) => (prev ? prev.filter((p) => p.paper_id !== paperId) : prev));
      }
    } catch (e) {
      console.error("Failed to unsave:", e);
    }
  }, []);

  const savedPapers = loadedFor === status ? (papers ?? []) : [];

  return (
    <div className="min-h-full bg-gray-50/50">
      <PageContainer size="content" className="py-6 sm:py-8">
        <PageHeader
          icon={BookOpen}
          title="My Library"
          description={`${savedPapers.length} saved paper${savedPapers.length !== 1 ? "s" : ""}`}
        />

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="space-y-3">
                  <div className="h-5 w-3/4 rounded animate-shimmer" />
                  <div className="h-4 w-1/2 rounded animate-shimmer" />
                  <div className="h-3 w-full rounded animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : savedPapers.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No saved papers yet"
            description="Start searching for research papers and save them to your library for quick access later."
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
          <div className="space-y-4">
            {savedPapers.map((entry) => (
              <div key={entry.id} className="relative">
                <PaperCard paper={entry.paper_data} className="pr-12" />
                <button
                  onClick={() => handleUnsave(entry.paper_id)}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Remove from library"
                  aria-label={`Remove ${entry.paper_data.title} from library`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}