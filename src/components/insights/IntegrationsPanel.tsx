import { useState } from 'react';
import { Globe, CircleAlert, KeyRound, Plug, RefreshCw, Unplug } from 'lucide-react';
import { SOCIAL_PLATFORMS, type IntegrationStatus, type SocialPlatform } from '@shared/insights';
import { useInsights, usePlatformModes } from '@/store/insights';
import { confirm } from '@/store/confirm';
import { platformSlug } from '@/services/metrics';
import { relativeTime } from '@/lib/insights';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { PlatformIcon } from '@/components/badges/PlatformIcon';

const MODE_LABEL: Record<NonNullable<IntegrationStatus['mode']>, string> = {
  instagram_login: 'Instagram API (Instagram Login)',
  tiktok_business: 'TikTok API for Business',
  tiktok_display: 'TikTok Display API (basic)',
  tiktok_studio: 'TikTok Studio (browser login)',
  meta_business_suite: 'Instagram + Meta Business Suite (browser login)',
};

const BROWSER_MODES = new Set<IntegrationStatus['mode']>(['tiktok_studio', 'meta_business_suite']);

function expiryText(iso?: string): { text: string; warn: boolean } {
  if (!iso) return { text: 'Token expiry unknown', warn: false };
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  const date = new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days < 0) return { text: `Token expired ${date}`, warn: true };
  // TikTok access tokens last a day and refresh automatically: only flag long-lived tokens near expiry.
  if (days < 1) return { text: `Token refreshes automatically (expires ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})`, warn: false };
  return { text: `Token expires ${date} (in ${days} day${days === 1 ? '' : 's'})`, warn: days <= 7 };
}

