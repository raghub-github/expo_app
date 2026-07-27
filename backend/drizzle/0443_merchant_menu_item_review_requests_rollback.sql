-- Rollback 0443_merchant_menu_item_review_requests.sql

DROP TABLE IF EXISTS merchant_menu_item_review_action_log;
DROP TABLE IF EXISTS merchant_menu_item_review_rejection_history;
DROP TABLE IF EXISTS merchant_menu_item_review_changes;
DROP TABLE IF EXISTS merchant_menu_item_review_requests;

DROP TYPE IF EXISTS merchant_menu_item_review_action;
DROP TYPE IF EXISTS merchant_menu_item_review_source;
DROP TYPE IF EXISTS merchant_menu_item_review_request_status;
DROP TYPE IF EXISTS merchant_menu_item_review_request_type;
