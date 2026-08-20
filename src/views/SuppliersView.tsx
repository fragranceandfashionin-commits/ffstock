import { useEffect, useState, useRef } from 'react';
import { Boxes, Save, Trash2, Plus, Phone, Download } from 'lucide-react';
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
import { fetchSuppliers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/lib/supabase';
import { getErrorMessage, formatDate, downloadCSV, getTodayDateString } from '@/lib/utils';

export type SuppliersViewProps = {
  initialSupplierId?: string;
};

export function SuppliersView({ initialSupplierId }: SuppliersViewProps = {}) {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Delete modal state
  const [deleteModalSupplier, setDeleteModalSupplier] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const lastHandledSupplierIdRef = useRef<string | null>(null);
  const toast = useToast();

  const load = async (isSilent = false) => {
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
  };

  useEffect(() => {
    if (initialSupplierId && suppliers && lastHandledSupplierIdRef.current !== initialSupplierId) {
      lastHandledSupplierIdRef.current = initialSupplierId;
      const found = suppliers.find((s) => s.id === initialSupplierId);
      if (found) setSearchQuery(found.name);
    }
  }, [initialSupplierId, suppliers]);

  useEffect(() => {
    load();
  }, []);

  // -- Realtime live syncing across multi-user terminals --
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
  }, []);

  const handleAdd = async (e?: React.FormEvent) => {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const filteredSuppliers = (suppliers ?? []).filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.contact ?? '').toLowerCase().includes(q);
  });

  // CSV Export Handler
  const exportSuppliersCSV = () => {
    if (!suppliers || suppliers.length === 0) return;
    try {
      const headers = ['Supplier Name', 'Contact Details', 'Registered Date'];
      const rows = suppliers.map((s) => [
        s.name,
        s.contact || '',
        s.created_at ? formatDate(s.created_at) : '',
      ]);

      const filename = `ffstock_suppliers_directory_${getTodayDateString()}`;
      downloadCSV(filename, headers, rows);
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
        {/* Add Supplier Form */}
        <Card className="lg:col-span-1 border-slate-200/90 shadow-sm lg:sticky lg:top-20">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-2xs">
              <Plus className="h-4 w-4" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Add Supplier</h2>
          </div>

          <form onSubmit={handleAdd} onKeyDown={handleKeyDown} className="space-y-4">
            {formError && <ErrorBanner message={formError} />}

            <Field label="Supplier Name" required hint="e.g. Apex Glass & Packaging Co.">
              <input
                type="text"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Apex Glass & Packaging Co."
                disabled={submitting}
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
                          <p className="text-[11px] text-slate-500">{formatDate(s.created_at)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeleteModalSupplier(s)}
                        className="rounded-xl min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                        title="Delete supplier"
                        aria-label={`Delete ${s.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {s.contact ? (
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="break-all">{s.contact}</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No contact details registered</p>
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
                              <span>{s.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 text-xs">
                            {s.contact ? (
                              <span className="font-medium text-slate-700">{s.contact}</span>
                            ) : (
                              <span className="text-slate-400 italic">No contact info</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(s.created_at)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
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
    </div>
  );
}
