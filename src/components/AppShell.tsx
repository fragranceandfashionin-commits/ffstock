import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  LayoutDashboard,
  Send,
  Boxes,
  Tag,
  Menu,
  X,
  CheckCircle2,
  Search,
  ClipboardList,
  Clock,
  Users,
  History,
  MoreHorizontal,
  UserCheck,
  LogIn,
} from 'lucide-react';
import type { View } from '@/lib/types';
import { classNames } from '@/lib/utils';
import { ToastProvider } from '@/components/Toast';
import { Button } from '@/components/ui';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';
import { LoginView } from '@/views/LoginView';
import { useAuth } from '@/lib/auth';
import type { BatchWithRelations, Dispatch } from '@/lib/supabase';

type NavItem = { id: View; label: string; icon: typeof LayoutDashboard; shortLabel?: string };

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortLabel: 'Dash' },
  { id: 'orders', label: 'Orders', icon: ClipboardList, shortLabel: 'Orders' },
  { id: 'vendor-pending', label: 'Vendor Pending', icon: Clock, shortLabel: 'Pending' },
  { id: 'clients', label: 'Clients', icon: Users, shortLabel: 'Clients' },
  { id: 'items', label: 'Items & Stock', icon: Tag, shortLabel: 'Items' },
  { id: 'suppliers', label: 'Suppliers', icon: Boxes, shortLabel: 'Suppliers' },
  { id: 'outward', label: 'Outward', icon: Send, shortLabel: 'Outward' },
  { id: 'order-history', label: 'History', icon: History, shortLabel: 'History' },
];

export type NavigationContext = {
  batchId?: string;
  itemId?: string;
  supplierId?: string;
  invoiceNo?: string;
  movementId?: string;
  inspectBatch?: BatchWithRelations;
  openChallan?: Dispatch;
  openInwardModal?: boolean;
  activeTab?: 'catalogue' | 'batches';
  orderId?: string;
  clientId?: string;
};

type AppShellProps = {
  view: View;
  onViewChange: (view: View, context?: NavigationContext) => void;
  children: ReactNode;
};

