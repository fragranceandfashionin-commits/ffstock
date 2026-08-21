import { useState, useRef, useEffect } from 'react';
import { Save, Plus, Building2 } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import { insertSupplier } from '@/lib/queries';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import type { Supplier } from '@/lib/supabase';

export type QuickSupplierModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
};

export function QuickSupplierModal({ isOpen, onClose, onSupplierCreated }: QuickSupplierModalProps) {
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');
  const [sessionAddedCount, setSessionAddedCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSessionAddedCount(0);
      setError(null);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSave = async (shouldClose: boolean, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedName = newSupplierName.trim();
    if (!trimmedName) {
      setError('Supplier / Factory name is required.');
      nameInputRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const newSupp = await insertSupplier({
        name: trimmedName,
        contact: newSupplierContact.trim() || null,
      });

      toast.success(
        `Supplier "${trimmedName}" registered successfully.${shouldClose ? '' : ' Ready for next supplier.'}`,
        'Supplier Saved'
      );
      setSessionAddedCount((prev) => prev + 1);
      onSupplierCreated(newSupp as Supplier);

      if (shouldClose) {
        setNewSupplierName('');
        setNewSupplierContact('');
        onClose();
      } else {
        // Reset form for continuous rapid adding
        setNewSupplierName('');
        setNewSupplierContact('');
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 50);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add supplier'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick-Add Supplier / Vendor"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={(e) => handleSave(false, e)} className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <p className="text-xs text-slate-500">
            Add suppliers/factories on the fly with continuous multi-entry.
          </p>
          {sessionAddedCount > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              ✨ {sessionAddedCount} {sessionAddedCount === 1 ? 'Supplier' : 'Suppliers'} Added
            </span>
          )}
        </div>

        <Field label="Supplier / Factory Name" htmlFor="quick-supp-name" required>
          <input
            ref={nameInputRef}
            id="quick-supp-name"
            className={`${inputClass} font-bold text-slate-900`}
            value={newSupplierName}
            onChange={(e) => setNewSupplierName(e.target.value)}
            placeholder="e.g. Apex Glass Works, HNG Glass"
            required
            autoFocus
          />
        </Field>

        <Field label="Contact Person / Phone / Email (Optional)" htmlFor="quick-supp-contact">
          <input
            id="quick-supp-contact"
            className={inputClass}
            value={newSupplierContact}
            onChange={(e) => setNewSupplierContact(e.target.value)}
            placeholder="e.g. contact@apexglass.com, +91 98765 43210"
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            {sessionAddedCount > 0 ? 'Done' : 'Cancel'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              loading={submitting}
              onClick={() => handleSave(false)}
              className="font-bold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-1 text-emerald-600" />
              <span>Save & Add Another (+)</span>
            </Button>

            <Button
              type="button"
              variant="primary"
              loading={submitting}
              onClick={() => handleSave(true)}
              className="font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
            >
              <Save className="h-4 w-4 mr-1 text-emerald-400" />
              <span>Save & Select</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
