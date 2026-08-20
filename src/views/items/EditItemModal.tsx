import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import { updateItem } from '@/lib/queries';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { ITEM_CATEGORIES, type Item } from '@/lib/supabase';
import { COMMON_UNITS } from './types';

export type EditItemModalProps = {
  item: Item | null;
  onClose: () => void;
  onItemUpdated: () => void;
};

export function EditItemModal({ item, onClose, onItemUpdated }: EditItemModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Bottle');
  const [unit, setUnit] = useState('pcs');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (item) {
      setName(item.name);
      setCategory(item.category || 'Bottle');
      setUnit(item.unit || 'pcs');
      setColor(item.color || '');
      setDescription(item.description || '');
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Item name is required.');
      return;
    }

    setSubmitting(true);
    try {
      await updateItem(item.id, {
        name: name.trim(),
        category: category.trim() || 'Bottle',
        unit: unit.trim() || 'pcs',
        description: description.trim() || null,
        color: color.trim() || null,
      });

      toast.success(`Updated item "${name.trim()}".`, 'Item Updated');
      onItemUpdated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update item'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(item)}
      onClose={onClose}
      title={`Edit Item: ${item.name}`}
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Component Category" htmlFor="edit-sku-cat" required>
          <select
            id="edit-sku-cat"
            className={`${inputClass} font-bold text-slate-900`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Item Name / Model Specification" htmlFor="edit-sku-name" required>
          <input
            id="edit-sku-name"
            className={`${inputClass} font-bold`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Unit of Measure" htmlFor="edit-sku-unit" required>
            <select
              id="edit-sku-unit"
              className={`${inputClass} font-semibold`}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
            >
              {COMMON_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Color / Finish" htmlFor="edit-sku-color">
            <input
              id="edit-sku-color"
              className={inputClass}
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Description / Notes" htmlFor="edit-sku-desc">
          <input
            id="edit-sku-desc"
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="font-bold bg-slate-900 text-white">
            <Save className="h-4 w-4 mr-1 text-emerald-400" />
            Update Item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
