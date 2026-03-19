-- Unified store activity feed: tracks ALL changes (bank, offers, menu, combos, addons, etc.)
-- across all surfaces (merchant_app, partnersite, dashboard) by both merchants and agents.

CREATE TABLE IF NOT EXISTS store_activity_feed (
  id            bigserial PRIMARY KEY,
  store_id      bigint NOT NULL,
  
  -- What changed
  section       text NOT NULL,  -- 'bank_account' | 'offer' | 'menu_item' | 'combo' | 'addon' | 'customization' | 'category' | 'store_settings' | etc.
  action        text NOT NULL,  -- 'create' | 'update' | 'delete' | 'enable' | 'disable' | 'set_default' | 'link' | 'unlink'
  entity_id     bigint NULL,    -- ID of the changed entity (bank account id, offer id, item id, etc.)
  entity_name   text NULL,      -- Human-readable name (offer title, item name, bank holder name, etc.)
  
  -- Human-readable summary
  summary       text NOT NULL,  -- e.g. "Added bank account ****1234", "Created offer 20% off", "Linked offer to Butter Roti"
  
  -- Structured diff for detail view
  diff          jsonb NULL,     -- { before: {...}, after: {...} } or { added: ..., removed: ... }
  
  -- Who did it
  actor_type    text NOT NULL DEFAULT 'merchant',  -- 'merchant' | 'agent' | 'system'
  actor_name    text NULL,
  actor_email   text NULL,
  actor_id      bigint NULL,    -- system_users.id for agents, NULL for merchants
  
  -- From where
  source        text NOT NULL DEFAULT 'merchant_app',  -- 'merchant_app' | 'partnersite' | 'dashboard'
  
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_activity_feed_store_created_idx
  ON store_activity_feed (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_activity_feed_section_idx
  ON store_activity_feed (store_id, section, created_at DESC);

CREATE INDEX IF NOT EXISTS store_activity_feed_entity_idx
  ON store_activity_feed (section, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS store_activity_feed_source_idx
  ON store_activity_feed (store_id, source, created_at DESC);

CREATE INDEX IF NOT EXISTS store_activity_feed_actor_type_idx
  ON store_activity_feed (store_id, actor_type, created_at DESC);

CREATE INDEX IF NOT EXISTS store_activity_feed_action_idx
  ON store_activity_feed (store_id, action, created_at DESC);
