#!/bin/bash

# Configuration
DB_PATH="sqlite.db"
BACKUP_NAME="backup_$(date +%Y%m%d_%H%M%S).sql"
LOCAL_PATH="/home/richard/Desktop/twinny/symmetry-server/backups"
BACKUP_DIR="/home/ubuntu/dev/symmetry-server/"

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Create SQLite backup
echo "Creating backup..."
sqlite3 $DB_PATH ".backup '$BACKUP_DIR/$BACKUP_NAME'"

# Compress the backup
echo "Compressing backup..."
gzip "$BACKUP_DIR/$BACKUP_NAME"

# Transfer to local machine using scp
echo "Transferring to local machine..."
scp "$BACKUP_DIR/$BACKUP_NAME.gz" $LOCAL_PATH

# Clean up old backup on VPS
rm "$BACKUP_DIR/$BACKUP_NAME.gz"

echo "Backup completed successfully!"