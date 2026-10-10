import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useUI } from '@/store/ui';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { useHotkey } from '@/hooks/useHotkey';
import { addDays, monthKeyOf, monthLabel, todayISO } from '@/lib/date';
import { PillarBadge, StatusBadge, TypeBadge } from '@/components/badges/Badges';
import { PlatformToggle, SelectField, usePillarOptions, useStatusOptions, useTypeOptions } from './Pickers';
import { isMac } from '@/lib/utils';

interface FormState {
  title: string;
  publishDate: string;
  platform: string[];
  contentType: string;
  contentPillar: string;
  status: string;
  brief: string;
}

export function QuickAddModal() {
  const quickAdd = useUI((s) => s.quickAdd);
  const close = useUI((s) => s.closeQuickAdd);
  const month = useUI((s) => s.month);
  const setMonth = useUI((s) => s.setMonth);
  const openContent = useUI((s) => s.openContent);
  const addContent = useWorkspace((s) => s.addContent);
  const settings = useWorkspace((s) => s.settings);
  const pillars = useWorkspace((s) => s.pillars);

  const statusOptions = useStatusOptions();
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();

  const defaultDate = () => {
    if (quickAdd.date) return quickAdd.date;
    const today = todayISO();
    // If browsing another month, default to its first day instead of today.
    return monthKeyOf(today) === month ? addDays(today, 1) : `${month}-01`;
  };

  const blank = (): FormState => ({
    title: '',
    publishDate: defaultDate(),
    platform: [...settings.platforms],
    contentType: settings.contentTypes[0] ?? '',
    contentPillar: pillars[0]?.name ?? '',
    status: quickAdd.status ?? settings.statuses[0]?.name ?? 'Ideation',
    brief: '',
  });

  const [form, setForm] = useState<FormState>(blank);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (quickAdd.open) {
      setForm(blank());
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickAdd.open]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (openAfter = false) => {
    setTouched(true);
    if (!form.title.trim()) return;
    const item = addContent({ ...form, title: form.title.trim() });
    close();
    if (form.publishDate && monthKeyOf(form.publishDate) !== month) setMonth(monthKeyOf(form.publishDate));
    toast.success('Content created', `“${item.title}” added to ${form.publishDate ? monthLabel(monthKeyOf(form.publishDate)) : 'the plan'}.`, {
      label: 'Open',
      onClick: () => openContent(item.id),
    });
    if (openAfter) openContent(item.id);
  };

  useHotkey(
    'mod+s',
    (e) => {
      e.preventDefault();
      submit();
    },
    quickAdd.open,
  );

  const titleError = touched && !form.title.trim();

  return (
    <Modal
      open={quickAdd.open}
      onClose={close}
      title="Add Content"
      description="Quick-add to the content plan. You can fill in the brief, caption and references later."
      footer={
        <>
          <span className="mr-auto hidden text-[11.5px] text-ink-4 sm:block">
            <span className="kbd">{isMac() ? '⌘' : 'Ctrl'}</span> <span className="kbd">Enter</span> to create
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => submit(true)}>
            Create & open
          </Button>
          <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => submit()}>
            Create Content
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <Field label="Judul Konten" className="sm:col-span-2">
          <input
            data-autofocus
            className={`input !h-10 !text-[14px] ${titleError ? '!border-red-400 !ring-red-100' : ''}`}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Alasan Main Tennis"
          />
          {titleError && <p className="mt-1 text-[11.5px] text-red-600">Give this content a title.</p>}
        </Field>
        <Field label="Date Post">
          <input type="date" className="input" value={form.publishDate} onChange={(e) => set('publishDate', e.target.value)} />
        </Field>
        <Field label="Status">
          <SelectField value={form.status} onChange={(v) => set('status', v)} options={statusOptions} renderValue={(v) => <StatusBadge status={v} />} />
        </Field>
        <Field label="Platform" className="sm:col-span-2">
          <PlatformToggle value={form.platform} onChange={(v) => set('platform', v)} />
        </Field>
        <Field label="Content Type">
          <SelectField value={form.contentType} onChange={(v) => set('contentType', v)} options={typeOptions} renderValue={(v) => <TypeBadge type={v} />} />
        </Field>
        <Field label="Content Pillar">
          <SelectField value={form.contentPillar} onChange={(v) => set('contentPillar', v)} options={pillarOptions} renderValue={(v) => <PillarBadge pillar={v} />} />
        </Field>
        <Field label="Brief" hint="Optional" className="sm:col-span-2">
          <textarea className="textarea" rows={3} value={form.brief} onChange={(e) => set('brief', e.target.value)} placeholder="Modifikasi dari referensi konten…" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
