import type { ContentItem, ContentMetrics, Idea, Pillar, WorkspaceSettings, WorkspaceSnapshot } from '@/types';
import { PILLAR_PALETTE } from '@/config/theme';

export const SCHEMA_VERSION = 4;

export const EMPTY_METRICS: ContentMetrics = {
  views: 0,
  reach: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  followersGained: 0,
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  platforms: ['Instagram', 'TikTok'],
  contentTypes: ['Reels', 'Carousel', 'Static', 'Story', 'TikTok', 'UGC'],
  statuses: [
    { name: 'Ideation', tone: 'gray', stage: 'idea' },
    { name: 'Brief Ready', tone: 'purple', stage: 'progress' },
    { name: 'Production', tone: 'orange', stage: 'progress' },
    { name: 'Editing', tone: 'yellow', stage: 'progress' },
    { name: 'Review', tone: 'blue', stage: 'progress' },
    { name: 'Ready to Post', tone: 'cyan', stage: 'progress' },
    { name: 'Scheduled', tone: 'indigo', stage: 'scheduled' },
    { name: 'Posted', tone: 'green', stage: 'published' },
  ],
  objectives: ['Awareness', 'Engagement', 'Education', 'Conversion', 'Community'],
  ideaStatuses: ['New', 'In Discussion', 'Approved', 'Moved to Plan'],
  team: [
    { id: 't_nadia', name: 'Nadia Putri', role: 'Social Media Specialist', color: '#17211a' },
    { id: 't_raka', name: 'Raka Pratama', role: 'Videographer', color: '#2a78d6' },
    { id: 't_salsa', name: 'Salsa Amelia', role: 'Graphic Designer', color: '#eb6834' },
    { id: 't_dimas', name: 'Dimas Ardi', role: 'Copywriter', color: '#4a3aa7' },
  ],
  brand: {
    name: 'KARDEUCE',
    tagline: 'Tennis community buat lo yang baru mulai, pengen mabar, atau cari circle baru.',
    audience:
      'Young professionals & office workers di Jabodetabek. Mostly beginner/newbie, pengen belajar tennis, cari temen mabar, dan cari aktivitas sosial seru after-office atau weekend. Aktif di Instagram & TikTok, lifestyle-oriented.',
    personality: ['Fun', 'Social', 'Casual', 'Youthful', 'Witty', 'Relatable', 'Tennis-culture driven', 'Slightly playful'],
    toneDo: [
      'Pakai bahasa sehari-hari: "lo/gue" boleh, campur English secukupnya',
      'Relatable sama kehidupan orang kantoran',
      'Jokes tennis yang dimengerti pemula',
      'Ajak interaksi: tag temen, comment, share',
    ],
    toneDont: ['Terlalu formal / corporate', 'Jargon teknis tanpa penjelasan', 'Hard selling di setiap post', 'Ngejek pemain pemula'],
  },
};

export const DEFAULT_PILLARS: Pillar[] = [
  {
    id: 'p_entertainment',
    name: 'Entertainment',
    color: PILLAR_PALETTE[0],
    description: 'Increase awareness, reach, engagement, shares, and relatability.',
    objective: 'Awareness & Engagement',
    kpis: ['Reach', 'Shares', 'Comments'],
    examples: [
      'Tennis memes',
      'Beginner tennis struggles',
      'Tennis POV',
      'Tennis lifestyle',
      'Tennis jokes',
      'Relatable tennis moments',
      'Office worker x tennis jokes',
    ],
    recommendedPct: 35,
  },
  {
    id: 'p_education',
    name: 'Education',
    color: PILLAR_PALETTE[1],
    description: 'Help beginner players understand tennis and build KARDEUCE authority.',
    objective: 'Education & Authority',
    kpis: ['Saves', 'Shares', 'Watch Time'],
    examples: [
      'Beginner tips',
      'Tennis rules',
      'Forehand tips',
      'Backhand tips',
      'Serve basics',
      'Tennis etiquette',
      'Equipment guide',
      'Beginner mistakes',
    ],
    recommendedPct: 25,
  },
  {
    id: 'p_promotion',
    name: 'Promotion',
    color: PILLAR_PALETTE[2],
    description: 'Convert followers into coaching participants, mabar participants, or customers.',
    objective: 'Conversion',
    kpis: ['DM', 'Registration', 'Clicks', 'Conversion'],
    examples: [
      'Coaching highlights',
      'Training sessions',
      'Student progress',
      'Community atmosphere',
      'Testimonials',
      'Fun coaching games',
      'Class registration',
      'Event promotion',
    ],
    recommendedPct: 25,
  },
  {
    id: 'p_informative',
    name: 'Informative',
    color: PILLAR_PALETTE[3],
    description: 'Become a useful resource for the tennis community.',
    objective: 'Utility & Discovery',
    kpis: ['Saves', 'Shares', 'Profile Visits'],
    examples: [
      'Tennis court recommendations',
      'Court prices',
      'Court reviews',
      'Tennis facilities',
      'Tennis events',
      'Equipment recommendations',
      'Places to play',
    ],
    recommendedPct: 15,
  },
];

