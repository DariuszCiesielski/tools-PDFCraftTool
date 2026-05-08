/**
 * Content hash dla cross-device matching dokumentów.
 *
 * SHA-256(name + size) → 16 hex chars (64 bits). Stabilny między urządzeniami
 * dla tego samego pliku — eliminuje heurystykę name+pageCount (Qwen finding R1).
 *
 * Dlaczego nie name + lastModified: lastModified zmienia się przy zapisie kopii,
 * a my chcemy że ten sam plik na 2 urządzeniach matchuje (user pobrał z chmury).
 *
 * Birthday collision: ~4 mld plików na 50% kolizji. Dla user-scoped data wystarczy.
 */

export async function computeContentHash(
  name: string,
  size: number,
): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return `nohash-${name}-${size}`;
  }
  const data = new TextEncoder().encode(`${name}|${size}`);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
