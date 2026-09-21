import { useState, useCallback, lazy, Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import type { NavigationContext } from '@/components/AppShell';
import { AuthProvider } from '@/lib/auth';
import type { View } from '@/lib/types';
import { CardSkeleton, TableSkeleton } from '@/components/ui';

const DashboardView = lazy(() =>
  import('@/views/DashboardView').then((m) => ({ default: m.DashboardView }))
);
const ItemsView = lazy(() =>
  import('@/views/ItemsView').then((m) => ({ default: m.ItemsView }))
);
const SuppliersView = lazy(() =>
  import('@/views/SuppliersView').then((m) => ({ default: m.SuppliersView }))
);
const OutwardView = lazy(() =>
  import('@/views/OutwardView').then((m) => ({ default: m.OutwardView }))
);
const OrdersView = lazy(() =>
  import('@/views/OrdersView').then((m) => ({ default: m.OrdersView }))
);
const VendorPendingView = lazy(() =>
  import('@/views/VendorPendingView').then((m) => ({ default: m.VendorPendingView }))
);
const ClientsView = lazy(() =>
  import('@/views/ClientsView').then((m) => ({ default: m.ClientsView }))
);
const OrderHistoryView = lazy(() =>
  import('@/views/OrderHistoryView').then((m) => ({ default: m.OrderHistoryView }))
);

function ViewFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6 animate-pulse">
      <div className="h-10 bg-slate-200 rounded-xl w-1/3 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [navContext, setNavContext] = useState<NavigationContext | undefined>(undefined);

  const handleViewChange = useCallback((next: View, context?: NavigationContext) => {
    setView(next);
    setNavContext(context);
  }, []);

  return (
    <AuthProvider>
      <AppShell view={view} onViewChange={handleViewChange}>
        <Suspense fallback={<ViewFallback />}>
          {view === 'dashboard' && (
            <DashboardView
              onViewChange={handleViewChange}
              initialInspectBatch={navContext?.inspectBatch}
              initialChallanDispatch={navContext?.openChallan}
              initialBatchId={navContext?.batchId}
            />
          )}
          {view === 'orders' && (
            <OrdersView
              initialOrderId={navContext?.orderId}
              initialClientId={navContext?.clientId}
              onViewChange={handleViewChange}
            />
          )}
          {view === 'vendor-pending' && (
            <VendorPendingView
              onViewChange={handleViewChange}
            />
          )}
          {view === 'clients' && (
            <ClientsView
              initialClientId={navContext?.clientId}
              onViewChange={handleViewChange}
            />
          )}
          {view === 'items' && (
            <ItemsView
              initialItemId={navContext?.itemId}
              initialBatchId={navContext?.batchId}
              initialOpenInwardModal={navContext?.openInwardModal}
              initialActiveTab={navContext?.activeTab}
              onViewChange={handleViewChange}
            />
          )}
          {view === 'suppliers' && (
            <SuppliersView
              initialSupplierId={navContext?.supplierId}
            />
          )}
          {view === 'outward' && (
            <OutwardView
              initialBatchId={navContext?.batchId}
              initialMovementId={navContext?.movementId}
            />
          )}
          {view === 'order-history' && (
            <OrderHistoryView
              onViewChange={handleViewChange}
            />
          )}
        </Suspense>
      </AppShell>
    </AuthProvider>
  );
}

export default App;
