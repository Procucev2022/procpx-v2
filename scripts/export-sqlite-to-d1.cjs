#!/usr/bin/env node
// Exports the local SQLite database (prisma/dev.db) as an INSERT-only SQL file
// for Cloudflare D1. Schema comes from migrations/; this file carries data only.
//
// DateTime columns are converted from the native engine's Unix-millisecond
// integers to the ISO-8601 text that @prisma/adapter-d1 writes, so old and new
// rows sort and compare consistently on D1.
//
// Usage:
//   node scripts/export-sqlite-to-d1.cjs [sourceDb] [outFile]
//   npx wrangler d1 execute DB --remote --file <outFile>
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Prisma } = require('@prisma/client');

const root = path.join(__dirname, '..');
const sourceDb = path.resolve(process.argv[2] || path.join(root, 'prisma', 'dev.db'));
const outFile = path.resolve(process.argv[3] || path.join(root, 'prisma', 'backups', 'd1-data-export.sql'));

function dateTimeColumnsByTable() {
  const result = new Map();
  for (const model of Prisma.dmmf.datamodel.models) {
    const table = model.dbName || model.name;
    const columns = model.fields
      .filter((field) => field.kind === 'scalar' && field.type === 'DateTime')
      .map((field) => field.dbName || field.name);
    result.set(table, new Set(columns));
  }
  return result;
}

function toD1DateTime(value) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return new Date(Number(value)).toISOString().replace('Z', '+00:00');
  }
  return value;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

// Parents before children, so foreign keys hold even without deferral.
function orderByDependencies(db, tables) {
  const deps = new Map(tables.map((table) => [
    table,
    db.prepare(`PRAGMA foreign_key_list("${table}")`).all().map((fk) => fk.table).filter((t) => t !== table),
  ]));
  const ordered = [];
  const visiting = new Set();
  const visit = (table) => {
    if (ordered.includes(table) || visiting.has(table)) return;
    visiting.add(table);
    for (const dep of deps.get(table) || []) if (deps.has(dep)) visit(dep);
    visiting.delete(table);
    ordered.push(table);
  };
  tables.forEach(visit);
  return ordered;
}

// Local SQLite may hold references to deleted parents (foreign keys were not
// enforced when they were deleted). D1 enforces them, so for nullable
// ON DELETE SET NULL references we export NULL, which is what the database
// would have done. Any other violation stops the export.
function danglingReferences(db) {
  const nulls = new Map();
  for (const violation of db.prepare('PRAGMA foreign_key_check').all()) {
    const fk = db.prepare(`PRAGMA foreign_key_list("${violation.table}")`).all().find((f) => f.id === violation.fkid);
    if (!fk || fk.on_delete !== 'SET NULL') {
      throw new Error(`Foreign key violation in ${violation.table} (rowid ${violation.rowid}) -> ${violation.parent}; fix it before exporting.`);
    }
    const key = `${violation.table}:${violation.rowid}`;
    if (!nulls.has(key)) nulls.set(key, new Set());
    nulls.get(key).add(fk.from);
  }
  return nulls;
}

function main() {
  const db = new DatabaseSync(sourceDb, { readOnly: true });
  const dateColumns = dateTimeColumnsByTable();
  const nullOut = danglingReferences(db);
  for (const [key, columns] of nullOut) {
    const [table, rowid] = key.split(':');
    const { id } = db.prepare(`SELECT id FROM "${table}" WHERE rowid = ?`).get(Number(rowid));
    console.log(`Dangling reference exported as NULL: ${table}.${[...columns].join(',')} on row ${id}`);
  }
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'")
    .all()
    .map((row) => row.name);

  const lines = ['PRAGMA defer_foreign_keys = true;'];
  const counts = {};
  for (const table of orderByDependencies(db, tables)) {
    const rows = db.prepare(`SELECT rowid AS "__rowid", * FROM "${table}"`).all();
    counts[table] = rows.length;
    const dates = dateColumns.get(table) || new Set();
    for (const { __rowid, ...row } of rows) {
      const dangling = nullOut.get(`${table}:${__rowid}`) || new Set();
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        if (dangling.has(column)) return 'NULL';
        return sqlLiteral(dates.has(column) ? toD1DateTime(row[column]) : row[column]);
      });
      lines.push(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`);
    }
  }
  db.close();

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`Exported ${total} rows from ${tables.length} tables to ${outFile}`);
  console.log(JSON.stringify(counts));
}

main();
