import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
}

export function PageHeader({ title, description, icon: Icon }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-center gap-3">
      {Icon && (
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100">
          <Icon className="h-5 w-5 text-primary-600" />
        </div>
      )}
      <div className="min-w-0">
        <h1 className={clsx("font-bold text-gray-900", Icon ? "text-2xl" : "text-xl sm:text-2xl")}>{title}</h1>
        {description && <p className="mt-1 text-sm leading-relaxed text-gray-500">{description}</p>}
      </div>
    </div>
  );
}
