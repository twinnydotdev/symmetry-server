BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS peers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    discovery_key TEXT NOT NULL UNIQUE,
    last_seen DATETIME,
    model_name TEXT,
    public BOOLEAN,
    connections INTEGER,
    max_connections INTEGER,
    data_collection_enabled BOOLEAN,
    name TEXT,
    website TEXT,
    online BOOLEAN,
    server_key TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES peers(key)
);

CREATE INDEX IF NOT EXISTS idx_peers_key ON peers(key);
CREATE INDEX IF NOT EXISTS idx_peers_discovery_key ON peers(discovery_key);
CREATE INDEX IF NOT EXISTS idx_sessions_provider_id ON sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TRIGGER IF NOT EXISTS update_peers_timestamp 
AFTER UPDATE ON peers
FOR EACH ROW
BEGIN
    UPDATE peers SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

COMMIT;