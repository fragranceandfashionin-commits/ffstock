import { useEffect, useState, useRef, useCallback } from 'react';
import { Boxes, Save, Trash2, Plus, Phone, Download, FileText, Copy, Edit2, Mail, X } from 'lucide-react';
import {
  Card,
  PageHeader,
  ErrorBanner,
  EmptyState,
  Field,
  inputClass,
  Button,
  SearchInput,
  ConfirmModal,
  TableSkeleton,
  TableScrollContainer,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import { fetchSuppliers, insertSuppliers, updateSupplierExtended } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Supplier, ExtendedSupplier } from '@/lib/supabase';
import { getErrorMessage, formatDate, downloadCSV, getTodayDateString } from '@/lib/utils';

export type SuppliersViewProps = {
  initialSupplierId?: string;
};

export type MultiSupplierRow = {
  id: string;
  name: string;
  contact: string;
};

const createEmptySupplierRow = (): MultiSupplierRow => ({
  id: crypto.randomUUID(),
  name: '',
  contact: '',
});

export function SuppliersView({ initialSupplierId }: SuppliersViewProps = {}) {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form Mode: 'single' vs 'multi'
  const [formMode, setFormMode] = useState<'single' | 'multi'>('single');

  // Single Supplier State
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');

  // Multi Supplier State
  const [multiRows, setMultiRows] = useState<MultiSupplierRow[]>([
    createEmptySupplierRow(),
    createEmptySupplierRow(),
  ]);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [rawPastedText, setRawPastedText] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Delete modal state
  const [deleteModalSupplier, setDeleteModalSupplier] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit Supplier Modal State
  const [editModalSupplier, setEditModalSupplier] = useState<ExtendedSupplier | null>(null);
  const [editName, setEditName] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editMaterials, setEditMaterials] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const lastHandledSupplierIdRef = useRef<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const data = await fetchSuppliers();
      setSuppliers(data);
      if (initialSupplierId && lastHandledSupplierIdRef.current !== initialSupplierId) {
        lastHandledSupplierIdRef.current = initialSupplierId;
        const found = data.find((s) => s.id === initialSupplierId);
        if (found) setSearchQuery(found.name);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load suppliers'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [initialSupplierId]);

  useEffect(() => {
    if (initialSupplierId && suppliers && lastHandledSupplierIdRef.current !== initialSupplierId) {
      lastHandledSupplierIdRef.current = initialSupplierId;
      const found = suppliers.find((s) => s.id === initialSupplierId);
      if (found) setSearchQuery(found.name);
    }
  }, [initialSupplierId, suppliers]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime live syncing across multi-user terminals
  useEffect(() => {
    const channel = supabase
      .channel('suppliers-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suppliers' },
        () => {
          load(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Multi Row Operations
  const handleAddMultiRow = () => {
    setMultiRows((prev) => [...prev, createEmptySupplierRow()]);
  };

  const handleDuplicateMultiRow = (idx: number) => {
    const target = multiRows[idx];
    if (!target) return;
    const newRow = {
      ...target,
      id: crypto.randomUUID(),
      name: target.name ? `${target.name} (Copy)` : '',
    };
    const next = [...multiRows];
    next.splice(idx + 1, 0, newRow);
    setMultiRows(next);
  };

  const handleDeleteMultiRow = (idx: number) => {
    if (multiRows.length <= 1) {
      setMultiRows([createEmptySupplierRow()]);
      return;
    }
    setMultiRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMultiRow = (idx: number, field: keyof MultiSupplierRow, val: string) => {
    setMultiRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  const handleApplyPastedSuppliers = () => {
    if (!rawPastedText.trim()) {
      setShowPasteBox(false);
      return;
    }

    const lines = rawPastedText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: MultiSupplierRow[] = lines.map((line) => {
      if (line.includes('\t')) {
        const parts = line.split('\t').map((p) => p.trim());
        return { id: crypto.randomUUID(), name: parts[0] || '', contact: parts[1] || '' };
      }
      if (line.includes(',')) {
        const parts = line.split(',').map((p) => p.trim());
        return { id: crypto.randomUUID(), name: parts[0] || '', contact: parts.slice(1).join(', ') };
      }
      return { id: crypto.randomUUID(), name: line, contact: '' };
    });

    if (parsed.length > 0) {
      const existingFilled = multiRows.filter((r) => r.name.trim().length > 0);
      setMultiRows([...existingFilled, ...parsed]);
      toast.success(`Imported ${parsed.length} suppliers into matrix.`, 'Suppliers Imported');
    }

    setRawPastedText('');
    setShowPasteBox(false);
  };

  // Submit Single Supplier
  const handleAddSingle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('suppliers').insert({
        name: name.trim(),
        contact: contact.trim() || null,
      });
      if (insertError) throw insertError;
      toast.success(`Supplier "${name.trim()}" added successfully.`, 'Supplier Added');
      setName('');
      setContact('');
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add supplier');
      setFormError(msg);
      toast.error(msg, 'Error Adding Supplier');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Multi Suppliers
  const handleAddMulti = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    const validRows = multiRows.filter((r) => r.name.trim().length > 0);
    if (validRows.length === 0) {
      setFormError('Please enter at least one supplier name.');
      return;
    }

    // Check for internal duplicates
    const nameSet = new Set<string>();
    const dupes: string[] = [];
    for (const r of validRows) {
      const n = r.name.trim().toLowerCase();
      if (nameSet.has(n)) {
        dupes.push(r.name.trim());
      } else {
        nameSet.add(n);
      }
    }
    if (dupes.length > 0) {
      setFormError(`Duplicate supplier names: "${dupes.join(', ')}".`);
      return;
    }

    setSubmitting(true);
    try {
      const payloads = validRows.map((r) => ({
        name: r.name.trim(),
        contact: r.contact.trim() || null,
      }));

      const created = await insertSuppliers(payloads);
      toast.success(`Successfully added ${created.length} suppliers.`, 'Batch Suppliers Added');

      setMultiRows([createEmptySupplierRow(), createEmptySupplierRow()]);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to add batch suppliers');
      setFormError(msg);
      toast.error(msg, 'Error Adding Suppliers');
    } finally {
      setSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteModalSupplier) return;
    setDeleting(true);
    try {
      const { error: deleteErr } = await supabase.from('suppliers').delete().eq('id', deleteModalSupplier.id);
      if (deleteErr) throw deleteErr;
      toast.success(`Supplier "${deleteModalSupplier.name}" deleted.`, 'Supplier Removed');
      setDeleteModalSupplier(null);
      await load(true);
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete supplier');
      toast.error(msg, 'Delete Blocked');
    } finally {
      setDeleting(false);
    }
  };

  const handleKeyDownSingle = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAddSingle();
    }
  };

  const openEditModal = (s: ExtendedSupplier) => {
    setEditModalSupplier(s);
    setEditName(s.name);
    setEditContactPerson(s.contact_person || '');
    setEditPhone(s.phone || s.contact || '');
    setEditEmail(s.email || '');
    setEditCategories(s.categories_supplied || []);
    setEditMaterials(s.specific_materials || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalSupplier || !editName.trim()) return;
    setSavingEdit(true);
    try {
      await updateSupplierExtended(editModalSupplier.id, {
        name: editName.trim(),
        contact: editPhone.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        contact_person: editContactPerson.trim() || null,
        categories_supplied: editCategories,
        specific_materials: editMaterials.trim() || null,
      });
      toast.success(`Supplier "${editName}" updated successfully!`, 'Supplier Updated');
      setEditModalSupplier(null);
      await load(true);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update supplier'), 'Update Failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredSuppliers = (suppliers ?? []).filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.contact ?? '').toLowerCase().includes(q);
  });

  const filledMultiCount = multiRows.filter((r) => r.name.trim().length > 0).length;

  // CSV Export Handler
  const exportSuppliersCSV = () => {
    if (!suppliers || suppliers.length === 0) return;
    try {
      const headers = ['Supplier Name', 'Contact Details', 'Registered Date'];
      const rowsData = suppliers.map((s) => [
        s.name,
        s.contact || '',
        s.created_at ? formatDate(s.created_at) : '',
      ]);

      const filename = `ffstock_suppliers_directory_${getTodayDateString()}`;
      downloadCSV(filename, headers, rowsData);
      toast.success('Suppliers directory CSV exported successfully', 'Export Complete');
    } catch (err) {
      toast.error(getErrorMessage(err), 'Export Failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Manage verified raw material suppliers, packaging vendors, and component fabricators."
        action={
          <Button
            variant="outline"
            onClick={exportSuppliersCSV}
            className="text-xs font-bold text-slate-700 bg-white shadow-2xs hover:bg-slate-50 cursor-pointer"
            title="Download suppliers directory CSV"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            Export Suppliers CSV
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
        {/* Add Supplier Form Card */}
        <Card className="lg:col-span-1 border-slate-200/90 shadow-sm lg:sticky lg:top-20">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-2xs">
                <Plus className="h-4 w-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Add Supplier</h2>
            </div>

            {/* Toggle Mode */}
            <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setFormMode('single')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  formMode === 'single' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => setFormMode('multi')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  formMode === 'multi' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500'
                }`}
              >
                Batch / Multi
              </button>
            </div>
          </div>

          {formError && <ErrorBanner message={formError} />}

          {/* ----------------- MODE 1: SINGLE SUPPLIER ----------------- */}
          {formMode === 'single' && (
            <form onSubmit={handleAddSingle} onKeyDown={handleKeyDownSingle} className="space-y-4">
              <Field label="Supplier Name" required hint="e.g. Apex Glass & Packaging Co.">
                <input
                  type="text"
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Apex Glass & Packaging Co."
                  disabled={submitting}
                  autoFocus
                />
              </Field>

              <Field label="Contact Info" hint="Phone, email, or address (optional)">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className={`${inputClass} pl-9`}
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="+91 98765 43210 / info@apex.com"
                    disabled={submitting}
                  />
                </div>
              </Field>

              <div className="pt-2">
                <Button type="submit" loading={submitting} className="w-full min-h-[44px]" variant="primary">
                  <Save className="h-4 w-4" />
                  <span>Save Supplier</span>
                  <kbd className="hidden sm:inline-block ml-1.5 px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded">Ctrl+Enter</kbd>
                </Button>
              </div>
            </form>
          )}

          {/* ----------------- MODE 2: MULTI-SUPPLIER BATCH MATRIX ----------------- */}
          {formMode === 'multi' && (
            <form onSubmit={handleAddMulti} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600">Register multiple vendors at once</span>
                <button
                  type="button"
                  onClick={() => setShowPasteBox((p) => !p)}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="h-3 w-3" />
                  {showPasteBox ? 'Hide Paste' : 'Bulk Paste'}
                </button>
              </div>

              {/* Paste box */}
              {showPasteBox && (
                <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                  <span className="text-[11px] font-bold text-indigo-950 block">Paste suppliers (one per line or Tab/CSV)</span>
                  <textarea
                    className="w-full h-20 text-xs font-mono p-1.5 bg-white border border-indigo-200 rounded-lg focus:outline-indigo-500"
                    placeholder="e.g.&#10;Apex Glass Works&#10;HNG Glass, +91 98765 43210&#10;Luxe Closures"
                    value={rawPastedText}
                    onChange={(e) => setRawPastedText(e.target.value)}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowPasteBox(false)}>
                      Cancel
                    </Button>
                    <Button type="button" variant="primary" size="sm" onClick={handleApplyPastedSuppliers} className="bg-indigo-600 text-white font-bold">
                      Import Rows
                    </Button>
                  </div>
                </div>
              )}

              {/* Dynamic Rows */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {multiRows.map((row, idx) => (
                  <div key={row.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 relative group">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400">SUPPLIER #{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateMultiRow(idx)}
                          title="Duplicate"
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMultiRow(idx)}
                          title="Remove"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      className={`${inputClass} text-xs font-bold`}
                      placeholder="Supplier / Vendor Name *"
                      value={row.name}
                      onChange={(e) => updateMultiRow(idx, 'name', e.target.value)}
                      required={idx === 0}
                    />

                    <input
                      type="text"
                      className={`${inputClass} text-xs`}
                      placeholder="Contact details (phone/email/address)"
                      value={row.contact}
                      onChange={(e) => updateMultiRow(idx, 'contact', e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddMultiRow}
                  className="text-xs font-bold text-slate-800 bg-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                  Add Another Row
                </Button>

                <span className="text-xs font-bold text-slate-700">
                  Total: <strong className="text-emerald-700">{filledMultiCount}</strong>
                </span>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={filledMultiCount === 0}
                  className="w-full min-h-[44px]"
                  variant="primary"
                >
                  <Save className="h-4 w-4" />
                  <span>Save All {filledMultiCount > 0 ? `(${filledMultiCount}) Suppliers` : 'Suppliers'}</span>
                </Button>
              </div>
            </form>
          )}
        </Card>

        {/* Suppliers List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search suppliers by name or contact…"
            />
            <div className="text-xs font-semibold text-slate-500 self-center sm:self-auto">
              Total: <span className="text-slate-900 font-bold">{filteredSuppliers.length}</span> {filteredSuppliers.length === 1 ? 'supplier' : 'suppliers'}
            </div>
          </div>

          {loading ? (
            <Card className="p-0">
              <TableSkeleton rows={5} cols={3} />
            </Card>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No suppliers found"
              description={searchQuery ? 'No suppliers match your search filter.' : 'Add your first supplier using the form on the left.'}
            />
          ) : (
            <>
              {/* Mobile View: Cards (< sm) */}
              <div className="grid grid-cols-1 gap-2.5 sm:hidden">
                {filteredSuppliers.map((s) => (
                  <Card key={`mobile-supplier-${s.id}`} className="p-3.5 border-slate-200 shadow-2xs space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 text-white text-xs font-bold shrink-0 shadow-2xs">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{s.name}</p>
                          {(s as ExtendedSupplier).contact_person && (
                            <p className="text-[11px] text-slate-600 font-medium">
                              Person: {(s as ExtendedSupplier).contact_person}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-400">{formatDate(s.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(s as ExtendedSupplier)}
                          className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
                          title="Edit supplier"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteModalSupplier(s)}
                          className="rounded-xl min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                          title="Delete supplier"
                          aria-label={`Delete ${s.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {((s as ExtendedSupplier).phone || s.contact) && (
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="break-all">{(s as ExtendedSupplier).phone || s.contact}</span>
                        </div>
                      )}
                      {(s as ExtendedSupplier).email && (
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="break-all">{(s as ExtendedSupplier).email}</span>
                        </div>
                      )}
                    </div>

                    {Array.isArray((s as ExtendedSupplier).categories_supplied) && (s as ExtendedSupplier).categories_supplied!.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(s as ExtendedSupplier).categories_supplied!.map((cat, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {/* Desktop View: Table (>= sm) */}
              <div className="hidden sm:block">
                <TableScrollContainer>
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200/80 text-xs font-bold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Supplier Name</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3">Added Date</th>
                        <th className="px-4 py-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredSuppliers.map((s) => (
                        <tr key={s.id} className="transition hover:bg-slate-50/80 group">
                          <td className="px-4 py-3.5 font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 text-xs font-bold shrink-0">
                                {s.name.charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <span>{s.name}</span>
                                {(s as ExtendedSupplier).contact_person && (
                                  <div className="text-[11px] font-normal text-slate-500">
                                    Attn: {(s as ExtendedSupplier).contact_person}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 text-xs">
                            <div className="space-y-0.5">
                              {((s as ExtendedSupplier).phone || s.contact) && (
                                <div className="font-medium text-slate-700 flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-slate-400" />
                                  {(s as ExtendedSupplier).phone || s.contact}
                                </div>
                              )}
                              {(s as ExtendedSupplier).email && (
                                <div className="text-slate-500 flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-slate-400" />
                                  {(s as ExtendedSupplier).email}
                                </div>
                              )}
                              {Array.isArray((s as ExtendedSupplier).categories_supplied) && (s as ExtendedSupplier).categories_supplied!.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {(s as ExtendedSupplier).categories_supplied!.map((cat, i) => (
                                    <span key={i} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium border border-slate-200">
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(s.created_at)}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditModal(s as ExtendedSupplier)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer mr-1"
                              title="Edit supplier"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteModalSupplier(s)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                              title="Delete supplier"
                              aria-label={`Delete ${s.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScrollContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteModalSupplier)}
        onClose={() => setDeleteModalSupplier(null)}
        onConfirm={executeDelete}
        title="Delete Supplier"
        message={`Are you sure you want to delete supplier "${deleteModalSupplier?.name}"?`}
        details="Note: Deletion will be safely blocked if any existing batches or receipts reference this supplier."
        confirmText="Yes, Delete Supplier"
        variant="danger"
        loading={deleting}
      />

      {/* Edit Supplier Modal */}
      {editModalSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 p-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Supplier Profile</h3>
                <p className="text-xs text-slate-500">Update supplier contact and materials info</p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1"
                onClick={() => setEditModalSupplier(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <Field label="Supplier Name" required>
                <input
                  type="text"
                  className={inputClass}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </Field>

              <Field label="Contact Person">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Rajesh Sharma"
                  value={editContactPerson}
                  onChange={(e) => setEditContactPerson(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone / Mobile">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="+91 98765 43210"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="sales@supplier.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </Field>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Categories Supplied
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Bottles', 'Cap', 'Atomizer', 'Packaging', 'Box', 'Sticker', 'Coating', 'Printing', 'Cellophane', 'Raw Material'
                  ].map((cat) => {
                    const isSelected = editCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditCategories(editCategories.filter((c) => c !== cat));
                          } else {
                            setEditCategories([...editCategories, cat]);
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-semibold transition ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="Specific Materials / Notes">
                <textarea
                  className={inputClass}
                  rows={2}
                  placeholder="e.g. Amber glass bottles, 24/410 crimpless collars, matte lamination..."
                  value={editMaterials}
                  onChange={(e) => setEditMaterials(e.target.value)}
                />
              </Field>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditModalSupplier(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={savingEdit}
                >
                  Save Supplier Details
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
