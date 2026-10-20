import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unsavePaper } from "@/lib/library/store";
import { getLibraryIdentity } from "@/lib/library/session";

export async function POST(request: NextRequest) {
  const identity = getLibraryIdentity(await auth());
  if (!identity) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { paperId } = await request.json();
  if (!paperId) return NextResponse.json({ error: "Missing paperId" }, { status: 400 });

  try {
    await unsavePaper(identity.key, paperId);
    console.log(
      `Library unsave: key=${identity.key} email=${identity.email ?? "?"} paper=${paperId}`
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Library storage error:", e);
    return NextResponse.json({ error: "Could not remove paper. Please try again." }, { status: 500 });
  }
}
