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

// ─────────────────────────────────────────────────────────
// CEK ID PLAYER — API Codashop (proxy dari server)
// ─────────────────────────────────────────────────────────
app.post('/api/cek-id', async function(req, res) {
  var game   = req.body.game;
  var userId = (req.body.userId || '').trim();
  var server = (req.body.server || '').trim();

  if (!game || !userId) {
    return res.json({ ok: false, message: 'ID tidak boleh kosong' });
  }

  try {
    var result = await cekIdPlayer(game, userId, server);
    res.json(result);
  } catch (err) {
    console.error('cek-id error:', err.message);
    res.json({ ok: false, message: 'Gagal cek ID. Coba lagi.' });
  }
});

// ── FUNGSI CEK ID PER GAME ─────────────────────────────────
async function cekIdPlayer(game, userId, server) {
  try {
    switch (game) {

      // ── FREE FIRE ──────────────────────────────────────
      case 'ff': {
        var resp = await axios.post(
          'https://order.codashop.com/api/id-check',
          {
            voucherPricePoint: { id: 107374, price: 1.0, variationId: 'ff-50' },
            gameProduct: { id: 'ff', deliveryTarget: 'ff-uid' },
            userExtraInfo: {},
            orderDeliveryTarget: userId
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.codashop.com/id-id/free-fire',
              'Origin': 'https://www.codashop.com'
            },
            timeout: 10000
          }
        );
        if (resp.data && resp.data.data && resp.data.data.role) {
          return { ok: true, nickname: resp.data.data.role, userId: userId };
        }
        // Fallback: coba endpoint lain
        var resp2 = await axios.post(
          'https://www.codashop.com/api/latest/id-check',
          { gameCode: 'FREEFIRE', userId: userId },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0',
              'Referer': 'https://www.codashop.com/id-id/free-fire'
            },
            timeout: 10000
          }
        );
        if (resp2.data && resp2.data.nickname) {
          return { ok: true, nickname: resp2.data.nickname, userId: userId };
        }
        return { ok: false, message: 'ID tidak ditemukan. Pastikan User ID benar.' };
      }

      // ── MOBILE LEGENDS ────────────────────────────────
      case 'mlbb': {
        if (!server) {
          return { ok: false, message: 'Masukkan Zone ID / Server dulu!' };
        }
        var respML = await axios.post(
          'https://order.codashop.com/api/id-check',
          {
            voucherPricePoint: { id: 109454, price: 1.0, variationId: 'mlbb-11' },
            gameProduct: { id: 'mlbb', deliveryTarget: 'mlbb-uid' },
            userExtraInfo: { selectedId: server },
            orderDeliveryTarget: userId
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0',
              'Referer': 'https://www.codashop.com/id-id/mobile-legends',
              'Origin': 'https://www.codashop.com'
            },
            timeout: 10000
          }
        );
        if (respML.data && respML.data.data && respML.data.data.role) {
          return { ok: true, nickname: respML.data.data.role, userId: userId + ' (' + server + ')' };
        }
        // Fallback endpoint
        var respML2 = await axios.get(
          'https://www.codashop.com/api/latest/id-check?gameCode=MOBILE_LEGENDS&userId=' + userId + '&zoneId=' + server,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Referer': 'https://www.codashop.com/id-id/mobile-legends'
            },
            timeout: 10000
          }
        );
        if (respML2.data && respML2.data.nickname) {
          return { ok: true, nickname: respML2.data.nickname, userId: userId + ' (' + server + ')' };
        }
        return { ok: false, message: 'ID tidak ditemukan. Cek User ID & Zone ID.' };
      }

      // ── PUBG MOBILE ───────────────────────────────────
      case 'pubg': {
        var respPG = await axios.post(
          'https://order.codashop.com/api/id-check',
          {
            voucherPricePoint: { id: 110478, price: 1.0, variationId: 'pubgm-60' },
            gameProduct: { id: 'pubgm', deliveryTarget: 'pubgm-uid' },
            userExtraInfo: {},
            orderDeliveryTarget: userId
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0',
              'Referer': 'https://www.codashop.com/id-id/pubg-mobile',
              'Origin': 'https://www.codashop.com'
            },
            timeout: 10000
          }
        );
        if (respPG.data && respPG.data.data && respPG.data.data.role) {
          return { ok: true, nickname: respPG.data.data.role, userId: userId };
        }
        return { ok: false, message: 'ID tidak ditemukan. Pastikan Player ID benar.' };
      }

      // ── GENSHIN (tidak ada API publik) ────────────────
      case 'genshin':
        return { ok: false, message: 'Genshin Impact tidak mendukung cek ID otomatis. Pastikan UID benar sebelum lanjut.' };

      // ── COD MOBILE (tidak ada API publik) ─────────────
      case 'cod':
        return { ok: false, message: 'COD Mobile tidak mendukung cek ID otomatis. Pastikan Player ID benar sebelum lanjut.' };

      // ── VALORANT (tidak ada API publik) ───────────────
      case 'valorant':
        return { ok: false, message: 'Valorant tidak mendukung cek ID otomatis. Pastikan Riot ID benar sebelum lanjut.' };

      // ── HONKAI STAR RAIL ──────────────────────────────
      case 'honkai':
        return { ok: false, message: 'Honkai: Star Rail tidak mendukung cek ID otomatis. Pastikan UID benar sebelum lanjut.' };

      // ── MAGIC CHESS ───────────────────────────────────
      case 'ml2': {
        // Magic Chess pakai server MLBB
        var respMC = await axios.post(
          'https://order.codashop.com/api/id-check',
          {
            voucherPricePoint: { id: 109454, price: 1.0, variationId: 'mlbb-11' },
            gameProduct: { id: 'mlbb', deliveryTarget: 'mlbb-uid' },
            userExtraInfo: { selectedId: server || '0' },
            orderDeliveryTarget: userId
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0',
              'Referer': 'https://www.codashop.com/id-id/mobile-legends',
              'Origin': 'https://www.codashop.com'
            },
            timeout: 10000
          }
        );
        if (respMC.data && respMC.data.data && respMC.data.data.role) {
          return { ok: true, nickname: respMC.data.data.role, userId: userId };
        }
        return { ok: false, message: 'ID tidak ditemukan. Pastikan User ID benar.' };
      }

      default:
        return { ok: false, message: 'Cek ID tidak tersedia untuk game ini.' };
    }
  } catch (err) {
    console.error('cekIdPlayer error [' + game + ']:', err.message);
    // Jika timeout atau network error
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { ok: false, message: 'Timeout. Coba lagi dalam beberapa detik.' };
    }
    if (err.response && err.response.status === 429) {
      return { ok: false, message: 'Terlalu banyak request. Tunggu sebentar lalu coba lagi.' };
    }
    return { ok: false, message: 'Gagal cek ID. Lanjutkan jika yakin ID sudah benar.' };
  }
}

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
app.get('/health', function(req, res) {
  var all = Array.from(orders.values());
  res.json({
    status: 'Online',
    total_orders: all.length,
    pending:   all.filter(function(o){ return o.status === 'pending'; }).length,
    confirmed: all.filter(function(o){ return o.status === 'confirmed'; }).length,
    rejected:  all.filter(function(o){ return o.status === 'rejected'; }).length,
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ─────────────────────────────────────────────────────────
// SUBMIT ORDER
// ─────────────────────────────────────────────────────────
app.post('/api/order', upload.single('bukti'), async function(req, res) {
  console.log('ORDER masuk:', req.body && req.body.orderId);
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Upload bukti dulu!' });
    var b = req.body;
    if (!b.orderId || !b.userId || !b.paket) return res.status(400).json({ ok: false, message: 'Data tidak lengkap!' });

    orders.set(b.orderId, {
      orderId: b.orderId, game: b.game, gameName: b.gameName,
      uidLabel: b.uidLabel, userId: b.userId, nickname: b.nickname || '',
      server: b.server || '', phone: b.phone || '-', paket: b.paket, total: b.total,
      status: 'pending', time: new Date().toISOString(),
      imageBuffer: req.file.buffer, imageMime: req.file.mimetype
    });

    await kirimNotifAdmin(b.orderId);
    res.json({ ok: true, orderId: b.orderId });
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// KIRIM NOTIF ADMIN
// ─────────────────────────────────────────────────────────
async function kirimNotifAdmin(orderId) {
  var o = orders.get(orderId);
  if (!o) return;
  var waktu = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text:
'🔔 *ORDER BARU!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 ID: `#' + o.orderId + '`\n' +
'🎮 Game: ' + o.gameName + '\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.nickname ? '\n✅ Nickname: *' + o.nickname + '*' : '') +
(o.server ? '\n🖥 Server: `' + o.server + '`' : '') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: ' + o.paket + '\n' +
'💰 Total: *' + o.total + '*\n' +
'⏰ Waktu: ' + waktu + ' WIB\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'📸 _Bukti transfer di bawah_',
    parse_mode: 'Markdown'
  });

  var fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, { filename: 'bukti_' + o.orderId + '.jpg', contentType: o.imageMime });
  fd.append('caption',
    '📸 #' + o.orderId + '\n' +
    o.gameName + ' | ' + o.paket + '\n' +
    o.total + '\n' +
    o.userId + (o.nickname ? ' (' + o.nickname + ')' : '') +
    (o.server ? ' / ' + o.server : '') + '\n' +
    '📱 ' + o.phone
  );
  await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto', fd, { headers: fd.getHeaders(), timeout: 30000 });

  var shortId = o.orderId.substring(0, 20);
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
        [{ text: '📋 Detail', callback_data: 'det:' + shortId }]
      ]
    })
  });
}

