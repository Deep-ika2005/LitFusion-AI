"use client";

import { useState, useCallback, useRef } from "react";
import { clsx } from "clsx";
import { Search, X, ShieldCheck, BookCheck } from "lucide-react";
import { getPublisherOptions, OTHER_PUBLISHER_ID, OTHER_PUBLISHER_LABEL } from "@/lib/verification/publisher";
import { checkboxControlClass, pillToggleClass, selectControlClass } from "@/components/ui/controls";

export interface SearchBarFilters {
  publisher: string;
  publisherQuery: string;
  scopusOnly: boolean;
  publishedOnly: boolean;
}

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
  isLoading?: boolean;
  large?: boolean;
  /** Verification filters rendered underneath the input. */
  filters?: SearchBarFilters;
  onFiltersChange?: (filters: SearchBarFilters) => void;
}

const DEFAULT_FILTERS: SearchBarFilters = { publisher: "all", publisherQuery: "", scopusOnly: false, publishedOnly: false };
const PUBLISHERS = getPublisherOptions();

export function SearchBar({
  initialQuery = "",
  onSearch,
  isLoading = false,
  large = false,
  filters,
  onFiltersChange,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [uncontrolledFilters, setUncontrolledFilters] = useState<SearchBarFilters>(DEFAULT_FILTERS);

  // Keep the input in sync when the query is changed from outside (URL, filter chips,
  // browser navigation) without an extra render pass through an effect.
  const [syncedQuery, setSyncedQuery] = useState(initialQuery);
  if (syncedQuery !== initialQuery) {
    setSyncedQuery(initialQuery);
    setQuery(initialQuery);
  }

  const activeFilters = filters ?? uncontrolledFilters;
  const [customPublisher, setCustomPublisher] = useState(activeFilters.publisherQuery ?? "");
  const [syncedPublisherQuery, setSyncedPublisherQuery] = useState(activeFilters.publisherQuery ?? "");
  if (syncedPublisherQuery !== (activeFilters.publisherQuery ?? "")) {
    setSyncedPublisherQuery(activeFilters.publisherQuery ?? "");
    setCustomPublisher(activeFilters.publisherQuery ?? "");
  }

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) onSearch(value.trim());
    }, 400);
  }, [onSearch]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim()) onSearch(query.trim());
  }, [query, onSearch]);

  const handleClear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const updateFilters = useCallback((next: SearchBarFilters) => {
    if (!filters) setUncontrolledFilters(next);
    onFiltersChange?.(next);
  }, [filters, onFiltersChange]);

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className={clsx(
          "flex items-center gap-2 transition-all focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-100",
          large
            ? "rounded-2xl border-2 border-primary-200 bg-white px-4 shadow-lg"
            : "rounded-xl border border-gray-200 bg-white px-3 shadow-sm"
        )}
      >
        <Search className={clsx("flex-shrink-0 text-gray-400", large ? "h-6 w-6" : "h-5 w-5")} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search papers..."
          className={clsx(
            "min-w-0 flex-1 bg-transparent text-gray-900 placeholder:text-gray-400 focus:outline-none",
            large ? "py-3.5 text-lg" : "py-2.5 text-sm"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className={clsx(
            "inline-flex h-9 flex-shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50",
            large ? "min-w-[7rem]" : "min-w-[5.75rem]"
          )}
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </div>

      {onFiltersChange && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="inline-flex h-8 items-center gap-2">
            <label htmlFor="search-publisher" className="whitespace-nowrap text-xs font-medium text-gray-500">
              Publisher
            </label>
            <select
              id="search-publisher"
              value={activeFilters.publisher}
              onChange={(e) => {
                const nextPublisher = e.target.value;
                // Switching away from Other clears the custom name; staying keeps it.
                updateFilters({
                  ...activeFilters,
                  publisher: nextPublisher,
                  publisherQuery: nextPublisher === OTHER_PUBLISHER_ID ? (activeFilters.publisherQuery ?? "") : "",
                });
                if (nextPublisher !== OTHER_PUBLISHER_ID) setCustomPublisher("");
              }}
              className={selectControlClass}
            >
              <option value="all">All Publishers</option>
              {PUBLISHERS.map((publisher) => (
                <option key={publisher.id} value={publisher.id}>
                  {publisher.name}
                </option>
              ))}
              <option value={OTHER_PUBLISHER_ID}>{OTHER_PUBLISHER_LABEL}</option>
            </select>
          </div>
          {activeFilters.publisher === OTHER_PUBLISHER_ID && (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customPublisher}
                onChange={(e) => setCustomPublisher(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    updateFilters({ ...activeFilters, publisherQuery: customPublisher.trim() });
                  }
                }}
                placeholder="e.g. Nature, SAGE, IEEE…"
                aria-label="Custom publisher name"
                className="h-8 w-44 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => updateFilters({ ...activeFilters, publisherQuery: customPublisher.trim() })}
                disabled={!customPublisher.trim()}
                className="inline-flex h-8 items-center rounded-lg bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Search
              </button>
              {(activeFilters.publisherQuery ?? "") !== "" && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomPublisher("");
                    updateFilters({ ...activeFilters, publisherQuery: "" });
                  }}
                  aria-label="Clear custom publisher"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <label
            className={clsx(
              pillToggleClass,
              activeFilters.scopusOnly
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            )}
          >
            <input
              type="checkbox"
              checked={activeFilters.scopusOnly}
              onChange={(e) => updateFilters({ ...activeFilters, scopusOnly: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
            Scopus Indexed Only
          </label>

          <label
            className={clsx(
              pillToggleClass,
              activeFilters.publishedOnly
                ? "border-primary-300 bg-primary-50 text-primary-700"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
            )}
          >
            <input
              type="checkbox"
              checked={activeFilters.publishedOnly}
              onChange={(e) => updateFilters({ ...activeFilters, publishedOnly: e.target.checked })}
              className={checkboxControlClass}
            />
            <BookCheck className="h-3.5 w-3.5 flex-shrink-0" />
            Published Papers Only
          </label>
        </div>
      )}
    </form>
  );
}
