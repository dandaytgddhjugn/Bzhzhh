require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';
const WEBHOOK_URL = process.env.WEBHOOK_URL || '';

// ── STORAGE ORDER (in-memory, reset tiap restart) ──────────
const orders = new Map();

// ── MULTER ─────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diterima'));
  }
});

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH CHECK ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: '✅ Online',
    bot_token: BOT_TOKEN ? '✅ Set' : '❌ TIDAK DISET',
    admin_chat_id: ADMIN_CHAT_ID ? '✅ Set' : '❌ TIDAK DISET',
    webhook_url: WEBHOOK_URL || '❌ TIDAK DISET',
    total_orders: orders.size,
    pending: [...orders.values()].filter(o => o.status === 'pending').length,
    confirmed: [...orders.values()].filter(o => o.status === 'confirmed').length,
    rejected: [...orders.values()].filter(o => o.status === 'rejected').length,
    uptime: process.uptime().toFixed(0) + 's'
  });
});

// ── API: SUBMIT ORDER ──────────────────────────────────────
app.post('/api/order', upload.single('bukti'), async (req, res) => {
  console.log('📥 Order masuk:', req.body?.orderId);
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Upload bukti pembayaran dulu!' });
    if (!BOT_TOKEN) return res.status(500).json({ ok: false, message: 'BOT_TOKEN belum diset di Railway Variables!' });
    if (!ADMIN_CHAT_ID) return res.status(500).json({ ok: false, message: 'ADMIN_CHAT_ID belum diset di Railway Variables! Dapatkan dari @userinfobot di Telegram.' });

    const { orderId, game, gameName, uidLabel, userId, server, paket, total } = req.body;
    if (!orderId || !userId || !paket) return res.status(400).json({ ok: false, message: 'Data order tidak lengkap!' });

    orders.set(orderId, {
      orderId, game, gameName, uidLabel, userId,
      server: server || '', paket, total,
      status: 'pending',
      time: new Date().toISOString(),
      imageBuffer: req.file.buffer,
      imageMime: req.file.mimetype
    });

    await kirimNotifAdmin(orderId);
    console.log('✅ Order terkirim ke Telegram:', orderId);
    res.json({ ok: true, orderId });

  } catch (err) {
    console.error('❌ Order error:', err.message);
    res.status(500).json({ ok: false, message: 'Gagal kirim ke admin: ' + err.message });
  }
});

// ── KIRIM NOTIF ADMIN ──────────────────────────────────────
async function kirimNotifAdmin(orderId) {
  const o = orders.get(orderId);
  if (!o) return;

  const waktu = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  const teks =
`🔔 *ORDER BARU MASUK!*
━━━━━━━━━━━━━━━━━━━━
🆔 *Order ID:* \`#${o.orderId}\`
🎮 *Game:* ${o.gameName}
👤 *${o.uidLabel}:* \`${o.userId}\`${o.server ? `\n🖥 *Server/Zone:* \`${o.server}\`` : ''}
💎 *Paket:* ${o.paket}
💰 *Total Bayar:* *${o.total}*
📅 *Waktu:* ${waktu} WIB
━━━━━━━━━━━━━━━━━━━━
📸 _Cek foto bukti transfer di bawah_`;

  // 1. Kirim teks
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: teks,
    parse_mode: 'Markdown'
  });

  // 2. Kirim foto bukti
  const fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, {
    filename: `bukti_${o.orderId}.jpg`,
    contentType: o.imageMime
  });
  fd.append('caption',
    `📸 Bukti Transfer — #${o.orderId}\n` +
    `🎮 ${o.gameName} | ${o.paket}\n` +
    `💰 ${o.total}\n` +
    `👤 ${o.uidLabel}: ${o.userId}${o.server ? ' / ' + o.server : ''}`
  );
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, fd, {
    headers: fd.getHeaders(), timeout: 30000
  });

  // 3. Kirim tombol aksi
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: `⚡ *Aksi cepat untuk Order #${o.orderId}*\n\nPilih tindakan di bawah:`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ KONFIRMASI', callback_data: `ok_${o.orderId}` },
          { text: '❌ TOLAK', callback_data: `no_${o.orderId}` }
        ],
        [
          { text: '📋 Detail Order', callback_data: `det_${o.orderId}` }
        ]
      ]
    }
  });
}

