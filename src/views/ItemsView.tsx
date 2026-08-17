import { useEffect, useState } from 'react';
import { Tag, Save, Trash2 } from 'lucide-react';
import { Card, PageHeader, Spinner, ErrorBanner, EmptyState, Field, inputClass, Button, SearchInput } from '@/components/ui';
import { fetchItems } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Item } from '@/lib/supabase';
import { getErrorMessage } from '@/lib/utils';

export function ItemsView() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    setDeleteError(null);
    try {
      setItems(await fetchItems());
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load items'));
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
      .channel('items-realtime-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items' },
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
      setFormError('Item description is required.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: insertError } = await supabase.from('items').insert({ name: name.trim() });
      if (insertError) throw insertError;
      setName('');
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Failed to add item'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item? Deletion is blocked while any batch references it.')) return;
    setDeleteError(null);
    try {
      const { error: deleteErr } = await supabase.from('items').delete().eq('id', id);
      if (deleteErr) throw deleteErr;
      await load();
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete item'));
    }
  };

  if (loading) return <Spinner label="Loading items…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!items) return null;

  const filteredItems = items.filter((i) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return i.name.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader title="Bottle Item Catalogue" subtitle="Register and manage bottle specifications and product variants." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5 h-fit">
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">Add New Bottle Item</h2>

            <Field label="Bottle Item Description" htmlFor="name" required hint="e.g. 500ml Clear Wine Bottle">
              <input
                id="name"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="500ml Clear Wine Bottle"
                required
              />
            </Field>

            {formError && <ErrorBanner message={formError} />}

            <Button type="submit" variant="primary" loading={submitting} className="w-full">
              <Save className="h-4 w-4" />
              Save Item Specification
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Tag className="h-5 w-5 text-slate-500" />
              Item Specifications ({items.length})
            </h2>
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search item catalogue…" />
          </div>

          {deleteError && <ErrorBanner message={deleteError} />}

          {filteredItems.length === 0 ? (
            <EmptyState title="No items found" description="Add a new item specification using the form on the left." />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Item Specification</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((i) => (
                    <tr key={i.id} className="transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-bold text-slate-900">{i.name}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(i.id)}
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

