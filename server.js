require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN     = '8788384268:AAHGQciMG0_RCwDDvPZeEibNObaCrzFIJpU';
const ADMIN_CHAT_ID = '7352381955';
const WEBHOOK_URL   = 'https://vfhf-production.up.railway.app';

const orders = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar'));
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', function(req, res) {
  var all = Array.from(orders.values());
  res.json({
    status: 'Online',
    total_orders: all.length,
    pending: all.filter(function(o){ return o.status === 'pending'; }).length,
    confirmed: all.filter(function(o){ return o.status === 'confirmed'; }).length,
    rejected: all.filter(function(o){ return o.status === 'rejected'; }).length,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// Submit order
app.post('/api/order', upload.single('bukti'), async function(req, res) {
  console.log('ORDER masuk:', req.body && req.body.orderId);
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Upload bukti dulu!' });
    var b = req.body;
    if (!b.orderId || !b.userId || !b.paket) return res.status(400).json({ ok: false, message: 'Data tidak lengkap!' });

    orders.set(b.orderId, {
      orderId: b.orderId,
      game: b.game,
      gameName: b.gameName,
      uidLabel: b.uidLabel,
      userId: b.userId,
      server: b.server || '',
      phone: b.phone || '-',
      paket: b.paket,
      total: b.total,
      status: 'pending',
      time: new Date().toISOString(),
      imageBuffer: req.file.buffer,
      imageMime: req.file.mimetype
    });

    await kirimNotifAdmin(b.orderId);
    console.log('Terkirim ke Telegram:', b.orderId);
    res.json({ ok: true, orderId: b.orderId });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Kirim notif ke admin
async function kirimNotifAdmin(orderId) {
  var o = orders.get(orderId);
  if (!o) return;
  var waktu = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // Kirim pesan teks
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text:
'🔔 *ORDER BARU!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 ID: `#' + o.orderId + '`\n' +
'🎮 Game: ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.server ? '\n🖥 Server: `' + o.server + '`' : '') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: ' + o.paket + '\n' +
'💰 Total: *' + o.total + '*\n' +
'⏰ Waktu: ' + waktu + ' WIB\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'📸 _Bukti transfer di bawah_',
    parse_mode: 'Markdown'
  });

  // Kirim foto bukti
  var fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, {
    filename: 'bukti_' + o.orderId + '.jpg',
    contentType: o.imageMime
  });
  fd.append('caption',
    '📸 Bukti #' + o.orderId + '\n' +
    o.gameName + ' | ' + o.paket + '\n' +
    o.total + '\n' +
    o.userId + (o.server ? ' / ' + o.server : '') + '\n' +
    '📱 ' + o.phone
  );
  await axios.post(
    'https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto',
    fd,
    { headers: fd.getHeaders(), timeout: 30000 }
  );

  // Kirim tombol aksi — PENTING: callback_data harus <= 64 karakter
  // Pakai ID pendek saja
  var shortId = o.orderId.substring(0, 20); // max 20 char agar total < 64
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: '⚡ Aksi untuk order *#' + o.orderId + '*:',
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: '✅ KONFIRMASI', callback_data: 'ok:' + shortId },
          { text: '❌ TOLAK', callback_data: 'no:' + shortId }
        ],
        [
          { text: '📋 Detail Order', callback_data: 'det:' + shortId }
        ]
      ]
    })
  });
}

