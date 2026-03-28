-- Entity Knowledge Graph Schema
-- Stores structured knowledge about people, projects, decisions, commitments
-- Updated by the Dream Cycle nightly

CREATE TABLE IF NOT EXISTS entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- person, project, organization, place, concept
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id INTEGER NOT NULL REFERENCES entities(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    confidence REAL DEFAULT 1.0, -- 0.0 to 1.0
    source TEXT, -- which daily log or conversation this came from
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(entity_id, key)
);

CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_entity_id INTEGER NOT NULL REFERENCES entities(id),
    relation TEXT NOT NULL, -- friend_of, works_on, owns, lives_in, etc.
    to_entity_id INTEGER NOT NULL REFERENCES entities(id),
    properties TEXT, -- JSON for extra metadata
    confidence REAL DEFAULT 1.0,
    source TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(from_entity_id, relation, to_entity_id)
);

CREATE TABLE IF NOT EXISTS commitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    entity_id INTEGER REFERENCES entities(id), -- who made it or who it's about
    due_date TEXT,
    status TEXT DEFAULT 'active', -- active, done, missed, cancelled
    financial_impact TEXT, -- CHF amount if applicable
    source TEXT, -- which email/conversation
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    summary TEXT NOT NULL,
    entities TEXT, -- JSON array of entity names involved
    decisions TEXT, -- JSON array of decisions made
    lessons TEXT, -- JSON array of lessons learned
    emotional_tone TEXT, -- positive, negative, neutral, mixed
    source TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
CREATE INDEX IF NOT EXISTS idx_commitments_due ON commitments(due_date);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
