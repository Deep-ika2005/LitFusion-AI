export function PaperCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="h-4 w-4 flex-shrink-0 rounded animate-shimmer" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="h-5 w-16 rounded-full animate-shimmer" />
            <div className="h-5 w-20 rounded-full animate-shimmer" />
          </div>
          <div className="h-5 w-3/4 rounded animate-shimmer" />
          <div className="h-4 w-1/2 rounded animate-shimmer" />
          <div className="flex flex-wrap gap-3">
            <div className="h-3 w-24 rounded animate-shimmer" />
            <div className="h-3 w-16 rounded animate-shimmer" />
            <div className="h-3 w-20 rounded animate-shimmer" />
          </div>
          <div className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-5/6 rounded animate-shimmer" />
            <div className="h-3 w-2/3 rounded animate-shimmer" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-5/6 rounded animate-shimmer" />
            <div className="h-3 w-2/3 rounded animate-shimmer" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-6 w-16 rounded-md animate-shimmer" />
            <div className="h-6 w-20 rounded-md animate-shimmer" />
            <div className="h-6 w-14 rounded-md animate-shimmer" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-24 rounded-lg animate-shimmer" />
            <div className="h-8 w-20 rounded-lg animate-shimmer" />
            <div className="h-8 w-16 rounded-lg animate-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <PaperCardSkeleton key={i} />
      ))}
    </div>
  );
}
