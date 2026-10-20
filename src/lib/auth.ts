import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist a stable per-account identifier in the JWT.
      //
      // Without this, `token.sub` is a fresh `crypto.randomUUID()` on every
      // OAuth sign-in (see `getUserAndAccount` in @auth/core: the user id is
      // intentionally decoupled from the provider profile). Keying the
      // library on `token.sub` therefore orphaned saved papers on every
      // sign-out/sign-in. `account.providerAccountId` is the stable Google
      // subject for this account and never changes between logins.
      const providerAccountId =
        account?.providerAccountId ??
        (profile as { sub?: unknown; id?: unknown } | null)?.sub ??
        (profile as { sub?: unknown; id?: unknown } | null)?.id;
      if (typeof providerAccountId === "string" && providerAccountId.length > 0) {
        (token as Record<string, unknown>).provider = account?.provider ?? "google";
        (token as Record<string, unknown>).providerAccountId = providerAccountId;
      }
      return token;
    },
    async session({ token, session }) {
      const extended = token as unknown as {
        sub?: string;
        provider?: string;
        providerAccountId?: string;
      };
      const stableId =
        (typeof extended.providerAccountId === "string" &&
          extended.providerAccountId.length > 0 &&
          `${extended.provider ?? "google"}:${extended.providerAccountId}`) ||
        (session.user?.email ? `email:${session.user.email.trim().toLowerCase()}` : null) ||
        extended.sub;
      if (stableId && session.user) {
        Object.assign(session.user, { id: stableId });
      }
      return session;
    },
  },
});