import { clsx } from "clsx";

const SIZE_CLASSES = {
  narrow: "max-w-4xl",
  content: "max-w-5xl",
  wide: "max-w-7xl",
} as const;

export type PageContainerSize = keyof typeof SIZE_CLASSES;

interface PageContainerProps {
  size?: PageContainerSize;
  className?: string;
  children: React.ReactNode;
}

export function PageContainer({ size = "wide", className, children }: PageContainerProps) {
  return (
    <div className={clsx("mx-auto w-full px-4 sm:px-6 lg:px-8", SIZE_CLASSES[size], className)}>
      {children}
    </div>
  );
}