// ── WEBHOOK TELEGRAM ───────────────────────────────────────
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // Balas cepat
  const u = req.body;
  if (!u) return;

  try {
    // ── CALLBACK QUERY (tombol inline) ──
    if (u.callback_query) {
      const cb = u.callback_query;
      const chatId = String(cb.message.chat.id);
      const msgId = cb.message.message_id;
      const data = cb.data;

      // Jawab callback agar loading hilang
      await tg('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: '⏳ Memproses...'
      }).catch(() => {});

      if (String(chatId) !== String(ADMIN_CHAT_ID)) {
        await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '⛔ Bukan admin!' }).catch(() => {});
        return;
      }

      if (data.startsWith('ok_')) {
        await prosesKonfirmasi(data.replace('ok_', ''), chatId, msgId, cb.id);
      } else if (data.startsWith('no_')) {
        await prosesTolak(data.replace('no_', ''), chatId, msgId, cb.id);
      } else if (data.startsWith('det_')) {
        await detailOrder(data.replace('det_', ''), chatId);
      } else if (data === 'menu_orders') {
        await cmdOrders(chatId);
      } else if (data === 'menu_stats') {
        await cmdStats(chatId);
      } else if (data === 'done') {
        await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '✅ Sudah diproses' }).catch(() => {});
      }
      return;
    }

    // ── PESAN TEKS ──
    if (!u.message) return;
    const msg = u.message;
    const chatId = String(msg.chat.id);
    const text = (msg.text || '').trim();
    const firstName = msg.from?.first_name || 'Admin';

    // Cek bukan admin
    if (chatId !== String(ADMIN_CHAT_ID)) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: `⛔ *Akses Ditolak*\n\nBot ini khusus untuk admin GameStore ID.\n\nID kamu: \`${chatId}\``,
        parse_mode: 'Markdown'
      });
      return;
    }

    // ── COMMAND HANDLER ──
    const cmd = text.split(' ')[0].toLowerCase().replace('@' + (process.env.BOT_USERNAME || ''), '');

    switch (cmd) {
      case '/start':
        await cmdStart(chatId, firstName);
        break;

      case '/help':
        await cmdHelp(chatId);
        break;

      case '/orders':
        await cmdOrders(chatId);
        break;

      case '/stats':
        await cmdStats(chatId);
        break;

      case '/cek': {
        const oid = text.split(' ')[1];
        if (!oid) { await kirimPesan(chatId, '❌ Format: `/cek ORDERID`\nContoh: `/cek ABC123`'); return; }
        await detailOrder(oid, chatId);
        break;
      }

      case '/konfirmasi': {
        const oid = text.split(' ')[1];
        if (!oid) { await kirimPesan(chatId, '❌ Format: `/konfirmasi ORDERID`\nContoh: `/konfirmasi ABC123`'); return; }
        await prosesKonfirmasi(oid, chatId, null, null);
        break;
      }

      case '/tolak': {
        const oid = text.split(' ')[1];
        if (!oid) { await kirimPesan(chatId, '❌ Format: `/tolak ORDERID`\nContoh: `/tolak ABC123`'); return; }
        await prosesTolak(oid, chatId, null, null);
        break;
      }

      case '/hapus': {
        const oid = text.split(' ')[1];
        if (!oid) { await kirimPesan(chatId, '❌ Format: `/hapus ORDERID`'); return; }
        if (!orders.has(oid)) { await kirimPesan(chatId, `❌ Order \`#${oid}\` tidak ditemukan.`); return; }
        orders.delete(oid);
        await kirimPesan(chatId, `🗑 Order \`#${oid}\` berhasil dihapus.`);
        break;
      }

      case '/reset': {
        const jumlah = orders.size;
        orders.clear();
        await kirimPesan(chatId, `🗑 Semua order (${jumlah}) berhasil dihapus/direset.`);
        break;
      }

      case '/pending':
        await cmdPending(chatId);
        break;

      case '/confirmed':
        await cmdConfirmed(chatId);
        break;

      case '/id':
        await kirimPesan(chatId,
          `🆔 *Info Akun Telegram Kamu*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 Nama: ${firstName}\n` +
          `🆔 Chat ID: \`${chatId}\`\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `_Gunakan ID ini untuk ADMIN\\_CHAT\\_ID di Railway_`
        );
        break;

      case '/status':
        await cmdStatus(chatId);
        break;

      default:
        // Cek format lama: /konfirmasi_ORDERID
        if (text.startsWith('/konfirmasi_')) {
          await prosesKonfirmasi(text.replace('/konfirmasi_', '').trim(), chatId, null, null);
        } else if (text.startsWith('/tolak_')) {
          await prosesTolak(text.replace('/tolak_', '').trim(), chatId, null, null);
        } else {
          await tg('sendMessage', {
            chat_id: chatId,
            text: `❓ Perintah tidak dikenal: \`${cmd}\`\n\nKetik /help untuk daftar perintah.`,
            parse_mode: 'Markdown'
          });
        }
    }

  } catch (err) {
    console.error('❌ Webhook handler error:', err.message);
  }
});

