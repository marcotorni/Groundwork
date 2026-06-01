"use client";

import dynamic from "next/dynamic";

export const AppShellClient = dynamic(
  () => import("@/components/AppShell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center bg-[#0c1421] text-sm text-[#8a96ad]">
        Loading map…
      </div>
    ),
  },
);
