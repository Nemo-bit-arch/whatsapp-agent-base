/**
 * Database - Initialisation et acces SQLite
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, 'agent.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db = null;

/**
 * Initialise la base de donnees et cree les tables
 */
function initDatabase() {
  db = new Database(DB_PATH);

  // Activer WAL pour de meilleures performances en concurrent
  db.pragma('journal_mode = WAL');

  // Executer le schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  console.log('[DB] Base de donnees initialisee:', DB_PATH);

  // Si lance avec --init, afficher un message et quitter
  if (process.argv.includes('--init')) {
    console.log('[DB] Tables creees avec succes.');
    console.log('[DB] Tables: conversations, leads, clients');
    process.exit(0);
  }

  return db;
}

/**
 * Retourne l'instance de la base de donnees
 */
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * Sauvegarde un nouveau lead
 */
function saveLead({ phone, pushName, sector, firstMessage, intent }) {
  const database = getDb();
  try {
    database.prepare(`
      INSERT INTO leads (phone, push_name, sector, first_message, intent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        push_name = COALESCE(?, push_name),
        sector = COALESCE(?, sector),
        updated_at = datetime('now')
    `).run(phone, pushName, sector, firstMessage, intent, pushName, sector);
  } catch (err) {
    console.error('[DB] Erreur sauvegarde lead:', err.message);
  }
}

module.exports = { initDatabase, getDb, saveLead };
