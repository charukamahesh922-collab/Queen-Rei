// ╔══════════════════════════════════════════════╗
// ║  👑 QUEEN REI — Baileys Connection           ║
// ║  QR login + name fix + auto-react            ║
// ╚══════════════════════════════════════════════╝

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const config = require('../config');

const logger = pino({ level: 'silent' });

let sock = null;

async function startBot() {
  // 1. Load or create session credentials
  const { state, saveCreds } = await useMultiFileAuthState(
    `./${config.sessionName || 'queen-rei'}`
  );

  // 2. Get latest WhatsApp Web version
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📡 WhatsApp Web version: ${version.join('.')} (latest: ${isLatest})`);

  // 3. Create socket
  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Queen Rei', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
  });

  // 4. Persist credentials
  sock.ev.on('creds.update', saveCreds);

  // 5. Connection lifecycle
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ── QR CODE ──
    if (qr) {
      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  👑 QUEEN REI — SCAN TO LOGIN        ║');
      console.log('╚══════════════════════════════════════╝');
      console.log('📱 WhatsApp → Linked Devices → Link a Device\n');
      qrcode.generate(qr, { small: true });
    }

    // ── CONNECTED ──
    if (connection === 'open') {
      const me = sock.user;
      const myNumber = me?.id?.split(':')[0]?.split('@')[0];

      // Proactively set profile name if missing (fixes "Unknown")
      if (!me?.name) {
        try {
          await sock.updateProfileName(config.botName || 'Queen Rei');
          console.log(`✅ Profile name set to: ${config.botName || 'Queen Rei'}`);
        } catch (err) {
          console.log('⚠️ Could not set profile name:', err.message);
        }
      }

      // Wait for WhatsApp to sync profile data
      await new Promise((r) => setTimeout(r, 3000));

      const updatedMe = sock.user;
      const displayName =
        updatedMe?.name ||
        updatedMe?.verifiedName ||
        config.botName ||
        'Queen Rei';

      console.log('\n╔══════════════════════════════════════╗');
      console.log('║  ✅ QUEEN REI IS ONLINE              ║');
      console.log('╚══════════════════════════════════════╝');
      console.log(`👑 Logged in as: ${displayName}`);
      console.log(`📞 Number: ${myNumber}`);
      console.log(`⚡ Prefix: ${config.prefix || '!'}\n`);

      // Send connected message to bot's own number, then react to it
      try {
        const sentMsg = await sock.sendMessage(`${myNumber}@s.whatsapp.net`, {
          text:
            '👑 *QUEEN REI IS ONLINE*\n\n' +
            `⚜️ Version: ${config.version}\n` +
            `👑 Name: ${displayName}\n` +
            `📞 Number: ${myNumber}\n` +
            `⚡ Prefix: ${config.prefix}\n\n` +
            '👑 At your service, my Queen.',
        });
        console.log('📨 Connected message sent.');

        // 👑 React to the connected message
        if (sentMsg?.key) {
          await new Promise((r) => setTimeout(r, 800));
          try {
            await sock.sendMessage(sentMsg.key.remoteJid, {
              react: { text: '👑', key: sentMsg.key },
            });
            console.log('👑 Reacted to connected message.');
          } catch (e) {
            console.log('⚠️ Reaction failed:', e.message);
          }
        }
      } catch (err) {
        console.log('⚠️ Could not send connected message:', err.message);
      }
    }

    // ── DISCONNECTED ──
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('🚪 Logged out. Delete the session folder and restart to re-scan.');
        process.exit(0);
      }

      if (statusCode === DisconnectReason.restartRequired) {
        console.log('🔄 Restart required (normal after pairing). Reconnecting...');
      } else if (statusCode === DisconnectReason.connectionClosed) {
        console.log('🔌 Connection closed. Reconnecting...');
      } else if (statusCode === DisconnectReason.connectionLost) {
        console.log('📡 Connection lost. Reconnecting...');
      } else if (statusCode === DisconnectReason.timedOut) {
        console.log('⏱️ Connection timed out. Reconnecting...');
      } else {
        console.log(`⚠️ Disconnected (code ${statusCode}). Reconnecting...`);
      }

      setTimeout(() => startBot(), 3000);
    }
  });

  // 6. Message handler
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      // Skip undecryptable messages to prevent queue blocking
      const stub = msg.messageStubParameters || [];
      const broken = stub.some((p) =>
        ['No matching sessions', 'Bad MAC', 'SessionError'].some((e) =>
          p?.includes?.(e)
        )
      );
      if (broken) continue;

      // 👑 React to every incoming message
      try {
        await sock.sendMessage(msg.key.remoteJid, {
          react: {
            text: '👑',
            key: msg.key,
          },
        });
      } catch (_) {}

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      const prefix = config.prefix || '!';
      const cmd = text.toLowerCase();

      // Ping
      if (cmd === `${prefix}ping`) {
        await sock.sendMessage(msg.key.remoteJid, {
          text: '👑 Pong! Queen Rei is alive. ⚜️',
        });
      }

      // Menu
      if (cmd === `${prefix}menu` || cmd === `${prefix}help`) {
        await sock.sendMessage(msg.key.remoteJid, {
          text:
            '👑 *QUEEN REI — MENU*\n\n' +
            `⚡ Prefix: ${prefix}\n\n` +
            `• ${prefix}ping — Check if bot is alive\n` +
            `• ${prefix}menu — Show this menu\n\n` +
            '👑 More commands coming soon.',
        });
      }
    }
  });

  return sock;
}

module.exports = { startBot, getSock: () => sock };
