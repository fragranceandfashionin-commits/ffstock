import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Read .env manually to avoid extra dependencies
function loadEnv() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL or Anon Key missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TABLES = [
  'stages',
  'suppliers',
  'items',
  'item_stock_receipts',
  'inward_batches',
  'stage_movements',
  'dispatches'
];

async function fetchAllRows(tableName) {
  const allRows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(from, to);

    if (error) {
      console.warn(`[WARN] Could not fetch table "${tableName}": ${error.message}`);
      return { success: false, error: error.message, rows: [] };
    }

    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return { success: true, rows: allRows };
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

function generateSqlInserts(tableName, rows) {
  if (!rows || rows.length === 0) return `-- No records for ${tableName}\n`;

  const columns = Object.keys(rows[0]);
  const colNames = columns.map(c => `"${c}"`).join(', ');

  const sqlStatements = [];
  sqlStatements.push(`-- Table: ${tableName} (${rows.length} rows)`);

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const valueRows = chunk.map(row => {
      const values = columns.map(col => escapeSqlValue(row[col])).join(', ');
      return `(${values})`;
    });

    sqlStatements.push(
      `INSERT INTO "${tableName}" (${colNames})\nVALUES\n  ${valueRows.join(',\n  ')}\nON CONFLICT DO NOTHING;\n`
    );
  }

  return sqlStatements.join('\n');
}

async function runBackup() {
  console.log(`Starting backup from Supabase: ${supabaseUrl}`);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  
  const backupDir = path.join(projectRoot, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData = {
    metadata: {
      timestamp: now.toISOString(),
      supabaseUrl,
      tableCounts: {}
    },
    tables: {}
  };

  let sqlDump = `-- Supabase Database Backup\n-- Date: ${now.toISOString()}\n-- Source: ${supabaseUrl}\n\n`;

  for (const table of TABLES) {
    process.stdout.write(`Fetching ${table}... `);
    const result = await fetchAllRows(table);
    if (result.success) {
      backupData.tables[table] = result.rows;
      backupData.metadata.tableCounts[table] = result.rows.length;
      sqlDump += generateSqlInserts(table, result.rows) + '\n';
      console.log(`✓ (${result.rows.length} rows)`);
    } else {
      console.log(`✗ skipped (${result.error})`);
    }
  }

  // Write JSON backup
  const jsonPath = path.join(backupDir, `backup_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2), 'utf8');

  // Write SQL backup
  const sqlPath = path.join(backupDir, `backup_${timestamp}.sql`);
  fs.writeFileSync(sqlPath, sqlDump, 'utf8');

  console.log('\n========================================');
  console.log('✅ Backup completed successfully!');
  console.log(`📄 JSON Backup: ${jsonPath}`);
  console.log(`📄 SQL Backup:  ${sqlPath}`);
  console.log('========================================');
  console.log('Table Summary:');
  for (const [tbl, count] of Object.entries(backupData.metadata.tableCounts)) {
    console.log(`  - ${tbl}: ${count} rows`);
  }
}

runBackup().catch(err => {
  console.error('Fatal backup error:', err);
  process.exit(1);
});
