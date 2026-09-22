import { z } from 'zod';
const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
const image = text(100, 1).nullable().default(null);
export const safeLink = text(2048).refine(value => {
  if (!value) return true;
  if (/[\x00-\x1f\\]/.test(value)) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, 'Use um link http(s) ou um caminho iniciado por /.');
export const bannerSchema = z.object({
  title: text(120, 2), subtitle: text(500).default(''), image_file_id: text(100, 1),
  active: z.boolean().default(true), order: z.number().int().min(0).max(100000).default(0),
  link: safeLink.default(''), alt_text: text(300).default(''),
}).strict();
export const categorySchema = z.object({ name: text(80, 2), description: text(2000).default(''),
  order: z.number().int().min(0).max(100000).default(0), active: z.boolean().default(true), image_file_id: image,
}).strict();
export const productSchema = z.object({
  name: text(160, 2), sku: text(40, 2), brand: text(80, 1), category_id: text(100, 1),
  price: z.number().min(0).max(10000000), promo_price: z.number().min(0).max(10000000).nullable().default(null),
  stock: z.number().int().min(0).max(10000000).default(0), sizes: z.array(text(80)).max(100).default([]),
  colors: z.array(text(80)).max(100).default([]), description: text(10000).default(''),
  tag: z.enum(['novo', 'oferta', 'mais_vendido']).nullable().default(null),
  featured: z.boolean().default(false), active: z.boolean().default(true), archived: z.boolean().default(false), image_file_id: image,
}).strict().refine(p => p.promo_price === null || p.promo_price < p.price, 'O preço promocional deve ser menor que o preço.');
export const roles = z.enum(['admin', 'atendente', 'comprador']);
export const states = ['aguardando_pagamento', 'aprovado', 'preparando', 'enviado', 'em_transito', 'entregue', 'cancelado'] as const;
export const stateLabels: Record<string, string> = { aguardando_pagamento: 'Pagamento pendente', aprovado: 'Pagamento aprovado', preparando: 'Preparando pedido', enviado: 'Enviado', em_transito: 'Em trânsito', entregue: 'Entregue', cancelado: 'Cancelado' };
export const loginSchema = z.object({ email: z.email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(128) }).strict();
export const registerSchema = loginSchema.extend({ name: text(120, 2), password: z.string().min(15).max(72).refine(s=>new TextEncoder().encode(s).length<=72,'A senha excede 72 bytes UTF-8.') });
export const orderSchema = z.object({ idempotency_key:z.uuid(), items: z.array(z.object({ product_id: text(100, 1), qty: z.number().int().min(1).max(99) }).strict()).min(1).max(100) }).strict();
export const slugify = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID();