// Webhook Telegram
app.post('/webhook/' + BOT_TOKEN, async function(req, res) {
  res.sendStatus(200);
  var u = req.body;
  if (!u) return;

  try {
    // Callback query (tombol)
    if (u.callback_query) {
      var cb = u.callback_query;
      var cbChat = String(cb.message.chat.id);
      var cbMsg = cb.message.message_id;
      var cbData = cb.data || '';

      // Jawab callback agar loading hilang
      await tg('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: 'Memproses...'
      });

      if (cbChat !== ADMIN_CHAT_ID) return;

      // Parse prefix:shortId
      var parts = cbData.split(':');
      var prefix = parts[0];
      var shortId = parts[1] || '';

      // Cari order berdasarkan shortId (match awal orderId)
      var matchOrder = null;
      orders.forEach(function(o) {
        if (o.orderId.substring(0, 20) === shortId) matchOrder = o;
      });

      var fullId = matchOrder ? matchOrder.orderId : shortId;

      if (prefix === 'ok') {
        await prosesKonfirmasi(fullId, cbChat, cbMsg);
      } else if (prefix === 'no') {
        await prosesTolak(fullId, cbChat, cbMsg);
      } else if (prefix === 'det') {
        await detailOrder(fullId, cbChat);
      } else if (cbData === 'menu_orders') {
        await cmdOrders(cbChat);
      } else if (cbData === 'menu_stats') {
        await cmdStats(cbChat);
      }
      return;
    }

    // Pesan teks
    if (!u.message) return;
    var msg = u.message;
    var chatId = String(msg.chat.id);
    var text = (msg.text || '').trim();
    var firstName = (msg.from && msg.from.first_name) || 'Admin';

    if (chatId !== ADMIN_CHAT_ID) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '⛔ Bot ini khusus untuk admin.\nID kamu: `' + chatId + '`',
        parse_mode: 'Markdown'
      });
      return;
    }

    if (text === '/start') {
      await cmdStart(chatId, firstName);
    } else if (text === '/help') {
      await cmdHelp(chatId);
    } else if (text === '/orders') {
      await cmdOrders(chatId);
    } else if (text === '/pending') {
      await cmdPending(chatId);
    } else if (text === '/confirmed') {
      await cmdConfirmed(chatId);
    } else if (text === '/stats') {
      await cmdStats(chatId);
    } else if (text === '/status') {
      await cmdStatus(chatId);
    } else if (text === '/reset') {
      var jml = orders.size;
      orders.clear();
      await kirimPesan(chatId, '🗑 Semua order (' + jml + ') berhasil dihapus.');
    } else if (text === '/id') {
      await kirimPesan(chatId, '🆔 Chat ID kamu: `' + chatId + '`\n👤 Nama: ' + firstName);
    } else if (text.startsWith('/cek ')) {
      await detailOrder(text.replace('/cek ', '').trim(), chatId);
    } else if (text.startsWith('/konfirmasi ')) {
      await prosesKonfirmasi(text.replace('/konfirmasi ', '').trim(), chatId, null);
    } else if (text.startsWith('/tolak ')) {
      await prosesTolak(text.replace('/tolak ', '').trim(), chatId, null);
    } else if (text.startsWith('/hapus ')) {
      var hoid = text.replace('/hapus ', '').trim();
      if (!orders.has(hoid)) {
        await kirimPesan(chatId, '❌ Order `#' + hoid + '` tidak ditemukan.');
      } else {
        orders.delete(hoid);
        await kirimPesan(chatId, '🗑 Order `#' + hoid + '` dihapus.');
      }
    } else {
      await kirimPesan(chatId, '❓ Perintah tidak dikenal.\nKetik /help untuk bantuan.');
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

// ── COMMAND FUNCTIONS ──────────────────────────────────────
async function cmdStart(chatId, firstName) {
  await tg('sendMessage', {
    chat_id: chatId,
    text:
'🎮 *Halo ' + firstName + '!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'Bot Admin *GameStore ID* aktif ✅\n\n' +
'Setiap order masuk otomatis dikirim ke sini lengkap dengan bukti transfer.\n\n' +
'Ketik /help untuk semua perintah.',
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [[
        { text: '📦 Order Pending', callback_data: 'menu_orders' },
        { text: '📊 Statistik', callback_data: 'menu_stats' }
      ]]
    })
  });
}

async function cmdHelp(chatId) {
  await kirimPesan(chatId,
'📖 *Perintah Bot Admin GameStore ID*\n' +
'━━━━━━━━━━━━━━━━━━━━\n\n' +
'*INFO*\n' +
'/start — Menu utama\n' +
'/help — Panduan ini\n' +
'/id — Chat ID kamu\n' +
'/status — Status server\n\n' +
'*ORDER*\n' +
'/orders — Semua order\n' +
'/pending — Order pending\n' +
'/confirmed — Sudah dikonfirmasi\n' +
'/stats — Statistik penjualan\n\n' +
'*PROSES*\n' +
'/cek ORDERID — Detail order\n' +
'/konfirmasi ORDERID — Konfirmasi\n' +
'/tolak ORDERID — Tolak\n' +
'/hapus ORDERID — Hapus 1 order\n' +
'/reset — Hapus semua order\n\n' +
'*Contoh:*\n' +
'`/cek ABC123`\n' +
'`/konfirmasi ABC123`\n' +
'`/tolak ABC123`\n\n' +
'💡 _Order baru = notif otomatis + tombol ✅ ❌_'
  );
}

