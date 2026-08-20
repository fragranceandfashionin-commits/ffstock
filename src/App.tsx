import { useState, useCallback } from 'react';
import { AppShell } from '@/components/AppShell';
import type { NavigationContext } from '@/components/AppShell';
import { DashboardView } from '@/views/DashboardView';
import { InwardView } from '@/views/InwardView';
import { OutwardView } from '@/views/OutwardView';
import { SuppliersView } from '@/views/SuppliersView';
import { ItemsView } from '@/views/ItemsView';
import type { View } from '@/lib/types';

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [navContext, setNavContext] = useState<NavigationContext | undefined>(undefined);

  const handleViewChange = useCallback((next: View, context?: NavigationContext) => {
    setView(next);
    setNavContext(context);
  }, []);

  return (
    <AppShell view={view} onViewChange={handleViewChange}>
      {view === 'dashboard' && (
        <DashboardView
          onViewChange={handleViewChange}
          initialInspectBatch={navContext?.inspectBatch}
          initialChallanDispatch={navContext?.openChallan}
          initialBatchId={navContext?.batchId}
        />
      )}
      {view === 'inward' && <InwardView />}
      {view === 'outward' && (
        <OutwardView
          initialBatchId={navContext?.batchId}
          initialMovementId={navContext?.movementId}
        />
      )}
      {view === 'suppliers' && (
        <SuppliersView
          initialSupplierId={navContext?.supplierId}
        />
      )}
      {view === 'items' && (
        <ItemsView
          initialItemId={navContext?.itemId}
        />
      )}
    </AppShell>
  );
}

export default App;

