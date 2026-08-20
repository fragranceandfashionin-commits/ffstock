import { useState, useMemo } from 'react';
import { Save, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import { insertItem } from '@/lib/queries';
import { getErrorMessage, findSimilarItems, type SimilarItemMatch } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { ITEM_CATEGORIES, type Item } from '@/lib/supabase';
import { COMMON_UNITS } from './types';

export type AddItemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: () => void;
  existingItems?: Item[];
};

export function AddItemModal({ isOpen, onClose, onItemCreated, existingItems = [] }: AddItemModalProps) {
  const [category, setCategory] = useState('Bottle');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const similarMatches: SimilarItemMatch[] = useMemo(() => {
    return findSimilarItems(name, category, existingItems);
  }, [name, category, existingItems]);

  const hasHighConfidenceMatch = similarMatches.length > 0 && (similarMatches[0].matchType === 'exact' || similarMatches[0].confidence >= 0.85);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Item name / specification is required.');
      return;
    }

    if (hasHighConfidenceMatch && !allowDuplicate) {
      const top = similarMatches[0];
      setError(
        `Similar SKU "${top.item.name}" (${top.item.category || 'Item'}) already exists (${Math.round(top.confidence * 100)}% match). Please confirm below if this is intentionally a separate SKU.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await insertItem({
        name: name.trim(),
        category: category.trim() || 'Bottle',
        unit: unit.trim() || 'pcs',
        description: description.trim() || null,
        color: color.trim() || null,
      });

      toast.success(`Registered new item "${name.trim()}".`, 'Item Added');
      setName('');
      setCategory('Bottle');
      setUnit('pcs');
      setColor('');
      setDescription('');
      setAllowDuplicate(false);
      onItemCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create item'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register Master Component SKU"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Component Category" htmlFor="sku-cat" required>
          <select
            id="sku-cat"
            className={`${inputClass} font-bold text-slate-900`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            {ITEM_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === 'Packaging' ? '📦 Packaging / Box' : c === 'Cap' ? '🧴 Cap' : c === 'Atomizer' ? '💨 Atomizer' : c === 'Bottle' ? '🍾 Bottle' : c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Item Name / Model Specification" htmlFor="sku-name" required>
          <input
            id="sku-name"
            className={`${inputClass} font-bold`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setAllowDuplicate(false);
            }}
            placeholder="e.g. 50ml Square Glass Bottle, 24mm Gold Cap"
            required
            autoFocus
          />
        </Field>

        {/* Similar Item / Duplicate Warning */}
        {similarMatches.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Potential Duplicate Detected:</span>
                <p className="mt-0.5 text-amber-800">
                  {similarMatches.length === 1 ? 'An existing SKU matches closely:' : `${similarMatches.length} existing SKUs match closely:`}
                </p>
              </div>
            </div>
            <div className="space-y-1 pl-6">
              {similarMatches.slice(0, 3).map(({ item, matchType, confidence }) => (
                <div key={item.id} className="flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-amber-200">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span className="font-semibold text-slate-900 truncate">"{item.name}"</span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-medium shrink-0">
                      {item.category || 'SKU'}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 ${matchType === 'exact' ? 'text-rose-600' : 'text-amber-700'}`}>
                    {matchType === 'exact' ? 'Exact Match' : `${Math.round(confidence * 100)}% match`}
                  </span>
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 pt-1 pl-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-[11px] font-medium text-amber-900">
                I understand — create this as a separate SKU anyway
              </span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Unit of Measure" htmlFor="sku-unit" required>
            <select
              id="sku-unit"
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

          <Field label="Default Color / Finish (Optional)" htmlFor="sku-color">
            <input
              id="sku-color"
              className={inputClass}
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="e.g. Frosted, Amber, Gold"
            />
          </Field>
        </div>

        <Field label="Technical Description / Notes (Optional)" htmlFor="sku-desc">
          <input
            id="sku-desc"
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Neck size 24/410, Weight 185g, Carton 48pcs"
          />
        </Field>

        {error && <ErrorBanner message={error} />}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} className="font-bold bg-slate-900 text-white">
            <Save className="h-4 w-4 mr-1 text-emerald-400" />
            Save SKU
          </Button>
        </div>
      </form>
    </Modal>
  );
}

