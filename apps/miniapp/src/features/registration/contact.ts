export interface RegistrarContact {
  label: string;
  href: string;
}

/** Registrar contact from `VITE_REGISTRAR_CONTACT`, or null when unset. */
export function getRegistrarContact(): RegistrarContact | null {
  const raw = (import.meta.env.VITE_REGISTRAR_CONTACT ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('@')) return { label: raw, href: `https://t.me/${raw.slice(1)}` };
  return { label: raw, href: raw };
}