// ─────────────────────────────────────────────────────────
// WEBHOOK TELEGRAM
// ─────────────────────────────────────────────────────────
app.post('/webhook/' + BOT_TOKEN, async function(req, res) {
  res.sendStatus(200);
  var u = req.body;
  if (!u) return;

  try {
    if (u.callback_query) {
      var cb = u.callback_query;
      var cbChat = String(cb.message.chat.id);
      var cbMsg  = cb.message.message_id;
      var cbData = cb.data || '';

      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Memproses...' });
      if (cbChat !== ADMIN_CHAT_ID) return;

      var parts  = cbData.split(':');
      var prefix = parts[0];
      var shortId = parts[1] || '';

      var matchOrder = null;
      orders.forEach(function(o) { if (o.orderId.substring(0,20) === shortId) matchOrder = o; });
      var fullId = matchOrder ? matchOrder.orderId : shortId;

      if      (prefix === 'ok')  await prosesKonfirmasi(fullId, cbChat, cbMsg);
      else if (prefix === 'no')  await prosesTolak(fullId, cbChat, cbMsg);
      else if (prefix === 'det') await detailOrder(fullId, cbChat);
      else if (cbData === 'menu_orders') await cmdOrders(cbChat);
      else if (cbData === 'menu_stats')  await cmdStats(cbChat);
      return;
    }

    if (!u.message) return;
    var msg = u.message;
    var chatId = String(msg.chat.id);
    var text = (msg.text || '').trim();
    var firstName = (msg.from && msg.from.first_name) || 'Admin';

    if (chatId !== ADMIN_CHAT_ID) {
      await tg('sendMessage', { chat_id: chatId, text: '⛔ Bot khusus admin.\nID kamu: `' + chatId + '`', parse_mode: 'Markdown' });
      return;
    }

    if      (text === '/start')   await cmdStart(chatId, firstName);
    else if (text === '/help')    await cmdHelp(chatId);
    else if (text === '/orders')  await cmdOrders(chatId);
    else if (text === '/pending') await cmdPending(chatId);
    else if (text === '/confirmed') await cmdConfirmed(chatId);
    else if (text === '/stats')   await cmdStats(chatId);
    else if (text === '/status')  await cmdStatus(chatId);
    else if (text === '/id')      await kirimPesan(chatId, '🆔 Chat ID: `' + chatId + '`\n👤 Nama: ' + firstName);
    else if (text === '/reset')   { var jml = orders.size; orders.clear(); await kirimPesan(chatId, '🗑 ' + jml + ' order dihapus.'); }
    else if (text.startsWith('/cek '))          await detailOrder(text.replace('/cek ','').trim(), chatId);
    else if (text.startsWith('/konfirmasi '))   await prosesKonfirmasi(text.replace('/konfirmasi ','').trim(), chatId, null);
    else if (text.startsWith('/tolak '))        await prosesTolak(text.replace('/tolak ','').trim(), chatId, null);
    else if (text.startsWith('/hapus ')) {
      var hoid = text.replace('/hapus ','').trim();
      if (orders.has(hoid)) { orders.delete(hoid); await kirimPesan(chatId, '🗑 Order `#' + hoid + '` dihapus.'); }
      else await kirimPesan(chatId, '❌ Order `#' + hoid + '` tidak ditemukan.');
    }
    else await kirimPesan(chatId, '❓ Tidak dikenal. Ketik /help');

  } catch (err) { console.error('Webhook error:', err.message); }
});

