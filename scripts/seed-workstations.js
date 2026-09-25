#!/usr/bin/env node

/**
 * seed-workstations.js
 * Automated utility to provision or verify standard factory workstation accounts.
 *
 * Usage:
 *   node scripts/seed-workstations.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env manually to avoid external dotenv dependency
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: VITE_SUPABASE_URL or API key not found in environment or .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const hasAdminKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

const WORKSTATIONS = [
  { email: 'admin@ffstock.internal', password: 'Factory2026!', displayName: 'Plant General Manager', role: 'admin' },
  { email: 'inward@ffstock.internal', password: 'Factory2026!', displayName: 'Inward Supervisor', role: 'inward_manager' },
  { email: 'coloring.line1@ffstock.internal', password: 'Factory2026!', displayName: 'Coloring Specialist (Line 1)', role: 'coloring_operator' },
  { email: 'printing.line1@ffstock.internal', password: 'Factory2026!', displayName: 'Printing Specialist (Line 1)', role: 'printing_operator' },
  { email: 'filling.line1@ffstock.internal', password: 'Factory2026!', displayName: 'Filling Specialist (Line 1)', role: 'filling_operator' },
  { email: 'packaging.line1@ffstock.internal', password: 'Factory2026!', displayName: 'Packaging Specialist (Line 1)', role: 'packaging_operator' },
  { email: 'stock@ffstock.internal', password: 'Factory2026!', displayName: 'Inventory Controller', role: 'stock_manager' },
  { email: 'dispatch@ffstock.internal', password: 'Factory2026!', displayName: 'Logistics Officer', role: 'dispatch_manager' },
  { email: 'vendor@ffstock.internal', password: 'Factory2026!', displayName: 'Procurement Officer', role: 'vendor_manager' },
  { email: 'auditor@ffstock.internal', password: 'Factory2026!', displayName: 'Plant Quality Auditor', role: 'viewer' },
];

async function seed() {
  console.log(`Connecting to Supabase at: ${supabaseUrl}`);
  console.log(`Provisioning ${WORKSTATIONS.length} standard factory workstation accounts (${hasAdminKey ? 'Admin API' : 'Public SignUp'})...`);

  let successCount = 0;

  for (const st of WORKSTATIONS) {
    try {
      if (hasAdminKey && supabase.auth.admin) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: st.email,
          password: st.password,
          email_confirm: true,
          user_metadata: {
            display_name: st.displayName,
            role: st.role,
          },
        });

        if (error) {
          if (error.message.includes('already') || error.message.includes('exists')) {
            console.log(`  ✓ ${st.role.padEnd(20)}: ${st.email} (Already registered)`);
            successCount++;
          } else {
            console.warn(`  ! ${st.role.padEnd(20)}: ${st.email} - ${error.message}`);
          }
        } else if (data.user) {
          console.log(`  ✓ ${st.role.padEnd(20)}: ${st.email} (Created via Admin API)`);
          successCount++;
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: st.email,
          password: st.password,
          options: {
            data: {
              display_name: st.displayName,
              role: st.role,
            },
          },
        });

        if (error) {
          if (error.message.includes('already registered')) {
            console.log(`  ✓ ${st.role.padEnd(20)}: ${st.email} (Already registered)`);
            successCount++;
          } else {
            console.warn(`  ! ${st.role.padEnd(20)}: ${st.email} - ${error.message}`);
          }
        } else if (data.user) {
          console.log(`  ✓ ${st.role.padEnd(20)}: ${st.email} (Created)`);
          successCount++;
        }
      }
    } catch (err) {
      console.warn(`  x ${st.role.padEnd(20)}: ${st.email} - ${err.message}`);
    }
  }

  console.log(`\nFinished: ${successCount}/${WORKSTATIONS.length} accounts verified/provisioned.`);
}

seed();
