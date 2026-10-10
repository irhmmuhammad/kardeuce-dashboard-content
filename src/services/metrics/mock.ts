import type { AccountDayInput, PostInput, PostMetrics, PostType, SocialPlatform } from '@shared/insights';
import type { ContentItem } from '@/types';
import { addDays, diffDays, todayISO } from '@/lib/date';
import type { MetricsProvider } from './types';

/**
 * Deterministic demo data. Every number is derived from a hash of
 * (platform, date) or (platform, post id), so the same day always shows the
 * same values, across reloads and machines, without storing anything.
 *
 * It mirrors what each API can really return: Instagram has no account-level
 * profile visits (deprecated), Reels have no profile visits/follows, and so on,
 * so the demo shows "—" in the same places real data will.
 */

export const MOCK_WINDOW_DAYS = 90;
const EPOCH = '2026-01-01';

function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 seeded by a string. */
function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, min: number, max: number) => min + r() * (max - min);
function pick<T>(r: () => number, items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    if ((x -= w) <= 0) return v;
  }
  return items[items.length - 1][0];
}

const PROFILE = {
  Instagram: { followersBase: 2140, followersSlope: 6.2, views: 3100, reachRatio: 0.62, er: 0.05 },
  TikTok: { followersBase: 1380, followersSlope: 9.8, views: 5200, reachRatio: 0.71, er: 0.062 },
} satisfies Record<SocialPlatform, unknown>;

function followersOn(platform: SocialPlatform, date: string): number {
  const t = diffDays(EPOCH, date);
  const p = PROFILE[platform];
  // Gentle growth with a slow wobble and a small weekend bump.
  return Math.round(p.followersBase + p.followersSlope * t + 38 * Math.sin(t / 9) + 6 * Math.sin(t / 2.3));
}

/* ---------------- Posts ---------------- */

const DEMO_TITLES: Record<string, string[]> = {
  Entertainment: [
    'POV: Pertama Kali Pegang Raket',
    'Orang Kantor vs Tennis Jam 7 Malam',
    'Tipe-Tipe Partner Mabar',
    'Dress Code Tennis vs Realita',
    'Kalau Raket Tennis Bisa Ngomong',
    'Tennis Bingo Saat Mabar',
    'Meeting Jam 5, Court Jam 7',
    'Ekspektasi vs Realita Serve Pertama',
  ],
  Education: [
    '5 Kesalahan Pemula Saat Forehand',
    'Serve Basic dalam 30 Detik',
    'Aturan Skor Tennis Biar Gak Bingung',
    'Grip Raket 101: Continental vs Eastern',
    'Bedanya Rally, Game, Set, Match',
    'Footwork Dasar Buat Pemula',
  ],
  Promotion: [
    'BTS Coaching Sabtu Pagi',
    'Testimoni Murid: Dari Nol ke Rally',
    'Open Mabar Batch Baru',
    'What Happens in a Kardeuce Session?',
    'Fun Coaching Games',
  ],
  Informative: [
    'Court Murah di Jakarta Selatan',
    'Racket Beginner di Bawah Rp2 Juta',
    'Review Court: Senayan vs Kemang',
    'Checklist Barang Bawaan ke Court',
  ],
};

const PILLAR_WEIGHTS: [string, number][] = [
  ['Entertainment', 40],
  ['Education', 25],
  ['Promotion', 20],
  ['Informative', 15],
];

/** Per pillar: [views multiplier, likes rate, shares rate, saves rate]. */
const PILLAR_SHAPE: Record<string, [number, number, number, number]> = {
  Entertainment: [1.3, 0.062, 0.013, 0.006],
  Education: [1.0, 0.05, 0.008, 0.032],
  Promotion: [0.7, 0.045, 0.004, 0.004],
  Informative: [0.9, 0.048, 0.009, 0.027],
};

const HOUR_WEIGHTS: [number, number][] = [
  [7, 2],
  [8, 1],
  [12, 3],
  [13, 2],
  [17, 2],
  [19, 4],
  [20, 4],
  [21, 2],
];

function hourMultiplier(h: number): number {
  if (h >= 19 && h <= 21) return 1.38;
  if (h >= 12 && h <= 13) return 1.08;
  if (h <= 8) return 0.86;
  return 0.94;
}

interface MockPost extends PostInput {
  demoPillar: string;
  demoFormat: string;
}

function formatFor(platform: SocialPlatform, r: () => number): { type: PostType; format: string } {
  if (platform === 'TikTok') {
    const format = pick(r, [
      ['Reels', 75],
      ['Carousel', 25],
    ]);
    return { type: format === 'Carousel' ? 'Carousel' : 'Video', format };
  }
  const format = pick(r, [
    ['Reels', 46],
    ['Carousel', 34],
    ['Static', 12],
    ['Story', 8],
  ]);
  return { type: format as PostType, format };
}

