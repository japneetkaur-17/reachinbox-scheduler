const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * Extracts unique email addresses from any CSV / TXT content. Works whether the
 * file has a header row, one address per line, or emails buried among other
 * columns (name, company, ...).
 */
export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_IN_TEXT) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

export async function readLeadsFile(file: File): Promise<string[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB');
  return extractEmails(await file.text());
}
