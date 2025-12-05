"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      toastOptions={{
        className: "bg-[#161616] border-[#252525] text-white",
        style: {
          background: "#161616",
          border: "1px solid #252525",
          color: "white",
        },
      }}
    />
  );
}
