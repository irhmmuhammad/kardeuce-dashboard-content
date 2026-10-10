import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useWorkspace } from '@/store/workspace';
import { useUI } from '@/store/ui';
import { toast } from '@/store/toast';
import { addDays, formatLong, monthKeyOf, todayISO } from '@/lib/date';
import { OwnerValue, PlatformToggle, SelectField, useOwnerOptions, useStatusOptions } from '@/components/content/Pickers';
import { PillarBadge, StatusBadge, TypeBadge } from '@/components/badges/Badges';
import { navigate } from '@/hooks/useRoute';
import type { Idea } from '@/types';

export function MoveToPlanModal({ idea, onClose }: { idea: Idea | null; onClose: () => void }) {
  const moveIdeaToPlan = useWorkspace((s) => s.moveIdeaToPlan);
  const contents = useWorkspace((s) => s.contents);
  const settings = useWorkspace((s) => s.settings);
  const openContent = useUI((s) => s.openContent);
  const setMonth = useUI((s) => s.setMonth);
  const ownerOptions = useOwnerOptions();
  const statusOptions = useStatusOptions();

  const suggestDate = () => {
    // First day from tomorrow without anything scheduled.
    const taken = new Set(contents.map((c) => c.publishDate));
    let d = addDays(todayISO(), 1);
    for (let i = 0; i < 60 && taken.has(d); i++) d = addDays(d, 1);
    return d;
  };

  const [date, setDate] = useState('');
  const [platform, setPlatform] = useState<string[]>([]);
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (idea) {
      setDate(suggestDate());
      setPlatform([...settings.platforms]);
      setOwner('');
      setStatus(settings.statuses[0]?.name ?? 'Ideation');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea]);

  const sameDay = contents.filter((c) => c.publishDate === date);

  const submit = () => {
    if (!idea || !date) return;
    const created = moveIdeaToPlan(idea.id, { publishDate: date, platform, owner, status });
    onClose();
    if (created) {
      toast.success('Moved to Content Plan', `Scheduled for ${formatLong(date)}.`, {
        label: 'View',
        onClick: () => {
          setMonth(monthKeyOf(date));
          navigate('plan');
          openContent(created.id);
        },
      });
    }
  };

  return (
    <Modal
      open={!!idea}
      onClose={onClose}
      title="Move to Content Plan"
      description="Pick a publishing date — the idea’s pillar, type, hook and reference carry over."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<CalendarPlus className="h-3.5 w-3.5" />} onClick={submit} disabled={!date}>
            Move to Content Plan
          </Button>
        </>
      }
    >
      {idea && (
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-line bg-canvas p-3">
            <div className="text-[14px] font-semibold text-ink">{idea.idea}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <PillarBadge pillar={idea.contentPillar} />
              <TypeBadge type={idea.contentType} />
            </div>
          </div>
          <Field label="Publishing date" hint={sameDay.length ? `${sameDay.length} other post${sameDay.length > 1 ? 's' : ''} on this day` : 'Free day ✓'}>
            <input data-autofocus type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Platform">
            <PlatformToggle value={platform} onChange={setPlatform} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PIC">
              <SelectField value={owner} onChange={setOwner} options={ownerOptions} renderValue={(v) => <OwnerValue id={v} />} placeholder="Assign later" allowClear />
            </Field>
            <Field label="Status">
              <SelectField value={status} onChange={setStatus} options={statusOptions} renderValue={(v) => <StatusBadge status={v} />} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}
