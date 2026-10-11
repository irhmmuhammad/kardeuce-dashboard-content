# KARDEUCE · Content Hub

Content strategy & planning workspace for the KARDEUCE social media team — a spreadsheet-fast content plan with the structure of Notion/Airtable.

Built with **React 18 + TypeScript + Vite + Tailwind CSS v4**, **Recharts**, **Lucide** and **Zustand**. Data persists in `localStorage` through a swappable adapter, so it can move to Supabase / Firebase / PostgreSQL without touching the UI.

---

## Run it

Requires **Node.js 20.12+** (https://nodejs.org). Node 22 or 24 recommended.

```bash
npm install
npm run dev        # web app http://localhost:5173 + insights API http://localhost:8787
```

`npm run dev` starts two processes with `concurrently`: the Vite web app and the small API server in `server/` (Hono). Vite forwards every `/api/*` request to the API server, which is the only place access tokens and app secrets live.

**No credentials needed to try it.** Without a `.env` (or with empty keys) the Dashboard and Performance pages run on deterministic **demo data** for Instagram and TikTok and show a *Demo data* badge. To switch to your real accounts, follow **[Menghubungkan Instagram & TikTok (data asli)](#menghubungkan-instagram--tiktok-data-asli)** below.

```bash
npm run dev:web    # web app only (insights fall back to demo data)
npm run dev:api    # API server only (auto-restarts on change)
npm run build      # type-check web + server, production build into dist/
npm run preview    # serve the production build
```

The first load seeds the workspace with the October–November 2026 plan from the team’s Google Sheet (12 posts, same rows, dates, pillars and reference links), 8 Content Bank ideas, 4 pillars and a 4-person team. **Settings → Reset to sample data** restores it at any time.

---

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | **Insights** (top): platform switch (All · Instagram · TikTok) and period (7d · 28d · 90d · this month · custom) compared with the previous period; account KPI cards with delta + sparkline (followers & net growth, reach, views, engagement rate, interactions, profile visits); followers growth (IG vs TikTok), reach and ER trends, ER/saves/shares/reach by pillar and by format per platform, best day/hour heatmap, cross-platform Top content (opens the content drawer), and auto-generated insights in mixed Bahasa/English. **Planning** (below): month KPIs, pillar donut vs. recommended mix, format distribution, Content Health, warnings, upcoming posts, production pipeline, team workload. |
| **Content Strategy** | Brand foundation (audience, personality, tone do/don’t) and editable pillar cards: name, purpose, objective, KPIs, typical topics, recommended %, colour. Recommended-mix donut with a “totals 100%” check and this month’s actual share. Renaming a pillar updates every content item that uses it. |
| **Content Plan** | The main spreadsheet (details below), plus **Calendar** and **Kanban** views of the same data, Planning Insights and Content Health. |
| **Calendar** | Month and week views, colour-coded by pillar. Drag content between days, drop **Content Bank ideas** straight onto a date, click an empty day to create content. Sidebar lists unscheduled content. |
| **Content Bank** | Idea backlog (idea, pillar, type, description, hook, reference, trend, priority, status) in card or table view, with filters. **Move to Content Plan** asks for a date (suggests the next free day), platform, PIC and status, then carries hook/reference/pillar over. |
| **Performance** | **Account** tab: KPI cards, Instagram-vs-TikTok comparison with deltas, followers/reach/ER trends and a daily table (CSV export). **Content** tab: every synced post from both platforms (plus manual-only content), sortable and filterable by pillar, format and link status, column picker for every metric, CSV export, and **Link to content** for posts that weren’t matched automatically. |
| **Settings** | Edit platforms, content types, statuses (colour + workflow stage), team/PIC, objectives, idea statuses. Rename cascades everywhere. JSON backup/restore, reset, storage usage, integration placeholders, shortcut reference. **Integrations**: connect/disconnect Instagram & TikTok (OAuth or pasted token), account name, token expiry, last sync. |

### Content Plan spreadsheet

- Columns: No, Date Post, Content Type, Content Pillar, Judul Konten, Brief, Caption, Reference, Cover, Link Konten, Status Upload, and optional Platform, PIC, CTA, Objective, KPI, Notes (**View Options** to show/hide; preferences are remembered).
- Click a cell to select it and **Enter** to edit. You can also just start typing on a text cell. Dropdown cells (type, pillar, status, objective, PIC, platform) open on a single click.
- Brief / Caption / CTA / Notes are truncated in the grid and open a larger editor. The caption editor counts characters and hashtags against Instagram limits.
- Reference shows **Open Ref ↗**. Link Konten shows a platform icon link. Cover takes an image upload (auto-resized so it fits in storage), shows a thumbnail, and opens a preview on click.
- Clicking the **title** opens the Content Detail drawer: status, date, platform, type, pillar, PIC, objective, KPI, hook, brief (rich text), script/structure, caption, CTA, multiple references, cover, notes, metrics, plus Save / Duplicate / Delete and prev/next navigation.
- Rows: add (toolbar, **N**, or *New row* at the bottom), duplicate, delete (with confirmation + **Undo**), drag to reorder, right-click menu, multi-select (shift-click for ranges), and a bulk bar for status / pillar / PIC / shift dates / duplicate / delete.
- Sticky header, frozen columns (none · No + Date · up to Judul Konten), compact/comfortable density. About 13–15 rows fit on a 1366×768 laptop.
- Search across title, brief, caption and hook. Filters for platform, pillar, type, status and PIC can be combined, with **Clear Filters**. Sort by clicking a header or from the Sort menu (date, status, pillar, type, title, manual).
- Month navigation (← / → / Today), CSV export of the current view, CSV import (works with Google Sheets exports, including DD/MM/YYYY dates and quoted multi-line captions).
- On phones the table becomes a list of content cards.

### Planning Insights & Content Health

Recomputed on every change:

- Planned posts, posts/week, average and longest gap, pillar distribution vs. recommended mix, format distribution.
- Warnings such as *“Entertainment content dominates this month”*, *“Only 1 Education post is planned”*, *“No Informative content scheduled this month”*, *“Promotion content is below the recommended 20% allocation”*, and *“There is a large publishing gap this month”* (gap > 5 days).
- Health indicators: Posting Consistency, Content Pillar Balance, Promotion Frequency and Education Frequency, combined into a 0–100 score. Rules live in `src/lib/analytics.ts`.

### Keyboard

| Key | Action |
| --- | --- |
| `N` | New content |
| `/` | Focus search |
| Arrows / `Tab` | Move between cells |
| `Enter` | Edit cell / open dropdown |
| `Esc` | Cancel edit / close |
| `⇧ Enter` | Open content details |
| `⌘/Ctrl S` | Save (drawer, editors, cells) |
| `⌘/Ctrl D` | Duplicate row |
| `Space` | Select row |
| `Delete` | Clear cell |

---

## Project structure

```
server/             Insights API (Node + TypeScript, Hono) — holds tokens & secrets, never bundled
  index.ts          Routes: /api/integrations, /api/auth/:platform/*, /api/:platform/{account,media,media-insights}
  providers/        instagram.ts (Instagram Login), tiktokBusiness.ts (API for Business), tiktokDisplay.ts (Display API)
  tokenStore.ts     Tokens in server/.data/tokens.json (gitignored)
  rateLimit.ts      Per-platform request queues + Meta usage-header backoff
shared/
  insights.ts       Insight data shapes shared by server and web app
src/
  types/            Domain model (ContentItem, Idea, Pillar, settings, UI types)
  data/
    seed.ts         Sample workspace
    repository.ts   Picks the active adapter, normalises records, seeds on first run
    adapters/
      types.ts                 DataAdapter / Collection interfaces
      localStorageAdapter.ts   Current implementation
  store/
    workspace.ts    Zustand domain store (CRUD, rename cascade, import, reset), optimistic + persisted via adapter
    insights.ts     Account snapshots, synced posts, integrations, sync orchestration, conflicts
    ui.ts           View preferences (persisted) + session UI state
    toast.ts, confirm.ts
  lib/              analytics (filters, sorting, plan insights, health, ER formula), insights (periods, KPIs,
                    post rows, grouping, best time, generated insights), dates, CSV, image resize, layers
  services/
    metrics/        Insight providers (instagram, tiktok via /api, mock demo data), sync + post linking
  hooks/            hash router, media query, hotkeys, filtered/month selectors, useInsightsData
  components/
    layout/         Sidebar, PageHeader, SaveIndicator, Logo
    ui/             Button, Modal, Drawer, Popover, OptionList, Menu, Tooltip, Toaster, ConfirmDialog,
                    EmptyState, Skeleton, Segmented, MonthNavigator, Checkbox, Avatar, KpiCard, Field/TagInput
    badges/         StatusBadge, PillarBadge, TypeBadge, PriorityBadge, platform glyphs
    charts/         DonutChart (Recharts), DistributionBars, StackedBar, Sparkline
    insights/       InsightsToolbar, InsightsOverview, Charts (platform lines, grouped bars, heatmap),
                    PostPieces (top content, link picker), ContentInsights (drawer), IntegrationsPanel, ConflictDialog
    content/        ContentTable (DataTable), FilterBar, ViewOptions/SortMenu, ContentDrawer, QuickAddModal,
                    TextEditorModal, RichTextArea, CaptionEditor, CoverField, ReferenceList, BulkActionBar,
                    CalendarView, KanbanBoard, ContentCardList, PlanInsights, ContentHealthCard, ImportModal
    bank/           IdeaModal, MoveToPlanModal
  pages/            Dashboard, Strategy, ContentPlan, Calendar, ContentBank, Performance, Settings
```

UI components never touch `localStorage`. They call store actions, the store updates state optimistically, and the store persists through `db` (the adapter).

---

## How insights work

- **Metrics per platform.** Each content item keeps `platformMetrics.Instagram` / `platformMetrics.TikTok` (`source`: `manual`, `api` or `mock`). Old combined numbers were migrated safely (schema v3): content on exactly one platform moved to that platform as manual input; content on several platforms keeps them as “Combined · old manual input”. Nothing was dropped.
- **Collections** (through the same adapter): `accountSnapshots` (one row per platform per day) and `platformPosts` (one row per synced post, with `linkedContentId`).
- **One engagement-rate formula** everywhere: (likes + comments + shares + saves) ÷ reach × 100, using views when reach is missing (`src/lib/analytics.ts`, `ER_FORMULA`).
- **Missing ≠ zero.** A metric the platform doesn’t provide is `undefined` and shows as “—”.
- **Linking:** first the post permalink vs the item’s *Link Konten*, then publish date (±1 day) + caption/title similarity. Unmatched posts get **Link to content**; manual links are never changed by a sync.
- **Manual numbers are protected.** If a sync brings different numbers for content with manual input, a dialog asks which to keep (and remembers “keep manual”).
- **Sync:** *Sync now* on Dashboard/Performance/Settings, plus auto-sync on app open when the last sync is older than 6 h. Errors and partial failures show as readable banners; the last good data stays visible.
- **Demo mode** per platform until it’s connected (deterministic data in `src/services/metrics/mock.ts`). The first real sync replaces that platform’s demo rows; real data is never mixed with demo data.

## Moving to Supabase / Firebase / PostgreSQL

1. Create tables that mirror `src/types` (one row per `ContentItem`, `Idea` and `Pillar`, plus one settings row per workspace). A Postgres starting point:

```sql
create table contents (
  id text primary key,
  workspace_id uuid not null,
  publish_date date,
  platform text[] not null default '{}',
  content_type text, content_pillar text, title text not null,
  brief text, hook text, script text, caption text, cta text,
  "references" text[] not null default '{}',
  cover_image text, content_url text,
  status text not null, objective text, kpi text, owner text, notes text,
  metrics jsonb not null default '{}',
  "order" int not null default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- ideas, pillars and workspace_settings follow the same pattern.
```

2. Add `src/data/adapters/supabaseAdapter.ts` that implements `DataAdapter`: `contents.upsert` → `supabase.from('contents').upsert(rows)`, `contents.remove` → `.delete().in('id', ids)`, and so on. Map camelCase ↔ snake_case there.
3. Point `db` in `src/data/repository.ts` at the new adapter. Nothing else changes.
4. Move cover uploads from data URLs to Storage: `fileToCoverDataUrl` in `src/lib/image.ts` becomes an upload that returns a public URL.

## Connecting Instagram / TikTok metrics

See **[Menghubungkan Instagram & TikTok (data asli)](#menghubungkan-instagram--tiktok-data-asli)** below (step-by-step, Bahasa Indonesia). In short: app credentials go in `.env`, the API server in `server/` handles OAuth, token refresh and rate limits, and the web app only ever calls `/api/*`. Without credentials everything runs on demo data.

---

## Menghubungkan Instagram & TikTok (data asli)

Panduan ini untuk pemula, dari nol sampai data asli muncul di Dashboard. Tanpa langkah ini pun aplikasi tetap jalan memakai **data demo** (ada badge *Demo data*).

> **Penting soal keamanan:** access token dan app secret **hanya** disimpan di server (`.env` dan `server/.data/tokens.json`). Dua file itu sudah masuk `.gitignore`, jadi jangan di-commit, jangan di-share di chat.

### Cara paling gampang: Connect via browser (tanpa token)

Gak mau bikin developer app atau ngurus token? Pakai jalur ini.

1. `npm run dev`, buka **Settings → Integrations**.
2. Klik **Connect via browser**. Jendela Chrome baru kebuka di komputer ini.
   - **TikTok:** login ke TikTok. Data diambil dari TikTok Studio.
   - **Instagram:** login Instagram di tab pertama, lalu login Facebook di tab kedua (**Meta Business Suite**). Tab kedua opsional, tapi tanpa itu reach / saves / shares gak kebaca.
3. Kalau udah login, **tutup jendela Chrome-nya**. Sync pertama langsung jalan.
4. Selama `npm run dev` nyala, server sync sendiri di background tiap 6 jam (`BROWSER_SYNC_HOURS`). Laptop harus nyala dan servernya jalan.

Yang perlu diketahui:
- Login disimpan di profil Chrome terpisah (`server/.data/browser/`), bukan Chrome harian kamu. **Disconnect** = logout + hapus profil itu.
- Jalur ini **membaca dashboard web**, bukan API resmi. Kalau TikTok/Meta ubah tampilan, sebagian angka bisa hilang (muncul warning). TikTok dan Meta juga melarang akses otomatis di ToS mereka, jadi ada risiko akun kena verifikasi/checkpoint. Pakai untuk akun sendiri dan jangan turunin interval sync.
- Yang kebaca: followers, views, likes, comments, shares, saves per post; Instagram reach dari Business Suite; watch time TikTok kalau tampil di Studio. Riwayat follower harian kebentuk dari tiap sync.
- Ada yang aneh? Set `SCRAPE_DEBUG=true` dan `BROWSER_HEADLESS=false` di `.env`, restart, klik **Sync now**, lalu cek `server/.data/scrape-debug/`.

### Gambaran singkat

| | Instagram | TikTok (Business API) | TikTok (Display API, cadangan) |
| --- | --- | --- | --- |
| Jenis akun | Professional (Business/Creator) | Akun TikTok (Business disarankan) | Akun TikTok apa saja |
| Perlu Facebook Page? | Tidak (kita pakai *Instagram Login*) | — | — |
| Perlu review/approval? | Tidak untuk akun sendiri (Standard Access) | Ya: form akses Accounts API | Ya: review app Login Kit |
| Data akun harian | Ya (riwayat follower mulai dari sync pertama) | Ya, maks. 60 hari ke belakang | Tidak, hanya total saat ini |
| Watch time / completion | Reels: avg & total watch time | Ya, plus traffic sources | Tidak |

### Langkah 1: Ubah akun Instagram ke Professional

1. Buka aplikasi Instagram → **Profile** → menu ☰ → **Settings and privacy**.
2. Pilih **Account type and tools** → **Switch to professional account**.
3. Pilih kategori, lalu pilih **Business** atau **Creator**. Keduanya bisa.
4. Selesai. Data insights baru tersedia setelah akun Professional, dan beberapa metrik (misalnya follows/unfollows) butuh minimal **100 followers**.

**Facebook Page tidak wajib.** Aplikasi ini memakai *Instagram API with Instagram Login*, jadi tidak perlu Page. Jalur alternatifnya, *Instagram API with Facebook Login*, butuh akun IG yang terhubung ke Facebook Page (Instagram → Settings → Accounts Center → hubungkan Page). Jalur itu hanya perlu kalau nanti butuh metrik khusus Facebook Login (misalnya `link_clicks` per post). Server ini belum mengimplementasikan jalur tersebut.

### Langkah 2: Buat Meta developer app (Instagram)

1. Buka **https://developers.facebook.com** → login → **My Apps** → **Create App**.
2. Pilih use case **"Manage messaging & content on Instagram"** (nama di dashboard bisa sedikit berbeda, cari yang menyebut *Instagram API with Instagram Login*). Isi nama app, misalnya `KARDEUCE Content Hub`.
3. Di menu app, buka **Instagram** → **API setup with Instagram login**.
4. Catat **Instagram app ID** dan **Instagram app secret**. Ini **bukan** App ID Facebook yang ada di bagian atas dashboard.
5. **Tambahkan akun IG kamu sebagai tester:** **App roles** → **Roles** → **Add People** → pilih **Instagram Tester**, lalu masukkan username IG. Setelah itu terima undangannya di Instagram (web: Settings → *Apps and websites* → *Tester invites*).
6. **Permissions** yang dibutuhkan:
   - `instagram_business_basic`
   - `instagram_business_manage_insights`

   Untuk akun milik sendiri (yang sudah jadi tester/role di app) **Standard Access sudah cukup, tanpa App Review**. App Review / Advanced Access hanya perlu kalau mau menarik data akun orang lain.
7. **Redirect URI** (untuk tombol *Connect*): di bagian *Business login settings* → **OAuth redirect URIs**, isi
   `https://<PUBLIC_URL kamu>/api/auth/instagram/callback`
   (lihat Langkah 4 soal `PUBLIC_URL`).

**Cara cepat tanpa OAuth (paste token):** di halaman *API setup with Instagram login* → bagian **Generate access tokens** → **Add account** → login dengan akun IG → klik **Generate token**. Copy token itu, lalu tempel di aplikasi: **Settings → Integrations → Instagram → Paste token**. Token berlaku 60 hari dan server akan memperpanjangnya otomatis (refresh) selama dipakai minimal sekali dalam 60 hari.

### Langkah 3: Akses TikTok

#### Opsi A (disarankan): TikTok API for Business, Accounts API

Ini satu-satunya jalur untuk reach, watch time, completion rate, traffic sources dan data harian akun.

1. Daftar di **https://business-api.tiktok.com** → **Become a Developer** (pakai akun TikTok for Business).
2. **Isi "Accounts API Access Application Form".** Sejak **20 Maret 2026** form ini wajib diisi *sebelum* membuat app atau minta scope "TikTok Accounts". Tunggu sampai disetujui.
3. **My Apps** → **Create an app**. Pilih produk/akses **TikTok Accounts**, lalu centang scopes:
   - `user.info.basic`, `user.info.username`, `user.info.stats`
   - `user.insights` (metrik harian akun)
   - `video.list`, `video.insights` (metrik per video, watch time, traffic sources)
4. **Redirect URL:** isi `https://<PUBLIC_URL kamu>/api/auth/tiktok/callback/`. Wajib **https**, wajib **diakhiri `/`**, dan tidak boleh ada `?query`.
5. Setelah app aktif, catat **App ID** dan **Secret**, lalu copy **"TikTok account holder authorization URL"** dari halaman app. Ketiganya dipakai di `.env`.
6. Catatan akses:
   - **Reach (unique viewers) dan followers baru/hilang per hari** hanya tersedia dengan **Advanced Access** atau akun **Verified Business**. Tanpa itu, metrik tersebut tampil sebagai "—".
   - Pastikan **Analytics** sudah dinyalakan di aplikasi TikTok (Profile → ☰ → Creator/Business tools → Analytics). Data harian muncul dengan jeda 24–48 jam.

#### Opsi B (cadangan): TikTok Display API (Login Kit)

Pakai ini kalau akses Business API belum disetujui.

1. Buka **https://developers.tiktok.com** → **Manage apps** → **Connect an app**.
2. Tambahkan produk **Login Kit** (Web), lalu scopes `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`.
3. Isi **Redirect URI**: `https://<PUBLIC_URL kamu>/api/auth/tiktok/callback`.
4. Submit app untuk review. Selama belum disetujui, hanya akun yang ditambahkan sebagai *target users / sandbox* yang bisa login.
5. Catat **Client key** dan **Client secret**.
6. **Keterbatasan:** hanya total lifetime (followers, views, likes, comments, shares per video). **Tidak ada** reach, watch time, completion rate, traffic sources, atau riwayat harian. Riwayat follower terbentuk dari setiap sync.

Kalau Opsi A dan B dua-duanya diisi, server memakai **Opsi A**.

### Langkah 4: HTTPS untuk login (OAuth) dengan tunnel

Instagram dan TikTok hanya mau redirect ke alamat **https**. Saat jalan di laptop, pakai *tunnel* ke port API (**8787**):

```bash
# pilih salah satu
cloudflared tunnel --url http://localhost:8787     # gratis, tanpa akun (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
ngrok http 8787                                    # perlu akun ngrok gratis
```

Copy alamat https yang muncul (contoh `https://abc-123.trycloudflare.com`) ke `PUBLIC_URL` di `.env`, lalu daftarkan redirect URI di app Meta/TikTok sesuai Langkah 2 dan 3. Alamat tunnel gratis berubah setiap kali dijalankan, jadi update `PUBLIC_URL` dan redirect URI kalau berubah.

> Tidak mau repot dengan tunnel? Pakai **Paste token** di Settings → Integrations. Opsi ini tidak butuh `PUBLIC_URL`.

### Langkah 5: Isi `.env`

```bash
cp .env.example .env
```

Buka `.env` dan isi:

| Variabel | Isi dengan |
| --- | --- |
| `PORT` | Port API server (default `8787`) |
| `APP_URL` | Alamat web app (default `http://localhost:5173`) |
| `PUBLIC_URL` | Alamat https dari tunnel (Langkah 4), tanpa `/` di akhir |
| `IG_APP_ID`, `IG_APP_SECRET` | Instagram app ID & secret (Langkah 2) |
| `IG_GRAPH_VERSION` | Biarkan `v26.0` kecuali Meta merilis versi baru |
| `TIKTOK_BUSINESS_APP_ID`, `TIKTOK_BUSINESS_SECRET`, `TIKTOK_BUSINESS_AUTH_URL` | Opsi A (Langkah 3) |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | Opsi B (Langkah 3) |

Setiap variabel juga dijelaskan di dalam `.env.example`. Setelah mengubah `.env`, **restart** `npm run dev`.

### Langkah 6: Jalankan & hubungkan

```bash
npm install
npm run dev
```

1. Buka **http://localhost:5173** → **Settings** → **Integrations**.
2. Untuk tiap platform, klik **Connect** (login lewat Instagram/TikTok) **atau** **Paste token**.
3. Setelah tersambung, kartu integrasi menampilkan nama akun, kapan token kedaluwarsa, dan waktu sync terakhir.
4. Klik **Sync now** (di Dashboard atau Performance). Sync pertama Instagram bisa makan waktu sekitar 1 menit karena mengambil 90 hari data harian satu per satu. Setelah itu aplikasi sync otomatis saat dibuka kalau sync terakhir lebih dari 6 jam yang lalu.
5. Badge *Demo data* hilang untuk platform yang sudah tersambung.

Untuk melepas koneksi: **Settings → Integrations → Disconnect**. Token dihapus dari server.

### Troubleshooting

| Masalah | Penyebab & solusi |
| --- | --- |
| "token has expired" / "Reconnect" | Token Instagram berlaku 60 hari dan diperpanjang otomatis saat dipakai. Kalau sudah lewat, klik **Connect** lagi atau paste token baru. Token TikTok berlaku 24 jam dan diperpanjang otomatis dengan refresh token (1 tahun). |
| Metrik tampil "—" | Platform memang tidak menyediakan metrik itu untuk akun/jenis post tersebut. Contoh: profile visits level akun di Instagram (sudah dihapus Meta), reach TikTok tanpa Advanced Access, atau semua metrik lanjutan di Display API. "—" artinya *tidak tersedia*, bukan 0. |
| Angka hari ini / kemarin kosong | Normal. Instagram dan TikTok punya jeda data **24–48 jam**. |
| Grafik TikTok cuma 60 hari | Business API hanya memberi 60 hari ke belakang. Hari-hari yang lebih lama tetap tersimpan dari sync sebelumnya, jadi riwayat makin panjang seiring waktu. |
| Grafik follower Instagram pendek / "estimated" | Instagram tidak menyediakan riwayat jumlah follower. Aplikasi mencatat jumlah follower di setiap sync, dan hari sebelumnya dihitung mundur dari follows/unfollows harian (ditandai *estimated*). |
| "rate limit" | Terlalu banyak request. Server sudah membatasi otomatis; tunggu beberapa menit lalu **Sync now** lagi. |
| Login gagal: "redirect_uri mismatch" | Redirect URI di app Meta/TikTok harus **persis sama** dengan `PUBLIC_URL` + path di atas (perhatikan `/` di akhir untuk TikTok Business). |
| "credentials are missing in .env" | Isi variabel di `.env`, lalu restart `npm run dev`. |
