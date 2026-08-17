import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { DashboardView } from '@/views/DashboardView';
import { InwardView } from '@/views/InwardView';
import { OutwardView } from '@/views/OutwardView';
import { SuppliersView } from '@/views/SuppliersView';
import { ItemsView } from '@/views/ItemsView';
import type { View } from '@/lib/types';

function App() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <AppShell view={view} onViewChange={setView}>
      {view === 'dashboard' && <DashboardView onViewChange={setView} />}
      {view === 'inward' && <InwardView />}
      {view === 'outward' && <OutwardView />}
      {view === 'suppliers' && <SuppliersView />}
      {view === 'items' && <ItemsView />}
    </AppShell>
  );
}

export default App;