// ─────────────────────────────────────────────────────────
// BOT COMMANDS
// ─────────────────────────────────────────────────────────
async function cmdStart(chatId, firstName) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: '🎮 *Halo ' + firstName + '!*\nBot Admin *GameStore ID* aktif ✅\n\nKetik /help untuk semua perintah.',
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({ inline_keyboard: [[
      { text: '📦 Order Pending', callback_data: 'menu_orders' },
      { text: '📊 Statistik', callback_data: 'menu_stats' }
    ]]})
  });
}

async function cmdHelp(chatId) {
  await kirimPesan(chatId,
'📖 *Perintah Bot Admin*\n━━━━━━━━━━━━━━━━━━━━\n\n' +
'*INFO*\n/start /help /id /status\n\n' +
'*ORDER*\n/orders /pending /confirmed /stats\n\n' +
'*PROSES*\n' +
'/cek ORDERID\n/konfirmasi ORDERID\n/tolak ORDERID\n/hapus ORDERID\n/reset\n\n' +
'💡 _Tombol ✅ ❌ muncul otomatis di setiap order_'
  );
}

async function cmdOrders(chatId) {
  var all = Array.from(orders.values());
  if (!all.length) { await kirimPesan(chatId, '📭 Belum ada order.'); return; }
  var teks = '📦 *Order (' + all.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  teks += '🟡' + all.filter(function(o){return o.status==='pending';}).length +
          ' | ✅' + all.filter(function(o){return o.status==='confirmed';}).length +
          ' | ❌' + all.filter(function(o){return o.status==='rejected';}).length + '\n━━━━━━━━━━━━━━━━━━━━\n';
  all.slice(-10).reverse().forEach(function(o) {
    var ic = o.status==='pending'?'🟡':o.status==='confirmed'?'✅':'❌';
    teks += '\n' + ic + ' *#' + o.orderId + '*\n   ' + o.gameName + ' — ' + o.paket + '\n   👤 ' + o.userId + (o.nickname?' ('+o.nickname+')':'') + ' | 💰 ' + o.total + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdPending(chatId) {
  var pending = Array.from(orders.values()).filter(function(o){return o.status==='pending';});
  if (!pending.length) { await kirimPesan(chatId, '✅ Tidak ada order pending!'); return; }
  var teks = '🟡 *Pending (' + pending.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  pending.forEach(function(o,i) {
    var wkt = new Date(o.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
    teks += '\n*' + (i+1) + '. #' + o.orderId + '*\n   🎮 ' + o.gameName + ' — ' + o.paket + '\n   👤 ' + o.userId + (o.nickname?' ('+o.nickname+')':'') + '\n   📱 ' + o.phone + '\n   💰 ' + o.total + ' | ⏰ ' + wkt + '\n   ➡️ /konfirmasi ' + o.orderId + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdConfirmed(chatId) {
  var confirmed = Array.from(orders.values()).filter(function(o){return o.status==='confirmed';});
  if (!confirmed.length) { await kirimPesan(chatId, '📭 Belum ada yang dikonfirmasi.'); return; }
  var teks = '✅ *Terkonfirmasi (' + confirmed.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  confirmed.slice(-10).reverse().forEach(function(o,i) {
    teks += '\n*' + (i+1) + '. #' + o.orderId + '*\n   ' + o.gameName + ' — ' + o.paket + '\n   👤 ' + o.userId + (o.nickname?' ('+o.nickname+')':'') + ' | 💰 ' + o.total + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdStats(chatId) {
  var all = Array.from(orders.values());
  var today = new Date().toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'});
  var todayO = all.filter(function(o){return new Date(o.time).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})===today;});
  var gs = {};
  all.forEach(function(o){ if(!gs[o.game]) gs[o.game]={name:o.gameName,count:0}; gs[o.game].count++; });
  var gl = Object.values(gs).sort(function(a,b){return b.count-a.count;}).map(function(g){return '   • '+g.name+': '+g.count;}).join('\n');
  await kirimPesan(chatId,
'📊 *Statistik GameStore ID*\n━━━━━━━━━━━━━━━━━━━━\n' +
'📅 Hari ini: ' + todayO.length + ' order\n' +
'📦 Total: ' + all.length + '\n' +
'🟡 Pending: ' + all.filter(function(o){return o.status==='pending';}).length + '\n' +
'✅ Konfirmasi: ' + all.filter(function(o){return o.status==='confirmed';}).length + '\n' +
'❌ Ditolak: ' + all.filter(function(o){return o.status==='rejected';}).length + '\n\n' +
'🎮 Per Game:\n' + (gl||'   Belum ada order')
  );
}

async function cmdStatus(chatId) {
  var up = process.uptime();
  var all = Array.from(orders.values());
  await kirimPesan(chatId,
'🖥 *Status Server*\n━━━━━━━━━━━━━━━━━━━━\n' +
'✅ Server: Online\n⏱ Uptime: ' + Math.floor(up/3600) + 'j ' + Math.floor((up%3600)/60) + 'm\n' +
'📦 Order: ' + all.length + ' | 🟡 Pending: ' + all.filter(function(o){return o.status==='pending';}).length
  );
}

async function detailOrder(oid, chatId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  var wkt = new Date(o.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
  var stxt = o.status==='pending'?'🟡 Pending':o.status==='confirmed'?'✅ Dikonfirmasi':'❌ Ditolak';
  var teks = '📋 *Detail #' + oid + '*\n━━━━━━━━━━━━━━━━━━━━\n' +
    '🎮 ' + o.gameName + '\n👤 ' + o.uidLabel + ': `' + o.userId + '`' +
    (o.nickname?'\n✅ Nickname: *'+o.nickname+'*':'') +
    (o.server?'\n🖥 Server: `'+o.server+'`':'') +
    '\n📱 HP: ' + o.phone + '\n💎 ' + o.paket + '\n💰 ' + o.total + '\n⏰ ' + wkt + ' WIB\n📌 ' + stxt;
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
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Sudah diproses: ' + o.status); return; }
  o.status = 'confirmed'; orders.set(oid, o);
  if (msgId) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId,
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '✅ DIKONFIRMASI', callback_data: 'done' }]] })
  }).catch(function(){});
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'Markdown',
    text: '✅ *ORDER #' + oid + ' DIKONFIRMASI!*\n━━━━━━━━━━━━━━━━━━━━\n🎮 ' + o.gameName + '\n👤 ' + o.uidLabel + ': `' + o.userId + '`' +
    (o.nickname?'\n✅ Nickname: *'+o.nickname+'*':'') +
    (o.server?'\n🖥 Server: `'+o.server+'`':'') +
    '\n📱 HP: ' + o.phone + '\n💎 ' + o.paket + '\n💰 ' + o.total + '\n━━━━━━━━━━━━━━━━━━━━\n⚡ *Proses top up sekarang!*'
  });
}

async function prosesTolak(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Sudah diproses: ' + o.status); return; }
  o.status = 'rejected'; orders.set(oid, o);
  if (msgId) await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: msgId,
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '❌ DITOLAK', callback_data: 'done' }]] })
  }).catch(function(){});
  await tg('sendMessage', { chat_id: chatId, parse_mode: 'Markdown',
    text: '❌ *ORDER #' + oid + ' DITOLAK*\n🎮 ' + o.gameName + ' — ' + o.paket + '\n👤 ' + o.userId + '\n📱 ' + o.phone + '\n💰 ' + o.total
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
      if (i === retries - 1) { console.error('TG ' + method + ' gagal: ' + desc); return null; }
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
    console.log(res.data.ok ? '✅ Webhook: ' + url : '⚠️ ' + res.data.description);
    if (res.data.ok) await tg('sendMessage', { chat_id: ADMIN_CHAT_ID,
      text: '🚀 *Bot GameStore ID Online!*\nSiap terima order. Ketik /start', parse_mode: 'Markdown' });
  } catch (err) { console.error('setupWebhook:', err.message); }
}

app.listen(PORT, async function() {
  console.log('🚀 GameStore ID port ' + PORT);
  await setupWebhook();
});