const PILLAR_OBJECTIVE: Record<string, string> = {
  Entertainment: 'Awareness',
  Education: 'Education',
  Promotion: 'Conversion',
  Informative: 'Awareness',
};

const NOW = '2026-10-01T09:00:00.000Z';

let seq = 0;
function content(p: Partial<ContentItem> & Pick<ContentItem, 'publishDate' | 'contentType' | 'contentPillar' | 'title'>): ContentItem {
  seq += 1;
  const pillar = DEFAULT_PILLARS.find((x) => x.name === p.contentPillar);
  return {
    id: `c_seed_${String(seq).padStart(3, '0')}`,
    platform: p.contentType === 'TikTok' ? ['TikTok'] : p.contentType === 'Reels' ? ['Instagram', 'TikTok'] : ['Instagram'],
    brief: 'Modifikasi dari referensi konten',
    hook: '',
    script: '',
    caption: '',
    cta: '',
    references: [],
    coverImage: '',
    contentUrl: '',
    status: 'Ideation',
    objective: PILLAR_OBJECTIVE[p.contentPillar] ?? 'Awareness',
    kpi: pillar?.kpis.join(', ') ?? '',
    owner: '',
    notes: '',
    metrics: { ...EMPTY_METRICS },
    platformMetrics: {},
    order: seq,
    createdAt: NOW,
    updatedAt: NOW,
    ...p,
  };
}

/** Mirrors the "CONTEN PLAN OKTOBER 2026" Google Sheet row for row (12 posts). */
const PLAN: ContentItem[] = [
  content({ publishDate: '2026-10-10', contentType: 'Carousel', contentPillar: 'Entertainment', title: 'Alasan Main Tennis', status: 'Posted', references: ['https://www.instagram.com/p/Dd1BsliAY7C/'] }),
  content({ publishDate: '2026-10-13', contentType: 'Reels', contentPillar: 'Entertainment', title: 'Excited Hidup', references: ['https://www.instagram.com/reel/DUPbDrykye2/'] }),
  content({ publishDate: '2026-10-15', contentType: 'Carousel', contentPillar: 'Entertainment', title: 'Circle of Life', references: ['https://www.instagram.com/p/Dc2kdB8qBzA/'] }),
  content({ publishDate: '2026-10-17', contentType: 'Carousel', contentPillar: 'Education', title: 'Tips Pemula', references: ['https://www.instagram.com/p/DeBNJ9qAQt1/'] }),
  content({ publishDate: '2026-10-20', contentType: 'Reels', contentPillar: 'Promotion', title: 'Cinematic' }),
  content({ publishDate: '2026-10-22', contentType: 'Carousel', contentPillar: 'Entertainment', title: 'Yes You Can', references: ['https://www.instagram.com/p/DeJE-6FJlG0/'] }),
  content({ publishDate: '2026-10-24', contentType: 'Reels', contentPillar: 'Entertainment', title: 'Kita Kaya Dulu', references: ['https://www.instagram.com/reel/DeDskRrOfr-/'] }),
  content({ publishDate: '2026-10-27', contentType: 'Reels', contentPillar: 'Entertainment', title: 'Profesi Pemain Tennis', references: ['https://www.instagram.com/reel/DctWQ21T-6t/'] }),
  content({ publishDate: '2026-10-29', contentType: 'Reels', contentPillar: 'Promotion', title: 'Fun Coaching / Games' }),
  content({ publishDate: '2026-10-31', contentType: 'Carousel', contentPillar: 'Entertainment', title: 'Makasih Tennis', references: ['https://www.instagram.com/p/Ddi_rlHAZ84/'] }),
  content({ publishDate: '2026-11-03', contentType: 'Carousel', contentPillar: 'Informative', title: 'Court Jakarta', references: ['https://www.instagram.com/p/DcGh2kqlBcQ/'] }),
  content({ publishDate: '2026-11-05', contentType: 'Reels', contentPillar: 'Entertainment', title: 'Salah Sepatu', references: ['https://www.instagram.com/reel/DcOcGoNzHjP/'] }),
];

