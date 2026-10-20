import { NextRequest, NextResponse } from "next/server";
import { searchPapersWithVerification, normalizePublisherFilter, normalizeQuartileFilter } from "@/lib/search";
import { hasOpenAlexApiKey } from "@/lib/openalex";
import { getPublisherDefinition, OTHER_PUBLISHER_ID, normalizePublisherQuery } from "@/lib/verification/publisher";

// Logged once per server start so a missing key is visible in the terminal
// instead of surfacing later as mysterious 429/503 search errors.
let missingKeyWarned = false;
function warnIfNoOpenAlexKey(): void {
  if (!missingKeyWarned && !hasOpenAlexApiKey()) {
    missingKeyWarned = true;
    console.warn(
      "[papers/search] OPENALEX_API_KEY is not configured — searches run in the anonymous pool, " +
        "which OpenAlex throttles and pauses under load (HTTP 429/503). " +
        "Set a free key from https://openalex.org/settings/api in .env.local and restart the server."
    );
  }
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1" || value === "yes";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(searchParams.get("perPage") || "25", 10);
  const rawSort = searchParams.get("sort") || "relevance";
  const validSorts = ["relevance", "best_match", "quartile_desc", "newest", "oldest", "citations_desc", "citations_asc", "title_asc", "title_desc"];
  const sort = validSorts.includes(rawSort) ? rawSort : "relevance";
  const yearFrom = searchParams.get("yearFrom") ? parseInt(searchParams.get("yearFrom")!, 10) : null;
  const yearTo = searchParams.get("yearTo") ? parseInt(searchParams.get("yearTo")!, 10) : null;
  const types = searchParams.get("types") ? searchParams.get("types")!.split(",").filter(Boolean) : [];
  const accessType = searchParams.get("accessType") || "all";
  const minCitations = searchParams.get("minCitations") ? parseInt(searchParams.get("minCitations")!, 10) : null;
  const fetchAll = parseBoolean(searchParams.get("fetchAll"));
  const targetCount = parseInt(searchParams.get("targetCount") || "100", 10);

  const publisher = normalizePublisherFilter(searchParams.get("publisher"));
  const publisherQuery = normalizePublisherQuery(searchParams.get("publisherQuery"));
  const scopusOnly = parseBoolean(searchParams.get("scopusOnly"));
  const publishedOnly = parseBoolean(searchParams.get("publishedOnly"));
  const quartiles = normalizeQuartileFilter(searchParams.get("quartiles"));

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
  }

  if (publisher !== "all" && publisher !== OTHER_PUBLISHER_ID && !getPublisherDefinition(publisher)) {
    return NextResponse.json({ error: `Unknown publisher filter "${publisher}"` }, { status: 400 });
  }

  try {
    warnIfNoOpenAlexKey();
    const result = await searchPapersWithVerification({
      query, page, perPage, sort, yearFrom, yearTo, types, accessType, minCitations,
      publisher, publisherQuery, scopusOnly, publishedOnly, quartiles, fetchAll, targetCount,
    });

    return NextResponse.json({
      query,
      totalResults: result.totalResults,
      page: result.page,
      perPage: result.perPage,
      totalPages: result.totalPages,
      results: result.papers,
      facets: result.facets,
      nextCursor: result.nextCursor,
      appliedFilters: result.appliedFilters,
      scannedCandidates: result.scannedCandidates,
      hasMoreResults: result.hasMoreResults,
      upstreamTotal: result.upstreamTotal,
      scopusVerification: result.scopusVerification,
    });
  } catch (error) {
    console.error("Search API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const upstreamStatus =
      (error as { status?: number } | null)?.status ??
      (/OpenAlex API error:\s*(\d{3})/.exec(message) ? Number(/OpenAlex API error:\s*(\d{3})/.exec(message)![1]) : undefined);
    const retryAfterSeconds = (error as { retryAfterSeconds?: number } | null)?.retryAfterSeconds;

    // Only a genuinely failed upstream is a bad gateway. A rate limit, a paused
    // search cluster, or a brief outage is the provider's state, not a broken
    // proxy, so it must not be reported as 502 — the client retries differently
    // for each (and a 502 in the console misleads users into debugging this app).
    const isRateLimited = upstreamStatus === 429;
    const isClusterUnavailable = upstreamStatus === 503;
    const isUpstreamFailure =
      upstreamStatus !== undefined && upstreamStatus >= 500 && !isClusterUnavailable;

    if (isRateLimited) {
      return NextResponse.json(
        {
          error: "Search is temporarily rate-limited by OpenAlex",
          details: message,
          retryAfterSeconds: retryAfterSeconds ?? 30,
          openAlexKeyConfigured: hasOpenAlexApiKey(),
        },
        { status: 429, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined }
      );
    }

    if (isClusterUnavailable) {
      const wait = retryAfterSeconds ?? 15;
      return NextResponse.json(
        {
          error: "OpenAlex search is temporarily unavailable",
          details: message,
          retryAfterSeconds: wait,
          openAlexKeyConfigured: hasOpenAlexApiKey(),
        },
        { status: 503, headers: { "Retry-After": String(wait) } }
      );
    }

    // Timeouts and refused connections leave no HTTP status behind, and a plain 500 reads
    // as "this app is broken". 503 plus Retry-After tells the client to try again.
    const isTransient =
      upstreamStatus === 408 || upstreamStatus === 425 || (upstreamStatus !== undefined && upstreamStatus >= 500);

    return NextResponse.json(
      {
        error: isUpstreamFailure ? "OpenAlex is temporarily unavailable" : "Failed to search papers",
        details: message,
        retryAfterSeconds: isTransient ? (retryAfterSeconds ?? 5) : undefined,
      },
      {
        status: isUpstreamFailure ? 502 : isTransient ? 503 : 500,
        headers: isTransient && retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
      }
    );
  }
}
