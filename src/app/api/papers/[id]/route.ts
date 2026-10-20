import { NextRequest, NextResponse } from "next/server";
import { getPaperById } from "@/lib/openalex";
import { verifyPaper } from "@/lib/verification";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const paper = await getPaperById(id);
    if (!paper) {
      return NextResponse.json({ error: "Paper not found" }, { status: 404 });
    }
    const verified = await verifyPaper(paper);
    return NextResponse.json(verified);
  } catch (error) {
    console.error("Paper API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch paper", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
