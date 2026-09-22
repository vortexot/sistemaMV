import { all, body, HttpError, id, insert, json, now, one, remove, required, save, statement, type Doc, type Env } from './db';
import { currentUser, publicUser } from './auth';
import { bannerSchema, categorySchema, productSchema, roles, slugify, states, stateLabels } from './schemas';
import { z } from 'zod';
export const ordered = (docs: Doc[]) => docs.sort((a,b) => (a.order||0)-(b.order||0) || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
export async function products(env: Env): Promise<Doc[]> {
  const cats = await all(env, 'categories');
  return (await all(env, 'products')).map(p => { const cat = cats.find(c => c.id===p.category_id); return {...p, category_name:cat?.name||'',category_slug:cat?.slug||''}; });
}
const stockRow = (p: Doc) => ({id:p.id,name:p.name,sku:p.sku,stock:p.stock,active:p.active,archived:p.archived,status:p.stock<=0?'sem_estoque':p.stock<=5?'estoque_baixo':'em_estoque'});
export async function catalog(request: Request, env: Env, path: string): Promise<Response|null> {
  const url = new URL(request.url), method=request.method;
  if (path==='/api/catalog/categories' && method==='GET') return json(ordered((await all(env,'categories')).filter(c=>c.active)));
  if (path.startsWith('/api/catalog/products') && method==='GET') {
    let docs=(await products(env)).filter(p=>p.active&&!p.archived);
    if(path==='/api/catalog/products') {
      const category=url.searchParams.get('category'),search=url.searchParams.get('search')?.trim().toLowerCase(),featured=url.searchParams.get('featured');
      docs=docs.filter(p=>(!category||p.category_slug===category)&&(!search||(p.name+' '+p.brand).toLowerCase().includes(search))&&(featured===null||p.featured===(featured==='true')));
      return json(docs.sort((a,b)=>Number(b.featured)-Number(a.featured)||b.created_at.localeCompare(a.created_at)));
    }
    const p=docs.find(p=>p.id===path.split('/')[4]); if(!p) throw new HttpError(404,'Produto não encontrado.'); return json(p);
  }
  if(path.startsWith('/api/favorites')) {
    const user=await currentUser(request,env);
    if(method==='GET'&&path==='/api/favorites') { const favs=await all(env,'favorites',"json_extract(data,'$.user_id')=?",user.id);return json((await products(env)).filter(p=>favs.some(f=>f.product_id===p.id))); }
    const match=path.match(/^\/api\/favorites\/([^/]+)\/toggle$/);
    if(match&&method==='POST') {await required(env,'products',match[1]); const key=user.id+':'+match[1];const existing=await one(env,'favorites',key);if(existing) await remove(env,'favorites',key);else await insert(env,'favorites',{id:key,user_id:user.id,product_id:match[1],created_at:now()}).run();return json({favorited:!existing});}
  }
  if(!path.startsWith('/api/admin/'))return null;
  const user=await currentUser(request,env,['admin','atendente']);
  const section=path.split('/')[3],recordId=path.split('/')[4];
  if(section==='indoor'&&method==='GET')return json(ordered((await all(env,'banners')).filter(b=>b.active&&b.image_file_id)));
  if(section==='dashboard'&&method==='GET') {
    const ps=await products(env),active=ps.filter(p=>p.active&&!p.archived),users=await all(env,'users'),orders=await all(env,'orders');
    return json({welcome:'Bem-vindo, '+user.name.split(' ')[0],produtos_ativos:active.length,clientes:users.filter(u=>u.role==='comprador').length,pedidos:orders.length,estoque_baixo:active.filter(p=>p.stock>0&&p.stock<=5).length,produtos_sem_estoque:active.filter(p=>p.stock<=0).length,resumo:`${active.length} produto(s) ativo(s) · ${orders.length} pedido(s) registrado(s).`,low_stock:ps.filter(p=>p.stock<=5).sort((a,b)=>a.stock-b.stock).slice(0,8).map(stockRow)});
  }
  if(section==='reports'&&method==='GET') {
    const orders=await all(env,'orders'),paid=orders.filter(o=>o.payment_status==='pago'),users=await all(env,'users'),ps=await products(env);
    const total=paid.reduce((sum,o)=>sum+o.total,0),top=new Map<string,Doc>();
    for(const o of paid)for(const item of o.items){const row=top.get(item.product_id)||{product_id:item.product_id,name:item.name,qty:0,receita:0};row.qty+=item.qty;row.receita+=item.qty*item.unit_price;top.set(item.product_id,row);}
    return json({pedidos_total:orders.length,vendas_total:total,ticket_medio:paid.length?total/paid.length:null,clientes_cadastrados:users.filter(u=>u.role==='comprador').length,pedidos_por_status:states.map(s=>({status:s,label:stateLabels[s],count:orders.filter(o=>o.status===s).length})).filter(s=>s.count),produtos_mais_vendidos:[...top.values()].sort((a,b)=>b.qty-a.qty).slice(0,5),estoque_baixo:ps.filter(p=>p.stock<=5).sort((a,b)=>a.stock-b.stock).slice(0,10).map(stockRow)});
  }
  if(method==='GET'&&['customers','orders','stock'].includes(section)) {
    const docs=await all(env,section==='customers'?'users':section==='stock'?'products':'orders');return json(section==='customers'?docs.map(publicUser):section==='stock'?docs.map(stockRow).sort((a,b)=>a.stock-b.stock):docs.sort((a,b)=>b.created_at.localeCompare(a.created_at)));
  }
  if(user.role!=='admin')throw new HttpError(403,'Acesso exclusivo do administrador.');
  if(method==='PATCH'&&recordId&&section==='customers') {
    if(recordId===user.id)throw new HttpError(400,'Você não pode alterar o próprio perfil.');
    const changes=z.object({role:roles.optional(),status:z.enum(['ativo','bloqueado']).optional()}).strict().parse(await body(request));
    const doc=await required(env,'users',recordId);
    const entries=Object.entries(changes);
    await env.DB.batch([
      statement(env,`UPDATE records SET data=json_set(data,'$.token_version',COALESCE(json_extract(data,'$.token_version'),0)+1${entries.map(()=>',?,json(?)').join('')}) WHERE kind='users' AND id=?`,...entries.flatMap(([k,v])=>['$.'+k,JSON.stringify(v)]),recordId),
      statement(env,'DELETE FROM sessions WHERE user_id=?',recordId),
    ]);
    return json(publicUser(await required(env,'users',recordId)));
  }
  if(method==='PATCH'&&recordId&&section==='stock') {
    const {stock}=z.object({stock:z.number().int().min(0).max(10000000)}).strict().parse(await body(request));await required(env,'products',recordId);
    await statement(env,"UPDATE records SET data=json_set(data,'$.stock',?,'$.updated_at',?) WHERE kind='products' AND id=?",stock,now(),recordId).run();return json(stockRow(await required(env,'products',recordId)));
  }
  if(method==='PATCH'&&recordId&&section==='orders') {
    const {status}=z.object({status:z.enum(states)}).strict().parse(await body(request));const doc=await required(env,'orders',recordId);
    const transitions:Record<string,string>={aprovado:'preparando',preparando:'enviado',enviado:'em_transito',em_transito:'entregue'};
    if(doc.payment_status!=='pago'||transitions[doc.status]!==status)throw new HttpError(409,'Transição de entrega inválida; pagamento confirmado é obrigatório.');
    const result=await statement(env,"UPDATE records SET data=json_set(data,'$.status',?) WHERE kind='orders' AND id=? AND json_extract(data,'$.status')=? AND json_extract(data,'$.payment_status')='pago'",status,recordId,doc.status).run();
    if(!result.meta.changes)throw new HttpError(409,'O pedido foi alterado. Atualize a página.');return json(await required(env,'orders',recordId));
  }
  const schema=section==='products'?productSchema:section==='categories'?categorySchema:section==='banners'?bannerSchema:null;
  if(!schema)return null;
  if(method==='GET'&&!recordId)return json(section==='products'?await products(env):ordered(await all(env,section)));
  if(method==='DELETE'&&recordId) {
    await required(env,section,recordId);
    if(section==='categories'&&(await all(env,'products',"json_extract(data,'$.category_id')=?",recordId)).length)throw new HttpError(409,'Mova os produtos antes de excluir esta categoria.');
    if(section==='products') {await statement(env,"UPDATE records SET data=json_set(data,'$.archived',json('true'),'$.active',json('false')) WHERE kind='products' AND id=?",recordId).run();}
    else await remove(env,section,recordId);return json({ok:true});
  }
  if((method==='POST'&&!recordId)||(method==='PATCH'&&recordId)) {
    const old=recordId?await required(env,section,recordId):null,input=await body(request);
    const existing=old?Object.fromEntries(Object.keys(schema.shape).filter(k=>k in old).map(k=>[k,old[k]])):{};
    const parsed:Doc=schema.parse({...existing,...input});
    if(parsed.image_file_id){const file=await required(env,'files',parsed.image_file_id);if(file.is_deleted)throw new HttpError(422,'Imagem indisponível.');}
    if(section==='products'){await required(env,'categories',parsed.category_id);parsed.sku=parsed.sku.toUpperCase();}
    if(section==='categories')parsed.slug=slugify(parsed.name);
    const doc={...old,...parsed,id:old?.id||id(),created_at:old?.created_at||now(),updated_at:now()};
    if(old) {
      const changes:Doc=Object.fromEntries(Object.keys(input).map(k=>[k,parsed[k]]));
      changes.updated_at=doc.updated_at;
      if(section==='categories'&&'name' in input)changes.slug=parsed.slug;
      const entries=Object.entries(changes);
      await statement(env,`UPDATE records SET data=json_set(data,${entries.map(()=> '?,json(?)').join(',')}) WHERE kind=? AND id=?`,...entries.flatMap(([k,v])=>['$.'+k,JSON.stringify(v)]),section,doc.id).run();
    }else await insert(env,section,doc).run();
    return json(section==='products'?(await products(env)).find(p=>p.id===doc.id):doc);
  }
  return null;
}
