BEGIN TRANSACTION;

ALTER TABLE peers ADD COLUMN completion_count INTEGER DEFAULT 0;

CREATE INDEX idx_peers_completion_count ON peers(completion_count);

DROP TRIGGER IF EXISTS update_peers_timestamp;
CREATE TRIGGER update_peers_timestamp 
AFTER UPDATE ON peers
FOR EACH ROW
BEGIN
    UPDATE peers SET 
        updated_at = CURRENT_TIMESTAMP,
        completion_count = CASE
            WHEN NEW.completion_count != OLD.completion_count THEN NEW.completion_count
            ELSE OLD.completion_count
        END
    WHERE id = OLD.id;
END;

COMMIT;