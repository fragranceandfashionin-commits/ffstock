import { ShieldAlert, ArrowLeft, UserCheck, Lock } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { View } from '@/lib/types';

export type AccessDeniedViewProps = {
  targetView: View;
  onViewChange: (view: View) => void;
  onOpenLogin?: () => void;
};

const VIEW_NAMES: Record<View, string> = {
  dashboard: 'Factory Dashboard',
  orders: 'Production Orders & BOM Tracking',
  'vendor-pending': 'Vendor Pending Procurement',
  clients: 'Clients Directory & CRM',
  items: 'Items Catalogue & Stock Ledger',
  suppliers: 'Suppliers & Vendor Registry',
  outward: 'Outward Pipeline & Movements',
  'order-history': 'Historical Orders & Dispatches',
};

export function AccessDeniedView({ targetView, onViewChange, onOpenLogin }: AccessDeniedViewProps) {
  const { role, roleDefinition, profile } = useAuth();
  const viewTitle = VIEW_NAMES[targetView] || targetView;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card className="p-8 text-center bg-white border border-rose-200 shadow-xl rounded-3xl relative overflow-hidden">
        {/* Top Warning Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mb-5 shadow-xs">
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
          Access Restricted
        </h2>
        <p className="text-sm font-semibold text-rose-600 mt-1">
          Workstation Authorization Required
        </p>

        <p className="text-xs text-slate-600 max-w-md mx-auto mt-3 leading-relaxed">
          Your current workstation clearance does not permit access to the{' '}
          <strong className="text-slate-900 font-bold">{viewTitle}</strong> module.
          Operational access is partitioned by manufacturing station to maintain data integrity and compliance.
        </p>

        {/* Current Operator Profile Card */}
        <div className="my-6 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-left max-w-md mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Active Station
            </span>
            <p className="text-sm font-black text-slate-900 truncate">
              {roleDefinition.label}
            </p>
            <p className="text-xs text-slate-500 font-medium truncate">
              {roleDefinition.department} {profile?.display_name ? `• ${profile.display_name}` : ''}
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-xl text-xs font-black border ${roleDefinition.color} shrink-0`}>
            {role.toUpperCase()}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            onClick={() => onViewChange('dashboard')}
            className="w-full sm:w-auto font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer px-5"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Return to Dashboard
          </Button>

          {onOpenLogin && (
            <Button
              variant="outline"
              onClick={onOpenLogin}
              className="w-full sm:w-auto font-bold border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer px-4"
            >
              <UserCheck className="h-4 w-4 mr-1.5 text-indigo-600" />
              Switch Station / Sign In
            </Button>
          )}
        </div>

        <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
          <Lock className="h-3 w-3" />
          Production-grade RBAC security boundary active
        </div>
      </Card>
    </div>
  );
}