async function cmdOrders(chatId) {
  var all = Array.from(orders.values());
  if (all.length === 0) { await kirimPesan(chatId, '📭 Belum ada order.'); return; }
  var p = all.filter(function(o){ return o.status==='pending'; }).length;
  var c = all.filter(function(o){ return o.status==='confirmed'; }).length;
  var r = all.filter(function(o){ return o.status==='rejected'; }).length;
  var teks = '📦 *Semua Order (' + all.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  teks += '🟡 Pending: ' + p + ' | ✅ Konfirmasi: ' + c + ' | ❌ Tolak: ' + r + '\n━━━━━━━━━━━━━━━━━━━━\n';
  all.slice(-10).reverse().forEach(function(o) {
    var ic = o.status==='pending'?'🟡':o.status==='confirmed'?'✅':'❌';
    teks += '\n' + ic + ' *#' + o.orderId + '*\n';
    teks += '   ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + ' | 💰 ' + o.total + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdPending(chatId) {
  var pending = Array.from(orders.values()).filter(function(o){ return o.status==='pending'; });
  if (pending.length === 0) { await kirimPesan(chatId, '✅ Tidak ada order pending!'); return; }
  var teks = '🟡 *Pending (' + pending.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  pending.forEach(function(o, i) {
    var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += '\n*' + (i+1) + '. #' + o.orderId + '*\n';
    teks += '   🎮 ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + (o.server?' / '+o.server:'') + '\n';
    teks += '   📱 ' + o.phone + '\n';
    teks += '   💰 ' + o.total + ' | ⏰ ' + wkt + '\n';
    teks += '   ➡️ /konfirmasi ' + o.orderId + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdConfirmed(chatId) {
  var confirmed = Array.from(orders.values()).filter(function(o){ return o.status==='confirmed'; });
  if (confirmed.length === 0) { await kirimPesan(chatId, '📭 Belum ada yang dikonfirmasi.'); return; }
  var teks = '✅ *Terkonfirmasi (' + confirmed.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  confirmed.slice(-10).reverse().forEach(function(o, i) {
    teks += '\n*' + (i+1) + '. #' + o.orderId + '*\n';
    teks += '   ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + ' | 💰 ' + o.total + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdStats(chatId) {
  var all = Array.from(orders.values());
  var today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  var todayO = all.filter(function(o){
    return new Date(o.time).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})===today;
  });
  var gs = {};
  all.forEach(function(o){
    if (!gs[o.game]) gs[o.game] = { name: o.gameName, count: 0 };
    gs[o.game].count++;
  });
  var gl = '';
  Object.values(gs).sort(function(a,b){return b.count-a.count;}).forEach(function(g){
    gl += '   • ' + g.name + ': ' + g.count + '\n';
  });
  await kirimPesan(chatId,
'📊 *Statistik GameStore ID*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'📅 Hari ini: ' + todayO.length + ' order\n\n' +
'📦 Total:\n' +
'   🟡 Pending: ' + all.filter(function(o){return o.status==='pending';}).length + '\n' +
'   ✅ Konfirmasi: ' + all.filter(function(o){return o.status==='confirmed';}).length + '\n' +
'   ❌ Ditolak: ' + all.filter(function(o){return o.status==='rejected';}).length + '\n' +
'   📊 Total: ' + all.length + '\n\n' +
'🎮 Per Game:\n' + (gl || '   Belum ada order')
  );
}

async function cmdStatus(chatId) {
  var up = process.uptime();
  var j = Math.floor(up/3600);
  var m = Math.floor((up%3600)/60);
  var d = Math.floor(up%60);
  var all = Array.from(orders.values());
  await kirimPesan(chatId,
'🖥 *Status Server*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'✅ Server: Online\n' +
'✅ Bot: Aktif\n' +
'⏱ Uptime: ' + j + 'j ' + m + 'm ' + d + 'd\n' +
'📦 Total Order: ' + all.length + '\n' +
'🟡 Pending: ' + all.filter(function(o){return o.status==='pending';}).length
  );
}

async function detailOrder(oid, chatId) {
  var o = orders.get(oid);
  if (!o) {
    await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.\nPastikan huruf kapital semua.');
    return;
  }
  var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  var stxt = o.status==='pending'?'🟡 Pending':o.status==='confirmed'?'✅ Dikonfirmasi':'❌ Ditolak';
  var teks =
'📋 *Detail Order #' + oid + '*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.server?'\n🖥 Server: `'+o.server+'`':'') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 ' + o.paket + '\n' +
'💰 ' + o.total + '\n' +
'⏰ ' + wkt + ' WIB\n' +
'📌 Status: ' + stxt;

  if (o.status === 'pending') {
    var shortId = oid.substring(0, 20);
    await tg('sendMessage', {
      chat_id: chatId,
      text: teks,
      parse_mode: 'Markdown',
      reply_markup: JSON.stringify({ inline_keyboard: [[
        { text: '✅ KONFIRMASI', callback_data: 'ok:' + shortId },
        { text: '❌ TOLAK', callback_data: 'no:' + shortId }
      ]]})
    });
  } else {
    await kirimPesan(chatId, teks);
  }
}

async function prosesKonfirmasi(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order sudah diproses: ' + o.status); return; }
  o.status = 'confirmed';
  orders.set(oid, o);
  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '✅ SUDAH DIKONFIRMASI', callback_data: 'done' }]] })
    }).catch(function(){});
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text:
'✅ *ORDER #' + oid + ' DIKONFIRMASI!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.server?'\n🖥 Server: `'+o.server+'`':'') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 ' + o.paket + '\n' +
'💰 ' + o.total + '\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'⚡ *Silakan proses top up sekarang!*',
    parse_mode: 'Markdown'
  });
}

