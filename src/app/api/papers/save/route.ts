import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { savePaper } from "@/lib/library/store";
import { getLibraryIdentity } from "@/lib/library/session";

export async function POST(request: NextRequest) {
  const identity = getLibraryIdentity(await auth());
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paperId, paperData } = await request.json();
  if (!paperId || !paperData) return NextResponse.json({ error: "Missing paperId or paperData" }, { status: 400 });

  try {
    const data = await savePaper(identity.key, paperId, paperData);
    console.log(
      `Library save: key=${identity.key} email=${identity.email ?? "?"} paper=${paperId}`
    );
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("Library storage error:", e);
    return NextResponse.json({ error: "Could not save paper. Please try again." }, { status: 500 });
  }
}
