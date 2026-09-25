export type UserRole =
  | 'admin'
  | 'inward_manager'
  | 'coloring_operator'
  | 'printing_operator'
  | 'filling_operator'
  | 'packaging_operator'
  | 'stock_manager'
  | 'dispatch_manager'
  | 'vendor_manager'
  | 'viewer';

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

export const ROLE_DEFINITIONS: Record<
  UserRole,
  { label: string; name: string; department: string; color: string; description: string }
> = {
  admin: {
    label: 'Plant General Manager',
    name: 'Plant General Manager',
    department: 'Executive Operations',
    color: 'bg-purple-100 text-purple-900 border-purple-300',
    description: 'Full supervisory authority across all factory modules and configurations.',
  },
  inward_manager: {
    label: 'Inward Supervisor',
    name: 'Inward Supervisor',
    department: 'Receiving Warehouse',
    color: 'bg-blue-100 text-blue-900 border-blue-300',
    description: 'Log inward batches, component intake receipts, and supplier deliveries.',
  },
  coloring_operator: {
    label: 'Coloring Specialist',
    name: 'Coloring Specialist',
    department: 'Coating & Coloring Line',
    color: 'bg-amber-100 text-amber-900 border-amber-300',
    description: 'Transition batches from Raw Stock to Coloring and onward to Printing.',
  },
  printing_operator: {
    label: 'Printing Specialist',
    name: 'Printing Specialist',
    department: 'Silk-Screen & Foil Line',
    color: 'bg-violet-100 text-violet-900 border-violet-300',
    description: 'Transition batches from Printing to Filling assembly line.',
  },
  filling_operator: {
    label: 'Filling Specialist',
    name: 'Filling Specialist',
    department: 'Filling & Assembly Line',
    color: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    description: 'Assemble fragrances, attach caps, atomizers, and advance to Packaging.',
  },
  packaging_operator: {
    label: 'Packaging Specialist',
    name: 'Packaging Specialist',
    department: 'Final Packaging Line',
    color: 'bg-pink-100 text-pink-900 border-pink-300',
    description: 'Enclose in secondary cartons/boxes and advance batches to Ready stage.',
  },
  stock_manager: {
    label: 'Inventory Controller',
    name: 'Inventory Controller',
    department: 'Warehouse & Inventory',
    color: 'bg-teal-100 text-teal-900 border-teal-300',
    description: 'Manage items catalogue, execute stock allocations, and audit stock levels.',
  },
  dispatch_manager: {
    label: 'Logistics Officer',
    name: 'Logistics Officer',
    department: 'Dispatch & Logistics',
    color: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    description: 'Dispatch finished products from Ready stage to customers and print delivery challans.',
  },
  vendor_manager: {
    label: 'Procurement Officer',
    name: 'Procurement Officer',
    department: 'Procurement & Vendor Ops',
    color: 'bg-orange-100 text-orange-900 border-orange-300',
    description: 'Manage production orders, expedite pending vendor BOM allocations, and manage suppliers.',
  },
  viewer: {
    label: 'Plant Auditor',
    name: 'Plant Auditor',
    department: 'Quality & Audit',
    color: 'bg-slate-100 text-slate-800 border-slate-300',
    description: 'Read-only access to dashboards, production pipelines, order history, and audit trails.',
  },
};

export type AuthAction =
  | 'inward'
  | 'stage_move'
  | 'dispatch'
  | 'manage_orders'
  | 'manage_items'
  | 'manage_suppliers'
  | 'manage_clients'
  | 'reverse_allocation';

