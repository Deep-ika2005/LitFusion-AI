import type { Paper, PublicationStatusResult, Source, PaperRawMetadata, VerificationEvidence } from "@/types";

/**
 * Publication verification.
 *
 * A paper is only reported as "Published" when the metadata source states it:
 *   - OpenAlex `primary_location.version === "publishedVersion"` or `is_published === true`
 *     (publisher-declared record of the version of record), or
 *   - a published version exists in any of the work's locations, or
 *   - a DOI plus a journal/conference venue plus a publication date is recorded.
 *
 * Preprints, submitted versions, accepted manuscripts, paratext records and works
 * without any publication record are reported with their own status and are all
 * excluded by the "Published Papers Only" filter.
 */
const LABELS: Record<PublicationStatusResult["status"], string> = {
  published: "Published",
  preprint: "Preprint",
  accepted: "Accepted Manuscript",
  submitted: "Submitted",
  "record-only": "Record Only",
  unpublished: "Unpublished",
  unknown: "Unknown",
};

const PREPRINT_RAW_TYPES = new Set(["posted-content", "posted_content", "preprint"]);

function isPreprintServer(source: Source | null): boolean {
  if (!source) return false;
  if (source.type !== "repository") return false;
  const name = (source.hostOrganizationName || source.displayName || "").toLowerCase();
  return [
    "arxiv",
    "biorxiv",
    "medrxiv",
    "chemrxiv",
    "psyarxiv",
    "ssrn",
    "research square",
    "preprints.org",
    "engrxiv",
    "authorea",
    "techrxiv",
    "osf",
  ].some((token) => name.includes(token));
}

function result(
  status: PublicationStatusResult["status"],
  evidence: VerificationEvidence[],
  reason: string | null
): PublicationStatusResult {
  const isPublished = status === "published";
  return {
    status,
    label: LABELS[status],
    isPublished,
    confidence: status === "unknown" ? "unknown" : "verified",
    evidence,
    reason: isPublished ? null : reason,
  };
}

/** Synchronous publication verification from already-normalized OpenAlex metadata. */
export function verifyPublicationStatus(
  paper: Pick<Paper, "type" | "doi" | "publicationDate" | "publicationYear" | "source" | "rawMetadata">
): PublicationStatusResult {
  const source = paper.source;
  const raw: PaperRawMetadata | null = paper.rawMetadata;
  const evidence: VerificationEvidence[] = [];

  if (raw?.primaryLocationVersion) {
    evidence.push({
      field: "primary_location.version",
      source: "openalex",
      detail: `Version of record reported by OpenAlex: ${raw.primaryLocationVersion}`,
    });
  }
  if (raw?.primaryLocationIsPublished !== null && raw?.primaryLocationIsPublished !== undefined) {
    evidence.push({
      field: "primary_location.is_published",
      source: "openalex",
      detail: `is_published = ${raw.primaryLocationIsPublished}`,
    });
  }
  if (raw?.primaryLocationIsAccepted !== null && raw?.primaryLocationIsAccepted !== undefined) {
    evidence.push({
      field: "primary_location.is_accepted",
      source: "openalex",
      detail: `is_accepted = ${raw.primaryLocationIsAccepted}`,
    });
  }
  if (raw?.primaryLocationRawType) {
    evidence.push({
      field: "primary_location.raw_type",
      source: "openalex",
      detail: `Raw record type reported by the data source: ${raw.primaryLocationRawType}`,
    });
  }
  if (raw?.biblio && (raw.biblio.volume || raw.biblio.firstPage)) {
    evidence.push({
      field: "biblio",
      source: "openalex",
      detail: `Bibliographic details present: volume ${raw.biblio.volume ?? "-"}, pages ${raw.biblio.firstPage ?? "-"}`,
    });
  }

  // 1. Paratext records (journal issues, tables, editorials) are not research papers.
  if (raw?.isParatext) {
    return result(
      "record-only",
      evidence,
      "OpenAlex classifies this record as paratext (issue front matter, editorial, table, etc.), not a research paper."
    );
  }

  // 2. Preprints: never counted as published.
  if (paper.type === "preprint" || (raw?.primaryLocationRawType ? PREPRINT_RAW_TYPES.has(raw.primaryLocationRawType) : false) || isPreprintServer(source)) {
    const detail = source?.displayName || paper.type;
    return result(
      "preprint",
      [
        ...evidence,
        {
          field: "type",
          source: "openalex",
          detail: `OpenAlex work type is "${paper.type}"${detail ? ` on ${detail}` : ""}`,
        },
      ],
      "Preprint: the record is a preprint and has not (yet) been published as a final version."
    );
  }

  // 3. Version-based ladder: published > accepted > submitted.
  const hasPublishedVersion =
    raw?.hasPublishedVersion === true || raw?.primaryLocationVersion === "publishedVersion";
  const hasAcceptedVersion =
    raw?.hasAcceptedVersion === true || raw?.primaryLocationVersion === "acceptedVersion";
  const hasSubmittedVersion =
    raw?.hasSubmittedVersion === true || raw?.primaryLocationVersion === "submittedVersion";

  if (hasPublishedVersion || raw?.primaryLocationIsPublished === true) {
    return result(
      "published",
      [
        ...evidence,
        {
          field: "locations.version",
          source: "openalex",
          detail: hasPublishedVersion
            ? "A publishedVersion (version of record) is recorded for this work."
            : "The primary location is flagged as published by the data source.",
        },
      ],
      null
    );
  }

  if (hasAcceptedVersion || raw?.primaryLocationIsAccepted === true) {
    return result(
      "accepted",
      evidence,
      "Accepted manuscript: peer review is complete but no published version of record is recorded."
    );
  }

  if (hasSubmittedVersion) {
    return result(
      "submitted",
      evidence,
      "Submitted version only: the manuscript has not been accepted or published."
    );
  }

  // 4. Corroborated publication: DOI + venue + publication date.
  const hasVenue = Boolean(source?.displayName) && ["journal", "conference", "book", "proceedings"].includes(source?.type ?? "");
  if (paper.doi && hasVenue && (paper.publicationDate || paper.publicationYear > 0)) {
    return result(
      "published",
      [
        ...evidence,
        {
          field: "doi + source + publication_date",
          source: "openalex",
          detail: `DOI ${paper.doi} is registered for venue "${source?.displayName}" with publication date ${paper.publicationDate ?? paper.publicationYear}.`,
        },
      ],
      null
    );
  }

  // 5. Monographs, datasets and theses need a venue plus a date.
  if (
    ["book", "book-chapter", "dataset", "dissertation", "reference-entry", "standard"].includes(paper.type) &&
    (paper.publicationDate || paper.publicationYear > 0) &&
    Boolean(source?.displayName)
  ) {
    return result(
      "published",
      [
        ...evidence,
        {
          field: "type + publication_date + source",
          source: "openalex",
          detail: `OpenAlex work type "${paper.type}" with a venue ("${source?.displayName}") and publication date ${paper.publicationDate ?? paper.publicationYear}.`,
        },
      ],
      null
    );
  }

  // 6. No usable publication record at all.
  if (!paper.publicationDate && paper.publicationYear <= 0 && !source && !paper.doi) {
    return result(
      "unpublished",
      evidence,
      "No publication date, venue or DOI is recorded for this work, so it is treated as an unpublished record."
    );
  }

  return result(
    "unknown",
    evidence,
    "The available metadata does not state whether this work is published, so the publication status is unknown."
  );
}

export function isPublishedRecord(status: PublicationStatusResult | null | undefined): boolean {
  return status?.isPublished === true;
}

export const PUBLICATION_STATUS_LABELS = LABELS;
