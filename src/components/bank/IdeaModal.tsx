import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { useWorkspace } from '@/store/workspace';
import { toast } from '@/store/toast';
import { PillarBadge, TypeBadge } from '@/components/badges/Badges';
import { SelectField, usePillarOptions, useTypeOptions } from '@/components/content/Pickers';
import { isUrl, normaliseUrl } from '@/lib/utils';
import type { Idea, IdeaPriority } from '@/types';

type Draft = Pick<Idea, 'idea' | 'contentPillar' | 'contentType' | 'description' | 'hook' | 'reference' | 'trend' | 'priority' | 'status'>;

export function IdeaModal({ open, idea, onClose }: { open: boolean; idea: Idea | null; onClose: () => void }) {
  const addIdea = useWorkspace((s) => s.addIdea);
  const updateIdea = useWorkspace((s) => s.updateIdea);
  const pillars = useWorkspace((s) => s.pillars);
  const types = useWorkspace((s) => s.settings.contentTypes);
  const ideaStatuses = useWorkspace((s) => s.settings.ideaStatuses);
  const pillarOptions = usePillarOptions();
  const typeOptions = useTypeOptions();

  const blank = (): Draft => ({
    idea: '',
    contentPillar: pillars[0]?.name ?? '',
    contentType: types[0] ?? '',
    description: '',
    hook: '',
    reference: '',
    trend: '',
    priority: 'Medium',
    status: ideaStatuses[0] ?? 'New',
  });
  const [d, setD] = useState<Draft>(blank);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setD(idea ? { ...idea } : blank());
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idea]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = () => {
    setTouched(true);
    if (!d.idea.trim()) return;
    const payload = { ...d, idea: d.idea.trim(), reference: d.reference ? normaliseUrl(d.reference) : '' };
    if (idea) {
      updateIdea(idea.id, payload);
      toast.success('Idea updated');
    } else {
      addIdea(payload);
      toast.success('Idea added to Content Bank');
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={idea ? 'Edit Idea' : 'Add Idea'}
      description="Capture it now — schedule it later with “Move to Content Plan”."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {idea ? 'Save Idea' : 'Add Idea'}
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
      >
        <Field label="Idea" className="sm:col-span-2">
          <input data-autofocus className={`input !h-10 !text-[14px] ${touched && !d.idea.trim() ? '!border-red-400' : ''}`} value={d.idea} onChange={(e) => set('idea', e.target.value)} placeholder="e.g. Tennis Bingo: Hal yang Pasti Terjadi Saat Mabar" />
        </Field>
        <Field label="Content Pillar">
          <SelectField value={d.contentPillar} onChange={(v) => set('contentPillar', v)} options={pillarOptions} renderValue={(v) => <PillarBadge pillar={v} />} />
        </Field>
        <Field label="Content Type">
          <SelectField value={d.contentType} onChange={(v) => set('contentType', v)} options={typeOptions} renderValue={(v) => <TypeBadge type={v} />} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className="textarea" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="Apa konsepnya? Kenapa relevan buat audience?" />
        </Field>
        <Field label="Hook" className="sm:col-span-2">
          <input className="input" value={d.hook} onChange={(e) => set('hook', e.target.value)} placeholder="Kalimat pembuka 3 detik pertama" />
        </Field>
        <Field label="Reference" hint={d.reference && !isUrl(d.reference) ? 'Not a valid URL' : undefined}>
          <input className="input" value={d.reference} onChange={(e) => set('reference', e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Trend">
          <input className="input" value={d.trend} onChange={(e) => set('trend', e.target.value)} placeholder="Audio / format / meme yang lagi naik" />
        </Field>
        <Field label="Priority">
          <Segmented<IdeaPriority>
            value={d.priority}
            onChange={(v) => set('priority', v)}
            options={[
              { value: 'Low', label: 'Low' },
              { value: 'Medium', label: 'Medium' },
              { value: 'High', label: 'High' },
            ]}
          />
        </Field>
        <Field label="Status">
          <SelectField value={d.status} onChange={(v) => set('status', v)} options={ideaStatuses.map((s) => ({ value: s, label: s }))} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
