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

// Pengumuman yang bisa diubah admin via bot
var settings = {
  maintenance: false,
  announcement: '',
  discountActive: false,
  discountNote: ''
};

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

// ─── HEALTH CHECK ─────────────────────────────────────────
app.get('/health', function(req, res) {
  var all = Array.from(orders.values());
  res.json({
    status: settings.maintenance ? 'Maintenance' : 'Online',
    maintenance: settings.maintenance,
    announcement: settings.announcement,
    total_orders: all.length,
    pending:   all.filter(function(o){return o.status==='pending';}).length,
    confirmed: all.filter(function(o){return o.status==='confirmed';}).length,
    rejected:  all.filter(function(o){return o.status==='rejected';}).length,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ─── SUBMIT ORDER ─────────────────────────────────────────
app.post('/api/order', upload.single('bukti'), async function(req, res) {
  if (settings.maintenance) {
    return res.status(503).json({ ok: false, message: 'Website sedang dalam maintenance. Coba lagi nanti.' });
  }
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Upload bukti dulu!' });
    var b = req.body;
    if (!b.orderId || !b.userId || !b.paket) return res.status(400).json({ ok: false, message: 'Data tidak lengkap!' });

    orders.set(b.orderId, {
      orderId: b.orderId, game: b.game, gameName: b.gameName,
      uidLabel: b.uidLabel, userId: b.userId, server: b.server || '',
      phone: b.phone || '-', paket: b.paket, total: b.total,
      status: 'pending', time: new Date().toISOString(),
      imageBuffer: req.file.buffer, imageMime: req.file.mimetype
    });

    await kirimNotifAdmin(b.orderId);
    console.log('Order terkirim:', b.orderId);
    res.json({ ok: true, orderId: b.orderId });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ─── KIRIM NOTIF ADMIN ────────────────────────────────────
async function kirimNotifAdmin(orderId) {
  var o = orders.get(orderId);
  if (!o) return;
  var waktu = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text:
'🔔 *ORDER BARU MASUK!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 *Order ID:* `#' + o.orderId + '`\n' +
'🎮 *Game:* ' + o.gameName + '\n' +
'👤 *' + o.uidLabel + ':* `' + o.userId + '`' +
(o.server ? '\n🖥 *Server:* `' + o.server + '`' : '') + '\n' +
'📱 *HP:* ' + o.phone + '\n' +
'💎 *Paket:* ' + o.paket + '\n' +
'💰 *Total:* *' + o.total + '*\n' +
'⏰ *Waktu:* ' + waktu + ' WIB\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'📸 _Bukti transfer di bawah_',
    parse_mode: 'Markdown'
  });

  var fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, { filename: 'bukti_' + o.orderId + '.jpg', contentType: o.imageMime });
  fd.append('caption', '📸 Bukti #' + o.orderId + '\n' + o.gameName + ' | ' + o.paket + '\n' + o.total + '\n' + o.userId + (o.server ? ' / ' + o.server : '') + '\n📱 ' + o.phone);
  await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto', fd, { headers: fd.getHeaders(), timeout: 30000 });

  var sid = o.orderId.substring(0, 20);
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: '⚡ *Aksi untuk Order #' + o.orderId + '*',
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: '✅ KONFIRMASI', callback_data: 'ok:' + sid },
          { text: '❌ TOLAK', callback_data: 'no:' + sid }
        ],
        [{ text: '📋 Detail Lengkap', callback_data: 'det:' + sid }]
      ]
    })
  });
}

