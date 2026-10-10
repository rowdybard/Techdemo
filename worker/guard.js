// Rates are sharded into 256 objects; report votes and moderation status have one object
// per greeting. SQL mutations have no intervening await and are committed atomically.
import { DurableObject } from 'cloudflare:workers';
import { REPORT_SECONDS, validId } from './common.js';

export class GreetingGuard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.greetings = env.GREETINGS;
    this.alarmUpdate = Promise.resolve();
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rates (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS votes (reporter TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS status (id INTEGER PRIMARY KEY CHECK(id = 1), hidden INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO status(id) VALUES(1);
    `);
  }

  status() { return this.ctx.storage.sql.exec('SELECT hidden, deleted, imported FROM status WHERE id = 1').one(); }

  importLegacy({ hidden = false, deleted = false } = {}) {
    this.ctx.storage.sql.exec('UPDATE status SET hidden = MAX(hidden, ?), deleted = MAX(deleted, ?), imported = 1 WHERE id = 1', hidden ? 1 : 0, deleted ? 1 : 0);
    return this.status();
  }

  // Internal RPC only, never exposed as an HTTP endpoint. Deletion remains a tombstone.
  setStatus({ hidden = false, deleted = false }) {
    this.ctx.storage.sql.exec('UPDATE status SET hidden = MAX(hidden, ?), deleted = MAX(deleted, ?) WHERE id = 1', hidden ? 1 : 0, deleted ? 1 : 0);
    return this.status();
  }

  async saveGreeting(id, record) {
    if (!validId(id)) throw new Error('Invalid greeting id');
    // A paid restore and retirement use the same gate, including their KV network I/O.
    return this.ctx.blockConcurrencyWhile(async () => {
      const status = this.status();
      if (status.hidden || status.deleted) return false;
      await this.greetings.put(`g:${id}`, JSON.stringify(record));
      return true;
    });
  }

  async retireGreeting(id) {
    if (!validId(id)) throw new Error('Invalid greeting id');
    return this.ctx.blockConcurrencyWhile(async () => {
      this.setStatus({ deleted: true });
      await this.greetings.delete(`g:${id}`);
      return this.status();
    });
  }

  async takeRate(key, limit, expires, now = Date.now()) {
    const allowed = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM rates WHERE expires <= ?', now);
      const row = this.ctx.storage.sql.exec('SELECT count FROM rates WHERE key = ?', key).toArray()[0];
      if (row && row.count >= limit) return false;
      this.ctx.storage.sql.exec('INSERT INTO rates(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', key, expires);
      return true;
    });
    await this.schedule();
    return allowed;
  }

  async vote(reporter, now = Date.now()) {
    const result = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM votes WHERE expires <= ?', now);
      this.ctx.storage.sql.exec('INSERT OR IGNORE INTO votes(reporter,expires) VALUES(?,?)', reporter, now + REPORT_SECONDS * 1000);
      const count = this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM votes').one().n;
      if (count >= 3) this.ctx.storage.sql.exec('UPDATE status SET hidden = 1 WHERE id = 1');
      return { count, ...this.status() };
    });
    await this.schedule();
    return result;
  }

  schedule() {
    // Read the latest minimum only after the preceding alarm write has completed.
    // This also prevents an older in-flight write from replacing a sooner deadline.
    const pending = this.alarmUpdate.then(async () => {
      const next = this.ctx.storage.sql.exec('SELECT MIN(expires) AS next FROM (SELECT expires FROM rates UNION ALL SELECT expires FROM votes)').one().next;
      if (next !== null) await this.ctx.storage.setAlarm(next);
      else await this.ctx.storage.deleteAlarm();
    });
    this.alarmUpdate = pending.catch(() => {});
    return pending;
  }

  async alarm() {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM votes WHERE expires <= ?', now);
    this.ctx.storage.sql.exec('DELETE FROM rates WHERE expires <= ?', now);
    await this.schedule();
  }
}