export function AppShell({ view, onViewChange, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { roleDefinition, canAccessView, isAuthenticated, profile } = useAuth();

  const visibleNavItems = useMemo(
    () => ALL_NAV_ITEMS.filter((item) => canAccessView(item.id)),
    [canAccessView]
  );

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

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col antialiased">
        {!isOnline && (
          <div className="bg-amber-600 text-white text-xs font-bold px-4 py-2 text-center sticky top-0 z-50 shadow-md">
            ⚠️ Factory Workstation Offline. Network disconnected. Please reconnect before logging movements.
          </div>
        )}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-3 sm:px-6 gap-2 sm:gap-3">
            {/* Left: Brand & Mobile Menu Button */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileOpen((open) => !open)}
                className="rounded-xl border border-slate-200 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-600 transition hover:bg-slate-100 lg:hidden cursor-pointer"
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="ffstock logo"
                  className="h-9 w-9 shrink-0 rounded-xl border border-slate-200 bg-white object-contain shadow-2xs"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="leading-tight">
                  <div className="flex items-center gap-1.5">
                    <p className="text-base font-bold tracking-tight text-slate-900">ffstock</p>
                    <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200 shadow-2xs">
                      <CheckCircle2 className="h-3 w-3" /> Live Ledger
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 hidden sm:block">
                    Factory Inventory &amp; Production Portal
                  </p>
                </div>
              </div>
            </div>

            {/* Center: Global Omni-Search Quick Bar (compact width to avoid overflow) */}
            <div className="w-36 lg:w-44 xl:w-60 hidden md:block shrink-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-1.5 text-xs font-medium text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 transition shadow-2xs cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Search className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 transition" />
                  <span className="truncate">Search...</span>
                </div>
                <kbd className="inline-flex items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-200 shadow-2xs">
                  Ctrl K
                </kbd>
              </button>
            </div>

            {/* Right: Desktop Navigation Tabs & Mobile Search Icon */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Workstation Shift / Role Badge */}
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition shadow-2xs cursor-pointer ${roleDefinition.color}`}
                  title={`Active Station: ${roleDefinition.label} (${roleDefinition.department})${profile?.display_name ? ` • ${profile.display_name}` : ''}. Click to manage shift.`}
                >
                  <UserCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate max-w-[120px] xl:max-w-[150px]">
                    {profile?.display_name || roleDefinition.label}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  title="Sign In to Factory Workstation"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Station Sign In</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="md:hidden rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Open Search"
              >
                <Search className="h-5 w-5" />
              </button>

              {/* Desktop Tabs (Compact, fits seamlessly without wrapping) */}
              <nav className="hidden lg:flex items-center gap-0.5 xl:gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/70 shadow-2xs">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={classNames(
                        'flex items-center gap-1.5 rounded-xl px-2 xl:px-2.5 py-1.5 text-xs font-bold transition-all duration-150 cursor-pointer whitespace-nowrap',
                        active
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80',
                      )}
                      title={item.label}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden xl:inline">{item.label}</span>
                      <span className="xl:hidden">{item.shortLabel || item.label}</span>
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

        {/* Mobile Slide-out Drawer (Categorized into Production & CRM vs Factory & Inventory) */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setMobileOpen(false)}
            />
            <nav className="absolute left-0 top-0 h-full w-80 max-w-[85%] bg-white p-5 shadow-2xl flex flex-col justify-between overflow-y-auto overscroll-contain">
              <div className="flex-1">
                <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png" alt="logo" className="h-8 w-8 rounded-lg border border-slate-200" />
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">ffstock</span>
                      <span className="text-[10px] text-slate-400">Factory Portal</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="rounded-xl min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Station Switcher Banner */}
                <div className="mb-4 p-3 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      {isAuthenticated ? 'Active Workstation' : 'Workstation Status'}
                    </span>
                    <p className="text-xs font-black text-slate-900 truncate">
                      {isAuthenticated ? (profile?.display_name || roleDefinition.label) : 'Not Authenticated'}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {isAuthenticated ? roleDefinition.department : 'Sign in to access workstation'}
                    </p>
                  </div>
                  <Button
                    variant={isAuthenticated ? 'outline' : 'primary'}
                    size="sm"
                    onClick={() => {
                      setLoginOpen(true);
                      setMobileOpen(false);
                    }}
                    className={`text-xs font-bold shrink-0 cursor-pointer ${!isAuthenticated ? 'bg-indigo-600 text-white' : ''}`}
                  >
                    {isAuthenticated ? 'Shift Handover' : 'Sign In'}
                  </Button>
                </div>

                {/* Authorized Module Navigation */}
                <div className="mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 block mb-1.5">
                    Authorized Factory Modules
                  </span>
                  <div className="space-y-1">
                    {visibleNavItems.map((item) => {
                      const Icon = item.icon;
                      const active = view === item.id;
                      return (
                        <button
                          key={`drawer-item-${item.id}`}
                          type="button"
                          onClick={() => handleSelect(item.id)}
                          className={classNames(
                            'w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition cursor-pointer',
                            active ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 text-[11px] text-slate-400 text-center shrink-0">
                Shared Factory Terminal &bull; {roleDefinition.label}
              </div>
            </nav>
          </div>
        )}

        {/* Main View Container */}
        <main className="mx-auto max-w-7xl w-full px-3 py-4 sm:px-6 sm:py-6 pb-24 lg:pb-8 flex-1">
          {children}
        </main>

        {/* Mobile & Tablet Bottom Bar (Gated Authorized Tabs + More Trigger) */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-slate-200/90 bg-white/95 backdrop-blur-md shadow-lg safe-area-inset-bottom">
          <div className="flex items-center justify-around px-2 py-1.5 max-w-lg mx-auto">
            {visibleNavItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={`bottom-nav-${item.id}`}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={classNames(
                    'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer min-w-0',
                    active ? 'text-slate-950 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium',
                  )}
                >
                  <div
                    className={classNames(
                      'flex items-center justify-center h-7 w-7 rounded-lg transition-all',
                      active ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-500',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-[10px] mt-0.5 truncate max-w-full leading-tight">
                    {item.shortLabel || item.label}
                  </span>
                </button>
              );
            })}

            {/* "More" Menu Trigger */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className={classNames(
                'flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all cursor-pointer min-w-0',
                mobileOpen ? 'text-slate-950 font-extrabold' : 'text-slate-500 hover:text-slate-800 font-medium',
              )}
            >
              <div className="flex items-center justify-center h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100">
                <MoreHorizontal className="h-4 w-4" />
              </div>
              <span className="text-[10px] mt-0.5 truncate max-w-full leading-tight">
                More
              </span>
            </button>
          </div>
        </nav>

        <footer className="border-t border-slate-200 bg-white py-4 mt-auto hidden lg:block">
          <div className="mx-auto max-w-7xl px-4 text-center text-xs text-slate-500 sm:px-6">
            ffstock &bull; Fragrance &amp; Fashion Integrated Factory Ledger &amp; Vendor Production Portal
          </div>
        </footer>

        {/* Workstation & Shift Login Modal */}
        <LoginView
          isOpen={loginOpen}
          onClose={() => setLoginOpen(false)}
        />
      </div>
    </ToastProvider>
  );
}
