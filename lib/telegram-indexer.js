#!/usr/bin/env node
/**
 * Telegram Message History Indexer
 * Fetches all Telegram chat history and stores it in messages.sqlite
 * 
 * Uses Telegram Client API (MTProto) for full message access
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Configuration
const DB_PATH = path.join(process.env.HOME, '.openclaw', 'messages.sqlite');
const SESSION_PATH = path.join(process.env.HOME, '.openclaw', 'telegram-session.txt');
const CONFIG_PATH = path.join(process.env.HOME, '.openclaw', 'telegram-client-config.json');

// Telegram API credentials (need to be obtained from https://my.telegram.org)
let API_ID, API_HASH, PHONE_NUMBER;

// Load or create config
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('[telegram-indexer] ⚠️  No Telegram API credentials found');
    console.log('[telegram-indexer] Get credentials from https://my.telegram.org/apps');
    console.log('[telegram-indexer] Then create', CONFIG_PATH);
    console.log('[telegram-indexer] Format: {"apiId": 12345, "apiHash": "abc...", "phoneNumber": "+1234567890"}');
    process.exit(1);
  }
  
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  API_ID = config.apiId;
  API_HASH = config.apiHash;
  PHONE_NUMBER = config.phoneNumber;
  
  if (!API_ID || !API_HASH) {
    console.error('[telegram-indexer] ❌ Invalid config: missing apiId or apiHash');
    process.exit(1);
  }
  
  if (!PHONE_NUMBER) {
    console.error('[telegram-indexer] ❌ Invalid config: missing phoneNumber');
    process.exit(1);
  }
  
  console.log(`[telegram-indexer] ✅ Loaded API credentials (ID: ${API_ID})`);
}

// Load existing session or create new
function loadSession() {
  if (fs.existsSync(SESSION_PATH)) {
    const sessionString = fs.readFileSync(SESSION_PATH, 'utf8').trim();
    console.log('[telegram-indexer] ✅ Loaded existing session');
    return new StringSession(sessionString);
  } else {
    console.log('[telegram-indexer] Creating new session (will need phone auth)');
    return new StringSession('');
  }
}

// Save session for reuse
function saveSession(client) {
  const sessionString = client.session.save();
  fs.writeFileSync(SESSION_PATH, sessionString, 'utf8');
  fs.chmodSync(SESSION_PATH, 0o600); // Secure permissions
  console.log('[telegram-indexer] ✅ Session saved');
}

// Database operations
class MessageDB {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better concurrency
  }

  // Insert or get chat
  upsertChat(channel, chatId, chatType, title) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO chats (channel, chat_id, chat_type, title, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(channel, chatId, chatType, title, Math.floor(Date.now() / 1000));
    
    const chat = this.db.prepare('SELECT id FROM chats WHERE channel = ? AND chat_id = ?').get(channel, chatId);
    return chat.id;
  }

  // Insert message (skip duplicates)
  insertMessage(chatFk, channel, messageId, senderId, senderName, text, timestamp, hasMedia, mediaType) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        chat_fk, channel, message_id, sender_id, sender_name, text, timestamp, has_media, media_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const info = stmt.run(
      chatFk, channel, String(messageId), String(senderId || ''), 
      senderName || '', text || '', timestamp, hasMedia ? 1 : 0, mediaType || null
    );
    
    return info.changes > 0; // true if inserted (not duplicate)
  }

  // Get last indexed message ID for a chat
  getLastMessageId(channel, chatId) {
    const chat = this.db.prepare('SELECT id, last_message_id FROM chats WHERE channel = ? AND chat_id = ?')
      .get(channel, chatId);
    return chat ? chat.last_message_id : null;
  }

  // Update last indexed message ID
  updateLastMessageId(channel, chatId, messageId) {
    this.db.prepare(`
      UPDATE chats 
      SET last_message_id = ?, last_indexed_at = ? 
      WHERE channel = ? AND chat_id = ?
    `).run(String(messageId), Math.floor(Date.now() / 1000), channel, chatId);
  }

  // Stats
  stats() {
    const chats = this.db.prepare('SELECT COUNT(*) as count FROM chats WHERE channel = ?').get('telegram');
    const messages = this.db.prepare('SELECT COUNT(*) as count FROM messages WHERE channel = ?').get('telegram');
    return { chats: chats.count, messages: messages.count };
  }

  close() {
    this.db.close();
  }
}

// Main indexing logic
async function indexTelegramHistory() {
  loadConfig();
  
  const session = loadSession();
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  console.log('[telegram-indexer] Connecting to Telegram...');
  await client.start({
    phoneNumber: async () => PHONE_NUMBER,
    password: async () => await input.text('Enter your 2FA password (if enabled): '),
    phoneCode: async () => await input.text('Enter the code you received: '),
    onError: (err) => console.error('[telegram-indexer] Auth error:', err),
  });

  console.log('[telegram-indexer] ✅ Connected to Telegram');
  saveSession(client);

  const db = new MessageDB(DB_PATH);
  let stats = db.stats();
  console.log(`[telegram-indexer] Current: ${stats.chats} chats, ${stats.messages} messages`);

  // Get all dialogs (chats/groups/channels)
  console.log('[telegram-indexer] Fetching dialogs...');
  const dialogs = await client.getDialogs({ limit: 500 }); // Increase if you have >500 chats
  console.log(`[telegram-indexer] Found ${dialogs.length} total dialogs`);
  console.log('[telegram-indexer] Indexing: DMs + small groups (<50 members). Skipping: channels + large groups.');

  let totalNewMessages = 0;
  let skippedCount = 0;
  
  for (const [index, dialog] of dialogs.entries()) {
    const chatId = String(dialog.id);
    const chatType = dialog.isUser ? 'private' : dialog.isGroup ? 'group' : 'channel';
    const title = dialog.title || dialog.name || 'Unknown';
    
    // Skip channels (broadcast only)
    if (chatType === 'channel') {
      skippedCount++;
      continue;
    }
    
    // Skip large groups (likely noise)
    if (chatType === 'group') {
      // `Entity` is a union (User | Chat | Channel); only some members declare
      // participantsCount. The optional chain already makes this safe at
      // runtime — the cast just tells tsc what the guard is protecting.
      const entity = /** @type {{ participantsCount?: number } | undefined} */ (dialog.entity);
      const participantsCount = entity?.participantsCount || 0;
      if (participantsCount > 50) {
        console.log(`\n[${index + 1}/${dialogs.length}] GROUP: ${title} (${participantsCount} members) — SKIPPED`);
        skippedCount++;
        continue;
      }
    }
    
    console.log(`\n[${index + 1}/${dialogs.length}] ${chatType.toUpperCase()}: ${title}`);
    
    // Upsert chat
    const chatFk = db.upsertChat('telegram', chatId, chatType, title);
    
    // TODO: incremental updates. The last-indexed id was read here and never
    // used, so the read is removed rather than left looking load-bearing;
    // wire db.getLastMessageId('telegram', chatId) in when the incremental
    // fetch is actually implemented.
    
    // Fetch messages
    console.log(`  Fetching messages...`);
    let newMessages = 0;
    let processedMessages = 0;
    
    try {
      const messages = await client.getMessages(dialog.entity, {
        limit: 1000, // Fetch up to 1000 most recent messages per chat (adjust as needed)
      });
      
      for (const msg of messages) {
        if (!msg.message && !msg.media) continue; // Skip service messages
        
        const messageId = String(msg.id);
        const senderId = msg.senderId ? String(msg.senderId) : null;
        // Same union narrowing as above: a sender may be a User (firstName) or a
        // Chat/Channel (username); neither is declared on every member.
        const sender = /** @type {{ firstName?: string, username?: string } | undefined} */ (msg.sender);
        const senderName = sender?.firstName || sender?.username || 'Unknown';
        const text = msg.message || '';
        const timestamp = Math.floor(msg.date);
        const hasMedia = !!msg.media;
        const mediaType = msg.media?.className || null;
        
        const inserted = db.insertMessage(
          chatFk, 'telegram', messageId, senderId, senderName, 
          text, timestamp, hasMedia, mediaType
        );
        
        if (inserted) newMessages++;
        processedMessages++;
      }
      
      // Update last message ID
      if (messages.length > 0) {
        const latestMessageId = String(messages[0].id);
        db.updateLastMessageId('telegram', chatId, latestMessageId);
      }
      
      console.log(`  ✅ ${newMessages} new, ${processedMessages - newMessages} duplicates`);
      totalNewMessages += newMessages;
      
    } catch (error) {
      console.error(`  ❌ Error fetching messages:`, error.message);
    }
  }

  // Final stats
  stats = db.stats();
  console.log(`\n[telegram-indexer] ✅ Indexing complete`);
  console.log(`[telegram-indexer] Indexed: ${stats.chats} chats, ${stats.messages} messages (+${totalNewMessages} new)`);
  console.log(`[telegram-indexer] Skipped: ${skippedCount} chats (channels + large groups)`);
  console.log(`[telegram-indexer] Skipped: ${skippedCount} chats (channels + large groups)`);
  
  db.close();
  await client.disconnect();
}

// Run
if (require.main === module) {
  indexTelegramHistory().catch(err => {
    console.error('[telegram-indexer] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { indexTelegramHistory };
