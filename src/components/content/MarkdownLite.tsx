import { Fragment, type ReactNode } from 'react';

/** Inline: **bold**, _italic_, `code`. Returns React nodes (no innerHTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('_')) out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    else out.push(<code key={i++}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ source, className }: { source: string; className?: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = (`h${h[1].length}` as 'h1' | 'h2' | 'h3');
      blocks.push(<Tag key={blocks.length}>{inline(h[2])}</Tag>);
    } else if (line.trim()) {
      blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    } else {
      blocks.push(<Fragment key={blocks.length} />);
    }
  }
  flush();
  return <div className={`prose-lite text-[13px] leading-relaxed text-ink ${className ?? ''}`}>{blocks}</div>;
}
