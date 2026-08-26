import { Printer } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { Dispatch, BatchWithRelations } from '@/lib/supabase';
import { formatNumber, formatDate } from '@/lib/utils';

export type DeliveryChallanModalProps = {
  isOpen: boolean;
  onClose: () => void;
  dispatch: Dispatch | null;
  batch?: BatchWithRelations | null;
  companyName?: string;
  facilitySubtitle?: string;
};

export function DeliveryChallanModal({
  isOpen,
  onClose,
  dispatch,
  batch,
  companyName = 'FRAGRANCE & FASHION MFG',
  facilitySubtitle = 'Batch Ledger & Packaging Facility • Factory Dispatch Division',
}: DeliveryChallanModalProps) {
  if (!isOpen || !dispatch) return null;

  const handlePrint = () => {
    window.print();
  };

  const unitLabel = batch?.item?.unit || 'units';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🚚 Official Delivery Challan & Gate Pass"
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div id="printable-delivery-challan" className="p-6 bg-white border border-slate-300 rounded-2xl space-y-6 text-slate-900 shadow-xs">
          {/* Header */}
          <div className="border-b border-slate-300 pb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Logo"
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-0.5"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <div>
                <h2 className="text-xl font-black tracking-tight text-slate-900">{companyName}</h2>
                <p className="text-xs text-slate-500 font-medium">{facilitySubtitle}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-black tracking-wider uppercase">
                Delivery Challan
              </span>
              <p className="text-xs text-slate-600 font-bold mt-1">Invoice: {dispatch.invoice_no}</p>
            </div>
          </div>

          {/* Consignee & Shipment Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Consignee / Customer Details</p>
              <p className="text-base font-black text-slate-900 mt-1">{dispatch.customer_name}</p>
              <p className="text-slate-600 mt-0.5">Verified Outward Delivery</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Dispatch Date:</span>
                <span className="font-bold">{formatDate(dispatch.dispatched_on)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Origin Batch:</span>
                <span className="font-bold text-indigo-700">{batch?.batch_no || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Vendor Origin:</span>
                <span className="font-bold">{batch?.supplier?.name ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Product Specification Table */}
          <div className="overflow-hidden border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 font-bold uppercase tracking-wider text-slate-700">
                <tr>
                  <th className="p-2.5">Item Description</th>
                  <th className="p-2.5">Finish & Artwork</th>
                  <th className="p-2.5">Components & Packaging Assembly</th>
                  <th className="p-2.5 text-right font-black">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-2.5 font-bold text-slate-900">
                    <div>{batch?.item?.name ?? 'Product'}</div>
                    {dispatch.variant_name && (
                      <div className="inline-flex items-center gap-1 text-[11px] font-black text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded mt-1">
                        🏷️ Variant: {dispatch.variant_name}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    <div className="space-y-0.5">
                      <div>Color: <strong>{dispatch.color || batch?.color || 'Standard'}</strong></div>
                      {dispatch.printing_design && (
                        <div className="text-[11px] text-indigo-700 font-bold">
                          🖨️ Print: {dispatch.printing_design}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-2.5 text-slate-600">
                    <div className="space-y-0.5">
                      {dispatch.cap_name && <div>• Cap: <strong>{dispatch.cap_name}</strong></div>}
                      {dispatch.atomizer_name && <div>• Pump: <strong>{dispatch.atomizer_name}</strong></div>}
                      {dispatch.box_name && <div>• Box: <strong>{dispatch.box_name}</strong></div>}
                      {!dispatch.cap_name && !dispatch.atomizer_name && !dispatch.box_name && (
                        <span>Standard Assembly</span>
                      )}
                      {dispatch.product_specs && <div className="text-[10px] text-slate-500 italic">Specs: {dispatch.product_specs}</div>}
                    </div>
                  </td>
                  <td className="p-2.5 text-right font-black text-base text-slate-900">
                    {formatNumber(dispatch.qty)} <span className="text-xs font-normal text-slate-500">{unitLabel}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs text-slate-500">
            <div className="border-t border-slate-300 pt-2">
              <p className="font-semibold text-slate-800">Prepared By</p>
              <p className="text-[10px]">Warehouse Dispatch</p>
            </div>
            <div className="border-t border-slate-300 pt-2">
              <p className="font-semibold text-slate-800">Security Gate Officer</p>
              <p className="text-[10px]">Outward Verification</p>
            </div>
            <div className="border-t border-slate-300 pt-2">
              <p className="font-semibold text-slate-800">Receiver's Signature</p>
              <p className="text-[10px]">Customer / Transporter</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 no-print">
          <Button variant="outline" type="button" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handlePrint}
            className="bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20"
          >
            <Printer className="h-4 w-4" /> Print Delivery Challan / Gate Pass
          </Button>
        </div>
      </div>
    </Modal>
  );
}
