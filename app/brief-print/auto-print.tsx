"use client";

import { useEffect } from "react";

// Opens the browser print dialog once the standalone report has mounted and
// fonts have had a moment to settle — the user saves it as a PDF from there.
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 450);
    return () => clearTimeout(t);
  }, []);
  return null;
}
