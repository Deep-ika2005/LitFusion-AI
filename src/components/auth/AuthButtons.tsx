"use client";

import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, User } from "lucide-react";

export function AuthButtons() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-8 w-8 rounded-full bg-navy-700 animate-pulse" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("google")}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white transition-colors w-full"
      >
        <LogIn className="h-5 w-5" />
        Sign In
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full ring-2 ring-navy-700"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600">
            <User className="h-4 w-4 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {session.user.name || "User"}
          </p>
          <p className="text-xs text-navy-400 truncate">
            {session.user.email}
          </p>
        </div>
      </div>
      <button
        onClick={() => signOut()}
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-navy-200 hover:bg-navy-800 hover:text-white transition-colors w-full"
      >
        <LogOut className="h-5 w-5" />
        Sign Out
      </button>
    </div>
  );
}