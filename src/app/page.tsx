"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ArrowRight, Zap, Shield } from "lucide-react";

const SUGGESTED_TOPICS = [
  "Machine Learning in Healthcare",
  "Cyber Security Threat Detection",
  "Natural Language Processing",
  "Deep Learning for Image Classification",
  "Cloud Computing Architecture",
  "Blockchain Technology",
  "Internet of Things",
  "Computer Vision",
];

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }, [query, router]);

  const handleTopicClick = useCallback((topic: string) => {
    router.push(`/search?q=${encodeURIComponent(topic)}`);
  }, [router]);

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-white to-primary-50">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-8 md:py-20">
        <div className="mb-10 text-center md:mb-12">
          <div className="mb-6 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 shadow-lg shadow-primary-200">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
            LitFusion <span className="text-primary-600">AI</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-gray-500 sm:text-lg">
            Intelligent Research Discovery and Insight Platform. Search millions of academic papers, get AI-powered summaries, and extract key research insights.
          </p>

          <form onSubmit={handleSearch} className="mx-auto mb-8 max-w-2xl">
            <div className="relative rounded-2xl border-2 border-primary-200 bg-white shadow-lg shadow-primary-100/50 transition-all focus-within:border-primary-500 focus-within:ring-4 focus-within:ring-primary-100">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 sm:left-5 sm:h-6 sm:w-6" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search research papers, topics, authors, DOIs..."
                className="w-full rounded-2xl bg-transparent py-3.5 pl-11 pr-28 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none sm:py-4 sm:pl-14 sm:pr-32 sm:text-lg"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6 sm:py-2.5"
              >
                Search
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                onClick={() => handleTopicClick(topic)}
                className="rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm font-medium text-gray-600 backdrop-blur transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3 sm:gap-6">
          {[
            { icon: Search, title: "Paper Discovery", desc: "Search across millions of research papers from top publishers and open-access repositories." },
            { icon: Zap, title: "AI Summarization", desc: "Get concise AI-powered summaries of research papers to quickly understand key findings." },
            { icon: Shield, title: "Research Insights", desc: "Extract methodologies, contributions, limitations, and research gaps automatically." },
          ].map((feature, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white/80 p-6 backdrop-blur transition-shadow hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                <feature.icon className="h-5 w-5 text-primary-600" />
              </div>
              <h2 className="mb-2 text-base font-semibold text-gray-900">{feature.title}</h2>
              <p className="text-sm leading-relaxed text-gray-500">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
