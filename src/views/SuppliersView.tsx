import { useEffect, useState } from 'react';
import { Boxes, Save, Trash2, Plus, Phone } from 'lucide-react';
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
import { getErrorMessage, formatDate } from '@/lib/utils';

export function SuppliersView() {
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

  const toast = useToast();

  const load = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      setSuppliers(await fetchSuppliers());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load suppliers'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Manage verified raw material suppliers, packaging vendors, and component fabricators."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
        {/* Add Supplier Form */}
        <Card className="lg:col-span-1 border-slate-200/90 shadow-sm sticky top-20">
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
              <Button type="submit" loading={submitting} className="w-full" variant="primary">
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
