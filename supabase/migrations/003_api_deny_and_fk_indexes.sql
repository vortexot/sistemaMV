-- The application still authenticates through FastAPI. Keep direct Data API access closed
-- until the backend cutover is implemented, and make that deny-by-default intent explicit.
create policy deny_api_access on mv.users for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.files for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.categories for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.products for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.product_images for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.banners for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.orders for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.order_items for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.favorites for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.login_attempts for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.password_reset_tokens for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.auth_limits for all to anon, authenticated using (false) with check (false);
create policy deny_api_access on mv.revoked_tokens for all to anon, authenticated using (false) with check (false);

create index if not exists banners_image_file_idx on mv.banners(image_file_id);
create index if not exists categories_image_file_idx on mv.categories(image_file_id);
create index if not exists favorites_product_idx on mv.favorites(product_id);
create index if not exists order_items_product_idx on mv.order_items(product_id);
create index if not exists password_reset_user_idx on mv.password_reset_tokens(user_id);
create index if not exists product_images_file_idx on mv.product_images(file_id);
create index if not exists products_image_file_idx on mv.products(image_file_id);
