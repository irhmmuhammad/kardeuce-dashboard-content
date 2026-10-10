import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useHotkey } from '@/hooks/useHotkey';
import { isMac } from '@/lib/utils';
import { RichTextArea } from './RichTextArea';
import { CaptionEditor } from './CaptionEditor';
import { AutoTextarea } from '@/components/ui/Field';

export type LongTextField = 'brief' | 'caption' | 'notes' | 'cta';

interface TextEditorModalProps {
  open: boolean;
  field: LongTextField;
  contentTitle: string;
  value: string;
  onSave: (v: string) => void;
  onClose: () => void;
}

const LABELS: Record<LongTextField, string> = { brief: 'Brief', caption: 'Caption', notes: 'Notes', cta: 'CTA' };

/** Larger editor opened from truncated spreadsheet cells. */
export function TextEditorModal({ open, field, contentTitle, value, onSave, onClose }: TextEditorModalProps) {
  const [text, setText] = useState(value);
  useEffect(() => {
    if (open) setText(value);
  }, [open, value]);

  const save = () => {
    onSave(text);
    onClose();
  };

  useHotkey(
    'mod+s',
    (e) => {
      e.preventDefault();
      save();
    },
    open,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`${LABELS[field]} · ${contentTitle || 'Untitled'}`}
      description={field === 'caption' ? 'Caption counts are based on Instagram limits.' : 'Supports **bold**, _italic_, headings and lists.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={text === value}>
            Save
            <span className="ml-1 rounded bg-white/15 px-1 font-mono text-[10px]">{isMac() ? '⌘' : 'Ctrl'} S</span>
          </Button>
        </>
      }
    >
      <div className="p-5">
        {field === 'caption' ? (
          <CaptionEditor value={text} onChange={setText} autoFocus minRows={10} />
        ) : field === 'brief' ? (
          <RichTextArea value={text} onChange={setText} autoFocus minRows={10} placeholder="Konsep, angle, mood, referensi visual…" />
        ) : (
          <AutoTextarea autoFocus value={text} minRows={6} onChange={(e) => setText(e.target.value)} />
        )}
      </div>
    </Modal>
  );
}
