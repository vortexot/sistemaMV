export type Doc = Record<string, any>;
export interface Env {
  DB: any;
  BUCKET: any;
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_HASH?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_CLIENT_SECRET?: string;
  PAYPAL_MODE?: string;
  PAYMENTS_PAUSED?: string;
  GOOGLE_AUTH_ENABLED?: string;
  RESET_WEBHOOK_URL?: string;
  RESET_WEBHOOK_TOKEN?: string;
}
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export const statement = (env: Env, sql: string, ...args: any[]) => env.DB.prepare(sql).bind(...args);
export async function one(env: Env, kind: string, recordId: string): Promise<Doc | null> {
  const row = await statement(env, 'SELECT data FROM records WHERE kind=? AND id=?', kind, recordId).first();
  return row ? JSON.parse(row.data) : null;
}
export async function all(env: Env, kind: string, condition = '1', ...args: any[]): Promise<Doc[]> {
  const result = await statement(env, `SELECT data FROM records WHERE kind=? AND (${condition})`, kind, ...args).all();
  return result.results.map((row: any) => JSON.parse(row.data));
}
export const insert = (env: Env, kind: string, doc: Doc, ignore = false) => statement(env,
  `INSERT ${ignore ? 'OR IGNORE' : ''} INTO records(kind,id,data) VALUES(?,?,?)`, kind, doc.id, JSON.stringify(doc));
export const save = (env: Env, kind: string, doc: Doc) => statement(env,
  'UPDATE records SET data=? WHERE kind=? AND id=?', JSON.stringify(doc), kind, doc.id);
export async function required(env: Env, kind: string, recordId: string): Promise<Doc> {
  const doc = await one(env, kind, recordId);
  if (!doc) throw new HttpError(404, 'Registro não encontrado.');
  return doc;
}
export const remove = (env: Env, kind: string, recordId: string) => statement(env,
  'DELETE FROM records WHERE kind=? AND id=?', kind, recordId).run();
export async function body(request: Request) {
  const raw = await limitedBytes(request, 64 * 1024);
  try { return JSON.parse(new TextDecoder().decode(raw)); }
  catch { throw new HttpError(422, 'Dados enviados inválidos.'); }
}
export async function limitedBytes(request: Request, maximum: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length') || 0) > maximum) throw new HttpError(413, 'Arquivo ou solicitação acima do limite.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); throw new HttpError(413, 'Arquivo ou solicitação acima do limite.'); }
    chunks.push(value);
  }
  const output = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
