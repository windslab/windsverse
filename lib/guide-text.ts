// How to Winds Space: the pieces a chapter is made of, and the plain-text format the admin writes
// rules in. One line each:
//   ## Subjudul                     a subheading
//   - poin                          a bullet list
//   1. langkah                      a numbered list
//   > catatan                       a note box
//   ! peringatan                    a warning box
//   Langkah A -> Langkah B -> …     a visual flow (a step may add a line under it: "Judul | ket")
//   ? Pertanyaan                    a choice; the lines under it that start with "* Pilihan:"
//   * Pilihan: langkah -> langkah   are its branches, each a little flow of its own
// Anything else is a paragraph (lines next to each other belong together). **tebal** is bold.

export type FlowStep = { title: string; sub?: string };
export type Block =
  | { h: string }
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { note: string; title?: string }
  | { warn: string; title?: string }
  | { flow: FlowStep[] }
  | { choice: string; options: { label: string; steps: FlowStep[] }[] }
  | { table: { head: string[]; rows: string[][] } };

const step = (text: string): FlowStep => {
  const [title, sub] = text.split('|').map((x) => x.trim());
  return sub ? { title, sub } : { title };
};
const flowOf = (line: string) =>
  line
    .split('->')
    .map((x) => x.trim())
    .filter(Boolean)
    .map(step);

/** Reads the admin's text into blocks. */
export function parseGuide(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ p: para.join(' ') });
    para = [];
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const last = blocks.at(-1);
    if (!line) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#{1,3}\s+(.+)/))) {
      flush();
      blocks.push({ h: m[1] });
    } else if ((m = line.match(/^[-•]\s+(.+)/))) {
      flush();
      if (last && 'ul' in last) last.ul.push(m[1]);
      else blocks.push({ ul: [m[1]] });
    } else if ((m = line.match(/^\d+[.)]\s+(.+)/))) {
      flush();
      if (last && 'ol' in last) last.ol.push(m[1]);
      else blocks.push({ ol: [m[1]] });
    } else if ((m = line.match(/^>\s*(.+)/))) {
      flush();
      blocks.push({ note: m[1] });
    } else if ((m = line.match(/^!\s*(.+)/))) {
      flush();
      blocks.push({ warn: m[1] });
    } else if ((m = line.match(/^\?\s*(.+)/))) {
      flush();
      blocks.push({ choice: m[1], options: [] });
    } else if ((m = line.match(/^\*\s*([^:]+):\s*(.+)/)) && last && 'choice' in last) {
      last.options.push({ label: m[1].trim(), steps: flowOf(m[2]) });
    } else if (line.includes('->')) {
      flush();
      blocks.push({ flow: flowOf(line) });
    } else para.push(line);
  }
  flush();
  return blocks;
}

/** Text with **bold** split into plain and bold runs. */
export function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? { bold: true, text: part.slice(2, -2) }
        : { bold: false, text: part },
    );
}

/** All the words of a chapter, for the search box. */
export function blockText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if ('h' in b) return b.h;
      if ('p' in b) return b.p;
      if ('ul' in b) return b.ul.join(' ');
      if ('ol' in b) return b.ol.join(' ');
      if ('note' in b) return (b.title ?? '') + ' ' + b.note;
      if ('warn' in b) return (b.title ?? '') + ' ' + b.warn;
      if ('flow' in b) return b.flow.map((s) => s.title + ' ' + (s.sub ?? '')).join(' ');
      if ('choice' in b)
        return (
          b.choice +
          ' ' +
          b.options.map((o) => o.label + ' ' + o.steps.map((s) => s.title).join(' ')).join(' ')
        );
      return [...b.table.head, ...b.table.rows.flat()].join(' ');
    })
    .join(' ');
}
