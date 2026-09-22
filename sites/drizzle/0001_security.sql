ALTER TABLE sessions ADD COLUMN token_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX unique_order_request ON records(json_extract(data,'$.user_id'), json_extract(data,'$.idempotency_key')) WHERE kind='orders';
CREATE INDEX rate_expiry ON login_attempts(expires);
