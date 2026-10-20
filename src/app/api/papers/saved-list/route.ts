import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listSaved } from "@/lib/library/store";
import { getLibraryIdentity } from "@/lib/library/session";

export async function GET() {
  const identity = getLibraryIdentity(await auth());
  if (!identity) return NextResponse.json({ papers: [] });

  try {
    const papers = await listSaved(identity.key);
    console.log(
      `Library list: key=${identity.key} email=${identity.email ?? "?"} count=${papers.length}`
    );
    return NextResponse.json({ papers });
  } catch (e) {
    console.error("Library storage error:", e);
    return NextResponse.json({ error: "Could not load library. Please try again." }, { status: 500 });
  }
}
