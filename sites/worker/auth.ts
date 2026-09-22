import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { all, body, HttpError, id, insert, json, now, one, required, save, statement, type Doc, type Env } from './db';
import { loginSchema, registerSchema } from './schemas';

const encoder = new TextEncoder();
const identities=new WeakMap<Request,string>();
export const auditActor=(request:Request)=>identities.get(request)||null;
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
export const digest = async (value: string | Uint8Array) => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value)));
export async function passwordHash(password: string) { return hash(password, 12); }
async function legacyHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2:${salt}:${hex(bits)}`;
}
async function verify(password: string, encoded: string | null) {
  if(new TextEncoder().encode(password).length>72)return false;
  if (!encoded) return false;
  if (encoded.startsWith('$2')) return compare(password, encoded);
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
  const expected = await legacyHash(password, parts[1]);
  let difference = expected.length ^ encoded.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (encoded.charCodeAt(i) || 0);
  return difference === 0;
}
export function publicUser(user: Doc) {
  const { id, name, email, role, status, created_at } = user;
  return { id, name, email, role, status, created_at, picture: user.picture ?? null };
}
function token(request: Request) { return request.headers.get('cookie')?.match(/(?:^|;\s*)mv_session=([^;]+)/)?.[1] || ''; }
const cookie = (value: string, request: Request, age = 604800) => `mv_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
async function session(request: Request, env: Env, user: Doc, previous?: {hash:string;expires:number}) {
  const sessionToken = id() + id();
  const expires=previous?.expires ?? Date.now()+(user.role==='comprador'?604800000:28800000);
  const sessionHash=await digest(sessionToken), version=user.token_version||0;
  if(previous) {
    const results=await env.DB.batch([
      statement(env,'INSERT INTO sessions(hash,user_id,expires,token_version) SELECT ?,user_id,expires,token_version FROM sessions WHERE hash=? AND expires>?',sessionHash,previous.hash,Date.now()),
      statement(env,'DELETE FROM sessions WHERE hash=?',previous.hash),
    ]);
    if(!results[0].meta.changes)throw new HttpError(401,'Sessão encerrada. Entre novamente.');
  }else await statement(env, 'INSERT INTO sessions(hash,user_id,expires,token_version) VALUES(?,?,?,?)', sessionHash, user.id, expires,version).run();
  return json(publicUser(user), 200, { 'Set-Cookie': cookie(sessionToken, request, Math.max(0,Math.floor((expires-Date.now())/1000))) });
}
export async function currentUser(request: Request, env: Env, roles?: string[]): Promise<Doc> {
  const sessionToken = token(request);
  if (!sessionToken) throw new HttpError(401, 'Entre na sua conta para continuar.');
  const row = await statement(env, 'SELECT user_id,token_version FROM sessions WHERE hash=? AND expires>?', await digest(sessionToken), Date.now()).first();
  const user = row && await one(env, 'users', row.user_id);
  if (!user || user.status !== 'ativo' || row.token_version !== (user.token_version||0)) throw new HttpError(401, 'Sessão encerrada. Entre novamente.');
  if (roles && !roles.includes(user.role)) throw new HttpError(403, 'Você não tem permissão para esta ação.');
  identities.set(request,user.id);
  return user;
}
async function rateLimit(env: Env, key: string, max = 10) {
  key=await digest(key);
  await statement(env, `INSERT INTO login_attempts(key,count,expires) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,
    expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END`, key, Date.now() + 900000, Date.now(), Date.now()).run();
  const row = await statement(env, 'SELECT count FROM login_attempts WHERE key=?', key).first();
  if (row.count > max) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos.');
}
async function limits(request:Request,env:Env,action:string,email='') {
  const source=request.headers.get('cf-connecting-ip')||'local';
  await rateLimit(env,action+':source:'+source,50);
  await rateLimit(env,action+':pair:'+source+':'+email,10);
}
const dummyHash = passwordHash('Synthetic dummy password only');
export async function auth(request: Request, env: Env, path: string): Promise<Response | null> {
  if(path==='/api/auth/options'&&request.method==='GET')return json({google_enabled:env.GOOGLE_AUTH_ENABLED==='true'});
  if (path === '/api/auth/me' && request.method === 'GET') return json(publicUser(await currentUser(request, env)));
  if (!path.startsWith('/api/auth/') || request.method !== 'POST') return null;
  if (path === '/api/auth/logout') {
    const sessionHash=await digest(token(request));
    await env.DB.batch([
      statement(env,"UPDATE records SET data=json_set(data,'$.token_version',COALESCE(json_extract(data,'$.token_version'),0)+1) WHERE kind='users' AND id=(SELECT user_id FROM sessions WHERE hash=?)",sessionHash),
      statement(env,'DELETE FROM sessions WHERE user_id=(SELECT user_id FROM sessions WHERE hash=?)',sessionHash),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', request, 0) });
  }
  if (path === '/api/auth/refresh') {
    const user = await currentUser(request, env);
    const sessionHash=await digest(token(request));
    const row=await statement(env,'SELECT expires FROM sessions WHERE hash=?',sessionHash).first();
    if(!row)throw new HttpError(401,'Sessão encerrada.');
    return session(request, env, user,{hash:sessionHash,expires:row.expires});
  }
  const input = await body(request);
  if (path === '/api/auth/login') {
    const data = loginSchema.parse(input);
    await limits(request,env,'login',data.email);
    const user = (await all(env, 'users', "json_extract(data,'$.email')=?", data.email))[0];
    const valid=await verify(data.password,user?.password_hash||await dummyHash);
    if (!user || !valid || user.status !== 'ativo') throw new HttpError(401, 'E-mail ou senha inválidos.');
    if(user.password_hash.startsWith('pbkdf2:'))await statement(env,"UPDATE records SET data=json_set(data,'$.password_hash',?) WHERE kind='users' AND id=? AND json_extract(data,'$.password_hash')=?",await passwordHash(data.password),user.id,user.password_hash).run();
    return session(request, env, user);
  }
  if (path === '/api/auth/register') {
    const data = registerSchema.parse(input);
    await limits(request,env,'register',data.email);
    const user = { id: id(), name: data.name, email: data.email, password_hash: await passwordHash(data.password), role: 'comprador', status: 'ativo', picture: null, created_at: now() };
    await insert(env, 'users', user).run();
    return session(request, env, user);
  }
  if (path === '/api/auth/forgot-password') {
    const { email } = z.object({ email: z.email().transform(s => s.toLowerCase()) }).parse(input);
    if (!env.RESET_WEBHOOK_URL?.startsWith('https://') || !env.RESET_WEBHOOK_TOKEN) throw new HttpError(503, 'Recuperação por e-mail não configurada. Fale com o administrador.');
    await limits(request,env,'forgot',email);
    const user = (await all(env, 'users', "json_extract(data,'$.email')=?", email))[0];
    if (user) {
      const resetToken = id() + id();
      const resetId=await digest(resetToken);
      await insert(env, 'resets', { id: resetId, user_id: user.id, token_version:user.token_version||0, expires: Date.now() + 1800000 }).run();
      try {
        const response = await fetch(env.RESET_WEBHOOK_URL, { method: 'POST',redirect:'error',signal:AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${env.RESET_WEBHOOK_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: resetToken, site: new URL(request.url).origin }) });
        if(!response.ok)throw new Error();
      }catch {
        await statement(env,"DELETE FROM records WHERE kind='resets' AND id=?",resetId).run();
        console.error('password_reset_delivery_failed');
      }
    }
    return json({ message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.', reset_token: null });
  }
  if (path === '/api/auth/reset-password') {
    await limits(request,env,'reset');
    const data = z.object({ token: z.string().min(32).max(200), new_password: registerSchema.shape.password }).strict().parse(input);
    const resetId = await digest(data.token);
    const reset = await one(env, 'resets', resetId);
    if (!reset || reset.expires < Date.now()) throw new HttpError(400, 'Token inválido ou expirado.');
    const hash = await passwordHash(data.new_password);
    const results=await env.DB.batch([
      statement(env, `UPDATE records SET data=json_set(data,'$.password_hash',?,'$.token_version',COALESCE(json_extract(data,'$.token_version'),0)+1) WHERE kind='users' AND id=? AND COALESCE(json_extract(data,'$.token_version'),0)=? AND EXISTS(SELECT 1 FROM records WHERE kind='resets' AND id=? AND json_extract(data,'$.expires')>?)`, hash, reset.user_id, reset.token_version||0, resetId,Date.now()),
      statement(env, 'DELETE FROM sessions WHERE user_id=?', reset.user_id),
      statement(env, "DELETE FROM records WHERE kind='resets' AND id=?", resetId),
    ]);
    if(!results[0].meta.changes)throw new HttpError(400,'Token inválido ou expirado.');
    return json({ message: 'Senha redefinida. Entre novamente.' });
  }
  if (path === '/api/auth/google/session') {
    if(env.GOOGLE_AUTH_ENABLED!=='true')throw new HttpError(503,'Login Google indisponível.');
    await limits(request,env,'google');
    const { session_id } = z.object({ session_id: z.string().min(1).max(4096) }).parse(input);
    const response = await fetch('https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data', { headers: { 'X-Session-ID': session_id }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HttpError(401, 'Falha ao validar a sessão Google.');
    const data: any = await response.json();
    const email = z.email().parse(data.email).toLowerCase();
    let user = (await all(env, 'users', "json_extract(data,'$.email')=?", email))[0];
    if(user&&(user.password_hash||user.role!=='comprador'))throw new HttpError(401,'Não foi possível entrar com esta identidade.');
    if (!user) {
      user = { id: id(), email, name: String(data.name || email.split('@')[0]).slice(0, 120), role: 'comprador', status: 'ativo', password_hash: null, picture: null, created_at: now() };
      await insert(env, 'users', user).run();
    }
    if (user.status !== 'ativo') throw new HttpError(403, 'Conta bloqueada.');
    return session(request, env, user);
  }
  return null;
}
