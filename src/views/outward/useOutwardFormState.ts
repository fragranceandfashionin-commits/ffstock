import { useState, useCallback } from 'react';
import { SCRAP_REASONS } from '@/lib/supabase';
import { getTodayDateString } from '@/lib/utils';
import type { VariantRow } from './types';

export function useOutwardFormState() {
  // Movement Form state
  const [moveQty, setMoveQty] = useState('');
  const [moveVariantName, setMoveVariantName] = useState('');
  const [moveColor, setMoveColor] = useState('');
  const [movePrintingDesign, setMovePrintingDesign] = useState('');
  const [capName, setCapName] = useState('');
  const [moveCapItemId, setMoveCapItemId] = useState('');
  const [atomizerName, setAtomizerName] = useState('');
  const [moveAtomizerItemId, setMoveAtomizerItemId] = useState('');
  const [moveBoxName, setMoveBoxName] = useState('');
  const [moveBoxItemId, setMoveBoxItemId] = useState('');
  const [moveRemarks, setMoveRemarks] = useState('');
  const [moveDoneBy, setMoveDoneBy] = useState('');
  const [splitScrapEnabled, setSplitScrapEnabled] = useState(false);
  const [splitScrapReason, setSplitScrapReason] = useState<string>(SCRAP_REASONS[0]);

  // Multi-variant split allocation
  const [moveMode, setMoveMode] = useState<'single' | 'multi-split'>('single');
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  // Scrap Form state
  const [scrapQty, setScrapQty] = useState('');
  const [scrapReason, setScrapReason] = useState<string>(SCRAP_REASONS[0]);

  // Dispatch Form state
  const [dispatchMode, setDispatchMode] = useState<'single' | 'multi-split'>('single');
  const [dispatchQty, setDispatchQty] = useState('');
  const [dispatchVariantName, setDispatchVariantName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [dispatchDate, setDispatchDate] = useState(getTodayDateString());
  const [dispatchColor, setDispatchColor] = useState('');
  const [dispatchPrintingDesign, setDispatchPrintingDesign] = useState('');
  const [dispatchCapName, setDispatchCapName] = useState('');
  const [dispatchAtomizerName, setDispatchAtomizerName] = useState('');
  const [dispatchBoxName, setDispatchBoxName] = useState('');
  const [dispatchProductSpecs, setDispatchProductSpecs] = useState('');

  // Multi-room batch allocation states
  const [moveAllocations, setMoveAllocations] = useState<Record<string, string>>({});
  const [dispatchAllocations, setDispatchAllocations] = useState<Record<string, string>>({});
  const [scrapAllocations, setScrapAllocations] = useState<Record<string, string>>({});

  const handleMoveAllocationChange = useCallback((batchId: string, val: string) => {
    setMoveAllocations((prev) => {
      const next = { ...prev, [batchId]: val };
      const total = Object.values(next).reduce((sum, v) => sum + (Number(v) || 0), 0);
      setMoveQty(total > 0 ? String(total) : '');
      return next;
    });
  }, []);

  const handleDispatchAllocationChange = useCallback((batchId: string, val: string) => {
    setDispatchAllocations((prev) => {
      const next = { ...prev, [batchId]: val };
      const total = Object.values(next).reduce((sum, v) => sum + (Number(v) || 0), 0);
      setDispatchQty(total > 0 ? String(total) : '');
      return next;
    });
  }, []);

  const handleScrapAllocationChange = useCallback((batchId: string, val: string) => {
    setScrapAllocations((prev) => {
      const next = { ...prev, [batchId]: val };
      const total = Object.values(next).reduce((sum, v) => sum + (Number(v) || 0), 0);
      setScrapQty(total > 0 ? String(total) : '');
      return next;
    });
  }, []);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setMoveQty('');
    setMoveAllocations({});
    setMoveVariantName('');
    setMoveColor('');
    setMovePrintingDesign('');
    setCapName('');
    setMoveCapItemId('');
    setAtomizerName('');
    setMoveAtomizerItemId('');
    setMoveBoxName('');
    setMoveBoxItemId('');
    setMoveRemarks('');
    setMoveDoneBy('');
    setSplitScrapEnabled(false);
    setSplitScrapReason(SCRAP_REASONS[0]);
    setScrapQty('');
    setScrapAllocations({});
    setScrapReason(SCRAP_REASONS[0]);
    setDispatchQty('');
    setDispatchAllocations({});
    setDispatchVariantName('');
    setCustomerName('');
    setInvoiceNo('');
    setDispatchDate(getTodayDateString());
    setDispatchColor('');
    setDispatchPrintingDesign('');
    setDispatchCapName('');
    setDispatchAtomizerName('');
    setDispatchBoxName('');
    setDispatchProductSpecs('');
    setVariantRows([]);
    setFormError(null);
  }, []);

  return {
    moveQty,
    setMoveQty,
    moveAllocations,
    setMoveAllocations,
    handleMoveAllocationChange,
    moveVariantName,
    setMoveVariantName,
    moveColor,
    setMoveColor,
    movePrintingDesign,
    setMovePrintingDesign,
    capName,
    setCapName,
    moveCapItemId,
    setMoveCapItemId,
    atomizerName,
    setAtomizerName,
    moveAtomizerItemId,
    setMoveAtomizerItemId,
    moveBoxName,
    setMoveBoxName,
    moveBoxItemId,
    setMoveBoxItemId,
    moveRemarks,
    setMoveRemarks,
    moveDoneBy,
    setMoveDoneBy,
    splitScrapEnabled,
    setSplitScrapEnabled,
    splitScrapReason,
    setSplitScrapReason,
    moveMode,
    setMoveMode,
    variantRows,
    setVariantRows,
    scrapQty,
    setScrapQty,
    scrapAllocations,
    setScrapAllocations,
    handleScrapAllocationChange,
    scrapReason,
    setScrapReason,
    dispatchMode,
    setDispatchMode,
    dispatchQty,
    setDispatchQty,
    dispatchAllocations,
    setDispatchAllocations,
    handleDispatchAllocationChange,
    dispatchVariantName,
    setDispatchVariantName,
    customerName,
    setCustomerName,
    invoiceNo,
    setInvoiceNo,
    dispatchDate,
    setDispatchDate,
    dispatchColor,
    setDispatchColor,
    dispatchPrintingDesign,
    setDispatchPrintingDesign,
    dispatchCapName,
    setDispatchCapName,
    dispatchAtomizerName,
    setDispatchAtomizerName,
    dispatchBoxName,
    setDispatchBoxName,
    dispatchProductSpecs,
    setDispatchProductSpecs,
    submitting,
    setSubmitting,
    formError,
    setFormError,
    resetForm,
  };
}