// ── COMMAND FUNCTIONS ──────────────────────────────────────

async function cmdStart(chatId, firstName) {
  await tg('sendMessage', {
    chat_id: chatId,
    text:
`🎮 *Selamat datang, ${firstName}!*
━━━━━━━━━━━━━━━━━━━━
*Bot Admin GameStore ID* siap melayani ✅

Kamu akan menerima notifikasi otomatis setiap kali ada order masuk beserta bukti transfer dan tombol konfirmasi.

Gunakan menu di bawah atau ketik perintah:`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '📦 Order Pending', callback_data: 'menu_orders' },
          { text: '📊 Statistik', callback_data: 'menu_stats' }
        ],
        [
          { text: '📖 Bantuan / Help', callback_data: 'noop' }
        ]
      ]
    }
  });
}

async function cmdHelp(chatId) {
  await kirimPesan(chatId,
`📖 *Daftar Perintah Bot Admin GameStore ID*
━━━━━━━━━━━━━━━━━━━━

*📋 INFO & NAVIGASI*
/start — Menu utama
/help — Panduan ini
/id — Lihat Chat ID kamu
/status — Status bot & server

*📦 MANAJEMEN ORDER*
/orders — Semua order (pending + konfirmasi)
/pending — Khusus order pending
/confirmed — Khusus order terkonfirmasi
/cek ORDERID — Detail 1 order
/stats — Statistik penjualan hari ini

*✅ PROSES ORDER*
/konfirmasi ORDERID — Konfirmasi order
/tolak ORDERID — Tolak order

*🗑 HAPUS DATA*
/hapus ORDERID — Hapus 1 order
/reset — Hapus semua order

*📌 CONTOH PENGGUNAAN*
\`/cek MN0H1A5MNEAW\`
\`/konfirmasi MN0H1A5MNEAW\`
\`/tolak MN0H1A5MNEAW\`

━━━━━━━━━━━━━━━━━━━━
💡 _Order baru otomatis masuk + ada tombol ✅ ❌_`
  );
}

async function cmdOrders(chatId) {
  const all = [...orders.values()];
  if (all.length === 0) {
    await kirimPesan(chatId, '📭 Belum ada order masuk hari ini.');
    return;
  }
  const pending = all.filter(o => o.status === 'pending');
  const confirmed = all.filter(o => o.status === 'confirmed');
  const rejected = all.filter(o => o.status === 'rejected');

  let teks = `📦 *Semua Order (${all.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
  teks += `🟡 Pending: ${pending.length} | ✅ Konfirmasi: ${confirmed.length} | ❌ Tolak: ${rejected.length}\n━━━━━━━━━━━━━━━━━━━━\n`;

  const tampil = all.slice(-10).reverse(); // 10 terbaru
  tampil.forEach((o, i) => {
    const wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const statusIcon = o.status === 'pending' ? '🟡' : o.status === 'confirmed' ? '✅' : '❌';
    teks += `\n${statusIcon} *#${o.orderId}*\n`;
    teks += `   🎮 ${o.gameName} — ${o.paket}\n`;
    teks += `   👤 ${o.userId}${o.server ? ' / ' + o.server : ''}\n`;
    teks += `   💰 ${o.total} | ⏰ ${wkt}\n`;
  });

  if (all.length > 10) teks += `\n_...dan ${all.length - 10} order lainnya_`;
  await kirimPesan(chatId, teks);
}

async function cmdPending(chatId) {
  const pending = [...orders.values()].filter(o => o.status === 'pending');
  if (pending.length === 0) {
    await kirimPesan(chatId, '✅ Tidak ada order pending saat ini. Semua sudah diproses!');
    return;
  }
  let teks = `🟡 *Order Pending (${pending.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
  pending.forEach((o, i) => {
    const wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += `\n*${i+1}. #${o.orderId}*\n`;
    teks += `   🎮 ${o.gameName} — ${o.paket}\n`;
    teks += `   👤 ${o.userId}${o.server ? ' / ' + o.server : ''}\n`;
    teks += `   💰 ${o.total}\n`;
    teks += `   ⏰ ${wkt}\n`;
    teks += `   ➡️ /konfirmasi ${o.orderId}\n`;
  });
  await kirimPesan(chatId, teks);
}

