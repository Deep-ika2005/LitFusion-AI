import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  tone?: "neutral" | "danger";
  iconClassName?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  iconClassName,
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-xl border px-6 py-14 text-center sm:py-16",
        tone === "danger" ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
      )}
    >
      <Icon className={clsx("mb-4 h-12 w-12", iconClassName ?? (tone === "danger" ? "text-red-400" : "text-gray-300"))} />
      <h2 className={clsx("text-lg font-semibold", tone === "danger" ? "text-red-700" : "text-gray-700")}>{title}</h2>
      <p
        className={clsx(
          "mt-2 max-w-md text-sm leading-relaxed",
          tone === "danger" ? "text-red-600" : "text-gray-500"
        )}
      >
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
