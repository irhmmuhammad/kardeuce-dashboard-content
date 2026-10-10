import type { ContentItem, TeamMember } from '@/types';
import { formatSheet, parseLooseDate } from './date';
import { contentTotals } from './analytics';

const COLUMNS: { header: string; aliases: string[]; get: (c: ContentItem, team: TeamMember[]) => string | number }[] = [
  { header: 'Date Post', aliases: ['date', 'publish date', 'tanggal'], get: (c) => formatSheet(c.publishDate) },
  { header: 'Platform', aliases: ['platforms'], get: (c) => c.platform.join('; ') },
  { header: 'Content Type', aliases: ['type', 'format'], get: (c) => c.contentType },
  { header: 'Content Pillar', aliases: ['pillar'], get: (c) => c.contentPillar },
  { header: 'Judul Konten', aliases: ['title', 'judul'], get: (c) => c.title },
  { header: 'Brief', aliases: [], get: (c) => c.brief },
  { header: 'Hook', aliases: [], get: (c) => c.hook },
  { header: 'Script', aliases: ['content structure'], get: (c) => c.script },
  { header: 'Caption', aliases: [], get: (c) => c.caption },
  { header: 'CTA', aliases: [], get: (c) => c.cta },
  { header: 'Reference', aliases: ['references', 'referensi'], get: (c) => c.references.join(' | ') },
  { header: 'Cover', aliases: ['cover image', 'thumbnail'], get: (c) => (c.coverImage.startsWith('data:') ? '(uploaded image)' : c.coverImage) },
  { header: 'Link Konten', aliases: ['content url', 'link', 'url'], get: (c) => c.contentUrl },
  { header: 'Status Upload', aliases: ['status'], get: (c) => c.status },
  { header: 'PIC', aliases: ['owner'], get: (c, team) => team.find((t) => t.id === c.owner)?.name ?? '' },
  { header: 'Objective', aliases: [], get: (c) => c.objective },
  { header: 'KPI', aliases: [], get: (c) => c.kpi },
  { header: 'Notes', aliases: ['catatan'], get: (c) => c.notes },
  { header: 'Views', aliases: [], get: (c) => contentTotals(c).views ?? '' },
  { header: 'Reach', aliases: [], get: (c) => contentTotals(c).reach ?? '' },
  { header: 'Likes', aliases: [], get: (c) => contentTotals(c).likes ?? '' },
  { header: 'Comments', aliases: [], get: (c) => contentTotals(c).comments ?? '' },
  { header: 'Shares', aliases: [], get: (c) => contentTotals(c).shares ?? '' },
  { header: 'Saves', aliases: [], get: (c) => contentTotals(c).saves ?? '' },
];

export function escapeCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function contentsToCsv(items: ContentItem[], team: TeamMember[]): string {
  const header = ['No', ...COLUMNS.map((c) => c.header)];
  const rows = items.map((item, i) => [i + 1, ...COLUMNS.map((col) => col.get(item, team))]);
  return [header, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/** RFC-4180-ish parser that handles quoted cells, escaped quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function csvToContents(text: string, team: TeamMember[]): Partial<ContentItem>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const find = (name: string) => {
    const col = COLUMNS.find((c) => c.header === name)!;
    const keys = [col.header.toLowerCase(), ...col.aliases];
    return header.findIndex((h) => keys.includes(h));
  };
  const idx = Object.fromEntries(COLUMNS.map((c) => [c.header, find(c.header)])) as Record<string, number>;
  const get = (r: string[], name: string) => (idx[name] >= 0 ? (r[idx[name]] ?? '').trim() : '');

  return rows.slice(1).map((r) => {
    const pic = get(r, 'PIC');
    const cover = get(r, 'Cover');
    return {
      publishDate: parseLooseDate(get(r, 'Date Post')),
      platform: get(r, 'Platform')
        .split(/[;,/]/)
        .map((s) => s.trim())
        .filter(Boolean),
      contentType: get(r, 'Content Type'),
      contentPillar: get(r, 'Content Pillar'),
      title: get(r, 'Judul Konten') || 'Untitled content',
      brief: get(r, 'Brief'),
      hook: get(r, 'Hook'),
      script: get(r, 'Script'),
      caption: get(r, 'Caption'),
      cta: get(r, 'CTA'),
      references: get(r, 'Reference')
        .split(/\s*\|\s*|\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
      coverImage: /^https?:\/\//.test(cover) ? cover : '',
      contentUrl: get(r, 'Link Konten'),
      status: get(r, 'Status Upload') || 'Ideation',
      owner: team.find((t) => t.name.toLowerCase() === pic.toLowerCase())?.id ?? '',
      objective: get(r, 'Objective'),
      kpi: get(r, 'KPI'),
      notes: get(r, 'Notes'),
      metrics: {
        views: num(get(r, 'Views')),
        reach: num(get(r, 'Reach')),
        likes: num(get(r, 'Likes')),
        comments: num(get(r, 'Comments')),
        shares: num(get(r, 'Shares')),
        saves: num(get(r, 'Saves')),
        followersGained: 0,
      },
    };
  });
}

/** Rows → CSV text (first row = header). */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + content : content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
