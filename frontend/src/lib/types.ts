// Hand-written mirrors of the backend Pydantic models (backend/models/*) — keep both in sync.
export type Role = "admin" | "atendente" | "comprador";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  picture: string | null;
  mfa_enabled: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  price: number;
  promo_price: number | null;
  stock: number;
  sizes: string[];
  colors: string[];
  description: string;
  tag: string | null;
  featured: boolean;
  active: boolean;
  archived: boolean;
  image_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category_name: string;
  category_slug: string;
  price: number;
  promo_price: number | null;
  in_stock: boolean;
  sizes: string[];
  colors: string[];
  description: string;
  tag: string | null;
  featured: boolean;
  image_file_id: string | null;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  order: number;
  active: boolean;
  image_file_id: string | null;
  created_at: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_file_id: string | null;
}

export interface Banner {
  order: number;
  link: string;
  alt_text: string;
  updated_at: string;
  id: string;
  title: string;
  subtitle: string;
  image_file_id: string | null;
  active: boolean;
  created_at: string;
}

export interface FileMeta {
  id: string;
  original_filename: string;
  content_type: string;
  size: number;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name: string;
  sku: string;
  unit_price: number;
  qty: number;
}

export interface Order {
  id: string;
  number: string;
  user_id: string;
  customer_name: string;
  customer_email: string;
  items: OrderItem[];
  items_total: number;
  total: number;
  status: string;
  payment_method: string | null;
  payment_status: string;
  paypal_order_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentStatus {
  paypal_configured: boolean;
  paypal_mode: string | null;
}

export interface PaypalApproval {
  order_id: string;
  approval_url: string;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string;
  stock: number;
}

export interface DashboardData {
  welcome: string;
  produtos_ativos: number;
  clientes: number;
  pedidos: number;
  estoque_baixo: number;
  produtos_sem_estoque: number;
  resumo: string;
  low_stock: LowStockItem[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  created_at: string;
}

export interface StockRow {
  id: string;
  name: string;
  sku: string;
  stock: number;
  active: boolean;
  archived: boolean;
  status: "em_estoque" | "estoque_baixo" | "sem_estoque";
}

export interface TopProduct {
  product_id: string;
  name: string;
  qty: number;
  receita: number;
}

export interface StatusCount {
  status: string;
  label: string;
  count: number;
}

export interface ReportData {
  pedidos_total: number;
  vendas_total: number;
  ticket_medio: number | null;
  clientes_cadastrados: number;
  pedidos_por_status: StatusCount[];
  produtos_mais_vendidos: TopProduct[];
  estoque_baixo: LowStockItem[];
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  aguardando_pagamento: "Pagamento pendente",
  aprovado: "Pagamento aprovado",
  preparando: "Preparando pedido",
  enviado: "Enviado",
  em_transito: "Em trânsito",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS);

export const TAG_LABELS: Record<string, string> = {
  novo: "NOVO",
  oferta: "OFERTA",
  mais_vendido: "MAIS VENDIDO",
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  atendente: "Atendente",
  comprador: "Comprador",
};

export const STOCK_STATUS_LABELS: Record<string, string> = {
  em_estoque: "Em estoque",
  estoque_baixo: "Estoque baixo",
  sem_estoque: "Sem estoque",
};
