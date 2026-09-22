import { ZodError } from 'zod';
import { imageSize } from 'image-size';
import { auth, currentUser, digest, auditActor } from './auth';
import { catalog } from './catalog';
import { orders } from './orders';
import { all, HttpError, id, insert, json, limitedBytes, now, one, required, type Env, type Doc } from './db';
import seed from './seed.json';

async function initialize(env: Env) {
  if(await one(env,'settings','initialized'))return;
  if(!env.BOOTSTRAP_ADMIN_EMAIL||!env.BOOTSTRAP_ADMIN_HASH)throw new HttpError(503,'A loja está sendo preparada. Tente novamente em instantes.');
  await env.DB.batch([
    ...seed.map(record=>insert(env,record.kind,record.data,true)),
    insert(env,'users',{id:'initial-admin',email:env.BOOTSTRAP_ADMIN_EMAIL.toLowerCase(),password_hash:env.BOOTSTRAP_ADMIN_HASH,name:'Administrador',role:'admin',status:'ativo',created_at:now()},true),
    insert(env,'settings',{id:'initialized',created_at:now()},true),
  ]);
}
const fileOut = (doc: Doc) => ({id:doc.id,original_filename:doc.original_filename,content_type:doc.content_type,size:doc.size,created_at:doc.created_at});
async function files(request: Request,env: Env,path: string): Promise<Response|null> {
  if(path==='/api/files/upload'&&request.method==='POST') {
    const user=await currentUser(request,env,['admin']);
    const raw=await limitedBytes(request,8*1024*1024+65536);
    let form:FormData;try{form=await new Response(raw as BodyInit,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new HttpError(422,'Upload inválido.');}
    const file=form.get('file');if(!file||typeof file==='string'||!file.size)throw new HttpError(422,'Selecione uma imagem.');
    if(file.size>8*1024*1024)throw new HttpError(413,'Imagem acima do limite de 8 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    let mime:string;try {const size=imageSize(bytes);const types:Record<string,string>={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};mime=types[size.type||''];if(!mime||!size.width||!size.height||size.width*size.height>40000000)throw new Error();}catch{throw new HttpError(415,'Imagem inválida. Use JPG, PNG, WEBP ou GIF de até 40 megapixels.');}
    const hash=await digest(bytes),old=(await all(env,'files',"json_extract(data,'$.sha256')=? AND json_extract(data,'$.is_deleted')=0",hash))[0];if(old)return json(fileOut(old));
    const fileId=id(),key='uploads/'+fileId;
    await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
    const doc={id:fileId,key,sha256:hash,original_filename:file.name.replace(/\\/g,'/').split('/').pop()?.slice(0,200)||'imagem',content_type:mime,size:file.size,uploaded_by:user.id,created_at:now(),is_deleted:false};
    try{await insert(env,'files',doc).run();}catch(error){await env.BUCKET.delete(key);throw error;}return json(fileOut(doc));
  }
  const match=path.match(/^\/api\/files\/([^/]+)$/);
  if(match&&request.method==='GET') {
    const doc=await required(env,'files',match[1]);if(doc.is_deleted)throw new HttpError(404,'Arquivo não encontrado.');
    const headers={'Content-Type':doc.content_type,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'};
    if(doc.asset_path){const response=await env.ASSETS.fetch(new Request(new URL(doc.asset_path,request.url)));if(!response.ok)throw new HttpError(404,'Arquivo não encontrado.');return new Response(response.body,{headers});}
    const object=await env.BUCKET.get(doc.key);if(!object)throw new HttpError(404,'Arquivo não encontrado.');return new Response(object.body,{headers});
  }
  return null;
}
const securityHeaders=(response:Response,request:Request)=>{
  const result=new Response(response.body,response);
  result.headers.set('X-Content-Type-Options','nosniff');
  result.headers.set('X-Frame-Options','DENY');
  result.headers.set('Referrer-Policy','no-referrer');
  result.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://images.unsplash.com; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if(new URL(request.url).protocol==='https:')result.headers.set('Strict-Transport-Security','max-age=31536000');
  return result;
};
const handler = {
  async fetch(request: Request,env: Env):Promise<Response> {
    const url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
    if(!path.startsWith('/api/')) {
      const response=await env.ASSETS.fetch(request);
      if(response.status!==404||!request.headers.get('accept')?.includes('text/html'))return response;
      return env.ASSETS.fetch(new Request(new URL('/',url),request));
    }
    try {
      if(!['GET','HEAD','OPTIONS'].includes(request.method)) {
        const origin=request.headers.get('origin');
        if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'Origem da solicitação não permitida.');
        if(path!=='/api/files/upload'&&request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new HttpError(415,'Use application/json.');
      }
      await initialize(env);
      return await auth(request,env,path)||await files(request,env,path)||await catalog(request,env,path)||await orders(request,env,path)||json({detail:'Página não encontrada.'},404);
    } catch(error) {
      if(error instanceof HttpError)return json({detail:error.message},error.status);
      if(error instanceof ZodError)return json({detail:'Confira os campos informados.'},422);
      const message=String(error);
      if(message.includes('UNIQUE constraint'))return json({detail:'Já existe um registro com esses dados.'},409);
      if(message.includes('nonnegative_stock'))return json({detail:'Estoque insuficiente. Atualize o carrinho.'},409);
      console.error('Request failed',path,error instanceof Error?error.name:'StorageError');
      return json({detail:'Serviço temporariamente indisponível. Tente novamente.'},503);
    }
  },
};
export default {async fetch(request:Request,env:Env){
  const response=await handler.fetch(request,env);
  const path=new URL(request.url).pathname;
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&/^\/api\/(admin|auth|payments)\//.test(path))console.info(JSON.stringify({event:'security_operation',request_id:id(),actor_id:auditActor(request),method:request.method,route:path.split('/').slice(0,4).join('/'),status:response.status}));
  return securityHeaders(response,request);
}};
