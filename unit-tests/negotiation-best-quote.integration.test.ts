import { createRequire } from 'node:module';
import {
  NEGOTIATION_BEST_QUOTE_UPDATE_SQL,
  NEGOTIATION_OFFER_PARENT_UPDATE_SQL,
  NEGOTIATION_ROUND_INSERT_SQL,
  NEGOTIATION_UPDATE_AFTER_ROUND_SQL,
} from '../src/lib/d1-batch.constants';

interface LocalSQLiteStatement {
  all(...values: unknown[]): Array<Record<string, unknown>>;
  run(...values: unknown[]): { changes: number | bigint };
}
interface LocalSQLiteDatabase {
  exec(sql: string): void;
  prepare(sql: string): LocalSQLiteStatement;
  close(): void;
}

const { DatabaseSync } = createRequire(process.cwd() + '/package.json')('node:sqlite') as {
  DatabaseSync: new (path: string) => LocalSQLiteDatabase;
};

const TENANT_ID = 'tenant-1';
const RFQ_ID = 'rfq-1';
const NEGOTIATION_ID = 'neg-1';
const NOW = '2026-11-17T00:00:00.000Z';

function openDatabase(): LocalSQLiteDatabase {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    'CREATE TABLE negotiations (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, rfqId TEXT NOT NULL, status TEXT NOT NULL, currentRound INTEGER NOT NULL DEFAULT 1, bestQuoteAmount REAL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);' +
    'CREATE TABLE negotiation_rounds (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, negotiationId TEXT NOT NULL, vendorId TEXT NOT NULL, roundNumber INTEGER NOT NULL, deadline TEXT, targetPrice REAL, previousQuoteAmount REAL, counterOfferAmount REAL, revisedQuoteAmount REAL, savingsAmount REAL, savingsPercent REAL, status TEXT NOT NULL, notes TEXT, nextResponsibleParty TEXT, lineItemsJson TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);',
  );
  sqlite.prepare('INSERT INTO negotiations VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    NEGOTIATION_ID, TENANT_ID, RFQ_ID, 'ACTIVE', 1, null, NOW, NOW,
  );
  return sqlite;
}

function createNegotiationActions(sqlite: LocalSQLiteDatabase) {
  let roundSequence = 0;

  function insertRound(vendorId: string, roundNumber: number, values: { counterOfferAmount: number | null; revisedQuoteAmount: number | null }) {
    roundSequence += 1;
    const changes = Number(sqlite.prepare(NEGOTIATION_ROUND_INSERT_SQL).run(
      `round-${roundSequence}`, TENANT_ID, NEGOTIATION_ID, vendorId, roundNumber, null, null, 0,
      values.counterOfferAmount, values.revisedQuoteAmount, 0, 0,
      values.revisedQuoteAmount === null ? 'ROUND_ACTIVE' : 'REVISED_SUBMITTED', null, 'BUYER', null, NOW, NOW,
    ).changes);
    expect(changes).toBe(1);
  }

  return {
    // Mirrors submit-offer and the negotiations route: the round is written first, then the parent update runs.
    vendorRevises(vendorId: string, roundNumber: number, revisedQuoteAmount: number) {
      insertRound(vendorId, roundNumber, { counterOfferAmount: null, revisedQuoteAmount });
      const changes = Number(sqlite.prepare(NEGOTIATION_OFFER_PARENT_UPDATE_SQL).run(roundNumber, NOW, TENANT_ID, RFQ_ID).changes);
      expect(changes).toBe(1);
    },
    buyerCounters(vendorId: string, roundNumber: number, counterOfferAmount: number) {
      insertRound(vendorId, roundNumber, { counterOfferAmount, revisedQuoteAmount: null });
      const changes = Number(sqlite.prepare(NEGOTIATION_OFFER_PARENT_UPDATE_SQL).run(roundNumber, NOW, TENANT_ID, RFQ_ID).changes);
      expect(changes).toBe(1);
    },
    bestQuoteAmount(): number | null {
      const row = sqlite.prepare('SELECT bestQuoteAmount FROM negotiations WHERE id = ?').all(NEGOTIATION_ID)[0];
      return row.bestQuoteAmount === null ? null : Number(row.bestQuoteAmount);
    },
    insertRound,
  };
}

describe('negotiation best quote', () => {
  let sqlite: LocalSQLiteDatabase;

  beforeEach(() => {
    sqlite = openDatabase();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('keeps the lowest revised offer and ignores buyer counteroffers', () => {
    const negotiation = createNegotiationActions(sqlite);

    negotiation.buyerCounters('vendor-a', 1, 700);
    expect(negotiation.bestQuoteAmount()).toBeNull();

    negotiation.vendorRevises('vendor-a', 2, 900);
    expect(negotiation.bestQuoteAmount()).toBe(900);

    negotiation.vendorRevises('vendor-b', 1, 850);
    expect(negotiation.bestQuoteAmount()).toBe(850);

    negotiation.buyerCounters('vendor-a', 3, 800);
    expect(negotiation.bestQuoteAmount()).toBe(850);
  });

  it('drops to the next lowest vendor when the lowest vendor raises its offer', () => {
    const negotiation = createNegotiationActions(sqlite);
    negotiation.vendorRevises('vendor-a', 1, 900);
    negotiation.vendorRevises('vendor-b', 1, 850);

    negotiation.vendorRevises('vendor-b', 2, 1100);
    expect(negotiation.bestQuoteAmount()).toBe(900);

    negotiation.vendorRevises('vendor-a', 2, 1200);
    expect(negotiation.bestQuoteAmount()).toBe(1100);
  });

  it('applies the same rule to the round update and the vendor portal statements', () => {
    const negotiation = createNegotiationActions(sqlite);
    negotiation.vendorRevises('vendor-a', 1, 900);

    negotiation.insertRound('vendor-c', 1, { counterOfferAmount: null, revisedQuoteAmount: 650 });
    expect(Number(sqlite.prepare(NEGOTIATION_UPDATE_AFTER_ROUND_SQL).run(2, NOW, NEGOTIATION_ID, TENANT_ID).changes)).toBe(1);
    expect(negotiation.bestQuoteAmount()).toBe(650);

    negotiation.insertRound('vendor-c', 2, { counterOfferAmount: null, revisedQuoteAmount: 700 });
    expect(Number(sqlite.prepare(NEGOTIATION_BEST_QUOTE_UPDATE_SQL).run(NOW, NEGOTIATION_ID, TENANT_ID).changes)).toBe(1);
    expect(negotiation.bestQuoteAmount()).toBe(700);
  });
});
