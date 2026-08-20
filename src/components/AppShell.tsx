import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { LayoutDashboard, PackagePlus, Send, Boxes, Tag, Menu, X, CheckCircle2, Search } from 'lucide-react';
import type { View } from '@/lib/types';
import { classNames } from '@/lib/utils';
import { ToastProvider } from '@/components/Toast';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';
import type { BatchWithRelations, Dispatch } from '@/lib/supabase';

type NavItem = { id: View; label: string; icon: typeof LayoutDashboard };

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'items', label: 'Items', icon: Tag },
  { id: 'suppliers', label: 'Suppliers', icon: Boxes },
  { id: 'inward', label: 'Inward Entry', icon: PackagePlus },
  { id: 'outward', label: 'Outward Journey', icon: Send },
];

export type NavigationContext = {
  batchId?: string;
  itemId?: string;
  supplierId?: string;
  invoiceNo?: string;
  movementId?: string;
  inspectBatch?: BatchWithRelations;
  openChallan?: Dispatch;
};

type AppShellProps = {
  view: View;
  onViewChange: (view: View, context?: NavigationContext) => void;
  children: ReactNode;
};

export function AppShell({ view, onViewChange, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSelect = useCallback(
    (next: View) => {
      onViewChange(next);
      setMobileOpen(false);
    },
    [onViewChange],
  );

  const handleSearchNavigate = useCallback(
    (nextView: View, context?: NavigationContext) => {
      onViewChange(nextView, context);
      setSearchOpen(false);
      setMobileOpen(false);
    },
    [onViewChange],
  );

  // Global Keyboard Shortcuts (Ctrl+K, Cmd+K, or '/')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setSearchOpen(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === '/' && !searchOpen) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
          e.preventDefault();
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 gap-3">
            {/* Left: Brand & Mobile Trigger */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                className="rounded-xl border border-slate-200 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-600 transition hover:bg-slate-100 md:hidden cursor-pointer"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-3">
                <img
                  src="/logo.png"
                  alt="ffstock logo"
                  className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="leading-tight">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold tracking-tight text-slate-900">ffstock</p>
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 shadow-2xs">
                      <CheckCircle2 className="h-3 w-3" /> Ledger Online
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-slate-500">Batch Inventory System</p>
                </div>
              </div>
            </div>

            {/* Center: Global Omni-Search Quick Bar */}
            <div className="flex-1 max-w-md mx-2 hidden sm:block">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3.5 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition shadow-2xs cursor-pointer group"
              >
                <div className="flex items-center gap-2 truncate">
                  <Search className="h-3.5 w-3.5 text-slate-400 group-hover:text-amber-600 transition" />
                  <span className="truncate">Search batches, items, invoices, suppliers...</span>
                </div>
                <kbd className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200 shadow-2xs">
                  Ctrl K
                </kbd>
              </button>
            </div>

            {/* Right: Navigation & Mobile Search Icon */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="sm:hidden rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 cursor-pointer"
                aria-label="Open Search"
              >
                <Search className="h-5 w-5" />
              </button>

              <nav className="hidden md:flex items-center gap-1.5 bg-slate-100/70 p-1.5 rounded-2xl border border-slate-200/60 shadow-2xs">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={classNames(
                        'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all duration-150 cursor-pointer',
                        active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </header>

        {/* Global Search Modal */}
        <GlobalSearchModal
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={handleSearchNavigate}
        />

        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-slate-900/60 sm:backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
            <nav className="absolute left-0 top-0 h-full w-72 max-w-[85%] bg-white p-5 shadow-2xl flex flex-col justify-between">
              <div>
                <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="logo" className="h-8 w-8 rounded-lg border border-slate-200" />
                    <span className="font-bold text-slate-900">ffstock</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = view === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className={classNames(
                          'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition cursor-pointer',
                          active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 text-xs text-slate-400 text-center">
                Database Ledger Integrity Protected
              </div>
            </nav>
          </div>
        )}

        <main className="mx-auto max-w-7xl w-full px-4 py-6 sm:px-6 sm:py-8 flex-1">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
          <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 sm:px-6">
            ffstock — Batch Inventory Ledger. Quantities calculated strictly from immutable ledger history.
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