// ─── WEBHOOK TELEGRAM ─────────────────────────────────────
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

      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '⏳ Memproses...' });
      if (cbChat !== ADMIN_CHAT_ID) return;

      var parts = cbData.split(':');
      var prefix = parts[0];
      var shortId = parts.slice(1).join(':');

      var matchOrder = null;
      orders.forEach(function(o) { if (o.orderId.substring(0,20) === shortId) matchOrder = o; });
      var fullId = matchOrder ? matchOrder.orderId : shortId;

      if      (prefix === 'ok')  await prosesKonfirmasi(fullId, cbChat, cbMsg);
      else if (prefix === 'no')  await prosesTolak(fullId, cbChat, cbMsg);
      else if (prefix === 'det') await detailOrder(fullId, cbChat);
      else if (cbData === 'mu')  await cmdOrders(cbChat);
      else if (cbData === 'ms')  await cmdStats(cbChat);
      else if (cbData === 'mp')  await cmdPending(cbChat);
      return;
    }

    // Pesan teks
    if (!u.message) return;
    var msg = u.message;
    var chatId = String(msg.chat.id);
    var text = (msg.text || '').trim();
    var firstName = (msg.from && msg.from.first_name) || 'Admin';

    if (chatId !== ADMIN_CHAT_ID) {
      await tg('sendMessage', { chat_id: chatId, text: '⛔ Bot ini khusus admin.\nID kamu: `' + chatId + '`', parse_mode: 'Markdown' });
      return;
    }

    // ─── COMMAND ROUTING ────────────────────────────────────
    if (text === '/start') {
      await cmdStart(chatId, firstName);
    } else if (text === '/help' || text === '/menu') {
      await cmdHelp(chatId);
    } else if (text === '/orders' || text === '/semua') {
      await cmdOrders(chatId);
    } else if (text === '/pending') {
      await cmdPending(chatId);
    } else if (text === '/confirmed' || text === '/selesai') {
      await cmdConfirmed(chatId);
    } else if (text === '/stats' || text === '/statistik') {
      await cmdStats(chatId);
    } else if (text === '/status') {
      await cmdStatus(chatId);
    } else if (text === '/id') {
      await kirimPesan(chatId, '🆔 Chat ID kamu: `' + chatId + '`\n👤 Nama: ' + firstName);

    // ── MAINTENANCE MODE ──
    } else if (text === '/maintenance on') {
      settings.maintenance = true;
      await kirimPesan(chatId, '🔴 *Maintenance mode AKTIF*\nWeb tidak bisa menerima order baru.');
    } else if (text === '/maintenance off') {
      settings.maintenance = false;
      await kirimPesan(chatId, '🟢 *Maintenance mode NONAKTIF*\nWeb kembali normal.');
    } else if (text === '/maintenance') {
      await kirimPesan(chatId, '⚙️ Status maintenance: *' + (settings.maintenance ? 'AKTIF 🔴' : 'NONAKTIF 🟢') + '*\n\nKetik:\n`/maintenance on` — aktifkan\n`/maintenance off` — nonaktifkan');

    // ── PENGUMUMAN ──
    } else if (text.startsWith('/umumkan ')) {
      settings.announcement = text.replace('/umumkan ', '').trim();
      await kirimPesan(chatId, '📢 Pengumuman diset:\n\n_' + settings.announcement + '_\n\nHapus dengan `/umumkan hapus`');
    } else if (text === '/umumkan hapus') {
      settings.announcement = '';
      await kirimPesan(chatId, '🗑 Pengumuman dihapus.');
    } else if (text === '/umumkan') {
      await kirimPesan(chatId, '📢 Pengumuman saat ini:\n\n' + (settings.announcement || '_(kosong)_') + '\n\nUntuk mengubah: `/umumkan teks pengumuman kamu`');

    // ── HAPUS DATA ──
    } else if (text === '/reset') {
      var jml = orders.size;
      orders.clear();
      await kirimPesan(chatId, '🗑 Semua ' + jml + ' order berhasil dihapus.');
    } else if (text.startsWith('/hapus ')) {
      var hoid = text.replace('/hapus ', '').trim();
      if (orders.has(hoid)) { orders.delete(hoid); await kirimPesan(chatId, '🗑 Order `#' + hoid + '` dihapus.'); }
      else await kirimPesan(chatId, '❌ Order `#' + hoid + '` tidak ditemukan.');

    // ── PROSES ORDER ──
    } else if (text.startsWith('/cek ')) {
      await detailOrder(text.replace('/cek ', '').trim(), chatId);
    } else if (text.startsWith('/konfirmasi ')) {
      await prosesKonfirmasi(text.replace('/konfirmasi ', '').trim(), chatId, null);
    } else if (text.startsWith('/tolak ')) {
      await prosesTolak(text.replace('/tolak ', '').trim(), chatId, null);

    } else {
      await kirimPesan(chatId, '❓ Perintah tidak dikenal.\nKetik /help untuk bantuan.');
    }

  } catch (err) { console.error('Webhook error:', err.message); }
});

