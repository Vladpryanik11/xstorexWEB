/** A block of an app description written by the admin as plain text. */
export type DescriptionBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'ul'; items: string[] };

const BULLET = /^[•-]\s*/;

/**
 * Plain text → blocks: lines starting with «• » or «- » form one list, a line ending with a colon
 * right before a list is its heading, every other non-empty line is a paragraph.
 */
export function parseDescription(text: string): DescriptionBlock[] {
  const blocks: DescriptionBlock[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '').trim();
      if (!item) continue;
      const last = blocks.at(-1);
      if (last?.kind === 'ul') {
        last.items.push(item);
        continue;
      }
      if (last?.kind === 'p' && last.text.endsWith(':')) {
        blocks[blocks.length - 1] = { kind: 'h', text: last.text.slice(0, -1).trim() };
      }
      blocks.push({ kind: 'ul', items: [item] });
      continue;
    }
    blocks.push({ kind: 'p', text: line });
  }
  return blocks;
}
