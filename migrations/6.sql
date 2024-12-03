-- Add a new `metrics` table
CREATE TABLE metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_session_id INTEGER NOT NULL,
    average_tokens_per_second REAL,
    total_bytes INTEGER,
    total_process_time REAL,
    average_token_length REAL,
    start_time INTEGER,
    total_tokens INTEGER,
    valid_checkpoints INTEGER,
    FOREIGN KEY(provider_session_id) REFERENCES provider_sessions(id)
);

-- Create an index to speed up queries on `metrics` associated with `provider_sessions`
CREATE INDEX idx_metrics_provider_session_id ON metrics(provider_session_id);
