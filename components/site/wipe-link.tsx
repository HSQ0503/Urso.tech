"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { triggerWipe } from "@/components/wipe-transition";

type WipeLinkProps = ComponentProps<typeof Link> & {
  onNavigate?: () => void;
};

/**
 * Internal link that routes through the page wipe. Modified clicks, external
 * targets, same-page links, and reduced-motion users all fall through to
 * normal Link behavior.
 */
export function WipeLink({ href, onNavigate, onClick, ...rest }: WipeLinkProps) {
  const pathname = usePathname();
  const hrefStr = typeof href === "string" ? href : (href.pathname ?? "");

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (!hrefStr.startsWith("/") || hrefStr === pathname) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onNavigate?.();
      return;
    }
    e.preventDefault();
    onNavigate?.();
    triggerWipe(hrefStr);
  }

  return <Link href={href} onClick={handleClick} {...rest} />;
}
