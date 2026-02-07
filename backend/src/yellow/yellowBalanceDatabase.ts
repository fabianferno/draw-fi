/**
 * Database for user Yellow balances (deposits from Yellow, used for positions)
 * Off-chain funding: user transfers to us, we credit; they open positions, we deduct
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface YellowDeposit {
  id: number;
  userAddress: string;
  amount: string;
  asset: string;
  yellowTxId: number;
  createdAt: number;
}

export class YellowBalanceDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(__dirname, '../../positions.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    logger.info('YellowBalanceDatabase initialized', { dbPath: this.dbPath });
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS yellow_balances (
        user_address TEXT PRIMARY KEY,
        balance TEXT NOT NULL DEFAULT '0',
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS yellow_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        asset TEXT NOT NULL,
        yellow_tx_id INTEGER NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_yellow_deposits_user ON yellow_deposits(user_address);
      CREATE INDEX IF NOT EXISTS idx_yellow_deposits_tx ON yellow_deposits(yellow_tx_id);
      CREATE TABLE IF NOT EXISTS yellow_position_funding (
        position_id INTEGER PRIMARY KEY,
        user_address TEXT NOT NULL,
        amount_ytest TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  /** Credit user balance (from Yellow transfer) */
  credit(userAddress: string, amount: string, asset: string, yellowTxId: number): boolean {
    const normalized = userAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    try {
      this.db.exec('BEGIN');
      const existing = this.db.prepare(
        'SELECT balance FROM yellow_balances WHERE user_address = ?'
      ).get(normalized) as { balance: string } | undefined;
      const current = existing ? BigInt(existing.balance) : 0n;
      const add = BigInt(amount);
      const newBalance = current + add;
      this.db.prepare(`
        INSERT INTO yellow_balances (user_address, balance, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_address) DO UPDATE SET
          balance = excluded.balance,
          updated_at = excluded.updated_at
      `).run(normalized, newBalance.toString(), now);
      this.db.prepare(`
        INSERT INTO yellow_deposits (user_address, amount, asset, yellow_tx_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(normalized, amount, asset, yellowTxId, now);
      this.db.exec('COMMIT');
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      if ((e as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return false; // already processed
      }
      throw e;
    }
  }

  /** Debit user balance (when opening position) */
  debit(userAddress: string, amount: string): boolean {
    const normalized = userAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare(
      'SELECT balance FROM yellow_balances WHERE user_address = ?'
    ).get(normalized) as { balance: string } | undefined;
    if (!existing) return false;
    const current = BigInt(existing.balance);
    const sub = BigInt(amount);
    if (current < sub) return false;
    const newBalance = current - sub;
    this.db.prepare(`
      UPDATE yellow_balances SET balance = ?, updated_at = ? WHERE user_address = ?
    `).run(newBalance.toString(), now, normalized);
    return true;
  }

  getBalance(userAddress: string): string {
    const normalized = userAddress.toLowerCase();
    const row = this.db.prepare(
      'SELECT balance FROM yellow_balances WHERE user_address = ?'
    ).get(normalized) as { balance: string } | undefined;
    return row?.balance ?? '0';
  }

  /** Record that a position was funded from Yellow (for payout on close) */
  recordYellowFundedPosition(positionId: number, userAddress: string, amountYtest: string): void {
    const normalized = userAddress.toLowerCase();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT OR REPLACE INTO yellow_position_funding (position_id, user_address, amount_ytest, created_at)
      VALUES (?, ?, ?, ?)
    `).run(positionId, normalized, amountYtest, now);
  }

  getYellowFundedPosition(positionId: number): { userAddress: string; amountYtest: string } | null {
    const row = this.db.prepare(
      'SELECT user_address as userAddress, amount_ytest as amountYtest FROM yellow_position_funding WHERE position_id = ?'
    ).get(positionId) as { userAddress: string; amountYtest: string } | undefined;
    return row ?? null;
  }

  clearYellowFundedPosition(positionId: number): void {
    this.db.prepare('DELETE FROM yellow_position_funding WHERE position_id = ?').run(positionId);
  }

  hasProcessedTx(yellowTxId: number): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM yellow_deposits WHERE yellow_tx_id = ?'
    ).get(yellowTxId);
    return !!row;
  }

  close(): void {
    this.db.close();
  }
}
