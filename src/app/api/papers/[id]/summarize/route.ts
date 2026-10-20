import { NextRequest, NextResponse } from "next/server";
import { getPaperById } from "@/lib/openalex";
import { summarizePaper } from "@/lib/ai";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const paper = await getPaperById(id);
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }
    if (!paper.abstract) {
      return NextResponse.json({ error: "No abstract available for summarization" }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const analysis = await summarizePaper(paper.abstract, paper.title);
    return NextResponse.json(analysis);
  } catch (error) {
    console.error("Summarize error:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    if (/insufficient_quota|no credits|quota|billing/i.test(details)) {
      return NextResponse.json(
        { error: "OpenAI quota exhausted — add credits to analyze papers", details },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "Failed to summarize paper", details },
      { status: 500 }
    );
  }
}