BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_ip_messages_last_seen ON ip_messages(last_seen);

COMMIT;