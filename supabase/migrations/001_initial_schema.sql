begin;

create schema if not exists mv;
revoke all on schema mv from anon, authenticated;

create table if not exists mv.users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text,
  role text not null check (role in ('admin', 'atendente', 'comprador')),
  status text not null check (status in ('ativo', 'bloqueado')),
  picture text,
  token_version integer not null default 0 check (token_version >= 0),
  created_at timestamptz not null
);

create table if not exists mv.files (
  id text primary key,
  sha256 text,
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  size bigint not null check (size >= 0),
  uploaded_by text,
  seed_key text,
  created_at timestamptz not null,
  is_deleted boolean not null default false
);
create unique index if not exists files_sha256_active
  on mv.files (sha256) where sha256 is not null and is_deleted = false;

create table if not exists mv.categories (
  id text primary key,
  name text not null,
  slug text not null unique,
  description text not null default '',
  "order" integer not null default 0 check ("order" >= 0),
  active boolean not null default true,
  image_file_id text references mv.files(id) on delete set null,
  created_at timestamptz not null
);

create table if not exists mv.products (
  id text primary key,
  name text not null,
  sku text not null unique,
  brand text not null,
  category_id text not null references mv.categories(id),
  price numeric(12,2) not null check (price >= 0),
  promo_price numeric(12,2) check (promo_price is null or promo_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  description text not null default '',
  tag text check (tag is null or tag in ('novo', 'oferta', 'mais_vendido')),
  featured boolean not null default false,
  active boolean not null default true,
  archived boolean not null default false,
  image_file_id text references mv.files(id) on delete set null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  check (promo_price is null or promo_price < price)
);

create table if not exists mv.product_images (
  id text primary key,
  product_id text not null references mv.products(id) on delete cascade,
  file_id text not null references mv.files(id) on delete restrict,
  is_main boolean not null default false,
  uploaded_by text,
  created_at timestamptz not null
);
create unique index if not exists product_images_one_main
  on mv.product_images(product_id) where is_main = true;

create table if not exists mv.banners (
  id text primary key,
  title text not null,
  subtitle text not null default '',
  image_file_id text references mv.files(id) on delete set null,
  active boolean not null default true,
  "order" integer not null default 0 check ("order" >= 0),
  link text not null default '',
  alt_text text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists mv.orders (
  id text primary key,
  number text not null unique,
  user_id text not null references mv.users(id),
  customer_name text not null,
  customer_email text not null,
  items_total numeric(12,2) not null check (items_total >= 0),
  total numeric(12,2) not null check (total >= 0),
  status text not null,
  payment_method text,
  payment_status text not null,
  paypal_order_id text,
  paid_at timestamptz,
  created_at timestamptz not null,
  idempotency_key text not null,
  request_hash text not null,
  unique (user_id, idempotency_key)
);

create table if not exists mv.order_items (
  id text primary key,
  order_id text not null references mv.orders(id) on delete cascade,
  product_id text references mv.products(id) on delete set null,
  name text not null,
  sku text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  qty integer not null check (qty > 0)
);

create table if not exists mv.favorites (
  id text primary key,
  user_id text not null references mv.users(id) on delete cascade,
  product_id text not null references mv.products(id) on delete cascade,
  created_at timestamptz not null,
  unique (user_id, product_id)
);

create table if not exists mv.login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null
);

create table if not exists mv.password_reset_tokens (
  token text primary key,
  user_id text not null references mv.users(id) on delete cascade,
  token_version integer not null,
  used boolean not null default false,
  created_at timestamptz not null,
  expires_at timestamptz not null
);

create table if not exists mv.auth_limits (
  id text primary key,
  count integer not null check (count >= 0),
  expires_at timestamptz not null
);

create table if not exists mv.revoked_tokens (
  jti text primary key,
  expires_at timestamptz not null,
  revoked_at timestamptz not null
);

create index if not exists products_catalog_idx
  on mv.products(active, archived, featured desc, created_at desc);
create index if not exists products_category_idx on mv.products(category_id);
create index if not exists categories_order_idx on mv.categories("order", name);
create index if not exists banners_order_idx on mv.banners(active, "order", created_at);
create index if not exists orders_user_idx on mv.orders(user_id, created_at desc);
create index if not exists orders_status_idx on mv.orders(status);
create index if not exists order_items_order_idx on mv.order_items(order_id);
create index if not exists login_attempts_created_idx on mv.login_attempts(created_at);
create index if not exists password_reset_expiry_idx on mv.password_reset_tokens(expires_at);
create index if not exists auth_limits_expiry_idx on mv.auth_limits(expires_at);
create index if not exists revoked_tokens_expiry_idx on mv.revoked_tokens(expires_at);

alter table mv.users enable row level security;
alter table mv.files enable row level security;
alter table mv.categories enable row level security;
alter table mv.products enable row level security;
alter table mv.product_images enable row level security;
alter table mv.banners enable row level security;
alter table mv.orders enable row level security;
alter table mv.order_items enable row level security;
alter table mv.favorites enable row level security;
alter table mv.login_attempts enable row level security;
alter table mv.password_reset_tokens enable row level security;
alter table mv.auth_limits enable row level security;
alter table mv.revoked_tokens enable row level security;

revoke all on all tables in schema mv from anon, authenticated;
revoke all on all sequences in schema mv from anon, authenticated;
alter default privileges in schema mv revoke all on tables from anon, authenticated;
alter default privileges in schema mv revoke all on sequences from anon, authenticated;

commit;
