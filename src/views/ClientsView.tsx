import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Users,
  Plus,
  Building2,
  Phone,
  Mail,
  Edit2,
  Trash2,
  ClipboardList,
  X,
} from 'lucide-react';
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
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  fetchClients,
  createClient,
  updateClient,
  deleteClient,
} from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/lib/supabase';
import type { View } from '@/lib/types';
import type { NavigationContext } from '@/components/AppShell';
import { getErrorMessage } from '@/lib/utils';

export type ClientsViewProps = {
  initialClientId?: string;
  onViewChange?: (view: View, context?: NavigationContext) => void;
};

export function ClientsView({ initialClientId, onViewChange }: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteModalClient, setDeleteModalClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferences, setPreferences] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [clientsWithOrders, setClientsWithOrders] = useState<Set<string>>(new Set());
  const toast = useToast();

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [data, ordersRes] = await Promise.all([
        fetchClients(),
        supabase.from('production_orders').select('client_id').not('client_id', 'is', null),
      ]);
      setClients(data);

      const orderClientIds = new Set<string>();
      (ordersRes.data ?? []).forEach((row: { client_id: string | null }) => {
        if (row.client_id) orderClientIds.add(row.client_id);
      });
      setClientsWithOrders(orderClientIds);

      if (initialClientId) {
        const found = data.find((c) => c.id === initialClientId);
        if (found) setSearchQuery(found.name);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load clients'));
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [initialClientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time updates
  useEffect(() => {
    const channel = supabase
      .channel('clients_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_orders' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Open Edit Modal
  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setCompanyName(client.company_name || '');
    setPhone(client.phone || '');
    setEmail(client.email || '');
    setPreferences(client.preferences || '');
    setStatus(client.status);
    setShowAddModal(true);
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingClient(null);
    setName('');
    setCompanyName('');
    setPhone('');
    setEmail('');
    setPreferences('');
    setStatus('active');
    setShowAddModal(true);
  };

  // Submit Form (Create or Update)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Client name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingClient) {
        const updated = await updateClient(editingClient.id, {
          name: name.trim(),
          company_name: companyName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          preferences: preferences.trim() || null,
          status,
        });
        toast.success(`Client "${updated.name}" updated!`);
      } else {
        const created = await createClient({
          name: name.trim(),
          company_name: companyName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          preferences: preferences.trim() || null,
          status,
        });
        toast.success(`Client "${created.name}" created!`);
      }

      setShowAddModal(false);
      await loadData();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save client'));
    } finally {
      setSaving(false);
    }
  };

  // Delete Client with foreign-key protection guard
  const handleConfirmDelete = async () => {
    if (!deleteModalClient) return;
    setDeleting(true);
    try {
      await deleteClient(deleteModalClient.id);
      toast.success(`Client "${deleteModalClient.name}" deleted`);
      setDeleteModalClient(null);
      await loadData();
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes('foreign key') || msg.includes('violates foreign key constraint')) {
        toast.error(
          `Cannot delete client "${deleteModalClient.name}" because they have existing production orders. Set client to "Inactive" instead to preserve history.`
        );
      } else {
        toast.error(msg || 'Failed to delete client');
      }
    } finally {
      setDeleting(false);
    }
  };

  // Filtered clients list
  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      if (statusFilter !== 'all' && client.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = client.name.toLowerCase().includes(q);
        const matchCompany = client.company_name?.toLowerCase().includes(q);
        const matchEmail = client.email?.toLowerCase().includes(q);
        const matchPhone = client.phone?.toLowerCase().includes(q);
        const matchPref = client.preferences?.toLowerCase().includes(q);
        return matchName || matchCompany || matchEmail || matchPhone || matchPref;
      }
      return true;
    });
  }, [clients, statusFilter, searchQuery]);

  const activeCount = clients.filter((c) => c.status === 'active').length;
  const inactiveCount = clients.filter((c) => c.status === 'inactive').length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Clients Directory"
        subtitle="Manage client CRM profiles, contact details, and packaging specifications"
        action={
          <Button
            variant="primary"
            onClick={handleOpenCreate}
          >
            <Plus className="h-4 w-4" />
            New Client
          </Button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {/* Search & Filter Bar */}
      <Card className="p-4 bg-white border border-slate-200 shadow-xs rounded-2xl">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 max-w-md">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search clients by name, company, email, phone..."
            />
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
              onClick={() => setStatusFilter('all')}
            >
              All Clients ({clients.length})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
              onClick={() => setStatusFilter('active')}
            >
              Active ({activeCount})
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-white text-slate-700 shadow-sm'
                  : 'hover:text-slate-900'
              }`}
              onClick={() => setStatusFilter('inactive')}
            >
              Inactive ({inactiveCount})
            </button>
          </div>
        </div>
      </Card>

      {/* Clients Grid */}
      {loading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No clients found"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'No clients match your filter criteria.'
              : 'Add your first client to link with production orders.'
          }
          action={
            <Button
              variant="primary"
              onClick={handleOpenCreate}
            >
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const isActive = client.status === 'active';
            const hasOrders = clientsWithOrders.has(client.id);

            return (
              <Card
                key={client.id}
                className="p-5 bg-white border border-slate-200/90 hover:border-slate-300 shadow-xs rounded-2xl flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{client.name}</h3>
                      {client.company_name && (
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3 w-3 text-slate-400" />
                          {client.company_name}
                        </p>
                      )}
                    </div>

                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-4 space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    {client.phone ? (
                      <a
                        href={`tel:${client.phone}`}
                        className="flex items-center gap-2 text-indigo-600 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {client.phone}
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 text-slate-400">
                        <Phone className="h-3.5 w-3.5" /> No phone
                      </span>
                    )}

                    {client.email ? (
                      <a
                        href={`mailto:${client.email}`}
                        className="flex items-center gap-2 text-indigo-600 hover:underline truncate"
                      >
                        <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{client.email}</span>
                      </a>
                    ) : (
                      <span className="flex items-center gap-2 text-slate-400">
                        <Mail className="h-3.5 w-3.5" /> No email
                      </span>
                    )}
                  </div>

                  {/* Preferences / Notes */}
                  {client.preferences && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                      <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">
                        Packaging Preferences:
                      </span>
                      <p className="italic line-clamp-2">{client.preferences}</p>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  {/* Jump to Orders */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (onViewChange) {
                        onViewChange('orders', { clientId: client.id });
                      }
                    }}
                    title="View production orders for this client"
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Orders
                  </Button>

                  <div className="flex items-center gap-1.5">
                    {hasOrders && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100/80 border border-amber-200 px-1.5 py-0.5 rounded-md">
                        Has Orders
                      </span>
                    )}

                    <button
                      type="button"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      onClick={() => handleOpenEdit(client)}
                      title="Edit client details"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      disabled={hasOrders}
                      className={`p-1.5 rounded-lg transition ${
                        hasOrders
                          ? 'opacity-30 cursor-not-allowed text-slate-300'
                          : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                      }`}
                      onClick={() => setDeleteModalClient(client)}
                      title={hasOrders ? 'Client has order history. Mark inactive instead to preserve history.' : 'Delete client'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT CLIENT MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingClient ? 'Edit Client Profile' : 'New Client Profile'}
                </h3>
                <p className="text-xs text-slate-500">
                  Client profile for production orders and customer CRM
                </p>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1"
                onClick={() => setShowAddModal(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-3.5">
              <Field label="Client Name" required>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </Field>

              <Field label="Company / Brand Name">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="e.g. Maison de Luxe Perfumes"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input
                    type="tel"
                    className={inputClass}
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="client@brand.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Packaging & Product Preferences">
                <textarea
                  className={inputClass}
                  rows={3}
                  placeholder="e.g. Matte black caps, standard crimpless atomizer, velvet box lining, gold foil embossed labels..."
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                />
              </Field>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Client Status
                </label>
                <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      status === 'active'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    onClick={() => setStatus('active')}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      status === 'inactive'
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    onClick={() => setStatus('inactive')}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={saving}
                >
                  {editingClient ? 'Save Changes' : 'Create Client'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CLIENT CONFIRMATION MODAL */}
      {deleteModalClient && (
        <ConfirmModal
          isOpen={!!deleteModalClient}
          title={`Delete Client ${deleteModalClient.name}?`}
          message={`Are you sure you want to delete "${deleteModalClient.name}"? If this client has any associated production orders, deletion will be safely prevented to protect historical records.`}
          confirmText={deleting ? 'Deleting...' : 'Delete Client'}
          variant="danger"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteModalClient(null)}
        />
      )}
    </div>
  );
}
