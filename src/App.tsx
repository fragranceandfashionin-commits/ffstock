import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import type { NavigationContext } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import type { View } from '@/lib/types';
import { CardSkeleton, TableSkeleton } from '@/components/ui';
import { LoginView } from '@/views/LoginView';
import { AccessDeniedView } from '@/views/AccessDeniedView';

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
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
      <div className="h-10 bg-slate-200 rounded-xl w-64 mb-6" />
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

function AppLoadingFallback() {
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowReset(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleForceReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignored
    }
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-indigo-500/20">
        <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
      <p className="text-sm font-bold text-slate-200">Initializing Factory Workstation...</p>
      <p className="text-xs text-slate-500 mt-1">Verifying operator credentials and permissions</p>
      {showReset && (
        <button
          type="button"
          onClick={handleForceReset}
          className="mt-6 px-4 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
        >
          Taking longer than usual? Click to reset workstation
        </button>
      )}
    </div>
  );
}

function App() {
  const { loading, isAuthenticated, canAccessView } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [navContext, setNavContext] = useState<NavigationContext | undefined>(undefined);

  const handleViewChange = useCallback((next: View, context?: NavigationContext) => {
    setView(next);
    setNavContext(context);
  }, []);

  if (loading) {
    return <AppLoadingFallback />;
  }

  if (!isAuthenticated) {
    return <LoginView standalone />;
  }

  const isCurrentViewAuthorized = canAccessView(view);

  return (
    <AppShell view={view} onViewChange={handleViewChange}>
      <Suspense fallback={<ViewFallback />}>
        {!isCurrentViewAuthorized ? (
          <AccessDeniedView targetView={view} onViewChange={handleViewChange} />
        ) : (
          <>
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
          </>
        )}
      </Suspense>
    </AppShell>
  );
}

export default App;
