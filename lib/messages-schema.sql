-- Command Center Message History Database Schema
-- SQLite database for Telegram/WhatsApp message indexing

-- Chats (conversations/groups/channels)
CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,        -- telegram | whatsapp
  chat_id TEXT NOT NULL,         -- platform chat id
  chat_type TEXT,                -- private | group | channel
  title TEXT,
  created_at INTEGER,
  last_indexed_at INTEGER,       -- timestamp of last successful index
  last_message_id TEXT,          -- platform message id of last indexed message
  UNIQUE(channel, chat_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  chat_fk INTEGER NOT NULL,
  channel TEXT NOT NULL,
  message_id TEXT NOT NULL,      -- platform message id
  sender_id TEXT,
  sender_name TEXT,
  text TEXT,
  timestamp INTEGER NOT NULL,    -- unix timestamp
  has_media BOOLEAN DEFAULT 0,
  media_type TEXT,               -- photo | video | document | audio | voice | sticker
  media_path TEXT,               -- local path if downloaded
  reply_to_id TEXT,
  forwarded_from TEXT,
  indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (chat_fk) REFERENCES chats(id),
  UNIQUE(channel, message_id)
);

-- Create indexes for lookups
CREATE INDEX IF NOT EXISTS idx_messages_channel_msg ON messages(channel, message_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_fk ON messages(chat_fk);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  text,
  sender_name,
  content=messages,
  content_rowid=id
);

-- Triggers to keep FTS in sync with messages table
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text, sender_name)
  VALUES (new.id, new.text, new.sender_name);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  DELETE FROM messages_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  UPDATE messages_fts SET text = new.text, sender_name = new.sender_name
  WHERE rowid = new.id;
END;

-- Metadata table for tracking indexer state
CREATE TABLE IF NOT EXISTS indexer_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);