// ─── BOT COMMANDS ─────────────────────────────────────────
async function cmdStart(chatId, firstName) {
  await tg('sendMessage', {
    chat_id: chatId,
    text:
'🎮 *Halo ' + firstName + '! Bot Admin GameStore ID*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'Bot aktif dan siap menerima order ✅\n\n' +
'Setiap order masuk dikirim otomatis ke sini beserta bukti transfer & tombol aksi.\n\n' +
'Status web: ' + (settings.maintenance ? '🔴 Maintenance' : '🟢 Normal') + '\n' +
'Total order: ' + orders.size,
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: '📦 Order Pending', callback_data: 'mp' },
          { text: '📊 Statistik', callback_data: 'ms' }
        ],
        [{ text: '📋 Semua Order', callback_data: 'mu' }]
      ]
    })
  });
}

async function cmdHelp(chatId) {
  await kirimPesan(chatId,
'📖 *Semua Perintah Bot Admin*\n' +
'━━━━━━━━━━━━━━━━━━━━\n\n' +
'*📊 INFO & STATISTIK*\n' +
'`/start` — Menu utama\n' +
'`/help` — Panduan ini\n' +
'`/id` — Chat ID kamu\n' +
'`/status` — Status server\n' +
'`/stats` — Statistik lengkap\n\n' +
'*📦 KELOLA ORDER*\n' +
'`/orders` — Semua order\n' +
'`/pending` — Order pending\n' +
'`/confirmed` — Sudah selesai\n' +
'`/cek ORDERID` — Detail order\n' +
'`/konfirmasi ORDERID` — Konfirmasi\n' +
'`/tolak ORDERID` — Tolak\n' +
'`/hapus ORDERID` — Hapus 1 order\n' +
'`/reset` — Hapus semua order\n\n' +
'*⚙️ PENGATURAN WEB*\n' +
'`/maintenance` — Cek status\n' +
'`/maintenance on` — Aktifkan\n' +
'`/maintenance off` — Nonaktifkan\n' +
'`/umumkan TEKS` — Set pengumuman\n' +
'`/umumkan hapus` — Hapus pengumuman\n\n' +
'*Contoh:*\n' +
'`/cek ABC123XYZ`\n' +
'`/konfirmasi ABC123XYZ`\n' +
'`/umumkan Web sedang ramai, mohon sabar`\n\n' +
'💡 _Tombol ✅ ❌ muncul otomatis di setiap order baru_'
  );
}

async function cmdOrders(chatId) {
  var all = Array.from(orders.values());
  if (!all.length) { await kirimPesan(chatId, '📭 Belum ada order.'); return; }
  var p = all.filter(function(o){return o.status==='pending';}).length;
  var c = all.filter(function(o){return o.status==='confirmed';}).length;
  var r = all.filter(function(o){return o.status==='rejected';}).length;
  var teks = '📦 *Semua Order (' + all.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  teks += '🟡 Pending: *' + p + '* | ✅ Selesai: *' + c + '* | ❌ Tolak: *' + r + '*\n━━━━━━━━━━━━━━━━━━━━\n';
  all.slice(-10).reverse().forEach(function(o) {
    var ic = o.status==='pending'?'🟡':o.status==='confirmed'?'✅':'❌';
    var wkt = new Date(o.time).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
    teks += '\n' + ic + ' `#' + o.orderId.substring(0,12) + '`\n';
    teks += '   ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + ' | 💰 ' + o.total + ' | ⏰ ' + wkt + '\n';
  });
  if (all.length > 10) teks += '\n_...dan ' + (all.length-10) + ' order lainnya_';
  await kirimPesan(chatId, teks);
}

