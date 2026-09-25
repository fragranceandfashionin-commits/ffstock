import { describe, it, expect } from 'vitest';
import { isOperatorTransitionAllowed, canAccessView, canPerformAction } from '../auth';
import type { UserRole, AuthAction } from '../types/auth';
import type { View } from '../types';

describe('auth.tsx RBAC rules', () => {
  describe('isOperatorTransitionAllowed', () => {
    it('allows admin to perform any stage transition', () => {
      expect(isOperatorTransitionAllowed('admin', 1, 2)).toBe(true);
      expect(isOperatorTransitionAllowed('admin', 3, 5)).toBe(true);
      expect(isOperatorTransitionAllowed('admin', 6, 1)).toBe(true);
    });

    it('enforces coloring operator boundary rules', () => {
      // Allowed: Raw(1)->Coloring(2), Coloring(2)->Printing(3), Coloring(2)->Filling(4), Coloring(2)->Scrap(8), Coloring(2)->Raw(1)
      expect(isOperatorTransitionAllowed('coloring_operator', 1, 2)).toBe(true);
      expect(isOperatorTransitionAllowed('coloring_operator', 2, 3)).toBe(true);
      expect(isOperatorTransitionAllowed('coloring_operator', 2, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('coloring_operator', 2, 8)).toBe(true);
      expect(isOperatorTransitionAllowed('coloring_operator', 2, 1)).toBe(true);

      // Disallowed: Printing(3)->Filling(4)
      expect(isOperatorTransitionAllowed('coloring_operator', 3, 4)).toBe(false);
      // Disallowed: Filling(4)->Packaging(5)
      expect(isOperatorTransitionAllowed('coloring_operator', 4, 5)).toBe(false);
    });

    it('enforces printing operator boundary rules', () => {
      // Allowed: Pull Raw(1)->Printing(3), Pull Coloring(2)->Printing(3), Printing(3)->Filling(4), Printing(3)->Scrap(8), Printing(3)->Coloring(2), Printing(3)->Raw(1)
      expect(isOperatorTransitionAllowed('printing_operator', 1, 3)).toBe(true);
      expect(isOperatorTransitionAllowed('printing_operator', 2, 3)).toBe(true);
      expect(isOperatorTransitionAllowed('printing_operator', 3, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('printing_operator', 3, 8)).toBe(true);
      expect(isOperatorTransitionAllowed('printing_operator', 3, 2)).toBe(true);
      expect(isOperatorTransitionAllowed('printing_operator', 3, 1)).toBe(true);

      // Disallowed: Raw(1)->Coloring(2)
      expect(isOperatorTransitionAllowed('printing_operator', 1, 2)).toBe(false);
      // Disallowed: Filling(4)->Packaging(5)
      expect(isOperatorTransitionAllowed('printing_operator', 4, 5)).toBe(false);
    });

    it('enforces filling operator boundary rules', () => {
      // Allowed: Pull Raw(1)->Filling(4), Pull Coloring(2)->Filling(4), Pull Printing(3)->Filling(4), Filling(4)->Packaging(5), Filling(4)->Scrap(8), Filling(4)->Reversals(1,2,3)
      expect(isOperatorTransitionAllowed('filling_operator', 1, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 2, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 3, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 4, 5)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 4, 8)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 4, 3)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 4, 2)).toBe(true);
      expect(isOperatorTransitionAllowed('filling_operator', 4, 1)).toBe(true);

      // Disallowed: Raw(1)->Coloring(2)
      expect(isOperatorTransitionAllowed('filling_operator', 1, 2)).toBe(false);
    });

    it('enforces packaging operator boundary rules', () => {
      // Allowed: Filling(4)->Packaging(5), Packaging(5)->Ready(6), Packaging(5)->Scrap(8), Packaging(5)->Filling(4) [Reversal]
      expect(isOperatorTransitionAllowed('packaging_operator', 4, 5)).toBe(true);
      expect(isOperatorTransitionAllowed('packaging_operator', 5, 6)).toBe(true);
      expect(isOperatorTransitionAllowed('packaging_operator', 5, 8)).toBe(true);
      expect(isOperatorTransitionAllowed('packaging_operator', 5, 4)).toBe(true);

      // Disallowed: Raw(1)->Coloring(2)
      expect(isOperatorTransitionAllowed('packaging_operator', 1, 2)).toBe(false);
    });

    it('allows stock_manager to perform any stage transition', () => {
      expect(isOperatorTransitionAllowed('stock_manager', 1, 2)).toBe(true);
      expect(isOperatorTransitionAllowed('stock_manager', 1, 3)).toBe(true);
      expect(isOperatorTransitionAllowed('stock_manager', 2, 4)).toBe(true);
      expect(isOperatorTransitionAllowed('stock_manager', 3, 5)).toBe(true);
      expect(isOperatorTransitionAllowed('stock_manager', 6, 1)).toBe(true);
      expect(isOperatorTransitionAllowed('stock_manager', 4, 8)).toBe(true);
    });

    it('returns false for viewer or inward_manager', () => {
      expect(isOperatorTransitionAllowed('viewer', 1, 2)).toBe(false);
      expect(isOperatorTransitionAllowed('inward_manager', 1, 2)).toBe(false);
    });
  });

  describe('canAccessView', () => {
    const allViews: View[] = [
      'dashboard',
      'orders',
      'vendor-pending',
      'clients',
      'items',
      'suppliers',
      'outward',
      'order-history',
    ];

    it('allows admin and viewer to access all views', () => {
      allViews.forEach((view) => {
        expect(canAccessView('admin', view)).toBe(true);
        expect(canAccessView('viewer', view)).toBe(true);
      });
    });

    it('restricts inward_manager to dashboard, items, suppliers', () => {
      expect(canAccessView('inward_manager', 'dashboard')).toBe(true);
      expect(canAccessView('inward_manager', 'items')).toBe(true);
      expect(canAccessView('inward_manager', 'suppliers')).toBe(true);
      expect(canAccessView('inward_manager', 'outward')).toBe(false);
      expect(canAccessView('inward_manager', 'orders')).toBe(false);
    });

    it('restricts line operators to dashboard and outward only', () => {
      const operators: UserRole[] = [
        'coloring_operator',
        'printing_operator',
        'filling_operator',
        'packaging_operator',
      ];
      operators.forEach((op) => {
        expect(canAccessView(op, 'dashboard')).toBe(true);
        expect(canAccessView(op, 'outward')).toBe(true);
        expect(canAccessView(op, 'orders')).toBe(false);
        expect(canAccessView(op, 'items')).toBe(false);
        expect(canAccessView(op, 'suppliers')).toBe(false);
      });
    });

    it('allows stock_manager access to items, outward, order-history, and dashboard', () => {
      expect(canAccessView('stock_manager', 'dashboard')).toBe(true);
      expect(canAccessView('stock_manager', 'items')).toBe(true);
      expect(canAccessView('stock_manager', 'outward')).toBe(true);
      expect(canAccessView('stock_manager', 'order-history')).toBe(true);
      expect(canAccessView('stock_manager', 'orders')).toBe(false);
    });

    it('allows dispatch_manager access to outward, orders, order-history, and dashboard', () => {
      expect(canAccessView('dispatch_manager', 'dashboard')).toBe(true);
      expect(canAccessView('dispatch_manager', 'outward')).toBe(true);
      expect(canAccessView('dispatch_manager', 'orders')).toBe(true);
      expect(canAccessView('dispatch_manager', 'order-history')).toBe(true);
      expect(canAccessView('dispatch_manager', 'items')).toBe(false);
    });

    it('allows vendor_manager access to procurement and crm views', () => {
      expect(canAccessView('vendor_manager', 'dashboard')).toBe(true);
      expect(canAccessView('vendor_manager', 'orders')).toBe(true);
      expect(canAccessView('vendor_manager', 'vendor-pending')).toBe(true);
      expect(canAccessView('vendor_manager', 'suppliers')).toBe(true);
      expect(canAccessView('vendor_manager', 'clients')).toBe(true);
      expect(canAccessView('vendor_manager', 'order-history')).toBe(true);
      expect(canAccessView('vendor_manager', 'items')).toBe(false);
      expect(canAccessView('vendor_manager', 'outward')).toBe(false);
    });
  });

  describe('canPerformAction', () => {
    const allActions: AuthAction[] = [
      'inward',
      'stage_move',
      'dispatch',
      'manage_orders',
      'manage_items',
      'manage_suppliers',
      'manage_clients',
      'reverse_allocation',
    ];

    it('allows admin to perform all actions without restriction', () => {
      allActions.forEach((action) => {
        expect(canPerformAction('admin', action)).toBe(true);
      });
    });

    it('denies viewer all mutation actions (read-only audit)', () => {
      allActions.forEach((action) => {
        expect(canPerformAction('viewer', action)).toBe(false);
      });
    });

    it('authorizes inward_manager only for inward and managing suppliers', () => {
      expect(canPerformAction('inward_manager', 'inward')).toBe(true);
      expect(canPerformAction('inward_manager', 'manage_suppliers')).toBe(true);
      expect(canPerformAction('inward_manager', 'stage_move')).toBe(false);
      expect(canPerformAction('inward_manager', 'dispatch')).toBe(false);
      expect(canPerformAction('inward_manager', 'manage_orders')).toBe(false);
      expect(canPerformAction('inward_manager', 'manage_items')).toBe(false);
      expect(canPerformAction('inward_manager', 'manage_clients')).toBe(false);
      expect(canPerformAction('inward_manager', 'reverse_allocation')).toBe(false);
    });

    it('authorizes line operators only for stage movements', () => {
      const lineOperators: UserRole[] = [
        'coloring_operator',
        'printing_operator',
        'filling_operator',
        'packaging_operator',
      ];
      lineOperators.forEach((op) => {
        expect(canPerformAction(op, 'stage_move')).toBe(true);
        expect(canPerformAction(op, 'inward')).toBe(false);
        expect(canPerformAction(op, 'dispatch')).toBe(false);
        expect(canPerformAction(op, 'manage_orders')).toBe(false);
        expect(canPerformAction(op, 'manage_items')).toBe(false);
        expect(canPerformAction(op, 'reverse_allocation')).toBe(false);
      });
    });

    it('authorizes dispatch_manager only for customer dispatches', () => {
      expect(canPerformAction('dispatch_manager', 'dispatch')).toBe(true);
      expect(canPerformAction('dispatch_manager', 'inward')).toBe(false);
      expect(canPerformAction('dispatch_manager', 'stage_move')).toBe(false);
      expect(canPerformAction('dispatch_manager', 'manage_orders')).toBe(false);
      expect(canPerformAction('dispatch_manager', 'manage_items')).toBe(false);
    });

    it('authorizes stock_manager for item catalogue, stage movements, and reverse allocations', () => {
      expect(canPerformAction('stock_manager', 'manage_items')).toBe(true);
      expect(canPerformAction('stock_manager', 'reverse_allocation')).toBe(true);
      expect(canPerformAction('stock_manager', 'stage_move')).toBe(true);
      expect(canPerformAction('stock_manager', 'inward')).toBe(false);
      expect(canPerformAction('stock_manager', 'dispatch')).toBe(false);
      expect(canPerformAction('stock_manager', 'manage_orders')).toBe(false);
    });

    it('authorizes vendor_manager for orders, suppliers, and clients', () => {
      expect(canPerformAction('vendor_manager', 'manage_orders')).toBe(true);
      expect(canPerformAction('vendor_manager', 'manage_suppliers')).toBe(true);
      expect(canPerformAction('vendor_manager', 'manage_clients')).toBe(true);
      expect(canPerformAction('vendor_manager', 'inward')).toBe(false);
      expect(canPerformAction('vendor_manager', 'stage_move')).toBe(false);
      expect(canPerformAction('vendor_manager', 'dispatch')).toBe(false);
      expect(canPerformAction('vendor_manager', 'reverse_allocation')).toBe(false);
    });
  });
});
