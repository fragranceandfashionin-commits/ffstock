import { useState } from 'react';
import { Save } from 'lucide-react';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!newSupplierName.trim()) {
      setError('Supplier name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const newSupp = await insertSupplier({
        name: newSupplierName.trim(),
        contact: newSupplierContact.trim() || null,
      });
      toast.success(`Supplier "${newSupplierName.trim()}" added.`, 'Supplier Created');
      onSupplierCreated(newSupp as Supplier);
      setNewSupplierName('');
      setNewSupplierContact('');
      onClose();
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
      title="Quick-Add Supplier"
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Supplier / Factory Name" htmlFor="quick-supp-name" required>
          <input
            id="quick-supp-name"
            className={inputClass}
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

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="font-bold bg-slate-900 text-white">
            <Save className="h-4 w-4 mr-1 text-emerald-400" />
            Save Supplier
          </Button>
        </div>
      </form>
    </Modal>
  );
}
