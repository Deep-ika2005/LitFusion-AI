"use client";

import { useState } from "react";
import { MobileHeader } from "./MobileHeader";
import { MobileSidebar } from "./MobileSidebar";

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <MobileHeader onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {children}
    </>
  );
}