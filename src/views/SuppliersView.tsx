import { useEffect, useState } from 'react';
import { Boxes, Save, Trash2 } from 'lucide-react';
import { Card, PageHeader, Spinner, ErrorBanner, EmptyState, Field, inputClass, Button, SearchInput } from '@/components/ui';
import { fetchSuppliers } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';

export function SuppliersView() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    setDeleteError(null);
    try {
      setSuppliers(await fetchSuppliers());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load suppliers'));
    } finally {
      setLoading(false);
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
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setName('');
      setContact('');
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to add supplier'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this supplier? Deletion is blocked while any batch references it.')) return;
    setDeleteError(null);
    try {
      const { error: deleteErr } = await supabase.from('suppliers').delete().eq('id', id);
      if (deleteErr) throw deleteErr;
      await load();
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete supplier'));
    }
  };

  if (loading) return <Spinner label="Loading suppliers…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!suppliers) return null;

  const filteredSuppliers = suppliers.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.contact ?? '').toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader title="Supplier Master Directory" subtitle="Register and manage raw bottle and glass suppliers." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5 h-fit">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Add New Supplier</h2>

            <Field label="Supplier Company Name" htmlFor="name" required hint="e.g. Apex Glassworks Pvt Ltd">
              <input id="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field label="Contact Person / Phone (optional)" htmlFor="contact" hint="Phone number, email, or representative">
              <input id="contact" className={inputClass} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. +91 98765 43210" />
            </Field>

            {formError && <ErrorBanner message={formError} />}

            <Button type="submit" variant="primary" loading={submitting} className="w-full">
              <Save className="h-4 w-4" />
              Save Supplier
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Boxes className="h-5 w-5 text-slate-500" />
              Registered Suppliers ({suppliers.length})
            </h2>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search suppliers…" />
          </div>

          {deleteError && <ErrorBanner message={deleteError} />}

          {filteredSuppliers.length === 0 ? (
            <EmptyState title="No suppliers found" description="Add a new supplier or change your search filter." />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Supplier Name</th>
                    <th className="px-4 py-3">Contact Details</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSuppliers.map((s) => (
                    <tr key={s.id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-bold text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{s.contact ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

