const DANGEROUS_SCHEME_RE = /^(?:\/?\/?)*(?:javascript|data|vbscript|file):/i;

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch (err) {
    console.warn('[safeReturnUrl] decodeURIComponent failed:', err);
    return s;
  }
}

export function isSafeReturnUrl(raw: string): boolean {
  if (!raw || !raw.startsWith('/')) return false;
  const decoded = safeDecode(raw);
  if (raw.startsWith('//') || decoded.startsWith('//')) return false;
  if (DANGEROUS_SCHEME_RE.test(raw) || DANGEROUS_SCHEME_RE.test(decoded)) return false;
  if (/\s/.test(raw) || /\s/.test(decoded)) return false;
  return true;
}

export function safeReturnUrlOr(search: string, fallback = '/'): string {
  const p = new URLSearchParams(search);
  const value = p.get('returnUrl');
  if (!value) return fallback;
  return isSafeReturnUrl(value) ? value : fallback;
}
