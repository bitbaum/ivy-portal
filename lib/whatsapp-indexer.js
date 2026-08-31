#!/usr/bin/env node
/**
 * WhatsApp Message History Indexer
 * Fetches all WhatsApp chat history and stores it in messages.sqlite
 *
 * Uses whatsapp-web.js (same as OpenClaw gateway)
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Database = require('better-sqlite3');
const path = require('path');

// Configuration
const DB_PATH = path.join(process.env.HOME, '.openclaw', 'messages.sqlite');
const SESSION_PATH = path.join(process.env.HOME, '.openclaw', 'whatsapp-indexer-session');

// Database operations (reuse from telegram-indexer)
class MessageDB {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  upsertChat(channel, chatId, chatType, title) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO chats (channel, chat_id, chat_type, title, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(channel, chatId, chatType, title, Math.floor(Date.now() / 1000));

    const chat = this.db
      .prepare('SELECT id FROM chats WHERE channel = ? AND chat_id = ?')
      .get(channel, chatId);
    return chat.id;
  }

  insertMessage(
    chatFk,
    channel,
    messageId,
    senderId,
    senderName,
    text,
    timestamp,
    hasMedia,
    mediaType,
  ) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (
        chat_fk, channel, message_id, sender_id, sender_name, text, timestamp, has_media, media_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      chatFk,
      channel,
      String(messageId),
      String(senderId || ''),
      senderName || '',
      text || '',
      timestamp,
      hasMedia ? 1 : 0,
      mediaType || null,
    );

    return info.changes > 0;
  }

  getLastMessageId(channel, chatId) {
    const chat = this.db
      .prepare('SELECT id, last_message_id FROM chats WHERE channel = ? AND chat_id = ?')
      .get(channel, chatId);
    return chat ? chat.last_message_id : null;
  }

  updateLastMessageId(channel, chatId, messageId) {
    this.db
      .prepare(
        `
      UPDATE chats 
      SET last_message_id = ?, last_indexed_at = ? 
      WHERE channel = ? AND chat_id = ?
    `,
      )
      .run(String(messageId), Math.floor(Date.now() / 1000), channel, chatId);
  }

  stats() {
    const chats = this.db
      .prepare('SELECT COUNT(*) as count FROM chats WHERE channel = ?')
      .get('whatsapp');
    const messages = this.db
      .prepare('SELECT COUNT(*) as count FROM messages WHERE channel = ?')
      .get('whatsapp');
    return { chats: chats.count, messages: messages.count };
  }

  close() {
    this.db.close();
  }
}

// Main indexing logic
async function indexWhatsAppHistory() {
  console.log('[whatsapp-indexer] Initializing WhatsApp client...');

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: 'openclaw-indexer',
      dataPath: SESSION_PATH,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // QR code for initial auth
  client.on('qr', (qr) => {
    console.log('[whatsapp-indexer] Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
  });

  // Ready event
  client.on('ready', async () => {
    console.log('[whatsapp-indexer] ✅ Connected to WhatsApp');

    const db = new MessageDB(DB_PATH);
    let stats = db.stats();
    console.log(`[whatsapp-indexer] Current: ${stats.chats} chats, ${stats.messages} messages`);

    try {
      // Get all chats
      console.log('[whatsapp-indexer] Fetching chats...');
      const chats = await client.getChats();
      console.log(`[whatsapp-indexer] Found ${chats.length} total chats`);
      console.log(
        '[whatsapp-indexer] Indexing: DMs + small groups (<50 members). Skipping: broadcast lists + large groups.',
      );

      let totalNewMessages = 0;
      let skippedCount = 0;

      for (const [index, chat] of chats.entries()) {
        const chatId = chat.id._serialized;
        const chatType = chat.isGroup ? 'group' : 'private';
        const title = chat.name || 'Unknown';

        // Skip broadcast lists
        if (chat.isBroadcast) {
          skippedCount++;
          continue;
        }

        // Skip large groups
        if (chat.isGroup) {
          const participantsCount = chat.participants?.length || 0;
          if (participantsCount > 50) {
            console.log(
              `\n[${index + 1}/${chats.length}] GROUP: ${title} (${participantsCount} members) — SKIPPED`,
            );
            skippedCount++;
            continue;
          }
        }

        console.log(`\n[${index + 1}/${chats.length}] ${chatType.toUpperCase()}: ${title}`);

        // Upsert chat
        const chatFk = db.upsertChat('whatsapp', chatId, chatType, title);

        // Fetch messages (WhatsApp limits to most recent ~40k per chat)
        console.log(`  Fetching messages...`);
        let newMessages = 0;
        let processedMessages = 0;

        try {
          const messages = await chat.fetchMessages({ limit: 1000 });

          for (const msg of messages) {
            if (msg.type === 'notification') continue; // Skip system messages

            const messageId = msg.id.id;
            const senderId = msg.from || msg.author || '';
            const senderName = msg._data?.notifyName || msg.author || 'Unknown';
            const text = msg.body || '';
            const timestamp = msg.timestamp;
            const hasMedia = msg.hasMedia;
            const mediaType = msg.type; // image, video, audio, document, etc.

            const inserted = db.insertMessage(
              chatFk,
              'whatsapp',
              messageId,
              senderId,
              senderName,
              text,
              timestamp,
              hasMedia,
              mediaType !== 'chat' ? mediaType : null,
            );

            if (inserted) newMessages++;
            processedMessages++;
          }

          // Update last message ID
          if (messages.length > 0) {
            const latestMessageId = messages[messages.length - 1].id.id;
            db.updateLastMessageId('whatsapp', chatId, latestMessageId);
          }

          console.log(`  ✅ ${newMessages} new, ${processedMessages - newMessages} duplicates`);
          totalNewMessages += newMessages;
        } catch (error) {
          console.error(`  ❌ Error fetching messages:`, error.message);
        }
      }

      // Final stats
      stats = db.stats();
      console.log(`\n[whatsapp-indexer] ✅ Indexing complete`);
      console.log(
        `[whatsapp-indexer] Indexed: ${stats.chats} chats, ${stats.messages} messages (+${totalNewMessages} new)`,
      );
      console.log(
        `[whatsapp-indexer] Skipped: ${skippedCount} chats (broadcast lists + large groups)`,
      );

      db.close();
      await client.destroy();
      process.exit(0);
    } catch (error) {
      console.error('[whatsapp-indexer] Fatal error:', error);
      db.close();
      await client.destroy();
      process.exit(1);
    }
  });

  // Auth failure
  client.on('auth_failure', (msg) => {
    console.error('[whatsapp-indexer] ❌ Authentication failed:', msg);
    process.exit(1);
  });

  // Disconnected
  client.on('disconnected', (reason) => {
    console.log('[whatsapp-indexer] Disconnected:', reason);
  });

  // Initialize
  await client.initialize();
}

// Run
if (require.main === module) {
  indexWhatsAppHistory().catch((err) => {
    console.error('[whatsapp-indexer] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { indexWhatsAppHistory };