function idea(i: number, p: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'>): Idea {
  return { id: `i_seed_${i}`, createdAt: NOW, updatedAt: NOW, ...p };
}

const IDEAS: Idea[] = [
  idea(1, { idea: 'Tennis Bingo: Hal yang Pasti Terjadi Saat Mabar', contentPillar: 'Entertainment', contentType: 'Carousel', description: 'Bingo card isi momen klasik mabar: bola nyangkut net, lupa skor, "sorry sorry".', hook: 'Berapa kotak yang udah lo centang?', reference: 'https://www.instagram.com/explore/tags/bingochallenge/', trend: 'Bingo card template', priority: 'High', status: 'Approved' }),
  idea(2, { idea: 'Grip Raket 101: Continental vs Eastern', contentPillar: 'Education', contentType: 'Reels', description: 'Coach jelasin 2 grip paling dasar + kapan dipakai.', hook: 'Salah grip = forehand lo nyangkut terus', reference: '', trend: '', priority: 'High', status: 'In Discussion' }),
  idea(3, { idea: 'Review Court: Senayan vs Kemang vs BSD', contentPillar: 'Informative', contentType: 'Carousel', description: 'Bandingin harga, fasilitas, parkir, vibe tiap court.', hook: 'Court mana yang paling worth buat mabar?', reference: '', trend: 'Comparison carousel', priority: 'Medium', status: 'New' }),
  idea(4, { idea: 'Day in the Life Coach KARDEUCE', contentPillar: 'Promotion', contentType: 'Reels', description: 'Ikutin 1 hari coach dari pagi sampai kelas malam.', hook: 'Jadi coach tennis tuh ngapain aja sih?', reference: 'https://www.tiktok.com/tag/dayinmylife', trend: 'Day in my life', priority: 'Medium', status: 'New' }),
  idea(5, { idea: 'Tennis Outfit Check di Kantor', contentPillar: 'Entertainment', contentType: 'TikTok', description: 'Dari kemeja kantor langsung ganti outfit tennis di toilet kantor.', hook: 'Outfit check: 17.00 vs 19.00', reference: '', trend: 'Outfit check / GRWM', priority: 'Low', status: 'New' }),
  idea(6, { idea: 'Aturan Skor Tennis Biar Gak Bingung', contentPillar: 'Education', contentType: 'Carousel', description: 'Kenapa 0 = love, 15-30-40, deuce & advantage dalam 6 slide.', hook: 'Kenapa skor tennis aneh banget sih?', reference: '', trend: '', priority: 'High', status: 'Approved' }),
  idea(7, { idea: 'Kalau Raket Tennis Bisa Ngomong', contentPillar: 'Entertainment', contentType: 'Reels', description: 'POV raket yang dipake pemula: dibanting, dipinjem, lupa dibawa.', hook: 'POV: lo raket punya pemula', reference: '', trend: 'POV object talking', priority: 'Medium', status: 'In Discussion' }),
  idea(8, { idea: 'KARDEUCE Night Rally', contentPillar: 'Promotion', contentType: 'Static', description: 'Teaser event mabar malam + music + giveaway merch.', hook: 'Tennis malam, lampu court, playlist kenceng.', reference: '', trend: '', priority: 'Medium', status: 'New' }),
];

export function createSeedSnapshot(): WorkspaceSnapshot {
  return {
    version: SCHEMA_VERSION,
    contents: PLAN.map((c) => ({ ...c, metrics: { ...c.metrics }, references: [...c.references] })),
    ideas: IDEAS.map((i) => ({ ...i })),
    pillars: DEFAULT_PILLARS.map((p) => ({ ...p, kpis: [...p.kpis], examples: [...p.examples] })),
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