async function cmdPending(chatId) {
  var pending = Array.from(orders.values()).filter(function(o){return o.status==='pending';});
  if (!pending.length) { await kirimPesan(chatId, '✅ Tidak ada order pending saat ini!'); return; }
  var teks = '🟡 *Order Pending (' + pending.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  pending.forEach(function(o, i) {
    var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += '\n*' + (i+1) + '. `#' + o.orderId + '`*\n';
    teks += '   🎮 ' + o.gameName + ' — *' + o.paket + '*\n';
    teks += '   👤 ' + o.userId + (o.server?' / '+o.server:'') + '\n';
    teks += '   📱 ' + o.phone + '\n';
    teks += '   💰 *' + o.total + '* | ⏰ ' + wkt + '\n';
    teks += '   ➡️ `/konfirmasi ' + o.orderId + '`\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdConfirmed(chatId) {
  var confirmed = Array.from(orders.values()).filter(function(o){return o.status==='confirmed';});
  if (!confirmed.length) { await kirimPesan(chatId, '📭 Belum ada order yang selesai.'); return; }
  var teks = '✅ *Order Selesai (' + confirmed.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  confirmed.slice(-15).reverse().forEach(function(o, i) {
    var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += '\n*' + (i+1) + '. `#' + o.orderId + '`*\n';
    teks += '   ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + ' | 💰 ' + o.total + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdStats(chatId) {
  var all = Array.from(orders.values());
  var today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  var todayO = all.filter(function(o){return new Date(o.time).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})===today;});
  var todayDone = todayO.filter(function(o){return o.status==='confirmed';});

  var gs = {};
  all.forEach(function(o){ if(!gs[o.game]) gs[o.game]={name:o.gameName,total:0,done:0}; gs[o.game].total++; if(o.status==='confirmed') gs[o.game].done++; });
  var gl = Object.values(gs).sort(function(a,b){return b.total-a.total;}).map(function(g){return '   • ' + g.name + ': ' + g.total + ' order (' + g.done + ' selesai)';}).join('\n');

  await kirimPesan(chatId,
'📊 *Statistik GameStore ID*\n━━━━━━━━━━━━━━━━━━━━\n\n' +
'📅 *Hari ini (' + today + ')*\n' +
'   Masuk: *' + todayO.length + '* | Selesai: *' + todayDone.length + '*\n\n' +
'📦 *Total Semua Order*\n' +
'   🟡 Pending: *' + all.filter(function(o){return o.status==='pending';}).length + '*\n' +
'   ✅ Selesai: *' + all.filter(function(o){return o.status==='confirmed';}).length + '*\n' +
'   ❌ Ditolak: *' + all.filter(function(o){return o.status==='rejected';}).length + '*\n' +
'   📊 Total: *' + all.length + '*\n\n' +
'🎮 *Per Game*\n' + (gl || '   Belum ada order') + '\n\n' +
'⚙️ Status: ' + (settings.maintenance ? '🔴 Maintenance' : '🟢 Normal')
  );
}

async function cmdStatus(chatId) {
  var up = process.uptime();
  var all = Array.from(orders.values());
  var pending = all.filter(function(o){return o.status==='pending';}).length;
  await kirimPesan(chatId,
'🖥 *Status Server & Bot*\n━━━━━━━━━━━━━━━━━━━━\n' +
'✅ Server: *Online*\n' +
'✅ Bot: *Aktif*\n' +
'⏱ Uptime: *' + Math.floor(up/3600) + 'j ' + Math.floor((up%3600)/60) + 'm*\n\n' +
'🌐 Web: ' + (settings.maintenance ? '🔴 *Maintenance*' : '🟢 *Normal*') + '\n' +
'📦 Total Order: *' + all.length + '*\n' +
'🟡 Pending: *' + pending + '*\n\n' +
(settings.announcement ? '📢 Pengumuman aktif:\n_' + settings.announcement + '_\n\n' : '') +
'🔗 `' + WEBHOOK_URL + '/health`'
  );
}

async function detailOrder(oid, chatId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.\n\nPastikan Order ID benar (huruf kapital semua).'); return; }
  var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  var stxt = o.status==='pending'?'🟡 Menunggu konfirmasi':o.status==='confirmed'?'✅ Sudah selesai':'❌ Ditolak';
  var teks =
'📋 *Detail Order*\n━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 ID: `#' + oid + '`\n' +
'🎮 Game: ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' + (o.server?'\n🖥 Server: `'+o.server+'`':'') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: ' + o.paket + '\n' +
'💰 Total: *' + o.total + '*\n' +
'⏰ Waktu: ' + wkt + ' WIB\n' +
'📌 Status: ' + stxt;
  if (o.status === 'pending') {
    var sid = oid.substring(0,20);
    await tg('sendMessage', { chat_id: chatId, text: teks, parse_mode: 'Markdown',
      reply_markup: JSON.stringify({ inline_keyboard: [[
        { text: '✅ KONFIRMASI', callback_data: 'ok:' + sid },
        { text: '❌ TOLAK', callback_data: 'no:' + sid }
      ]]})
    });
  } else { await kirimPesan(chatId, teks); }
}

async function prosesKonfirmasi(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order ini sudah diproses sebelumnya dengan status: *' + o.status + '*'); return; }
  o.status = 'confirmed'; orders.set(oid, o);
  if (msgId) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId,
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '✅ SUDAH DIKONFIRMASI', callback_data: 'done' }]] })
  }).catch(function(){});
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'Markdown',
    text:
