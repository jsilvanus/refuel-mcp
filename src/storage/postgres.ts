import { Pool, type PoolClient } from 'pg';
import type { AuthStore,AuthorizationCodeRecord,RefreshTokenRecord,McpUser,UserStore } from './interface.js';
const ddl = `
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT,password_hash TEXT,created_at BIGINT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS authorization_codes(code TEXT PRIMARY KEY,client_id TEXT NOT NULL,redirect_uri TEXT NOT NULL,challenge TEXT NOT NULL,subject TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,scope TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS refresh_tokens(token TEXT PRIMARY KEY,client_id TEXT NOT NULL,subject TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,scope TEXT NOT NULL,expires BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS cars(id UUID PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,registration TEXT,fuel_type TEXT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,is_default BOOLEAN NOT NULL DEFAULT FALSE,is_archived BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(id,user_id),CHECK(NOT(is_default AND is_archived)));
CREATE UNIQUE INDEX IF NOT EXISTS cars_one_default_per_user ON cars(user_id) WHERE is_default;
CREATE TABLE IF NOT EXISTS refueling_records(id UUID PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,car_id UUID NOT NULL,event_at TIMESTAMPTZ NOT NULL,litres NUMERIC(12,3) NOT NULL CHECK(litres>0),total_paid NUMERIC(12,2) NOT NULL CHECK(total_paid>=0),price_per_litre NUMERIC(12,4) NOT NULL CHECK(price_per_litre>=0),odometer_km NUMERIC(12,1),odometer_trust TEXT NOT NULL DEFAULT 'trusted' CHECK(odometer_trust IN('trusted','untrusted')),station TEXT,notes TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),deleted_at TIMESTAMPTZ,FOREIGN KEY(car_id,user_id) REFERENCES cars(id,user_id));
CREATE INDEX IF NOT EXISTS refuel_user_date_idx ON refueling_records(user_id,event_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS refuel_car_date_idx ON refueling_records(car_id,event_at ASC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS refueling_audit(id BIGSERIAL PRIMARY KEY,record_id UUID NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,before_state JSONB,after_state JSONB,occurred_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;
const user=(r:any):McpUser|undefined=>r?{id:r.id,name:r.name,...(r.email?{email:r.email}:{}),...(r.password_hash?{passwordHash:r.password_hash}:{}),createdAt:Number(r.created_at)}:undefined;
export class PostgresStore implements AuthStore,UserStore {
 readonly pool:Pool;
 constructor(url=process.env.DATABASE_URL){if(!url)throw new Error('DATABASE_URL is required');this.pool=new Pool({connectionString:url,max:Number(process.env.PG_POOL_MAX??10)});}
 async migrate(){await this.pool.query(ddl);}
 async close(){await this.pool.end();}
 async saveAuthorizationCode(r:AuthorizationCodeRecord){await this.pool.query('INSERT INTO authorization_codes VALUES($1,$2,$3,$4,$5,$6,$7)',[r.code,r.clientId,r.redirectUri,r.challenge,r.subject,r.scope,r.expires]);}
 async consumeAuthorizationCode(code:string){const r=await this.pool.query('DELETE FROM authorization_codes WHERE code=$1 AND expires >= $2 RETURNING *',[code,Date.now()]);if(!r.rowCount)await this.pool.query('DELETE FROM authorization_codes WHERE code=$1',[code]);const x=r.rows[0];return x?{code:x.code,clientId:x.client_id,redirectUri:x.redirect_uri,challenge:x.challenge,subject:x.subject,scope:x.scope,expires:Number(x.expires)}:undefined;}
 async saveRefreshToken(r:RefreshTokenRecord){await this.pool.query('INSERT INTO refresh_tokens VALUES($1,$2,$3,$4,$5)',[r.token,r.clientId,r.subject,r.scope,r.expires]);}
 async getRefreshToken(token:string){await this.pool.query('DELETE FROM refresh_tokens WHERE token=$1 AND expires<$2',[token,Date.now()]);const r=await this.pool.query('SELECT * FROM refresh_tokens WHERE token=$1',[token]);const x=r.rows[0];return x?{token:x.token,clientId:x.client_id,subject:x.subject,scope:x.scope,expires:Number(x.expires)}:undefined;}
 async createUser(u:McpUser){await this.pool.query('INSERT INTO users(id,name,email,password_hash,created_at) VALUES($1,$2,$3,$4,$5)',[u.id,u.name,u.email??null,u.passwordHash??null,u.createdAt]);}
 async listUsers(){const r=await this.pool.query('SELECT * FROM users ORDER BY name,id');return r.rows.map(x=>user(x)!);}
 async getUser(id:string){const r=await this.pool.query('SELECT * FROM users WHERE id=$1',[id]);return user(r.rows[0]);}
 async getUserByEmail(email:string){const r=await this.pool.query('SELECT * FROM users WHERE lower(email)=lower($1)',[email]);return user(r.rows[0]);}
 async updateUser(id:string,p:{name?:string;email?:string;passwordHash?:string}){const u=await this.getUser(id);if(!u)return;const r=await this.pool.query('UPDATE users SET name=$2,email=$3,password_hash=$4 WHERE id=$1 RETURNING *',[id,p.name??u.name,p.email??u.email??null,p.passwordHash??u.passwordHash??null]);return user(r.rows[0]);}
 async deleteUser(id:string){const r=await this.pool.query('DELETE FROM users WHERE id=$1',[id]);return (r.rowCount??0)>0;}
 async transaction<T>(fn:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const x=await fn(c);await c.query('COMMIT');return x;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
}