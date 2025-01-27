BEGIN TRANSACTION;

CREATE INDEX IF NOT EXISTS idx_provider_sessions_peer_key ON provider_sessions(peer_key);
CREATE INDEX IF NOT EXISTS idx_provider_sessions_end_time ON provider_sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_provider_sessions_start_time ON provider_sessions(start_time);

CREATE VIEW IF NOT EXISTS provider_session_stats AS
SELECT 
    COUNT(*) as total_sessions,
    SUM(CASE WHEN date(start_time) = date('now') THEN total_requests ELSE 0 END) as total_requests_today,
    SUM(total_requests) as total_requests,
    ROUND(AVG(CASE WHEN duration_minutes != 0 THEN duration_minutes END), 2) as average_session_minutes,
    SUM(duration_minutes) as total_provider_time
FROM provider_sessions;

COMMIT;