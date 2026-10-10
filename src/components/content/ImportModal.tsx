import { useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { csvToContents } from '@/lib/csv';
import { formatSheet } from '@/lib/date';
import type { ContentItem } from '@/types';

export function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const team = useWorkspace((s) => s.settings.team);
  const importContents = useWorkspace((s) => s.importContents);
  const [rows, setRows] = useState<Partial<ContentItem>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setFileName('');
    setError('');
  };

  const handle = async (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = csvToContents(text, team);
      if (!parsed.length) setError('No rows found. Make sure the first row contains column headers (e.g. "Judul Konten", "Date Post").');
      else setError('');
      setRows(parsed);
    } catch {
      setError('Could not read that file.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="lg"
      title="Import content from CSV"
      description="Works with files exported from this dashboard or from Google Sheets (File → Download → CSV)."
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Upload className="h-3.5 w-3.5" />}
            disabled={!rows?.length}
            onClick={() => {
              const n = importContents(rows ?? []);
              toast.success(`Imported ${n} content item${n === 1 ? '' : 's'}`);
              reset();
              onClose();
            }}
          >
            Import {rows?.length ? `${rows.length} rows` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handle(e.dataTransfer.files?.[0]);
          }}
          className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-canvas px-4 py-8 text-center hover:bg-muted"
        >
          <FileUp className="h-6 w-6 text-ink-3" />
          <span className="text-[13px] font-medium text-ink">{fileName || 'Drop a .csv file or click to browse'}</span>
          <span className="text-[11.5px] text-ink-4">Recognised columns: Date Post, Platform, Content Type, Content Pillar, Judul Konten, Brief, Caption, Reference, Link Konten, Status Upload, PIC…</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => handle(e.target.files?.[0])} />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{error}</p>}
        {rows && rows.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-line">
            <div className="bg-canvas px-3 py-2 text-[12px] font-semibold text-ink-2">Preview · {rows.length} rows</div>
            <div className="scrollbar-thin max-h-60 overflow-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-white text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Judul Konten</th>
                    <th className="px-3 py-1.5 font-medium">Type</th>
                    <th className="px-3 py-1.5 font-medium">Pillar</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-1.5 tabular">{r.publishDate ? formatSheet(r.publishDate) : '—'}</td>
                      <td className="px-3 py-1.5 font-medium text-ink">{r.title}</td>
                      <td className="px-3 py-1.5">{r.contentType || '—'}</td>
                      <td className="px-3 py-1.5">{r.contentPillar || '—'}</td>
                      <td className="px-3 py-1.5">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