function postMetrics(platform: SocialPlatform, post: MockPost, today: string): PostMetrics {
  const r = rng(`${post.mediaId}:metrics`);
  const [viewMul, likeRate, shareRate, saveRate] = PILLAR_SHAPE[post.demoPillar] ?? PILLAR_SHAPE.Entertainment;
  const date = post.publishedAt.slice(0, 10);
  const age = Math.max(0, diffDays(date, today));
  const maturity = Math.min(1, (age + 1) / 4);
  const hour = Number(post.publishedAt.slice(11, 13));
  const isVideo = post.type === 'Reels' || post.type === 'Video';
  const base =
    platform === 'TikTok' ? (isVideo ? 8600 : 3600) : post.type === 'Reels' ? 5600 : post.type === 'Carousel' ? 2500 : post.type === 'Story' ? 520 : 1500;
  // Education Reels get a saves boost so the demo surfaces a real-looking insight.
  const eduReels = post.demoPillar === 'Education' && isVideo ? 1.55 : 1;
  const views = Math.round(base * viewMul * hourMultiplier(hour) * between(r, 0.6, 1.6) * maturity);
  const reach = Math.round(views * (platform === 'TikTok' ? between(r, 0.7, 0.8) : between(r, 0.62, 0.74)));
  const likes = Math.round(reach * likeRate * between(r, 0.75, 1.25));
  const comments = Math.round(reach * 0.006 * between(r, 0.5, 1.6));
  const shares = Math.round(reach * shareRate * between(r, 0.6, 1.4));
  const saves = Math.round(reach * saveRate * eduReels * between(r, 0.7, 1.3));
  const m: PostMetrics = { views, reach, likes, comments, shares, saves };

  if (platform === 'Instagram') {
    if (post.type === 'Story') {
      return {
        views,
        reach,
        shares,
        totalInteractions: shares + Math.round(reach * 0.01),
        profileVisits: Math.round(reach * 0.012),
        follows: Math.round(reach * 0.002),
        storyReplies: Math.round(reach * 0.01),
        storyNavigation: {
          tap_forward: Math.round(reach * 0.62),
          tap_back: Math.round(reach * 0.08),
          tap_exit: Math.round(reach * 0.14),
          swipe_forward: Math.round(reach * 0.06),
        },
      };
    }
    m.totalInteractions = likes + comments + shares + saves;
    if (post.type === 'Reels') {
      const avg = Number(between(r, 5.5, 11.5).toFixed(1));
      m.avgWatchTime = avg;
      m.totalWatchTime = Math.round(views * avg);
      m.skipRate = Number(between(r, 28, 52).toFixed(1));
    } else {
      m.profileVisits = Math.round(reach * between(r, 0.008, 0.016));
      m.follows = Math.round(reach * between(r, 0.001, 0.003));
    }
    return m;
  }

  // TikTok
  m.profileVisits = Math.round(views * between(r, 0.015, 0.03));
  m.follows = Math.round(views * between(r, 0.002, 0.005));
  if (isVideo) {
    const avg = Number(between(r, 4.8, 14).toFixed(1));
    m.avgWatchTime = avg;
    m.totalWatchTime = Math.round(views * avg);
    m.completionRate = Number(between(r, 11, 38).toFixed(1));
  }
  const fyp = between(r, 68, 84);
  const rest = 100 - fyp;
  m.trafficSources = {
    'For You': Number(fyp.toFixed(1)),
    Follow: Number((rest * 0.38).toFixed(1)),
    Profile: Number((rest * 0.24).toFixed(1)),
    Search: Number((rest * 0.22).toFixed(1)),
    Sound: Number((rest * 0.1).toFixed(1)),
    Hashtag: Number((rest * 0.06).toFixed(1)),
  };
  return m;
}

function buildPosts(platform: SocialPlatform, contents: ContentItem[], pillarNames: string[], today: string): MockPost[] {
  const since = addDays(today, -(MOCK_WINDOW_DAYS - 1));
  const posts: MockPost[] = [];
  const prefix = platform === 'Instagram' ? 'ig' : 'tt';
  const pillarWeights = PILLAR_WEIGHTS.filter(([p]) => pillarNames.includes(p));
  const weights = pillarWeights.length ? pillarWeights : PILLAR_WEIGHTS;

  // Real plan items already in the window get a matching post, so linking can be demoed.
  const planDates = new Map<string, ContentItem>();
  for (const c of contents) {
    if (!c.publishDate || c.publishDate < since || c.publishDate > today) continue;
    if (c.platform.length && !c.platform.includes(platform)) continue;
    planDates.set(c.publishDate, c);
  }

  for (let i = 0; i < MOCK_WINDOW_DAYS; i++) {
    const date = addDays(since, i);
    const plan = planDates.get(date);
    const r = rng(`${platform}:${date}:post`);
    if (!plan && r() > 0.34) continue;
    const id = `mock_${prefix}_${date.replace(/-/g, '')}`;
    const hour = pick(r, HOUR_WEIGHTS);
    const minute = Math.floor(r() * 60);
    let { type, format } = formatFor(platform, r);
    let pillar = pick(r, weights);
    let title = pick(r, (DEMO_TITLES[pillar] ?? DEMO_TITLES.Entertainment).map((t) => [t, 1] as [string, number]));
    let caption = '';
    if (plan) {
      pillar = plan.contentPillar || pillar;
      format = plan.contentType || format;
      type = platform === 'TikTok' ? (format === 'Carousel' ? 'Carousel' : 'Video') : format === 'Carousel' ? 'Carousel' : format === 'Static' ? 'Static' : 'Reels';
      title = plan.title;
      caption = plan.caption;
    }
    if (!caption) caption = `${title} 🎾\n\nLo pernah ngalamin juga? Tag temen mabar lo!\n\n#KARDEUCE #TennisJakarta #TennisPemula`;
    const permalink =
      platform === 'Instagram'
        ? `https://www.instagram.com/${type === 'Reels' ? 'reel' : 'p'}/DEMO${hash(id).toString(36).toUpperCase()}/`
        : `https://www.tiktok.com/@kardeuce/video/74${String(hash(id)).padStart(10, '0').slice(0, 10)}`;
    const post: MockPost = {
      platform,
      mediaId: id,
      permalink,
      type,
      publishedAt: `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`,
      caption,
      thumbnail: '',
      metrics: {},
      demoPillar: pillar,
      demoFormat: format,
    };
    post.metrics = postMetrics(platform, post, today);
    posts.push(post);
  }
  return posts;
}

