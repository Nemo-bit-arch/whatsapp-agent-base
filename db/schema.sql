-- Schema de la base de donnees WhatsApp Agent

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',  -- message, escalade, note
  content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  push_name TEXT,
  prenom TEXT,
  besoin TEXT,
  contact_prefere TEXT DEFAULT 'whatsapp',
  sector TEXT,
  first_message TEXT,
  intent TEXT,
  status TEXT DEFAULT 'nouveau',  -- nouveau, contacte, converti, perdu
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL UNIQUE,
  prenom TEXT,
  nom TEXT,
  email TEXT,
  sector TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rdv (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_phone TEXT NOT NULL,
  nom_complet TEXT,
  date_rdv TEXT,
  heure_rdv TEXT,
  format_rdv TEXT DEFAULT 'telephone',
  besoin TEXT,
  conseiller TEXT,
  statut TEXT DEFAULT 'pending',  -- pending, confirmed, completed, cancelled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Migration: ajouter gcal_event_id si absent
-- SQLite ne supporte pas IF NOT EXISTS pour ALTER TABLE, on utilise un trick
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
INSERT OR IGNORE INTO _migrations (name) VALUES ('add_gcal_event_id');

CREATE INDEX IF NOT EXISTS idx_rdv_phone ON rdv(lead_phone);
CREATE INDEX IF NOT EXISTS idx_rdv_date ON rdv(date_rdv);
CREATE INDEX IF NOT EXISTS idx_rdv_statut ON rdv(statut);

-- Index pour les recherches frequentes
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_sector ON leads(sector);
