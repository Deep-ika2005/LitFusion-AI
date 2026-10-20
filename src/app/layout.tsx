import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNavProvider } from "@/components/layout/MobileNavProvider";
import { Providers } from "@/components/auth/Providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LitFusion AI - Intelligent Research Discovery",
  description: "AI-powered platform for research paper discovery, summarization, and insight extraction",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full antialiased">
        <Providers>
          <MobileNavProvider>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex min-h-0 flex-1">
                <Sidebar />
                <main className="min-w-0 flex-1 overflow-auto">{children}</main>
              </div>
            </div>
          </MobileNavProvider>
        </Providers>
      </body>
    </html>
  );
}