/* ---------------- Account days ---------------- */

function accountDay(platform: SocialPlatform, date: string, postsByDate: Map<string, MockPost>): AccountDayInput {
  const r = rng(`${platform}:${date}:account`);
  const p = PROFILE[platform];
  const t = diffDays(EPOCH, date);
  const dow = new Date(`${date}T12:00:00`).getDay();
  const weekday = dow === 0 || dow === 6 ? 1.22 : dow === 5 ? 1.1 : 1;
  const prevDay = addDays(date, -1);
  const spike = postsByDate.has(date) ? 1.75 : postsByDate.has(prevDay) ? 1.3 : 1;
  const views = Math.round(p.views * weekday * spike * (1 + 0.004 * (t - 180)) * between(r, 0.78, 1.22));
  const reach = Math.round(views * p.reachRatio * between(r, 0.92, 1.08));
  const interactions = Math.round(reach * p.er * between(r, 0.8, 1.2));
  const likes = Math.round(interactions * 0.72);
  const comments = Math.round(interactions * 0.08);
  const shares = Math.round(interactions * 0.09);
  const followers = followersOn(platform, date);
  const day: AccountDayInput = {
    platform,
    date,
    followers,
    netFollowers: followers - followersOn(platform, prevDay),
    reach,
    views,
    accountsEngaged: Math.round(interactions * 0.58),
    likes,
    comments,
    shares,
  };
  if (platform === 'Instagram') {
    day.saves = interactions - likes - comments - shares;
    day.interactions = interactions;
    day.linkClicks = Math.round(reach * between(r, 0.002, 0.005));
    // profileVisits stays undefined: Instagram deprecated account-level profile_views.
  } else {
    day.interactions = likes + comments + shares;
    day.profileVisits = Math.round(views * between(r, 0.018, 0.03));
  }
  return day;
}

/* ---------------- Provider ---------------- */

export function mockProvider(platform: SocialPlatform, contents: ContentItem[], pillarNames: string[]): MetricsProvider {
  const today = todayISO();
  let cache: MockPost[] | null = null;
  const posts = () => (cache ??= buildPosts(platform, contents, pillarNames, today));
  // Simulate a little network latency so loading states are visible in the demo.
  const delay = <T,>(v: T) => new Promise<T>((res) => setTimeout(() => res(v), 280));

  return {
    platform,
    kind: 'mock',
    listIncludesInsights: true,
    async getAccountInsights(range) {
      const byDate = new Map(posts().map((p) => [p.publishedAt.slice(0, 10), p]));
      const days: AccountDayInput[] = [];
      const start = range.since > addDays(today, -(MOCK_WINDOW_DAYS - 1)) ? range.since : addDays(today, -(MOCK_WINDOW_DAYS - 1));
      for (let d = start; d <= range.until && d <= today; d = addDays(d, 1)) days.push(accountDay(platform, d, byDate));
      return delay({ followersNow: followersOn(platform, today), days, warnings: [] });
    },
    async listMedia(range) {
      const list = posts().filter((p) => {
        const d = p.publishedAt.slice(0, 10);
        return d >= range.since && d <= range.until;
      });
      return delay({ posts: list, warnings: [] });
    },
    async getMediaInsights(refs) {
      const ids = new Set(refs.map((r) => r.mediaId));
      return delay({ metrics: Object.fromEntries(posts().filter((p) => ids.has(p.mediaId)).map((p) => [p.mediaId, p.metrics])), warnings: [] });
    },
  };
}

/** Demo pillar/format for a mock post id (used when storing posts). */
export function isMockPost(p: PostInput): p is MockPost {
  return 'demoPillar' in p;
}