async function cmdConfirmed(chatId) {
  const confirmed = [...orders.values()].filter(o => o.status === 'confirmed');
  if (confirmed.length === 0) {
    await kirimPesan(chatId, '📭 Belum ada order yang dikonfirmasi.');
    return;
  }
  let teks = `✅ *Order Terkonfirmasi (${confirmed.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
  confirmed.slice(-10).reverse().forEach((o, i) => {
    const wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += `\n*${i+1}. #${o.orderId}* ✅\n`;
    teks += `   🎮 ${o.gameName} — ${o.paket}\n`;
    teks += `   👤 ${o.userId}\n`;
    teks += `   💰 ${o.total} | ⏰ ${wkt}\n`;
  });
  await kirimPesan(chatId, teks);
}

async function cmdStats(chatId) {
  const all = [...orders.values()];
  const today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const todayO = all.filter(o =>
    new Date(o.time).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }) === today
  );

  // Hitung total pendapatan hari ini (dari order confirmed)
  const todayConfirmed = todayO.filter(o => o.status === 'confirmed');

  // Per game stats
  const gameStats = {};
  all.forEach(o => {
    if (!gameStats[o.game]) gameStats[o.game] = { name: o.gameName, count: 0 };
    gameStats[o.game].count++;
  });

  let gameLine = '';
  Object.values(gameStats).sort((a,b) => b.count - a.count).forEach(g => {
    gameLine += `   • ${g.name}: ${g.count} order\n`;
  });

  await kirimPesan(chatId,
`📊 *Statistik GameStore ID*
━━━━━━━━━━━━━━━━━━━━
📅 *Hari ini (${today}):*
   📥 Masuk: ${todayO.length}
   ✅ Dikonfirmasi: ${todayConfirmed.length}

📦 *Total Semua Order:*
   🟡 Pending: ${all.filter(o=>o.status==='pending').length}
   ✅ Konfirmasi: ${all.filter(o=>o.status==='confirmed').length}
   ❌ Ditolak: ${all.filter(o=>o.status==='rejected').length}
   📊 Grand Total: ${all.length}

🎮 *Per Game:*
${gameLine || '   Belum ada order'}
━━━━━━━━━━━━━━━━━━━━
🌐 Web: ${WEBHOOK_URL || 'belum diset'}`
  );
}

async function cmdStatus(chatId) {
  const uptimeSec = process.uptime();
  const jam = Math.floor(uptimeSec / 3600);
  const menit = Math.floor((uptimeSec % 3600) / 60);
  const detik = Math.floor(uptimeSec % 60);
  const uptimeStr = `${jam}j ${menit}m ${detik}d`;

  await kirimPesan(chatId,
`🖥 *Status Bot & Server*
━━━━━━━━━━━━━━━━━━━━
🤖 Bot: ✅ Online
🌐 Server: ✅ Jalan
⏱ Uptime: ${uptimeStr}
📦 Total Order: ${orders.size}
🟡 Pending: ${[...orders.values()].filter(o=>o.status==='pending').length}
━━━━━━━━━━━━━━━━━━━━
🔗 URL: ${WEBHOOK_URL || 'belum diset'}
🔍 Health: ${WEBHOOK_URL}/health`
  );
}

