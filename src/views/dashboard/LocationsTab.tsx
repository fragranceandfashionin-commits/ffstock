import { MapPin, Building2 } from 'lucide-react';
import { Card } from '@/components/ui';
import type { LocationStock } from '@/lib/types';
import type { BatchWithRelations } from '@/lib/supabase';
import { formatNumber } from '@/lib/utils';

export type LocationsTabProps = {
  locations: LocationStock[];
  batches: BatchWithRelations[];
};

export function LocationsTab({
  locations,
  batches,
}: LocationsTabProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Storage Locations */}
      <Card className="shadow-2xs border-slate-200/90">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
          <MapPin className="h-5 w-5 text-slate-500" />
          Warehouse Storage Racks & Live Unit Load
        </h3>
        {locations.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No location stock recorded.</p>
        ) : (
          <div className="space-y-3">
            {locations.map((loc) => {
              return (
                <div
                  key={loc.location}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{loc.location}</p>
                      <p className="text-xs text-slate-500">Active Storage Bay</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-slate-900">
                        {formatNumber(loc.qty)} <span className="text-xs font-normal text-slate-500">units</span>
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600">On-floor balance</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Supplier Breakdown */}
      <Card className="shadow-2xs border-slate-200/90">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-4">
          <Building2 className="h-5 w-5 text-slate-500" />
          Supplier Inward Contributions
        </h3>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No supplier inward data.</p>
        ) : (
          <div className="space-y-3">
            {Array.from(
              batches.reduce((acc, b) => {
                const name = b.supplier?.name ?? 'Unknown Supplier';
                const cur = acc.get(name) ?? { batches: 0, received: 0 };
                cur.batches += 1;
                cur.received += b.qty_received;
                acc.set(name, cur);
                return acc;
              }, new Map<string, { batches: number; received: number }>())
            ).map(([name, data]) => {
              return (
                <div
                  key={name}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{name}</p>
                      <p className="text-xs text-slate-500">{data.batches} inward batches</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-indigo-700">
                        {formatNumber(data.received)} <span className="text-xs font-normal text-slate-500">units</span>
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600">Total received</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
