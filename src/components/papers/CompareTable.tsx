"use client";

import { X } from "lucide-react";
import type { Paper } from "@/types";

interface CompareTableProps {
  papers: Paper[];
  onRemove: (paperId: string) => void;
}

const COMPARISON_FIELDS = [
  { label: "Title", key: "title" as const },
  { label: "Authors", key: "authors" as const },
  { label: "Year", key: "publicationYear" as const },
  { label: "Type", key: "type" as const },
  { label: "Source", key: "source" as const },
  { label: "Citations", key: "citedByCount" as const },
  { label: "Access", key: "openAccess" as const },
  { label: "DOI", key: "doi" as const },
  { label: "Topics", key: "topics" as const },
  { label: "Keywords", key: "keywords" as const },
  { label: "Abstract", key: "abstract" as const },
];

function formatValue(paper: Paper, key: string): string {
  switch (key) {
    case "title": return paper.title;
    case "authors": return paper.authors.slice(0, 3).map((a) => a.name).join(", ") + (paper.authors.length > 3 ? " et al." : "");
    case "publicationYear": return paper.publicationYear?.toString() || "N/A";
    case "type": return paper.type.replace(/-/g, " ");
    case "source": return paper.source?.displayName || "N/A";
    case "citedByCount": return paper.citedByCount.toLocaleString();
    case "openAccess": return paper.openAccess.isOa ? "Open Access" : "Restricted";
    case "doi": return paper.doi || "N/A";
    case "topics": return paper.topics.join(", ") || "N/A";
    case "keywords": return paper.keywords.join(", ") || "N/A";
    case "abstract": return paper.abstract ? (paper.abstract.length > 200 ? paper.abstract.substring(0, 200) + "..." : paper.abstract) : "N/A";
    default: return "N/A";
  }
}

export function CompareTable({ papers, onRemove }: CompareTableProps) {
  if (papers.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-40 min-w-[10rem] border-b border-gray-200 bg-gray-50 p-4 text-left align-top text-sm font-semibold text-gray-500">
              Attribute
            </th>
            {papers.map((paper) => (
              <th key={paper.id} className="min-w-[16rem] border-b border-gray-200 p-4 text-left align-top">
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-3 break-words text-sm font-semibold text-gray-900">
                    {paper.title}
                  </span>
                  <button
                    onClick={() => onRemove(paper.id)}
                    aria-label={`Remove ${paper.title} from comparison`}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {COMPARISON_FIELDS.map((field) => (
            <tr key={field.key} className="group/row">
              <td className="sticky left-0 z-10 border-b border-gray-100 bg-white p-4 text-sm font-medium text-gray-500 transition-colors group-hover/row:bg-gray-50">
                {field.label}
              </td>
              {papers.map((paper) => (
                <td
                  key={paper.id}
                  className="border-b border-gray-100 p-4 align-top text-sm break-words text-gray-700 transition-colors group-hover/row:bg-gray-50"
                >
                  {formatValue(paper, field.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}