'✅ *ORDER #' + oid + ' DIKONFIRMASI!*\n━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' + (o.server?'\n🖥 Server: `'+o.server+'`':'') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: ' + o.paket + '\n' +
'💰 Total: *' + o.total + '*\n━━━━━━━━━━━━━━━━━━━━\n' +
'⚡ *Silakan proses top up sekarang ke akun di atas!*'
  });
}

async function prosesTolak(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order sudah diproses: *' + o.status + '*'); return; }
  o.status = 'rejected'; orders.set(oid, o);
  if (msgId) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId,
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '❌ SUDAH DITOLAK', callback_data: 'done' }]] })
  }).catch(function(){});
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'Markdown',
    text:
'❌ *ORDER #' + oid + ' DITOLAK*\n━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 ' + o.gameName + ' — ' + o.paket + '\n' +
'👤 ' + o.userId + '\n' +
'📱 ' + o.phone + '\n' +
'💰 ' + o.total
  });
}

async function kirimPesan(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text: text, parse_mode: 'Markdown' });
}

async function tg(method, data, retries) {
  if (retries === undefined) retries = 3;
  for (var i = 0; i < retries; i++) {
    try {
      var res = await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, data, { timeout: 15000 });
      return res.data;
    } catch (err) {
      var code = err.response && err.response.data && err.response.data.error_code;
      var desc = (err.response && err.response.data && err.response.data.description) || err.message;
      if (code === 400 || code === 403) { console.error('TG ' + code + ': ' + desc); return null; }
      if (i === retries-1) { console.error('TG ' + method + ' gagal: ' + desc); return null; }
      await new Promise(function(r){ setTimeout(r, 1000*(i+1)); });
    }
  }
  return null;
}

async function setupWebhook() {
  try {
    await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/deleteWebhook');
    await new Promise(function(r){ setTimeout(r, 1000); });
    var url = WEBHOOK_URL + '/webhook/' + BOT_TOKEN;
    var res = await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook', {
      url: url, allowed_updates: ['message','callback_query'], drop_pending_updates: true
    });
    if (res.data.ok) {
      console.log('✅ Webhook: ' + url);
      await tg('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        text: '🚀 *Bot GameStore ID Online!*\n\nServer aktif & webhook terpasang.\nKetik /start untuk menu utama.\nKetik /help untuk semua perintah.',
        parse_mode: 'Markdown'
      });
    }
  } catch (err) { console.error('setupWebhook:', err.message); }
}

app.listen(PORT, async function() {
  console.log('🚀 GameStore ID port ' + PORT);
  await setupWebhook();
});
