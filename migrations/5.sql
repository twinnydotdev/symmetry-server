BEGIN TRANSACTION;

CREATE UNIQUE INDEX idx_active_sessions ON provider_sessions(peer_key) 
WHERE end_time IS NULL;

COMMIT;