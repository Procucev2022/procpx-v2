/* eslint @typescript-eslint/no-require-imports: "off" -- This module intentionally uses CommonJS. */

function expectedColumnsByTable(models) {
  return new Map(models.map((model) => [
    model.dbName || model.name,
    new Set(model.fields
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
      .map((field) => field.dbName || field.name)),
  ]));
}

function readIndexIdentifier(match) {
  return match[2] || match[3] || match[4] || match[5];
}

function expectedIndexNamesFromMigrations(migrations) {
  const indexes = new Set();
  const createPattern = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s;(]+))/gim;
  const dropPattern = /^\s*DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([^\s;(]+))/gim;

  for (const migration of migrations) {
    const sql = typeof migration === 'string' ? migration : migration.sql;
    const operations = [
      ...[...sql.matchAll(createPattern)].map((match) => ({ match, create: true })),
      ...[...sql.matchAll(dropPattern)].map((match) => ({ match, create: false })),
    ].sort((left, right) => left.match.index - right.match.index);
    for (const { match, create } of operations) {
      const indexName = readIndexIdentifier(match);
      if (create) indexes.add(indexName);
      else indexes.delete(indexName);
    }
  }

  return indexes;
}

function findMissingColumns(expectedColumns, actualColumns) {
  const missing = [];
  for (const [tableName, columns] of expectedColumns) {
    const actual = actualColumns.get(tableName) || new Set();
    for (const columnName of columns) {
      if (!actual.has(columnName)) missing.push({ tableName, columnName });
    }
  }
  return missing;
}

function findMissingIndexes(expectedIndexes, actualIndexes) {
  return [...expectedIndexes].filter((indexName) => !actualIndexes.has(indexName)).sort();
}

module.exports = {
  expectedColumnsByTable,
  expectedIndexNamesFromMigrations,
  findMissingColumns,
  findMissingIndexes,
};
