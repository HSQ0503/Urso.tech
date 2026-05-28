export function AnnouncementBar() {
  return (
    <div className="border-b border-edge bg-[#0d0d0d] px-4 py-2 text-center text-[11px] leading-[1.4] tracking-[-0.005em] sm:px-6 sm:py-2.5 sm:text-[13px]">
      <span className="text-ink-dim">
        Urso opens its AI pilot cohort — four operators, eight stores.
      </span>
      <a
        href="#"
        className="ml-1.5 whitespace-nowrap text-orange underline underline-offset-[3px] hover:opacity-90 sm:ml-2.5"
      >
        Read the brief →
      </a>
    </div>
  );
}
