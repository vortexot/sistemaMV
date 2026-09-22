import { z } from 'zod';
import { currentUser, digest } from './auth';
import { all, body, HttpError, id, insert, json, now, required, statement, type Env, type Doc } from './db';
import { orderSchema } from './schemas';
const configured=(env:Env)=>Boolean(env.PAYPAL_CLIENT_ID&&env.PAYPAL_CLIENT_SECRET&&env.PAYMENTS_PAUSED==='false'&&['sandbox','live'].includes(env.PAYPAL_MODE||'sandbox'));
async function paypal(env:Env,path:string,payload:unknown,requestId:string) {
  const base=env.PAYPAL_MODE==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';
  const tokenResponse=await fetch(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+btoa(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_CLIENT_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
  if(!tokenResponse.ok)throw new HttpError(502,'Não foi possível conectar ao PayPal.');
  const token:any=await tokenResponse.json();
  const response=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json','PayPal-Request-Id':requestId},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new HttpError(502,'Não foi possível confirmar a operação no PayPal. Tente novamente.');
  return await response.json() as any;
}
export async function orders(request:Request,env:Env,path:string):Promise<Response|null> {
  const method=request.method;
  if(path==='/api/payments/status'&&method==='GET')return json({paypal_configured:configured(env),paypal_mode:configured(env)?env.PAYPAL_MODE||'sandbox':null});
  if(!path.startsWith('/api/orders')&&!path.startsWith('/api/payments/'))return null;
  const user=await currentUser(request,env);
  if(path==='/api/orders'&&method==='POST') {
    if(!configured(env))throw new HttpError(503,'PayPal indisponível no momento. Nenhuma cobrança foi realizada.');
    const data=orderSchema.parse(await body(request)),quantities=new Map<string,number>();
    for(const item of data.items)quantities.set(item.product_id,(quantities.get(item.product_id)||0)+item.qty);
    if([...quantities.values()].some(q=>q>99))throw new HttpError(422,'Limite de 99 unidades por produto.');
    const fingerprint=await digest(JSON.stringify([...quantities].sort(([a],[b])=>a.localeCompare(b))));
    const previous=(await all(env,'orders',"json_extract(data,'$.user_id')=? AND json_extract(data,'$.idempotency_key')=?",user.id,data.idempotency_key))[0];
    if(previous){if(previous.request_hash!==fingerprint)throw new HttpError(409,'A chave de repetição já pertence a outro carrinho.');return json(previous);}
    if((await all(env,'orders',"json_extract(data,'$.user_id')=? AND json_extract(data,'$.status')='aguardando_pagamento'",user.id)).length>=5)throw new HttpError(409,'Conclua ou cancele seus pedidos pendentes.');
    const orderId=id(),items:Doc[]=[],updates=[];
    for(const [productId,qty] of quantities) {
      const product=await required(env,'products',productId);
      if(!product.active||product.archived)throw new HttpError(409,'Produto indisponível.');
      if(product.stock<qty)throw new HttpError(409,'Estoque insuficiente para '+product.name+'.');
      const unit=Math.round((product.promo_price??product.price)*100)/100;
      if(!Number.isFinite(unit)||unit<0)throw new HttpError(409,'Valor financeiro inválido.');
      items.push({id:id(),order_id:orderId,product_id:product.id,name:product.name,sku:product.sku,unit_price:unit,qty});
      updates.push(statement(env,"UPDATE records SET data=json_set(data,'$.stock',CASE WHEN json_extract(data,'$.active')=1 AND COALESCE(json_extract(data,'$.archived'),0)=0 AND COALESCE(json_extract(data,'$.promo_price'),json_extract(data,'$.price'))=? THEN json_extract(data,'$.stock')-? ELSE -1 END) WHERE kind='products' AND id=?",product.promo_price??product.price,qty,productId));
    }
    const total=items.reduce((sum,item)=>sum+Math.round(item.unit_price*100)*item.qty,0)/100;
    const order={id:orderId,number:'MV-'+orderId.slice(0,8).toUpperCase(),user_id:user.id,customer_name:user.name,customer_email:user.email,items_total:total,total,status:'aguardando_pagamento',payment_method:'paypal',payment_status:'aguardando',paypal_order_id:null,created_at:now(),items};
    Object.assign(order,{idempotency_key:data.idempotency_key,request_hash:fingerprint});
    try {await env.DB.batch([...updates,insert(env,'orders',order)]);}catch(error){
      const duplicate=(await all(env,'orders',"json_extract(data,'$.user_id')=? AND json_extract(data,'$.idempotency_key')=?",user.id,data.idempotency_key))[0];
      if(duplicate&&duplicate.request_hash===fingerprint)return json(duplicate);
      throw error;
    }return json(order);
  }
  if(path==='/api/orders/mine'&&method==='GET')return json((await all(env,'orders',"json_extract(data,'$.user_id')=?",user.id)).sort((a,b)=>b.created_at.localeCompare(a.created_at)));
  if(path.startsWith('/api/orders/')&&method==='GET'){const order=await required(env,'orders',path.split('/')[3]);if(order.user_id!==user.id)throw new HttpError(404,'Pedido não encontrado.');return json(order);}
  if(!path.startsWith('/api/payments/paypal/')||method!=='POST')return null;
  const input=z.object({order_id:z.string().min(1).max(100),return_url:z.url().optional(),cancel_url:z.url().optional()}).strict().parse(await body(request));
  const order=await required(env,'orders',input.order_id);if(order.user_id!==user.id)throw new HttpError(404,'Pedido não encontrado.');
  const action=path.split('/').pop();
  if(action==='cancel') {
    if(order.status!=='aguardando_pagamento')return json(order);
    if(order.payment_status!=='aguardando')throw new HttpError(409,'A confirmação do pagamento está em andamento. Tente novamente.');
    const eligible="EXISTS(SELECT 1 FROM records o WHERE o.kind='orders' AND o.id=? AND json_extract(o.data,'$.status')='aguardando_pagamento' AND json_extract(o.data,'$.payment_status')='aguardando')";
    await env.DB.batch([
      ...order.items.map((item:Doc)=>statement(env,`UPDATE records SET data=json_set(data,'$.stock',json_extract(data,'$.stock')+?) WHERE kind='products' AND id=? AND ${eligible}`,item.qty,item.product_id,order.id)),
      statement(env,"UPDATE records SET data=json_set(data,'$.status','cancelado','$.payment_status','cancelado') WHERE kind='orders' AND id=? AND json_extract(data,'$.status')='aguardando_pagamento' AND json_extract(data,'$.payment_status')='aguardando'",order.id),
    ]);return json(await required(env,'orders',order.id));
  }
  if(!configured(env))throw new HttpError(503,'PayPal indisponível no momento. Nenhuma cobrança foi realizada.');
  if(action==='create') {
    if(order.status!=='aguardando_pagamento'||order.payment_status!=='aguardando')throw new HttpError(409,'Este pedido não está aguardando pagamento.');
    if(!input.return_url||!input.cancel_url||[input.return_url,input.cancel_url].some(u=>new URL(u).origin!==new URL(request.url).origin))throw new HttpError(422,'Endereço de retorno inválido.');
    const origin=new URL(request.url).origin;
    const result=await paypal(env,'/v2/checkout/orders',{intent:'CAPTURE',purchase_units:[{reference_id:order.number,amount:{currency_code:'BRL',value:order.total.toFixed(2)}}],payment_source:{paypal:{experience_context:{return_url:origin+'/checkout?paypal=return&order_id='+order.id,cancel_url:origin+'/checkout?paypal=cancel&order_id='+order.id,user_action:'PAY_NOW'}}}},order.id);
    const approval=result.links?.find((l:any)=>l.rel==='payer-action'||l.rel==='approve')?.href;if(!approval)throw new HttpError(502,'PayPal não retornou o link de aprovação.');
    const update=await statement(env,"UPDATE records SET data=json_set(data,'$.paypal_order_id',?) WHERE kind='orders' AND id=? AND json_extract(data,'$.status')='aguardando_pagamento' AND json_extract(data,'$.payment_status')='aguardando'",result.id,order.id).run();
    if(!update.meta.changes)throw new HttpError(409,'O pedido foi alterado. Atualize a página.');return json({order_id:order.id,approval_url:approval});
  }
  if(action==='capture') {
    if(order.payment_status==='pago')return json(order);
    if(order.status!=='aguardando_pagamento'||!order.paypal_order_id)throw new HttpError(409,'Pagamento não iniciado ou pedido cancelado.');
    const update=await statement(env,"UPDATE records SET data=json_set(data,'$.payment_status','processando') WHERE kind='orders' AND id=? AND json_extract(data,'$.status')='aguardando_pagamento' AND json_extract(data,'$.payment_status') IN ('aguardando','processando')",order.id).run();
    if(!update.meta.changes)throw new HttpError(409,'O pedido foi alterado. Atualize a página.');
    // The same idempotency key lets a retry resolve an ambiguous network failure without charging twice.
    const result=await paypal(env,'/v2/checkout/orders/'+encodeURIComponent(order.paypal_order_id)+'/capture',{},order.id+'-c');
    const captures=(result.purchase_units||[]).flatMap((p:any)=>p.payments?.captures||[]);
    if(result.id!==order.paypal_order_id||result.status!=='COMPLETED'||!captures.length||captures.some((c:any)=>c.status!=='COMPLETED'||c.amount?.currency_code!=='BRL'||!/^\d+\.\d{2}$/.test(c.amount?.value))||captures.reduce((sum:number,c:any)=>sum+Math.round(Number(c.amount.value)*100),0)!==Math.round(order.total*100))throw new HttpError(409,'Pagamento ainda não confirmado. Tente novamente.');
    await statement(env,"UPDATE records SET data=json_set(data,'$.status','aprovado','$.payment_status','pago','$.paid_at',?) WHERE kind='orders' AND id=? AND json_extract(data,'$.status')='aguardando_pagamento'",now(),order.id).run();return json(await required(env,'orders',order.id));
  }
  return null;
}
