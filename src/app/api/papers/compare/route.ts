import { NextRequest, NextResponse } from "next/server";
import { getPaperById } from "@/lib/openalex";
import { buildBasicComparison, comparePapers, type ComparePaperInput } from "@/lib/ai";
import { verifyPapers } from "@/lib/verification";

const MAX_PAPERS = 5;

export async function POST(request: NextRequest) {
  let ids: string[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body. Expected { ids: string[] }." }, { status: 400 });
  }

  const uniqueIds = [...new Set(ids)].slice(0, MAX_PAPERS);
  if (uniqueIds.length < 2) {
    return NextResponse.json({ error: "Select at least 2 papers to compare." }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const fetched = await Promise.all(uniqueIds.map((id) => getPaperById(id)));
    const missing = uniqueIds.filter((_, i) => !fetched[i]);
    if (missing.length > 0) {
      return NextResponse.json({ error: `Paper(s) not found: ${missing.join(", ")}` }, { status: 404 });
    }
    const verified = await verifyPapers(fetched.filter((p) => p !== null));
    const inputs: ComparePaperInput[] = verified.map((paper) => ({
      id: paper.id,
      title: paper.title,
      abstract: paper.abstract,
      publicationYear: paper.publicationYear,
      citedByCount: paper.citedByCount,
      sourceName: paper.source?.displayName ?? null,
      doi: paper.doi,
    }));
    if (inputs.every((p) => !p.abstract)) {
      return NextResponse.json({ error: "No abstracts available for comparison" }, { status: 400 });
    }

    // The AI call needs OpenAI credits — when it fails (quota, outage, bad
    // key) still return a useful basic metadata comparison instead of an
    // error, clearly labelled so the verdict is never mistaken for an AI one.
    try {
      const comparison = await comparePapers(inputs);
      return NextResponse.json(comparison);
    } catch (aiError) {
      console.error("Compare AI failed, returning basic comparison:", aiError);
      return NextResponse.json(buildBasicComparison(inputs));
    }
  } catch (error) {
    console.error("Compare error:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to compare papers", details },
      { status: 500 }
    );
  }
}
