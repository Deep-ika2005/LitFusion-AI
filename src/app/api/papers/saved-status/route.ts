import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSavedIds } from "@/lib/library/store";
import { getLibraryIdentity } from "@/lib/library/session";

export async function GET(request: NextRequest) {
  const identity = getLibraryIdentity(await auth());
  if (!identity) return NextResponse.json({ saved: [] });

  const { searchParams } = new URL(request.url);
  const paperIds = searchParams.get("ids")?.split(",") || [];
  if (paperIds.length === 0) return NextResponse.json({ saved: [] });

  try {
    const saved = await getSavedIds(identity.key, paperIds);
    return NextResponse.json({ saved });
  } catch (e) {
    console.error("Library storage error:", e);
    return NextResponse.json({ saved: [] });
  }
}
