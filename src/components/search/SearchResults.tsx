"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useSearch } from "@/hooks/useSearch";
import { SearchBar, type SearchBarFilters } from "./SearchBar";
import { PaperCard } from "./PaperCard";
import { ActiveFilters } from "./ActiveFilters";
import { ResultCountSelector } from "./ResultCountSelector";
import { SortDropdown } from "./SortDropdown";
import { RightPanel } from "./RightPanel";
import { FilterSidebar } from "@/components/filters/FilterSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SearchResultsSkeleton } from "@/components/ui/Skeleton";
import { FileSearch, AlertCircle, GitCompare, X, Info, ShieldQuestion } from "lucide-react";
import type { Paper } from "@/types";

export function SearchResults() {
  const router = useRouter();
  const { searchState, result, updateSearch, setPage, clearFilters } = useSearch();
  const { results, totalResults, totalPages, facets, isLoading, error, scannedCandidates, hasMoreResults, upstreamTotal, scopusVerification } = result;
  const [selectedForCompare, setSelectedForCompare] = useState<Paper[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  /** In-flight save/unsave guard so rapid double-clicks can never create duplicates. */
  const pendingSaveRef = useRef<Set<string>>(new Set());

  // Reflect the library state on the visible results. Merges (never wipes) so
  // paging back and forth keeps every known saved id.
  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;
    const ids = results.map((p) => p.id).join(",");
    fetch(`/api/papers/saved-status?ids=${encodeURIComponent(ids)}`)
      .then((res) => (res.ok ? res.json() : { saved: [] }))
      .then((data: { saved?: string[] }) => {
        if (cancelled || !Array.isArray(data.saved)) return;
        setSavedIds((prev) => new Set([...prev, ...data.saved!]));
      })
      .catch(() => {
        // Library state is a progressive enhancement; search must work without it.
      });
    return () => {
      cancelled = true;
    };
  }, [results]);

  const handleSearch = useCallback((query: string) => {
    updateSearch({ query });
  }, [updateSearch]);

  const handleFiltersChange = useCallback((next: SearchBarFilters) => {
    updateSearch({
      publisher: next.publisher,
      publisherQuery: next.publisherQuery ?? "",
      scopusOnly: next.scopusOnly,
      publishedOnly: next.publishedOnly,
    });
  }, [updateSearch]);

  const handleToggleSave = useCallback(async (paper: Paper) => {
    if (pendingSaveRef.current.has(paper.id)) return;
    pendingSaveRef.current.add(paper.id);
    const wasSaved = savedIds.has(paper.id);
    // Immediate UI update; rolled back below if the request fails.
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(paper.id);
      else next.add(paper.id);
      return next;
    });
    try {
      const res = await fetch(wasSaved ? "/api/papers/unsave" : "/api/papers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          wasSaved ? { paperId: paper.id } : { paperId: paper.id, paperData: paper }
        ),
      });
      if (res.status === 401) {
        router.push("/login");
      } else if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          hint?: string;
        } | null;
        const detail = body?.error ? `: ${body.error}` : "";
        const hint = body?.hint ? ` — ${body.hint}` : "";
        throw new Error(`Save toggle failed (HTTP ${res.status})${detail}${hint}`);
      } else {
        return;
      }
    } catch (e) {
      console.error("Save toggle failed:", e);
    } finally {
      pendingSaveRef.current.delete(paper.id);
    }
    // Request failed or user is logged out — revert the optimistic update.
    // (Server-side duplicates are additionally impossible: save upserts on
    // user_id + paper_id.)
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.add(paper.id);
      else next.delete(paper.id);
      return next;
    });
  }, [router, savedIds]);

  const handleToggleCompare = useCallback((paper: Paper) => {
    setSelectedForCompare((prev) => {
      const exists = prev.find((p) => p.id === paper.id);
      if (exists) return prev.filter((p) => p.id !== paper.id);
      if (prev.length >= 5) return prev;
      return [...prev, paper];
    });
  }, []);

  const handleGoToCompare = useCallback(() => {
    const ids = selectedForCompare.map((p) => p.id).join(",");
    router.push(`/compare?ids=${ids}`);
  }, [selectedForCompare, router]);

  const isSelectedForCompare = useCallback(
    (paperId: string) => selectedForCompare.some((p) => p.id === paperId),
    [selectedForCompare]
  );

  const startResult = (searchState.page - 1) * searchState.perPage + 1;
  const endResult = Math.min(searchState.page * searchState.perPage, totalResults);
  const usesVerificationFilters =
    searchState.publisher !== "all" ||
    (searchState.publisherQuery?.trim() ?? "") !== "" ||
    searchState.scopusOnly ||
    searchState.publishedOnly ||
    searchState.quartiles.length > 0;

  const scopusUnavailable = searchState.scopusOnly && scopusVerification && !scopusVerification.isAvailable;
  const showRightPanel = Boolean(searchState.query && !isLoading && totalResults > 0);

  return (
    <div className="flex min-h-full flex-col bg-gray-50/50">
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur-md">
        <PageContainer className="py-3 sm:py-4">
          <div className="mx-auto w-full max-w-3xl">
            <SearchBar
              initialQuery={searchState.query}
              onSearch={handleSearch}
              isLoading={isLoading}
              filters={{
                publisher: searchState.publisher,
                publisherQuery: searchState.publisherQuery,
                scopusOnly: searchState.scopusOnly,
                publishedOnly: searchState.publishedOnly,
              }}
              onFiltersChange={handleFiltersChange}
            />
          </div>
        </PageContainer>
      </div>

      <PageContainer className="flex-1 py-6 sm:py-8">
        {showRightPanel && (
          <PageHeader
            title="Search Results"
            description={
              <>
                Found{" "}
                <span className="font-semibold text-gray-700">{totalResults.toLocaleString()}</span>{" "}
                {usesVerificationFilters ? "verified matching" : "research"} papers for{" "}
                <span className="font-semibold text-primary-600">&ldquo;{searchState.query}&rdquo;</span>
                {totalResults > searchState.perPage && (
                  <span className="ml-1">
                    — Showing <span className="font-medium">{startResult}–{endResult.toLocaleString()}</span> of{" "}
                    {totalResults.toLocaleString()}
                  </span>
                )}
                {usesVerificationFilters && (
                  <span className="mt-1 block text-xs text-gray-400">
                    {scannedCandidates.toLocaleString()} candidate records were inspected and verified before these{" "}
                    {totalResults.toLocaleString()} matches were produced.
                    {typeof upstreamTotal === "number" && upstreamTotal > 0 && (
                      <> The upstream index reports {upstreamTotal.toLocaleString()} matches for this query.</>
                    )}
                    {hasMoreResults && " More verified matches may exist beyond the inspected window — use Next to keep paging."}
                  </span>
                )}
              </>
            }
          />
        )}

        {scopusUnavailable && (
          <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <ShieldQuestion className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">Scopus verification is not configured.</span>{" "}
              {scopusVerification?.detail} Set <code className="rounded bg-amber-100 px-1">SCOPUS_API_KEY</code> or run{" "}
              <code className="rounded bg-amber-100 px-1">npm run scopus:registry -- &lt;export.csv&gt;</code> to verify coverage.
              Papers are never marked as Scopus Indexed without a verification source.
            </p>
          </div>
        )}

        <ActiveFilters
          types={searchState.types}
          accessType={searchState.accessType}
          yearFrom={searchState.yearFrom}
          yearTo={searchState.yearTo}
          minCitations={searchState.minCitations}
          publisher={searchState.publisher}
          publisherQuery={searchState.publisherQuery}
          scopusOnly={searchState.scopusOnly}
          publishedOnly={searchState.publishedOnly}
          quartiles={searchState.quartiles}
          onRemoveType={(type) => updateSearch({ types: searchState.types.filter((t) => t !== type) })}
          onRemoveAccess={() => updateSearch({ accessType: "all" })}
          onRemoveYear={() => updateSearch({ yearFrom: null, yearTo: null })}
          onRemoveCitations={() => updateSearch({ minCitations: null })}
          onRemovePublisher={() => updateSearch({ publisher: "all", publisherQuery: "" })}
          onRemoveScopus={() => updateSearch({ scopusOnly: false })}
          onRemovePublished={() => updateSearch({ publishedOnly: false })}
          onRemoveQuartile={(q) => updateSearch({ quartiles: searchState.quartiles.filter((v) => v !== q) })}
          onClearAll={clearFilters}
        />

        <div
          className={clsx(
            "grid items-start gap-x-6 gap-y-6",
            showRightPanel ? "2xl:grid-cols-[17.5rem_minmax(0,1fr)_16rem] lg:grid-cols-[17.5rem_minmax(0,1fr)]" : "lg:grid-cols-[17.5rem_minmax(0,1fr)]"
          )}
        >
          <FilterSidebar
            facets={facets}
            selectedTypes={searchState.types}
            selectedAccess={searchState.accessType}
            selectedYearFrom={searchState.yearFrom}
            selectedYearTo={searchState.yearTo}
            selectedMinCitations={searchState.minCitations}
            selectedPublisher={searchState.publisher}
            selectedPublisherQuery={searchState.publisherQuery}
            scopusOnly={searchState.scopusOnly}
            publishedOnly={searchState.publishedOnly}
            selectedQuartiles={searchState.quartiles}
            onTypeChange={(types) => updateSearch({ types })}
            onAccessChange={(accessType) => updateSearch({ accessType })}
            onYearChange={(yearFrom, yearTo) => updateSearch({ yearFrom, yearTo })}
            onCitationChange={(minCitations) => updateSearch({ minCitations })}
            onPublisherChange={(publisher, publisherQuery) =>
              updateSearch({
                publisher,
                ...(publisherQuery !== undefined ? { publisherQuery } : {}),
                ...((publisher !== "other" || publisherQuery === undefined) && publisher !== searchState.publisher
                  ? { publisherQuery: "" }
                  : {}),
              })
            }
            onScopusOnlyChange={(scopusOnly) => updateSearch({ scopusOnly })}
            onPublishedOnlyChange={(publishedOnly) => updateSearch({ publishedOnly })}
            onQuartileChange={(quartiles) => updateSearch({ quartiles })}
            onClearAll={clearFilters}
          />

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <ResultCountSelector
                value={searchState.perPage}
                onChange={(perPage) => updateSearch({ perPage })}
              />
              <SortDropdown
                value={searchState.sort}
                onChange={(sort) => updateSearch({ sort })}
              />
            </div>

            {isLoading ? (
              <SearchResultsSkeleton />
            ) : error ? (
              <EmptyState
                tone="danger"
                icon={AlertCircle}
                title="Search Error"
                description={error}
                action={
                  <button
                    onClick={() => handleSearch(searchState.query)}
                    className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                  >
                    Try Again
                  </button>
                }
              />
            ) : !searchState.query ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-14 text-center sm:py-16">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-100">
                  <FileSearch className="h-10 w-10 text-primary-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Discover Research Papers</h2>
                <p className="mt-2 mb-6 max-w-md text-sm leading-relaxed text-gray-500">
                  Search across millions of academic papers. Filter by publisher, Scopus indexing and publication status.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {["Machine Learning", "Cyber Security", "NLP", "Deep Learning", "Cloud Computing"].map((topic) => (
                    <button
                      key={topic}
                      onClick={() => handleSearch(topic)}
                      className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-primary-300 hover:text-primary-600"
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>
            ) : results.length === 0 ? (
              <EmptyState
                icon={FileSearch}
                title="No papers found"
                description={
                  <>
                    No research papers found for &quot;{searchState.query}&quot; with the selected filters. Try different
                    keywords or relax the publisher, Scopus, quartile or publication filters.
                    {usesVerificationFilters && (
                      <span className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        {scannedCandidates.toLocaleString()} candidate records were verified against the active filters.
                      </span>
                    )}
                  </>
                }
              />
            ) : (
              <>
                <div className="space-y-4">
                  {results.map((paper) => (
                    <PaperCard
                      key={paper.id}
                      paper={paper}
                      onSave={handleToggleSave}
                      isSaved={savedIds.has(paper.id)}
                      onCompare={handleToggleCompare}
                      isSelected={isSelectedForCompare(paper.id)}
                      onToggleSelect={handleToggleCompare}
                    />
                  ))}
                </div>
                <Pagination
                  currentPage={searchState.page}
                  totalPages={Math.min(totalPages, Math.ceil(10000 / searchState.perPage))}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>

          {showRightPanel && (
            <RightPanel
              query={searchState.query}
              totalResults={totalResults}
              facets={facets}
            />
          )}
        </div>
      </PageContainer>

      {selectedForCompare.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:bottom-6 sm:pb-0">
          <div className="flex w-full max-w-md animate-fadeIn flex-wrap items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-lg">
            <GitCompare className="h-5 w-5 flex-shrink-0 text-primary-600" />
            <span className="text-sm font-medium text-gray-700">
              {selectedForCompare.length} paper{selectedForCompare.length > 1 ? "s" : ""} selected
            </span>
            <button
              onClick={handleGoToCompare}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Compare Now
            </button>
            <button
              onClick={() => setSelectedForCompare([])}
              aria-label="Clear selection"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
