import { useState, useCallback } from 'react';
import type { DashboardTab, KpiFilter } from './types';

export function useDashboardFilters() {
  const [asOfDate, setAsOfDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<DashboardTab>('batch-matrix');
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('ALL');
  const [selectedColor, setSelectedColor] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStageId, setSelectedStageId] = useState<string | 'ALL'>('ALL');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | 'ALL'>('ALL');
  const [selectedItemId, setSelectedItemId] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [expandedComponentIds, setExpandedComponentIds] = useState<Set<string>>(new Set());

  const resetFilters = useCallback(() => {
    setKpiFilter('ALL');
    setSelectedColor('ALL');
    setSelectedCategory('ALL');
    setSelectedStageId('ALL');
    setSelectedSupplierId('ALL');
    setSelectedItemId('ALL');
    setSearchQuery('');
  }, []);

  return {
    asOfDate,
    setAsOfDate,
    activeTab,
    setActiveTab,
    kpiFilter,
    setKpiFilter,
    selectedColor,
    setSelectedColor,
    selectedCategory,
    setSelectedCategory,
    selectedStageId,
    setSelectedStageId,
    selectedSupplierId,
    setSelectedSupplierId,
    selectedItemId,
    setSelectedItemId,
    searchQuery,
    setSearchQuery,
    expandedBatchIds,
    setExpandedBatchIds,
    expandedComponentIds,
    setExpandedComponentIds,
    resetFilters,
  };
}
