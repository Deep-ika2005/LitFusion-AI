"use client";

import type { SearchFacets } from "@/types";
import { FileText, BookOpen, Unlock, Lock, ShieldCheck, Building2, BadgeCheck } from "lucide-react";

interface RightPanelProps {
  query: string;
  totalResults: number;
  facets: SearchFacets;
}

const PUBLISHER_LABELS: Record<string, string> = {
  ieee: "IEEE",
  springer: "Springer",
  elsevier: "Elsevier",
  acm: "ACM",
  wiley: "Wiley",
  mdpi: "MDPI",
  "taylor-and-francis": "Taylor & Francis",
};

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  preprint: "Preprint",
  accepted: "Accepted manuscript",
  submitted: "Submitted",
  "record-only": "Record only",
  unpublished: "Unpublished",
  unknown: "Unknown",
};

export function RightPanel({ query, totalResults, facets }: RightPanelProps) {
  const typeCounts = Object.entries(facets.typeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const publisherCounts = Object.entries(facets.publisherCounts ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const statusCounts = Object.entries(facets.publicationStatusCounts ?? {})
    .filter(([status]) => status === "published" || status === "preprint" || status === "accepted" || status === "submitted")
    .sort(([, a], [, b]) => b - a);

  const scopusCounts = facets.scopusCounts ?? { indexed: 0, "not-indexed": 0, unknown: 0 };
  const quartileCounts = facets.quartileCounts ?? { Q1: 0, Q2: 0, Q3: 0, Q4: 0, unranked: 0 };

  return (
    <div className="w-full min-w-0">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm 2xl:sticky 2xl:top-[var(--sticky-panel-offset)]">
        <h3 className="mb-4 text-sm font-bold text-gray-900">Your Search</h3>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-lg bg-primary-50 p-3">
            <p className="text-xs text-primary-600 font-medium mb-1">Query</p>
            <p className="text-sm font-semibold text-primary-900 truncate">&ldquo;{query}&rdquo;</p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 font-medium mb-1">Total Results</p>
            <p className="text-lg font-bold text-gray-900">{totalResults.toLocaleString()}</p>
          </div>

          {typeCounts.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500 font-medium mb-2">By Type</p>
              <div className="space-y-1.5">
                {typeCounts.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 capitalize">{type.replace(/-/g, " ")}</span>
                    <span className="text-xs font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {statusCounts.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500 font-medium mb-2">Publication Status</p>
              <div className="space-y-1.5">
                {statusCounts.map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600">
                      <BadgeCheck className="h-3 w-3 text-primary-500" />
                      {STATUS_LABELS[status] || status}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {publisherCounts.length > 0 && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500 font-medium mb-2">By Publisher</p>
              <div className="space-y-1.5">
                {publisherCounts.map(([publisher, count]) => (
                  <div key={publisher} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Building2 className="h-3 w-3 text-indigo-400" />
                      {PUBLISHER_LABELS[publisher] || publisher}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 font-medium mb-2">Scopus Status</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <ShieldCheck className="h-3 w-3" /> Indexed
                </span>
                <span className="text-xs font-medium text-gray-700">{scopusCounts.indexed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <FileText className="h-3 w-3" /> Not indexed
                </span>
                <span className="text-xs font-medium text-gray-700">{scopusCounts["not-indexed"]}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-gray-400">
                  <BookOpen className="h-3 w-3" /> Unknown
                </span>
                <span className="text-xs font-medium text-gray-700">{scopusCounts.unknown}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 font-medium mb-2">Journal Quartile</p>
            <div className="space-y-1.5">
              {(["Q1", "Q2", "Q3", "Q4", "unranked"] as const).map((tier) => (
                <div key={tier} className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">{tier === "unranked" ? "Unavailable" : tier}</span>
                  <span className="text-xs font-medium text-gray-700">{quartileCounts[tier]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500 font-medium mb-2">Access</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Unlock className="h-3 w-3" /> Open Access
                </span>
                <span className="text-xs font-medium text-gray-700">{facets.accessCounts.open}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-amber-600">
                  <Lock className="h-3 w-3" /> Restricted
                </span>
                <span className="text-xs font-medium text-gray-700">{facets.accessCounts.restricted}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
