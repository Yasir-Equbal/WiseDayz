'use strict';
// PostgreSQL repository. Requires `pg` and DATABASE_URL; JSON mode remains for local tests.
class PostgresStore {
  constructor(pool) { this.pool = pool; }
  static async connect(connectionString) {
    let Pool;
    try { ({ Pool } = require('pg')); }
    catch { throw new Error('PostgreSQL mode requires the pg package. Run: npm install'); }
    const pool = new Pool({ connectionString, max: Number(process.env.PG_POOL_MAX || 10), ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: true } : undefined });
    const store = new PostgresStore(pool);
    await store.migrate();
    return store;
  }
  async migrate() {
    const fs = require('node:fs'); const path = require('node:path');
    const sql = fs.readFileSync(path.join(__dirname, 'migrations', '001_initial.sql'), 'utf8');
    await this.pool.query(sql);
  }
  async userByEmail(email) { const r = await this.pool.query('SELECT id,name,email,salt,password_hash,created_at FROM users WHERE email=$1', [email]); return r.rows[0] && this.mapUser(r.rows[0]); }
  async userById(id) { const r = await this.pool.query('SELECT id,name,email,salt,password_hash,created_at FROM users WHERE id=$1', [id]); return r.rows[0] && this.mapUser(r.rows[0]); }
  mapUser(r) { return { id:r.id, name:r.name, email:r.email, salt:r.salt, passwordHash:r.password_hash, createdAt:Number(r.created_at) }; }
  async createUser(user) {
    const c = await this.pool.connect();
    try { await c.query('BEGIN'); await c.query('INSERT INTO users(id,name,email,salt,password_hash,created_at) VALUES($1,$2,$3,$4,$5,$6)',[user.id,user.name,user.email,user.salt,user.passwordHash,String(user.createdAt)]); await c.query('INSERT INTO workspaces(user_id,version,data,updated_at) VALUES($1,1,NULL,$2)',[user.id,String(user.createdAt)]); await c.query('COMMIT'); }
    catch(e) { await c.query('ROLLBACK'); if(e.code==='23505') e.code='DUPLICATE_EMAIL'; throw e; } finally { c.release(); }
  }
  async createSession(session) { await this.pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[session.tokenHash,session.userId,String(session.expiresAt)]); }
  async userForToken(hash, now) { const r=await this.pool.query('SELECT u.id,u.name,u.email,u.salt,u.password_hash,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2',[hash,String(now)]); return r.rows[0]&&this.mapUser(r.rows[0]); }
  async revokeSession(hash) { await this.pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash]); }
  async cleanupSessions(now) { await this.pool.query('DELETE FROM sessions WHERE expires_at<=$1',[String(now)]); }
  async getWorkspace(userId) { const r=await this.pool.query('SELECT version,data,updated_at FROM workspaces WHERE user_id=$1',[userId]); const x=r.rows[0]; return x?{version:Number(x.version),data:x.data,updatedAt:x.updated_at===null?null:Number(x.updated_at)}:{version:0,data:null,updatedAt:null}; }
  async saveWorkspace(userId, expectedVersion, data, now) {
    const r=await this.pool.query('UPDATE workspaces SET data=$1,version=version+1,updated_at=$2 WHERE user_id=$3 AND version=$4 RETURNING version,data,updated_at',[JSON.stringify(data),String(now),userId,expectedVersion]);
    if(r.rowCount) { const x=r.rows[0]; return {version:Number(x.version),data:x.data,updatedAt:Number(x.updated_at)}; }
    return null;
  }
  async close() { await this.pool.end(); }
}
module.exports = { PostgresStore };