export function IntegrationsPanel() {
  const integrations = useInsights((s) => s.integrations);
  const serverError = useInsights((s) => s.serverError);
  const meta = useInsights((s) => s.meta);
  const sync = useInsights((s) => s.sync);
  const syncNow = useInsights((s) => s.syncNow);
  const disconnect = useInsights((s) => s.disconnect);
  const connectBrowser = useInsights((s) => s.connectBrowser);
  const [loggingIn, setLoggingIn] = useState<SocialPlatform | null>(null);
  const refresh = useInsights((s) => s.refreshIntegrations);
  const modes = usePlatformModes();
  // Hosted site showing data published by the local server: nothing can be connected here.
  const readOnly = !!integrations?.some((i) => i.snapshotAt);
  const [pasting, setPasting] = useState<SocialPlatform | null>(null);

  const logIn = async (p: SocialPlatform) => {
    setLoggingIn(p);
    await connectBrowser(p);
    setLoggingIn(null);
  };

  return (
    <div className="space-y-2">
      {serverError && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-amber-200">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {serverError} Demo data stays available meanwhile.{' '}
            <button type="button" className="font-semibold underline" onClick={() => void refresh()}>
              Retry
            </button>
          </span>
        </div>
      )}
      <ul className="space-y-2">
        {SOCIAL_PLATFORMS.map((p) => {
          const integ = integrations?.find((i) => i.platform === p);
          const mode = modes[p];
          const viaBrowser = BROWSER_MODES.has(integ?.mode ?? null) && !!integ?.connected;
          const exp = integ?.connected && !viaBrowser ? expiryText(integ.tokenExpiresAt) : null;
          const st = sync[p];
          return (
            <li key={p} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <PlatformIcon platform={p} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-ink">{p}</span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[10.5px] font-semibold',
                        mode === 'live' ? 'bg-emerald-50 text-emerald-700' : mode === 'stale' ? 'bg-amber-50 text-amber-800' : 'bg-muted text-ink-3',
                      )}
                    >
                      {mode === 'live' ? 'Connected' : mode === 'stale' ? 'Disconnected · old data' : 'Demo data'}
                    </span>
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-[11.5px] text-ink-3">
                    {integ?.connected && (
                      <div className="truncate">
                        {integ.accountName ? <b className="font-medium text-ink-2">@{integ.accountName.replace(/^@/, '')}</b> : 'Account connected'}
                        {integ.mode && ` · ${MODE_LABEL[integ.mode]}`}
                      </div>
                    )}
                    {exp && <div className={cn(exp.warn && 'font-medium text-amber-700')}>{exp.text}</div>}
                    {viaBrowser && integ?.nextAutoSyncAt && (
                      <div>No token · background sync {new Date(integ.nextAutoSyncAt) <= new Date() ? 'running soon' : `next at ${new Date(integ.nextAutoSyncAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}</div>
                    )}
                    {integ?.snapshotAt ? (
                      <div>Read-only copy · synced on the KARDEUCE computer {relativeTime(integ.snapshotAt)}</div>
                    ) : (
                      <div>Last sync {relativeTime(meta.lastSyncAt[p])}</div>
                    )}
                    {!readOnly && !integ?.configured && !integ?.connected && (
                      <div className="text-ink-4">{integ?.browserAvailable ? 'No token needed: connect via browser and log in to ' + (p === 'TikTok' ? 'TikTok Studio' : 'Instagram & Meta Business Suite') + '.' : 'No app credentials in .env. You can still paste a token.'}</div>
                    )}
                    {integ?.error && <div className="text-red-600">{integ.error}</div>}
                    {st.errors[0] && !st.syncing && <div className="text-red-600">{st.errors[0]}</div>}
                  </div>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {integ?.snapshotAt ? (
                  <Button size="xs" loading={st.syncing} icon={<RefreshCw className="h-3 w-3" />} onClick={() => syncNow({ platforms: [p] })}>
                    Reload data
                  </Button>
                ) : readOnly ? (
                  mode === 'demo' && <span className="text-[11.5px] text-ink-4">Not published from the KARDEUCE computer yet: showing demo data.</span>
                ) : integ?.connected ? (
                  <>
                    <Button size="xs" loading={st.syncing} icon={<RefreshCw className="h-3 w-3" />} onClick={() => syncNow({ platforms: [p] })}>
                      Sync now
                    </Button>
                    {viaBrowser ? (
                      <Button size="xs" loading={loggingIn === p} icon={<Globe className="h-3 w-3" />} onClick={() => logIn(p)}>
                        Log in again
                      </Button>
                    ) : (
                      integ.oauthAvailable && (
                        <Button size="xs" icon={<Plug className="h-3 w-3" />} onClick={() => (window.location.href = `/api/auth/${platformSlug(p)}/start`)}>
                          Reconnect
                        </Button>
                      )
                    )}
                    <Button
                      size="xs"
                      variant="danger"
                      icon={<Unplug className="h-3 w-3" />}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Disconnect ${p}?`,
                          description: viaBrowser
                            ? 'You are logged out of the server’s Chrome profile. Numbers already synced stay in this workspace.'
                            : 'The token is removed from the server. Numbers already synced stay in this workspace.',
                          confirmLabel: 'Disconnect',
                        });
                        if (ok) await disconnect(p);
                      }}
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <>
                    {integ?.browserAvailable && (
                      <Button
                        size="xs"
                        variant="primary"
                        loading={loggingIn === p}
                        title={`Opens Chrome on this computer. Log in to ${p === 'TikTok' ? 'TikTok Studio' : 'Instagram (and Meta Business Suite in the second tab)'}, then close the window.`}
                        icon={<Globe className="h-3 w-3" />}
                        onClick={() => logIn(p)}
                      >
                        Connect via browser
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant={integ?.browserAvailable ? 'secondary' : 'primary'}
                      disabled={!integ?.oauthAvailable}
                      title={integ?.oauthAvailable ? undefined : 'Set the app credentials and PUBLIC_URL in .env first (see README).'}
                      icon={<Plug className="h-3 w-3" />}
                      onClick={() => (window.location.href = `/api/auth/${platformSlug(p)}/start`)}
                    >
                      Connect
                    </Button>
                    <Button size="xs" disabled={!!serverError} icon={<KeyRound className="h-3 w-3" />} onClick={() => setPasting(p)}>
                      Paste token
                    </Button>
                    {mode === 'demo' && (
                      <Button size="xs" variant="ghost" loading={st.syncing} icon={<RefreshCw className="h-3 w-3" />} onClick={() => syncNow({ platforms: [p] })}>
                        Refresh demo
                      </Button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11.5px] leading-relaxed text-ink-4">
        {readOnly
          ? 'This hosted dashboard shows a copy of the numbers synced on the KARDEUCE computer; it updates a few minutes after each sync there (every 6 hours while its server runs). Connect, log in and disconnect from that computer.'
          : <>Tokens and browser logins are stored by the local API server (<code className="rounded bg-muted px-1">server/.data</code>), never in the browser. Auto-sync runs when the app opens and the last sync is older than 6 hours; browser connections also sync in the background every 6 hours while the server runs. Setup guide: README → “Menghubungkan Instagram &amp; TikTok”.</>}
      </p>
      <PasteTokenModal platform={pasting} onClose={() => setPasting(null)} />
    </div>
  );
}

function PasteTokenModal({ platform, onClose }: { platform: SocialPlatform | null; onClose: () => void }) {
  const pasteToken = useInsights((s) => s.pasteToken);
  const [access, setAccess] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setAccess('');
    setRefreshToken('');
    setOpenId('');
    onClose();
  };
  const submit = async () => {
    if (!platform || !access.trim()) return;
    setBusy(true);
    const ok = await pasteToken(platform, access, refreshToken, openId);
    setBusy(false);
    if (ok) close();
  };
  return (
    <Modal
      open={!!platform}
      onClose={close}
      title={`Paste ${platform ?? ''} access token`}
      description={
        platform === 'Instagram'
          ? 'A long-lived Instagram User token (Meta App Dashboard → Instagram → API setup → Generate token). It’s sent to the local API server only.'
          : 'A TikTok access token. Add the refresh token so the server can renew it every 24 hours. For the Business API, also add the open_id.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} disabled={!access.trim()} onClick={submit}>
            Connect
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="label">Access token</span>
          <input className="input font-mono text-[12px]" autoComplete="off" spellCheck={false} value={access} onChange={(e) => setAccess(e.target.value)} placeholder="IGAA… / act.…" />
        </label>
        {platform === 'TikTok' && (
          <>
            <label className="block">
              <span className="label">Refresh token (recommended)</span>
              <input className="input font-mono text-[12px]" autoComplete="off" spellCheck={false} value={refreshToken} onChange={(e) => setRefreshToken(e.target.value)} placeholder="rft.…" />
            </label>
            <label className="block">
              <span className="label">open_id (Business API only)</span>
              <input className="input font-mono text-[12px]" autoComplete="off" spellCheck={false} value={openId} onChange={(e) => setOpenId(e.target.value)} placeholder="-000…" />
            </label>
          </>
        )}
      </form>
    </Modal>
  );
}
