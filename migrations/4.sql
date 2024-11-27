BEGIN TRANSACTION;

CREATE TABLE provider_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    peer_key TEXT NOT NULL,
    start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_time DATETIME,
    duration_minutes INTEGER,
    total_requests INTEGER DEFAULT 0,
    FOREIGN KEY(peer_key) REFERENCES peers(key)
);

INSERT INTO provider_sessions (peer_key, start_time, end_time, duration_minutes)
SELECT 
    key,
    created_at,
    updated_at,
    points / 5 -- approximation of duration in minutes
FROM peers 
WHERE points > 0;

CREATE INDEX idx_provider_sessions_peer ON provider_sessions(peer_key);
CREATE INDEX idx_provider_sessions_times ON provider_sessions(start_time, end_time);

ALTER TABLE peers DROP COLUMN points;
ALTER TABLE peers DROP COLUMN connected_since;
ALTER TABLE peers DROP COLUMN last_seen;

COMMIT;