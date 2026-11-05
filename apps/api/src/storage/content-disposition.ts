/**
 * `Content-Disposition: attachment` for any file name: an ASCII fallback for old clients plus the
 * RFC 5987 `filename*` with the exact UTF-8 name (Cyrillic names are common).
 */
export function attachmentDisposition(fileName: string): string {
  // Each run of non-printable-ASCII characters, quotes or backslashes becomes one underscore.
  const fallback = fileName.replace(/[^\x20\x21\x23-\x5b\x5d-\x7e]+/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*!]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
