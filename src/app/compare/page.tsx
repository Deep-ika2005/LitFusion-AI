import { Suspense } from "react";
import CompareContent from "./CompareContent";

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="flex min-h-full items-center justify-center bg-gray-50/50"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" /></div>}>
      <CompareContent />
    </Suspense>
  );
}