async function detailOrder(oid, chatId) {
  const o = orders.get(oid);
  if (!o) {
    await kirimPesan(chatId, `❌ Order \`#${oid}\` tidak ditemukan.\n\nPastikan Order ID benar (huruf besar semua).`);
    return;
  }
  const wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const statusTeks = o.status === 'pending' ? '🟡 Menunggu konfirmasi' : o.status === 'confirmed' ? '✅ Sudah dikonfirmasi' : '❌ Ditolak';

  const teks =
`📋 *Detail Order #${oid}*
━━━━━━━━━━━━━━━━━━━━
🎮 Game: ${o.gameName}
👤 ${o.uidLabel}: \`${o.userId}\`${o.server ? `\n🖥 Server: \`${o.server}\`` : ''}
💎 Paket: ${o.paket}
💰 Total: ${o.total}
📅 Waktu: ${wkt} WIB
📌 Status: ${statusTeks}`;

  if (o.status === 'pending') {
    await tg('sendMessage', {
      chat_id: chatId,
      text: teks,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ KONFIRMASI', callback_data: `ok_${oid}` },
          { text: '❌ TOLAK', callback_data: `no_${oid}` }
        ]]
      }
    });
  } else {
    await kirimPesan(chatId, teks);
  }
}

// ── PROSES KONFIRMASI ──────────────────────────────────────
async function prosesKonfirmasi(oid, chatId, msgId, cbId) {
  const o = orders.get(oid);
  if (!o) {
    await kirimPesan(chatId, `❌ Order \`#${oid}\` tidak ditemukan.`);
    return;
  }
  if (o.status !== 'pending') {
    await kirimPesan(chatId, `⚠️ Order \`#${oid}\` sudah diproses dengan status: *${o.status}*`);
    return;
  }

  o.status = 'confirmed';
  orders.set(oid, o);

  // Update tombol
  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: { inline_keyboard: [[{ text: '✅ SUDAH DIKONFIRMASI', callback_data: 'done' }]] }
    }).catch(() => {});
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text:
`✅ *ORDER #${oid} DIKONFIRMASI!*
━━━━━━━━━━━━━━━━━━━━
🎮 ${o.gameName}
👤 ${o.uidLabel}: \`${o.userId}\`${o.server ? `\n🖥 Server: \`${o.server}\`` : ''}
💎 Paket: ${o.paket}
💰 Total: ${o.total}
━━━━━━━━━━━━━━━━━━━━
⚡ *Silakan proses top up sekarang!*
_Buka game dan lakukan top up ke ID di atas_`,
    parse_mode: 'Markdown'
  });
}

// ── PROSES TOLAK ───────────────────────────────────────────
async function prosesTolak(oid, chatId, msgId, cbId) {
  const o = orders.get(oid);
  if (!o) {
    await kirimPesan(chatId, `❌ Order \`#${oid}\` tidak ditemukan.`);
    return;
  }
  if (o.status !== 'pending') {
    await kirimPesan(chatId, `⚠️ Order \`#${oid}\` sudah diproses dengan status: *${o.status}*`);
    return;
  }

  o.status = 'rejected';
  orders.set(oid, o);

  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: msgId,
      reply_markup: { inline_keyboard: [[{ text: '❌ SUDAH DITOLAK', callback_data: 'done' }]] }
    }).catch(() => {});
  }

  await tg('sendMessage', {
    chat_id: chatId,
    text:
`❌ *ORDER #${oid} DITOLAK*
━━━━━━━━━━━━━━━━━━━━
🎮 ${o.gameName} — ${o.paket}
👤 ${o.userId}
💰 ${o.total}
━━━━━━━━━━━━━━━━━━━━
_Jika ada kesalahan pembayaran, hubungi pembeli._`,
    parse_mode: 'Markdown'
  });
}

// ── HELPER: KIRIM PESAN ────────────────────────────────────
async function kirimPesan(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

// ── HELPER: TELEGRAM API WRAPPER (anti-error) ──────────────
async function tg(method, data, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
        data,
        { timeout: 15000 }
      );
      return res.data;
    } catch (err) {
      const isLast = i === retries - 1;
      const code = err.response?.data?.error_code;
      const desc = err.response?.data?.description || err.message;

      // Jangan retry untuk error permanen
      if (code === 400 || code === 403) {
        console.error(`❌ Telegram ${method} error ${code}: ${desc}`);
        return null;
      }

      if (isLast) {
        console.error(`❌ Telegram ${method} gagal setelah ${retries}x: ${desc}`);
        return null;
      }

      // Tunggu sebelum retry
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

// ── SETUP WEBHOOK ──────────────────────────────────────────
async function setupWebhook() {
  if (!BOT_TOKEN) { console.log('⚠️  BOT_TOKEN tidak diset, skip webhook'); return; }
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('your-app')) { console.log('⚠️  WEBHOOK_URL belum diset, skip webhook'); return; }

  try {
    // Hapus webhook lama dulu
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
    await new Promise(r => setTimeout(r, 1000));

    const webhookUrl = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
    const res = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      url: webhookUrl,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });

    if (res.data.ok) {
      console.log('✅ Webhook aktif:', webhookUrl);
      // Kirim notif ke admin bahwa bot aktif
      await tg('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        text: `🚀 *Bot GameStore ID Online!*\n\nWebhook aktif. Bot siap menerima order.\n\nKetik /start untuk mulai.`,
        parse_mode: 'Markdown'
      }).catch(() => {});
    } else {
      console.log('⚠️  Webhook gagal:', res.data.description);
    }
  } catch (err) {
    console.error('❌ Setup webhook error:', err.message);
  }
}

// ── START SERVER ───────────────────────────────────────────
app.listen(PORT, async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 GameStore ID Server Started');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🤖 BOT_TOKEN: ${BOT_TOKEN ? '✅ Set' : '❌ TIDAK DISET!'}`);
  console.log(`👤 ADMIN_CHAT_ID: ${ADMIN_CHAT_ID ? '✅ Set' : '❌ TIDAK DISET!'}`);
  console.log(`🌐 WEBHOOK_URL: ${WEBHOOK_URL || '❌ TIDAK DISET!'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await setupWebhook();
});
