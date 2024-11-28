BEGIN TRANSACTION;

UPDATE provider_sessions 
SET end_time = CURRENT_TIMESTAMP 
WHERE id NOT IN (
    SELECT MAX(id) 
    FROM provider_sessions 
    WHERE end_time IS NULL 
    GROUP BY peer_key
);

CREATE UNIQUE INDEX idx_active_sessions ON provider_sessions(peer_key) 
WHERE end_time IS NULL;

COMMIT;