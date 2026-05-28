// Module-level flag set by the homepage slider just before it navigates
// to /book-an-audit, consumed once by AuditPageGate on mount.
// Lives in the same JS context across client-side navigation, so it
// survives router.push but resets on full page reload (intentional).

let pendingIntro = false;

export function armIntro() {
  pendingIntro = true;
}

export function consumeIntro() {
  const was = pendingIntro;
  pendingIntro = false;
  return was;
}
