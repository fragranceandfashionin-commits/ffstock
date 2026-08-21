import { useState, useMemo, useRef, useEffect } from 'react';
import { Save, AlertTriangle, Plus, Trash2, Copy, FileText, ListPlus, Sparkles, Check } from 'lucide-react';
import { Modal, Field, inputClass, Button, ErrorBanner } from '@/components/ui';
import { insertItem, insertItems } from '@/lib/queries';
import { getErrorMessage, findSimilarItems, type SimilarItemMatch } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import { ITEM_CATEGORIES, type Item } from '@/lib/supabase';
import { COMMON_UNITS } from './types';

export type AddItemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated?: (newItem?: Item) => void;
  existingItems?: Item[];
  initialCategory?: string;
};

export type MultiItemRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  color: string;
  description: string;
};

const createEmptyRow = (defaultCategory = 'Bottle'): MultiItemRow => ({
  id: crypto.randomUUID(),
  name: '',
  category: defaultCategory,
  unit: 'pcs',
  color: '',
  description: '',
});

export function AddItemModal({
  isOpen,
  onClose,
  onItemCreated,
  existingItems = [],
  initialCategory = 'Bottle',
}: AddItemModalProps) {
  // Mode: 'single' or 'multi'
  const [entryMode, setEntryMode] = useState<'single' | 'multi'>('single');

  // Single Item State
  const [category, setCategory] = useState(initialCategory);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [color, setColor] = useState('');
  const [description, setDescription] = useState('');
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  // Session Counter for continuous additions
  const [sessionAddedCount, setSessionAddedCount] = useState(0);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);

  // Multi Items State
  const [rows, setRows] = useState<MultiItemRow[]>([
    createEmptyRow('Bottle'),
    createEmptyRow('Cap'),
    createEmptyRow('Atomizer'),
  ]);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [rawPastedText, setRawPastedText] = useState('');
  const [defaultBatchCategory, setDefaultBatchCategory] = useState('Bottle');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSessionAddedCount(0);
      setLastAddedName(null);
      setError(null);
      if (initialCategory) setCategory(initialCategory);
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, initialCategory]);

  // Single item similarity detection
  const similarMatches: SimilarItemMatch[] = useMemo(() => {
    if (entryMode !== 'single') return [];
    return findSimilarItems(name, category, existingItems);
  }, [name, category, existingItems, entryMode]);

  const hasHighConfidenceMatch =
    similarMatches.length > 0 &&
    (similarMatches[0].matchType === 'exact' || similarMatches[0].confidence >= 0.85);

  // Add row in multi mode
  const handleAddRow = () => {
    const lastCategory = rows.length > 0 ? rows[rows.length - 1].category : defaultBatchCategory;
    setRows((prev) => [...prev, createEmptyRow(lastCategory)]);
  };

  // Duplicate row
  const handleDuplicateRow = (index: number) => {
    const target = rows[index];
    if (!target) return;
    const newRow: MultiItemRow = {
      ...target,
      id: crypto.randomUUID(),
      name: target.name ? `${target.name} (Copy)` : '',
    };
    const next = [...rows];
    next.splice(index + 1, 0, newRow);
    setRows(next);
  };

  // Delete row
  const handleDeleteRow = (index: number) => {
    if (rows.length <= 1) {
      setRows([createEmptyRow(defaultBatchCategory)]);
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Update specific row field
  const updateRow = (index: number, field: keyof MultiItemRow, val: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  // Process raw pasted text into rows (e.g. from Excel or list)
  const handleApplyPastedText = () => {
    if (!rawPastedText.trim()) {
      setShowPasteBox(false);
      return;
    }

    const lines = rawPastedText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsedRows: MultiItemRow[] = lines.map((line) => {
      if (line.includes('\t')) {
        const parts = line.split('\t').map((p) => p.trim());
        return {
          id: crypto.randomUUID(),
          name: parts[0] || '',
          category: parts[1] || defaultBatchCategory,
          unit: parts[2] || 'pcs',
          color: parts[3] || '',
          description: parts[4] || '',
        };
      }
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim());
        return {
          id: crypto.randomUUID(),
          name: parts[0] || '',
          category: parts[1] || defaultBatchCategory,
          unit: parts[2] || 'pcs',
          color: parts[3] || '',
          description: parts[4] || '',
        };
      }
      return {
        id: crypto.randomUUID(),
        name: line,
        category: defaultBatchCategory,
        unit: 'pcs',
        color: '',
        description: '',
      };
    });

    if (parsedRows.length > 0) {
      const existingFilled = rows.filter((r) => r.name.trim().length > 0);
      setRows([...existingFilled, ...parsedRows]);
      toast.success(`Imported ${parsedRows.length} item lines.`, 'Items Imported');
    }

    setRawPastedText('');
    setShowPasteBox(false);
  };

  // Handle Submit Single SKU
  const handleSaveSingle = async (shouldClose: boolean, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Item name / specification is required.');
      nameInputRef.current?.focus();
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
      const newItem = await insertItem({
        name: trimmedName,
        category: category.trim() || 'Bottle',
        unit: unit.trim() || 'pcs',
        description: description.trim() || null,
        color: color.trim() || null,
      });

      toast.success(
        `Registered SKU "${trimmedName}" (${category}).${shouldClose ? '' : ' Ready for next SKU.'}`,
        'SKU Added'
      );

      setSessionAddedCount((prev) => prev + 1);
      setLastAddedName(trimmedName);
      onItemCreated?.(newItem);

      if (shouldClose) {
        setName('');
        setColor('');
        setDescription('');
        setAllowDuplicate(false);
        onClose();
      } else {
        // Continuous mode: Reset name, color, description, keep category & unit
        setName('');
        setColor('');
        setDescription('');
        setAllowDuplicate(false);
        setTimeout(() => {
          nameInputRef.current?.focus();
        }, 50);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create item'));
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Submit Multi
  const handleSubmitMulti = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const validRows = rows.filter((r) => r.name.trim().length > 0);
    if (validRows.length === 0) {
      setError('Please enter at least one item name to register.');
      return;
    }

    // Check for duplicate names within the multi-entry batch
    const nameSet = new Set<string>();
    const internalDuplicates: string[] = [];
    for (const r of validRows) {
      const lower = r.name.trim().toLowerCase();
      if (nameSet.has(lower)) {
        internalDuplicates.push(r.name.trim());
      } else {
        nameSet.add(lower);
      }
    }
    if (internalDuplicates.length > 0) {
      setError(`Duplicate items in list: "${internalDuplicates.join(', ')}". Please ensure distinct SKU names.`);
      return;
    }

    setSubmitting(true);
    try {
      const payloads = validRows.map((r) => ({
        name: r.name.trim(),
        category: r.category.trim() || 'Bottle',
        unit: r.unit.trim() || 'pcs',
        description: r.description.trim() || null,
        color: r.color.trim() || null,
      }));

      const created = await insertItems(payloads);
      toast.success(`Successfully registered ${created.length} new SKUs in Master Catalogue.`, 'Batch Items Saved');

      setRows([
        createEmptyRow('Bottle'),
        createEmptyRow('Cap'),
        createEmptyRow('Atomizer'),
      ]);
      if (created.length > 0) {
        onItemCreated?.(created[0]);
      } else {
        onItemCreated?.();
      }
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create batch items'));
    } finally {
      setSubmitting(false);
    }
  };

  const filledRowCount = rows.filter((r) => r.name.trim().length > 0).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Register Master Component SKUs"
      maxWidthClass={entryMode === 'multi' ? 'max-w-4xl' : 'max-w-lg'}
    >
      <div className="space-y-4">
        {/* MODE TOGGLE SWITCH & LIVE SESSION BADGE */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setEntryMode('single')}
              className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'single'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Single SKU Entry</span>
            </button>

            <button
              type="button"
              onClick={() => setEntryMode('multi')}
              className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                entryMode === 'multi'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <ListPlus className="h-3.5 w-3.5 text-emerald-400" />
              <span>Multi-SKU Matrix</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                  entryMode === 'multi' ? 'bg-slate-800 text-emerald-300' : 'bg-slate-200 text-slate-600'
                }`}
              >
                Fast Add
              </span>
            </button>
          </div>

          {sessionAddedCount > 0 && entryMode === 'single' && (
            <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 animate-in fade-in">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span>{sessionAddedCount} Registered</span>
            </span>
          )}
        </div>

        {/* -------------------- MODE 1: SINGLE ENTRY (CONTINUOUS + WORKFLOW) -------------------- */}
        {entryMode === 'single' && (
          <form
            onSubmit={(e) => handleSaveSingle(false, e)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSaveSingle(false);
              }
            }}
            className="space-y-4"
          >
            {sessionAddedCount > 0 && lastAddedName && (
              <div className="flex items-center justify-between bg-emerald-50/80 border border-emerald-200 rounded-xl px-3 py-1.5 text-xs text-emerald-900">
                <span className="flex items-center gap-1.5 truncate">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>
                    Saved: <strong>"{lastAddedName}"</strong>
                  </span>
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold shrink-0 ml-2">
                  Form ready for next SKU ↓
                </span>
              </div>
            )}

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
                    {c === 'Packaging'
                      ? '📦 Packaging / Box'
                      : c === 'Cap'
                      ? '🧴 Cap'
                      : c === 'Atomizer'
                      ? '💨 Atomizer'
                      : c === 'Bottle'
                      ? '🍾 Bottle'
                      : c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Item Name / Model Specification" htmlFor="sku-name" required>
              <input
                ref={nameInputRef}
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
                      {similarMatches.length === 1
                        ? 'An existing SKU matches closely:'
                        : `${similarMatches.length} existing SKUs match closely:`}
                    </p>
                  </div>
                </div>
                <div className="space-y-1 pl-6">
                  {similarMatches.slice(0, 3).map(({ item, matchType, confidence }) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between bg-white/80 px-2 py-1 rounded border border-amber-200"
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        <span className="font-semibold text-slate-900 truncate">"{item.name}"</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-medium shrink-0">
                          {item.category || 'SKU'}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${
                          matchType === 'exact' ? 'text-rose-600' : 'text-amber-700'
                        }`}
                      >
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={onClose}>
                {sessionAddedCount > 0 ? `Done (${sessionAddedCount} Added)` : 'Cancel'}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  loading={submitting}
                  onClick={() => handleSaveSingle(false)}
                  className="font-bold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 cursor-pointer shadow-2xs"
                  title="Save this SKU and keep the form open to add more"
                >
                  <Plus className="h-4 w-4 mr-1 text-emerald-600" />
                  <span>Save & Add Another SKU (+)</span>
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  loading={submitting}
                  onClick={() => handleSaveSingle(true)}
                  className="font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <Save className="h-4 w-4 mr-1 text-emerald-400" />
                  <span>Save & Close</span>
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* -------------------- MODE 2: MULTI-SKU BATCH MATRIX -------------------- */}
        {entryMode === 'multi' && (
          <form onSubmit={handleSubmitMulti} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div className="text-xs text-slate-600">
                Add multiple items in one batch. Type SKU names below or paste a bulk list.
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPasteBox((p) => !p)}
                  className="text-xs font-semibold text-slate-700 bg-white"
                >
                  <FileText className="h-3.5 w-3.5 mr-1 text-indigo-600" />
                  {showPasteBox ? 'Hide Paste Box' : 'Quick Paste List'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  className="text-xs font-bold text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add SKU Row
                </Button>
              </div>
            </div>

            {/* Quick Paste Modal / Textarea Box */}
            {showPasteBox && (
              <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950">
                    Bulk Paste Items (One item per line or tab-separated from Excel)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-indigo-800">Default Category:</span>
                    <select
                      className="text-xs font-bold bg-white border border-indigo-300 rounded px-2 py-0.5"
                      value={defaultBatchCategory}
                      onChange={(e) => setDefaultBatchCategory(e.target.value)}
                    >
                      {ITEM_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <textarea
                  className="w-full h-24 text-xs font-mono p-2 bg-white border border-indigo-200 rounded-lg focus:outline-indigo-500"
                  placeholder="e.g.&#10;50ml Square Clear Bottle&#10;100ml Cylindrical Bottle&#10;24mm Gold Cap&#10;24mm Shiny Silver Atomizer"
                  value={rawPastedText}
                  onChange={(e) => setRawPastedText(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowPasteBox(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleApplyPastedText}
                    className="bg-indigo-600 text-white font-bold"
                  >
                    Import to Table
                  </Button>
                </div>
              </div>
            )}

            {/* Dynamic Rows Table Grid */}
            <div className="max-h-[380px] overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider z-10 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-2 w-32">Category</th>
                    <th className="py-2.5 px-2 min-w-[180px]">Item Name / Model Spec *</th>
                    <th className="py-2.5 px-2 w-20">Unit</th>
                    <th className="py-2.5 px-2 w-28">Color (Opt)</th>
                    <th className="py-2.5 px-2 min-w-[140px]">Description (Opt)</th>
                    <th className="py-2.5 px-2 text-center w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400 font-bold">
                        {idx + 1}
                      </td>

                      {/* Category */}
                      <td className="py-2 px-1.5">
                        <select
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                          value={row.category}
                          onChange={(e) => updateRow(idx, 'category', e.target.value)}
                        >
                          {ITEM_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Name */}
                      <td className="py-2 px-1.5">
                        <input
                          type="text"
                          className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder="e.g. 50ml Square Bottle…"
                          value={row.name}
                          onChange={(e) => updateRow(idx, 'name', e.target.value)}
                          required={idx === 0 || rows.length === 1}
                        />
                      </td>

                      {/* Unit */}
                      <td className="py-2 px-1.5">
                        <select
                          className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-1.5 py-1.5"
                          value={row.unit}
                          onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                        >
                          {COMMON_UNITS.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Color */}
                      <td className="py-2 px-1.5">
                        <input
                          type="text"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5"
                          placeholder="e.g. Clear, Gold"
                          value={row.color}
                          onChange={(e) => updateRow(idx, 'color', e.target.value)}
                        />
                      </td>

                      {/* Description */}
                      <td className="py-2 px-1.5">
                        <input
                          type="text"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5"
                          placeholder="e.g. Neck 24/410, 185g"
                          value={row.description}
                          onChange={(e) => updateRow(idx, 'description', e.target.value)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-1.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(idx)}
                            title="Duplicate Row"
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            title="Remove Row"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Multi Row Summary Footer Bar */}
            <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  className="text-xs font-bold text-slate-800 bg-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Add Another Row
                </Button>
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.name.trim().length > 0))}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  Clear empty rows
                </button>
              </div>

              <div className="text-xs font-bold text-slate-700">
                Ready to save: <span className="text-emerald-700 font-black">{filledRowCount}</span>{' '}
                {filledRowCount === 1 ? 'SKU' : 'SKUs'}
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={filledRowCount === 0}
                className="font-bold bg-slate-900 text-white shadow-md cursor-pointer"
              >
                <Save className="h-4 w-4 mr-1 text-emerald-400" />
                <span>Save All {filledRowCount > 0 ? `(${filledRowCount}) SKUs` : 'SKUs'}</span>
                <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">
                  Ctrl+Enter
                </kbd>
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