async function prosesTolak(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order sudah diproses: ' + o.status); return; }
  o.status = 'rejected';
  orders.set(oid, o);
  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '❌ SUDAH DITOLAK', callback_data: 'done' }]] })
    }).catch(function(){});
  }
  await tg('sendMessage', {
    chat_id: chatId,
    text:
'❌ *ORDER #' + oid + ' DITOLAK*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 ' + o.gameName + ' — ' + o.paket + '\n' +
'👤 ' + o.userId + '\n' +
'📱 ' + o.phone + '\n' +
'💰 ' + o.total,
    parse_mode: 'Markdown'
  });
}

async function kirimPesan(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
}

// Telegram API wrapper dengan auto-retry
async function tg(method, data, retries) {
  if (retries === undefined) retries = 3;
  for (var i = 0; i < retries; i++) {
    try {
      var res = await axios.post(
        'https://api.telegram.org/bot' + BOT_TOKEN + '/' + method,
        data,
        { timeout: 15000 }
      );
      return res.data;
    } catch (err) {
      var isLast = i === retries - 1;
      var code = err.response && err.response.data && err.response.data.error_code;
      var desc = (err.response && err.response.data && err.response.data.description) || err.message;
      if (code === 400 || code === 403) {
        console.error('TG error ' + code + ': ' + desc);
        return null;
      }
      if (isLast) {
        console.error('TG ' + method + ' gagal: ' + desc);
        return null;
      }
      await new Promise(function(r){ setTimeout(r, 1000 * (i+1)); });
    }
  }
  return null;
}

// Setup webhook
async function setupWebhook() {
  try {
    await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/deleteWebhook');
    await new Promise(function(r){ setTimeout(r, 1000); });
    var url = WEBHOOK_URL + '/webhook/' + BOT_TOKEN;
    var res = await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook', {
      url: url,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });
    if (res.data.ok) {
      console.log('✅ Webhook aktif: ' + url);
      await tg('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        text: '🚀 *Bot GameStore ID Online!*\n\nWebhook aktif. Siap terima order!\nKetik /start untuk mulai.',
        parse_mode: 'Markdown'
      });
    } else {
      console.log('⚠️ Webhook gagal: ' + res.data.description);
    }
  } catch (err) {
    console.error('setupWebhook error: ' + err.message);
  }
}

app.listen(PORT, async function() {
  console.log('🚀 GameStore ID jalan di port ' + PORT);
  await setupWebhook();
});
