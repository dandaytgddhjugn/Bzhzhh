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
var settings = { maintenance: false, announcement: '' };

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
// CEK ID PLAYER — REAL API
// ─────────────────────────────────────────────────────────
app.post('/api/cek-id', async function(req, res) {
  var game   = (req.body.game || '').trim();
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

// ── CEK ID FUNGSI UTAMA ───────────────────────────────────
async function cekIdPlayer(game, userId, server) {

  // Helper headers mirip browser
  var browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://www.codashop.com',
    'Referer': 'https://www.codashop.com/id-id/',
    'Content-Type': 'application/json;charset=UTF-8'
  };

  try {
    switch (game) {

      // ── FREE FIRE ─────────────────────────────────────
      case 'ff': {
        // Method 1: Codashop ID check endpoint
        try {
          var r = await axios.post(
            'https://order.codashop.com/api/snapshot/ff/create',
            {
              userId: userId,
              voucherTypeId: 'FF_ID_1',
              countryCode: 'ID'
            },
            { headers: { ...browserHeaders, 'Referer': 'https://www.codashop.com/id-id/free-fire' }, timeout: 8000 }
          );
          if (r.data && r.data.playerName) {
            return { ok: true, nickname: r.data.playerName };
          }
        } catch(e1) {}

        // Method 2: Moonton FF API
        try {
          var r2 = await axios.post(
            'https://order.codashop.com/api/snapshot',
            {
              "voucherPricePoint.id": 13799,
              "voucherPricePoint.price": 1500,
              "voucherPricePoint.variationId": "ff-50-id",
              "gameProductId": "FF_ID",
              "checkoutId": "",
              "userId": userId,
              "zoneId": "",
              "productId": "FF_ID",
              "countryCode": "ID",
              "paymentChannel": "DC_BRI",
              "currency": "IDR"
            },
            { headers: { ...browserHeaders, 'Referer': 'https://www.codashop.com/id-id/free-fire' }, timeout: 8000 }
          );
          if (r2.data && r2.data.result && r2.data.result.playerName) {
            return { ok: true, nickname: r2.data.result.playerName };
          }
          if (r2.data && r2.data.username) {
            return { ok: true, nickname: r2.data.username };
          }
        } catch(e2) {}

        // Method 3: UniPin API
        try {
          var r3 = await axios.post(
            'https://store.unipin.com/api/verify_account.php',
            JSON.stringify({ game_code: 'ff', user_id: userId, server_id: '' }),
            { headers: { ...browserHeaders, 'Referer': 'https://store.unipin.com/' }, timeout: 8000 }
          );
          if (r3.data && r3.data.username) {
            return { ok: true, nickname: r3.data.username };
          }
          if (r3.data && r3.data.name) {
            return { ok: true, nickname: r3.data.name };
          }
        } catch(e3) {}

        // Method 4: VIP Reseller API
        try {
          var r4 = await axios.get(
            'https://api.vipreseller.id/v1/check-nick?game=freefire&user_id=' + userId,
            { headers: { 'User-Agent': browserHeaders['User-Agent'] }, timeout: 8000 }
          );
          if (r4.data && r4.data.data && r4.data.data.nickname) {
            return { ok: true, nickname: r4.data.data.nickname };
          }
        } catch(e4) {}

        return { ok: false, message: 'ID tidak ditemukan. Pastikan User ID Free Fire benar.' };
      }

      // ── MOBILE LEGENDS ───────────────────────────────
      case 'mlbb': {
        if (!server) return { ok: false, message: 'Zone ID wajib diisi untuk Mobile Legends!' };

        // Method 1: Codashop MLBB
        try {
          var r = await axios.post(
            'https://order.codashop.com/api/snapshot',
            {
              "voucherPricePoint.id": 14313,
              "voucherPricePoint.price": 3000,
              "voucherPricePoint.variationId": "mlbb-11-id",
              "gameProductId": "MLBB_ID",
              "checkoutId": "",
              "userId": userId,
              "zoneId": server,
              "productId": "MLBB_ID",
              "countryCode": "ID",
              "paymentChannel": "DC_BRI",
              "currency": "IDR"
            },
            { headers: { ...browserHeaders, 'Referer': 'https://www.codashop.com/id-id/mobile-legends' }, timeout: 8000 }
          );
          if (r.data && r.data.result && r.data.result.playerName) {
            return { ok: true, nickname: r.data.result.playerName };
          }
          if (r.data && r.data.username) {
            return { ok: true, nickname: r.data.username };
          }
        } catch(e1) {}

        // Method 2: Moonton official check
        try {
          var r2 = await axios.post(
            'https://api.mobilelegends.com/base/misc/checkUser',
            { uid: userId, zoneId: server },
            { headers: { ...browserHeaders, 'Referer': 'https://www.mobilelegends.com/' }, timeout: 8000 }
          );
          if (r2.data && r2.data.data && r2.data.data.name) {
            return { ok: true, nickname: r2.data.data.name };
          }
        } catch(e2) {}

        // Method 3: VIP Reseller
        try {
          var r3 = await axios.get(
            'https://api.vipreseller.id/v1/check-nick?game=mobilelegend&user_id=' + userId + '&zone_id=' + server,
            { headers: { 'User-Agent': browserHeaders['User-Agent'] }, timeout: 8000 }
          );
          if (r3.data && r3.data.data && r3.data.data.nickname) {
            return { ok: true, nickname: r3.data.data.nickname };
          }
        } catch(e3) {}

        // Method 4: Games.unipin
        try {
          var r4 = await axios.post(
            'https://games.unipin.com/id/mobilelegends/verify',
            { user_id: userId, zone_id: server },
            { headers: { ...browserHeaders }, timeout: 8000 }
          );
          if (r4.data && (r4.data.username || r4.data.nickname || r4.data.name)) {
            return { ok: true, nickname: r4.data.username || r4.data.nickname || r4.data.name };
          }
        } catch(e4) {}

        return { ok: false, message: 'ID tidak ditemukan. Cek User ID dan Zone ID Mobile Legends.' };
      }

      // ── PUBG MOBILE ──────────────────────────────────
      case 'pubg': {
        // Method 1: Codashop PUBG
        try {
          var r = await axios.post(
            'https://order.codashop.com/api/snapshot',
            {
              "voucherPricePoint.id": 15046,
              "voucherPricePoint.price": 15000,
              "voucherPricePoint.variationId": "pubgm-60-id",
              "gameProductId": "PUBGM_ID",
              "checkoutId": "",
              "userId": userId,
              "zoneId": "",
              "productId": "PUBGM_ID",
              "countryCode": "ID",
              "paymentChannel": "DC_BRI",
              "currency": "IDR"
            },
            { headers: { ...browserHeaders, 'Referer': 'https://www.codashop.com/id-id/pubg-mobile' }, timeout: 8000 }
          );
          if (r.data && r.data.result && r.data.result.playerName) {
            return { ok: true, nickname: r.data.result.playerName };
          }
          if (r.data && r.data.username) {
            return { ok: true, nickname: r.data.username };
          }
        } catch(e1) {}

        // Method 2: VIP Reseller
        try {
          var r2 = await axios.get(
            'https://api.vipreseller.id/v1/check-nick?game=pubgmobile&user_id=' + userId,
            { headers: { 'User-Agent': browserHeaders['User-Agent'] }, timeout: 8000 }
          );
          if (r2.data && r2.data.data && r2.data.data.nickname) {
            return { ok: true, nickname: r2.data.data.nickname };
          }
        } catch(e2) {}

        // Method 3: UniPin
        try {
          var r3 = await axios.post(
            'https://store.unipin.com/api/verify_account.php',
            JSON.stringify({ game_code: 'pubgm', user_id: userId, server_id: '' }),
            { headers: browserHeaders, timeout: 8000 }
          );
          if (r3.data && (r3.data.username || r3.data.name)) {
            return { ok: true, nickname: r3.data.username || r3.data.name };
          }
        } catch(e3) {}

        return { ok: false, message: 'ID tidak ditemukan. Pastikan Player ID PUBG Mobile benar.' };
      }

      // ── GENSHIN IMPACT ───────────────────────────────
      case 'genshin': {
        // Genshin tidak ada API publik resmi, tapi bisa via HoYoLAB
        try {
          var r = await axios.get(
            'https://api-account-os.hoyolab.com/auth/api/getUserAccountInfoByUid?uid=' + userId,
            {
              headers: {
                'User-Agent': browserHeaders['User-Agent'],
                'Referer': 'https://www.hoyolab.com/',
                'x-rpc-language': 'id-id'
              },
              timeout: 8000
            }
          );
          if (r.data && r.data.data && r.data.data.user_info) {
            var name = r.data.data.user_info.nickname;
            if (name) return { ok: true, nickname: name };
          }
        } catch(e) {}

        // VIP Reseller Genshin
        try {
          var r2 = await axios.get(
            'https://api.vipreseller.id/v1/check-nick?game=genshinimpact&user_id=' + userId + (server ? '&zone_id=' + server : ''),
            { headers: { 'User-Agent': browserHeaders['User-Agent'] }, timeout: 8000 }
          );
          if (r2.data && r2.data.data && r2.data.data.nickname) {
            return { ok: true, nickname: r2.data.data.nickname };
          }
        } catch(e2) {}

        return {
          ok: false,
          message: 'Genshin Impact tidak tersedia cek ID otomatis. Pastikan UID sudah benar sebelum lanjut.',
          canSkip: true
        };
      }

      // ── COD MOBILE ───────────────────────────────────
      case 'cod': {
        try {
          var r = await axios.get(
            'https://api.vipreseller.id/v1/check-nick?game=codmobile&user_id=' + userId,
            { headers: { 'User-Agent': browserHeaders['User-Agent'] }, timeout: 8000 }
          );
          if (r.data && r.data.data && r.data.data.nickname) {
            return { ok: true, nickname: r.data.data.nickname };
          }
        } catch(e) {}

        return {
          ok: false,
          message: 'COD Mobile tidak tersedia cek ID otomatis. Pastikan Player ID sudah benar.',
          canSkip: true
        };
      }

      // ── VALORANT ────────────────────────────────────
      case 'valorant': {
        // Valorant Riot ID format: name#tag
        if (userId.includes('#')) {
          var parts = userId.split('#');
          var gameName = parts[0];
          var tagLine = parts[1];
          try {
            var r = await axios.get(
              'https://api.henrikdev.xyz/valorant/v1/account/' + encodeURIComponent(gameName) + '/' + encodeURIComponent(tagLine),
              {
                headers: { 'User-Agent': browserHeaders['User-Agent'] },
                timeout: 10000
              }
            );
            if (r.data && r.data.data && r.data.data.name) {
              return {
                ok: true,
                nickname: r.data.data.name + '#' + r.data.data.tag + ' (Level ' + (r.data.data.account_level || '?') + ')'
              };
            }
          } catch(e) {}
        }
        return {
          ok: false,
          message: 'Masukkan Riot ID format: NamaKamu#TAG (contoh: ProGamer#1234)',
          canSkip: false
        };
      }

      // ── HONKAI STAR RAIL ─────────────────────────────
      case 'honkai': {
        try {
          var r = await axios.get(
            'https://api-account-os.hoyolab.com/auth/api/getUserAccountInfoByUid?uid=' + userId,
            {
              headers: {
                'User-Agent': browserHeaders['User-Agent'],
                'Referer': 'https://www.hoyolab.com/'
              },
              timeout: 8000
            }
          );
          if (r.data && r.data.data && r.data.data.user_info) {
            var name = r.data.data.user_info.nickname;
            if (name) return { ok: true, nickname: name };
          }
        } catch(e) {}

        return {
          ok: false,
          message: 'Honkai: Star Rail tidak tersedia cek ID otomatis. Pastikan UID sudah benar.',
          canSkip: true
        };
      }

      // ── MAGIC CHESS ─────────────────────────────────
      case 'ml2': {
        // Magic Chess pakai akun MLBB
        if (!server) return {
          ok: false,
          message: 'Masukkan Zone ID untuk Magic Chess (sama dengan Zone ID Mobile Legends kamu).',
          canSkip: false
        };
        try {
          var r = await axios.post(
            'https://order.codashop.com/api/snapshot',
            {
              "voucherPricePoint.id": 14313,
              "voucherPricePoint.price": 3000,
              "voucherPricePoint.variationId": "mlbb-11-id",
              "gameProductId": "MLBB_ID",
              "checkoutId": "",
              "userId": userId,
              "zoneId": server,
              "productId": "MLBB_ID",
              "countryCode": "ID",
              "paymentChannel": "DC_BRI",
              "currency": "IDR"
            },
            { headers: { ...browserHeaders, 'Referer': 'https://www.codashop.com/id-id/mobile-legends' }, timeout: 8000 }
          );
          if (r.data && r.data.result && r.data.result.playerName) {
            return { ok: true, nickname: r.data.result.playerName };
          }
          if (r.data && r.data.username) {
            return { ok: true, nickname: r.data.username };
          }
        } catch(e) {}
        return { ok: false, message: 'ID tidak ditemukan. Cek User ID dan Zone ID.' };
      }

      default:
        return { ok: false, message: 'Cek ID tidak tersedia untuk game ini.', canSkip: true };
    }
  } catch (err) {
    console.error('cekIdPlayer [' + game + ']:', err.message);
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { ok: false, message: 'Koneksi timeout. Coba lagi dalam beberapa detik.', canSkip: true };
    }
    return { ok: false, message: 'Gagal cek ID. Lanjutkan jika yakin ID sudah benar.', canSkip: true };
  }
}

// ─────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// SUBMIT ORDER
// ─────────────────────────────────────────────────────────
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
      uidLabel: b.uidLabel, userId: b.userId, nickname: b.nickname || '',
      server: b.server || '', phone: b.phone || '-',
      paket: b.paket, total: b.total,
      status: 'pending', time: new Date().toISOString(),
      imageBuffer: req.file.buffer, imageMime: req.file.mimetype
    });

    await kirimNotifAdmin(b.orderId);
    console.log('✅ Order:', b.orderId);
    res.json({ ok: true, orderId: b.orderId });
  } catch (err) {
    console.error('❌ Order error:', err.message);
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
'🔔 *ORDER BARU MASUK!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 *Order ID:* `#' + o.orderId + '`\n' +
'🎮 *Game:* ' + o.gameName + '\n' +
'👤 *' + o.uidLabel + ':* `' + o.userId + '`' +
(o.nickname ? '\n✅ *Nickname:* ' + o.nickname : '') +
(o.server ? '\n🖥 *Server:* `' + o.server + '`' : '') + '\n' +
'📱 *HP:* ' + o.phone + '\n' +
'💎 *Paket:* ' + o.paket + '\n' +
'💰 *Total:* *' + o.total + '*\n' +
'⏰ *Waktu:* ' + waktu + ' WIB\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'📸 _Bukti transfer terlampir_',
    parse_mode: 'Markdown'
  });

  var fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, { filename: 'bukti_' + o.orderId + '.jpg', contentType: o.imageMime });
  fd.append('caption',
    '📸 Bukti #' + o.orderId + '\n' +
    o.gameName + ' | ' + o.paket + '\n' +
    o.total + '\n' +
    o.userId + (o.nickname ? ' (' + o.nickname + ')' : '') +
    (o.server ? ' / ' + o.server : '') + '\n📱 ' + o.phone
  );
  await axios.post('https://api.telegram.org/bot' + BOT_TOKEN + '/sendPhoto', fd, { headers: fd.getHeaders(), timeout: 30000 });

  var sid = o.orderId.substring(0, 20);
  await tg('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text: '⚡ *Aksi untuk Order #' + o.orderId + '*\nPilih tindakan:',
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

// ─────────────────────────────────────────────────────────
// WEBHOOK TELEGRAM
// ─────────────────────────────────────────────────────────
app.post('/webhook/' + BOT_TOKEN, async function(req, res) {
  res.sendStatus(200);
  var u = req.body;
  if (!u) return;

  try {
    // Callback query
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
      orders.forEach(function(o) {
        if (o.orderId.substring(0, 20) === shortId) matchOrder = o;
      });
      var fullId = matchOrder ? matchOrder.orderId : shortId;

      if      (prefix === 'ok')  await prosesKonfirmasi(fullId, cbChat, cbMsg);
      else if (prefix === 'no')  await prosesTolak(fullId, cbChat, cbMsg);
      else if (prefix === 'det') await detailOrder(fullId, cbChat);
      else if (cbData === 'mu')  await cmdOrders(cbChat);
      else if (cbData === 'ms')  await cmdStats(cbChat);
      else if (cbData === 'mp')  await cmdPending(cbChat);
      return;
    }

    if (!u.message) return;
    var msg = u.message;
    var chatId = String(msg.chat.id);
    var text = (msg.text || '').trim();
    var firstName = (msg.from && msg.from.first_name) || 'Admin';

    if (chatId !== ADMIN_CHAT_ID) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '⛔ *Akses Ditolak*\n\nBot ini khusus untuk admin GameStore ID.\n\nID Telegram kamu: `' + chatId + '`',
        parse_mode: 'Markdown'
      });
      return;
    }

    // ── COMMAND ROUTING ──────────────────────────────────
    if      (text === '/start')            await cmdStart(chatId, firstName);
    else if (text === '/help' || text === '/menu') await cmdHelp(chatId);
    else if (text === '/orders' || text === '/semua') await cmdOrders(chatId);
    else if (text === '/pending')          await cmdPending(chatId);
    else if (text === '/confirmed' || text === '/selesai') await cmdConfirmed(chatId);
    else if (text === '/stats' || text === '/statistik') await cmdStats(chatId);
    else if (text === '/status')           await cmdStatus(chatId);
    else if (text === '/id')               await kirimPesan(chatId, '🆔 Chat ID kamu: `' + chatId + '`\n👤 Nama: ' + firstName);
    else if (text === '/reset') {
      var jml = orders.size;
      orders.clear();
      await kirimPesan(chatId, '🗑 Semua *' + jml + '* order berhasil dihapus.');

    } else if (text === '/maintenance on') {
      settings.maintenance = true;
      await kirimPesan(chatId, '🔴 *Maintenance mode AKTIF*\nWeb tidak bisa menerima order baru sementara.');

    } else if (text === '/maintenance off') {
      settings.maintenance = false;
      await kirimPesan(chatId, '🟢 *Maintenance mode NONAKTIF*\nWeb kembali normal dan bisa menerima order.');

    } else if (text === '/maintenance') {
      await kirimPesan(chatId,
        '⚙️ *Status Maintenance*\n\nSaat ini: *' + (settings.maintenance ? '🔴 AKTIF' : '🟢 NONAKTIF') + '*\n\n' +
        'Perintah:\n`/maintenance on` — Aktifkan\n`/maintenance off` — Nonaktifkan'
      );

    } else if (text.startsWith('/umumkan ')) {
      var ann = text.replace('/umumkan ', '').trim();
      if (ann === 'hapus') {
        settings.announcement = '';
        await kirimPesan(chatId, '🗑 Pengumuman berhasil dihapus.');
      } else {
        settings.announcement = ann;
        await kirimPesan(chatId, '📢 *Pengumuman berhasil diset:*\n\n_' + ann + '_\n\nHapus dengan `/umumkan hapus`');
      }

    } else if (text === '/umumkan') {
      await kirimPesan(chatId,
        '📢 *Pengumuman Saat Ini:*\n\n' + (settings.announcement ? '_' + settings.announcement + '_' : '_(kosong)_') +
        '\n\nUntuk mengubah:\n`/umumkan teks pengumuman kamu`\n`/umumkan hapus` — menghapus'
      );

    } else if (text.startsWith('/hapus ')) {
      var hoid = text.replace('/hapus ', '').trim();
      if (orders.has(hoid)) {
        orders.delete(hoid);
        await kirimPesan(chatId, '🗑 Order `#' + hoid + '` berhasil dihapus.');
      } else {
        await kirimPesan(chatId, '❌ Order `#' + hoid + '` tidak ditemukan.\n\nPastikan Order ID benar (huruf kapital).');
      }

    } else if (text.startsWith('/cek ')) {
      await detailOrder(text.replace('/cek ', '').trim(), chatId);

    } else if (text.startsWith('/konfirmasi ')) {
      await prosesKonfirmasi(text.replace('/konfirmasi ', '').trim(), chatId, null);

    } else if (text.startsWith('/tolak ')) {
      await prosesTolak(text.replace('/tolak ', '').trim(), chatId, null);

    } else {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '❓ Perintah tidak dikenal: `' + text + '`\n\nKetik /help untuk daftar semua perintah.',
        parse_mode: 'Markdown',
        reply_markup: JSON.stringify({
          inline_keyboard: [[{ text: '📖 Lihat Semua Perintah', callback_data: 'help' }]]
        })
      });
    }

  } catch (err) { console.error('Webhook error:', err.message); }
});

// ─────────────────────────────────────────────────────────
// BOT COMMAND FUNCTIONS
// ─────────────────────────────────────────────────────────
async function cmdStart(chatId, firstName) {
  var all = Array.from(orders.values());
  var pending = all.filter(function(o){return o.status==='pending';}).length;
  await tg('sendMessage', {
    chat_id: chatId,
    text:
'🎮 *Halo ' + firstName + '!*\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'*Bot Admin GameStore ID* aktif ✅\n\n' +
'📊 Status:\n' +
'• Web: ' + (settings.maintenance ? '🔴 Maintenance' : '🟢 Normal') + '\n' +
'• Order hari ini: *' + all.length + '*\n' +
'• Pending: *' + pending + '*\n\n' +
(settings.announcement ? '📢 Pengumuman aktif:\n_' + settings.announcement + '_\n\n' : '') +
'Ketik /help untuk semua perintah.',
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [
        [
          { text: '🟡 Order Pending (' + pending + ')', callback_data: 'mp' },
        ],
        [
          { text: '📦 Semua Order', callback_data: 'mu' },
          { text: '📊 Statistik', callback_data: 'ms' }
        ]
      ]
    })
  });
}

async function cmdHelp(chatId) {
  await kirimPesan(chatId,
'📖 *Semua Perintah Bot Admin GameStore ID*\n' +
'━━━━━━━━━━━━━━━━━━━━\n\n' +
'*📊 INFO*\n' +
'`/start` — Menu utama + statistik\n' +
'`/help` — Panduan ini\n' +
'`/id` — Lihat Chat ID kamu\n' +
'`/status` — Status server & bot\n' +
'`/stats` — Statistik lengkap per game\n\n' +
'*📦 KELOLA ORDER*\n' +
'`/orders` — Semua order (10 terbaru)\n' +
'`/pending` — Order yang belum diproses\n' +
'`/confirmed` — Order yang sudah selesai\n' +
'`/cek ORDERID` — Detail 1 order\n' +
'`/konfirmasi ORDERID` — Konfirmasi order\n' +
'`/tolak ORDERID` — Tolak order\n' +
'`/hapus ORDERID` — Hapus 1 order\n' +
'`/reset` — Hapus semua order\n\n' +
'*⚙️ PENGATURAN WEB*\n' +
'`/maintenance` — Cek status\n' +
'`/maintenance on` — Aktifkan mode maintenance\n' +
'`/maintenance off` — Matikan maintenance\n' +
'`/umumkan TEKS` — Set pengumuman di web\n' +
'`/umumkan hapus` — Hapus pengumuman\n\n' +
'*Contoh penggunaan:*\n' +
'`/cek ABC123XYZ`\n' +
'`/konfirmasi ABC123XYZ`\n' +
'`/tolak ABC123XYZ` \n' +
'`/umumkan Server sedang ramai, mohon sabar 🙏`\n\n' +
'━━━━━━━━━━━━━━━━━━━━\n' +
'💡 _Tombol ✅ ❌ muncul otomatis di setiap order baru_'
  );
}

async function cmdOrders(chatId) {
  var all = Array.from(orders.values());
  if (!all.length) {
    await kirimPesan(chatId, '📭 Belum ada order masuk.\n\nOrder akan muncul di sini saat ada pembeli melakukan top up.');
    return;
  }
  var p = all.filter(function(o){return o.status==='pending';}).length;
  var c = all.filter(function(o){return o.status==='confirmed';}).length;
  var r = all.filter(function(o){return o.status==='rejected';}).length;
  var teks = '📦 *Semua Order (' + all.length + ')*\n';
  teks += '━━━━━━━━━━━━━━━━━━━━\n';
  teks += '🟡 Pending: *' + p + '* | ✅ Selesai: *' + c + '* | ❌ Tolak: *' + r + '*\n';
  teks += '━━━━━━━━━━━━━━━━━━━━\n';
  var tampil = all.slice(-10).reverse();
  tampil.forEach(function(o) {
    var ic = o.status==='pending'?'🟡':o.status==='confirmed'?'✅':'❌';
    var wkt = new Date(o.time).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
    teks += '\n' + ic + ' `#' + o.orderId.substring(0,12) + '...`\n';
    teks += '   🎮 ' + o.gameName + ' — *' + o.paket + '*\n';
    teks += '   👤 ' + o.userId + (o.nickname?' ('+o.nickname+')':'') + '\n';
    teks += '   💰 *' + o.total + '* | ⏰ ' + wkt + '\n';
  });
  if (all.length > 10) teks += '\n_...dan ' + (all.length-10) + ' order lainnya_';
  await kirimPesan(chatId, teks);
}

async function cmdPending(chatId) {
  var pending = Array.from(orders.values()).filter(function(o){return o.status==='pending';});
  if (!pending.length) {
    await kirimPesan(chatId, '✅ *Tidak ada order pending!*\n\nSemua order sudah diproses. Good job! 👍');
    return;
  }
  var teks = '🟡 *Order Pending (' + pending.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  pending.forEach(function(o, i) {
    var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += '\n*' + (i+1) + '. `#' + o.orderId + '`*\n';
    teks += '   🎮 ' + o.gameName + ' — *' + o.paket + '*\n';
    teks += '   👤 ' + o.userId + (o.server?' / '+o.server:'') + (o.nickname?' ✅_'+o.nickname+'_':'') + '\n';
    teks += '   📱 ' + o.phone + '\n';
    teks += '   💰 *' + o.total + '*\n';
    teks += '   ⏰ ' + wkt + '\n';
    teks += '   ↪️ `/konfirmasi ' + o.orderId + '`\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdConfirmed(chatId) {
  var confirmed = Array.from(orders.values()).filter(function(o){return o.status==='confirmed';});
  if (!confirmed.length) {
    await kirimPesan(chatId, '📭 Belum ada order yang selesai dikonfirmasi.');
    return;
  }
  var teks = '✅ *Order Selesai (' + confirmed.length + ')*\n━━━━━━━━━━━━━━━━━━━━\n';
  confirmed.slice(-15).reverse().forEach(function(o, i) {
    var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    teks += '\n*' + (i+1) + '.* `#' + o.orderId + '`\n';
    teks += '   🎮 ' + o.gameName + ' — ' + o.paket + '\n';
    teks += '   👤 ' + o.userId + (o.nickname?' ('+o.nickname+')':'') + '\n';
    teks += '   💰 *' + o.total + '* | ⏰ ' + wkt + '\n';
  });
  await kirimPesan(chatId, teks);
}

async function cmdStats(chatId) {
  var all = Array.from(orders.values());
  var today = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  var todayO = all.filter(function(o){
    return new Date(o.time).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})===today;
  });
  var todayDone = todayO.filter(function(o){return o.status==='confirmed';});

  var gs = {};
  all.forEach(function(o){
    if (!gs[o.game]) gs[o.game] = {name:o.gameName, total:0, done:0, omzet:0};
    gs[o.game].total++;
    if (o.status==='confirmed') {
      gs[o.game].done++;
      var nom = parseInt((o.total||'').replace(/\D/g,'')) || 0;
      gs[o.game].omzet += nom;
    }
  });
  var gl = Object.values(gs)
    .sort(function(a,b){return b.total-a.total;})
    .map(function(g){
      return '   • *' + g.name + '*: ' + g.total + ' order (' + g.done + ' selesai)';
    }).join('\n');

  var totalOmzet = 0;
  Array.from(orders.values()).filter(function(o){return o.status==='confirmed';}).forEach(function(o){
    totalOmzet += parseInt((o.total||'').replace(/\D/g,'')) || 0;
  });

  await kirimPesan(chatId,
'📊 *Statistik Lengkap GameStore ID*\n━━━━━━━━━━━━━━━━━━━━\n\n' +
'📅 *Hari ini (' + today + ')*\n' +
'   Masuk: *' + todayO.length + '* order\n' +
'   Selesai: *' + todayDone.length + '* order\n\n' +
'📦 *Total Semua Order*\n' +
'   🟡 Pending: *' + all.filter(function(o){return o.status==='pending';}).length + '*\n' +
'   ✅ Selesai: *' + all.filter(function(o){return o.status==='confirmed';}).length + '*\n' +
'   ❌ Ditolak: *' + all.filter(function(o){return o.status==='rejected';}).length + '*\n' +
'   📊 Total: *' + all.length + '*\n\n' +
'💰 *Estimasi Omzet (order selesai)*\n' +
'   Rp ' + totalOmzet.toLocaleString('id-ID') + '\n\n' +
'🎮 *Per Game*\n' + (gl || '   Belum ada order') + '\n\n' +
'⚙️ Status Web: ' + (settings.maintenance ? '🔴 Maintenance' : '🟢 Normal')
  );
}

async function cmdStatus(chatId) {
  var up = process.uptime();
  var all = Array.from(orders.values());
  var pending = all.filter(function(o){return o.status==='pending';}).length;
  await kirimPesan(chatId,
'🖥 *Status Server & Bot*\n━━━━━━━━━━━━━━━━━━━━\n' +
'✅ Server: *Online*\n' +
'✅ Bot Telegram: *Aktif*\n' +
'⏱ Uptime: *' + Math.floor(up/3600) + 'j ' + Math.floor((up%3600)/60) + 'm ' + Math.floor(up%60) + 'd*\n\n' +
'🌐 Web: ' + (settings.maintenance ? '🔴 *Maintenance*' : '🟢 *Normal*') + '\n' +
'📦 Total Order: *' + all.length + '*\n' +
'🟡 Pending: *' + pending + '*\n\n' +
(settings.announcement ? '📢 *Pengumuman Aktif:*\n_' + settings.announcement + '_\n\n' : '📢 Tidak ada pengumuman aktif\n\n') +
'🔗 Health check:\n`' + WEBHOOK_URL + '/health`'
  );
}

async function detailOrder(oid, chatId) {
  var o = orders.get(oid);
  if (!o) {
    await kirimPesan(chatId,
      '❌ Order `#' + oid + '` *tidak ditemukan.*\n\n' +
      'Pastikan:\n• Order ID benar (huruf kapital semua)\n• Order belum dihapus\n\n' +
      'Cari order di `/pending` atau `/orders`'
    );
    return;
  }
  var wkt = new Date(o.time).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  var stxt = o.status==='pending'?'🟡 Menunggu konfirmasi':o.status==='confirmed'?'✅ Sudah selesai':'❌ Ditolak';
  var teks =
'📋 *Detail Order*\n━━━━━━━━━━━━━━━━━━━━\n' +
'🆔 ID: `#' + oid + '`\n' +
'🎮 Game: *' + o.gameName + '*\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.nickname ? '\n✅ Nickname: *' + o.nickname + '*' : '') +
(o.server ? '\n🖥 Server: `' + o.server + '`' : '') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: *' + o.paket + '*\n' +
'💰 Total: *' + o.total + '*\n' +
'⏰ Waktu: ' + wkt + ' WIB\n' +
'📌 Status: ' + stxt;

  if (o.status === 'pending') {
    var sid = oid.substring(0, 20);
    await tg('sendMessage', {
      chat_id: chatId, text: teks, parse_mode: 'Markdown',
      reply_markup: JSON.stringify({ inline_keyboard: [[
        { text: '✅ KONFIRMASI', callback_data: 'ok:' + sid },
        { text: '❌ TOLAK', callback_data: 'no:' + sid }
      ]]})
    });
  } else {
    await kirimPesan(chatId, teks);
  }
}

async function prosesKonfirmasi(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order ini sudah diproses sebelumnya.\nStatus saat ini: *' + o.status + '*'); return; }

  o.status = 'confirmed'; orders.set(oid, o);

  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '✅ SUDAH DIKONFIRMASI', callback_data: 'done' }]] })
    }).catch(function(){});
  }

  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'Markdown',
    text:
'✅ *ORDER #' + oid + ' DIKONFIRMASI!*\n━━━━━━━━━━━━━━━━━━━━\n' +
'🎮 *' + o.gameName + '*\n' +
'👤 ' + o.uidLabel + ': `' + o.userId + '`' +
(o.nickname ? '\n✅ Nickname: *' + o.nickname + '*' : '') +
(o.server ? '\n🖥 Server: `' + o.server + '`' : '') + '\n' +
'📱 HP: ' + o.phone + '\n' +
'💎 Paket: *' + o.paket + '*\n' +
'💰 Total: *' + o.total + '*\n━━━━━━━━━━━━━━━━━━━━\n' +
'⚡ *Silakan proses top up ke akun di atas sekarang!*'
  });
}

async function prosesTolak(oid, chatId, msgId) {
  var o = orders.get(oid);
  if (!o) { await kirimPesan(chatId, '❌ Order `#' + oid + '` tidak ditemukan.'); return; }
  if (o.status !== 'pending') { await kirimPesan(chatId, '⚠️ Order sudah diproses.\nStatus: *' + o.status + '*'); return; }

  o.status = 'rejected'; orders.set(oid, o);

  if (msgId) {
    await tg('editMessageReplyMarkup', {
      chat_id: chatId, message_id: msgId,
      reply_markup: JSON.stringify({ inline_keyboard: [[{ text: '❌ SUDAH DITOLAK', callback_data: 'done' }]] })
    }).catch(function(){});
  }

  await tg('sendMessage', {
    chat_id: chatId, parse_mode: 'Markdown',
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
      var res = await axios.post(
        'https://api.telegram.org/bot' + BOT_TOKEN + '/' + method,
        data,
        { timeout: 15000 }
      );
      return res.data;
    } catch (err) {
      var code = err.response && err.response.data && err.response.data.error_code;
      var desc = (err.response && err.response.data && err.response.data.description) || err.message;
      if (code === 400 || code === 403) { console.error('TG ' + code + ': ' + desc); return null; }
      if (i === retries-1) { console.error('TG ' + method + ' gagal setelah ' + retries + 'x: ' + desc); return null; }
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
      url: url,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true
    });
    if (res.data.ok) {
      console.log('✅ Webhook aktif: ' + url);
      await tg('sendMessage', {
        chat_id: ADMIN_CHAT_ID,
        text:
'🚀 *Bot GameStore ID Online!*\n━━━━━━━━━━━━━━━━━━━━\n\n' +
'✅ Server aktif\n' +
'✅ Webhook terpasang\n' +
'✅ Siap menerima order\n\n' +
'Ketik /start untuk menu utama\nKetik /help untuk semua perintah.',
        parse_mode: 'Markdown'
      });
    } else {
      console.log('⚠️ Webhook gagal: ' + res.data.description);
    }
  } catch (err) { console.error('setupWebhook error:', err.message); }
}

app.listen(PORT, async function() {
  console.log('🚀 GameStore ID jalan di port ' + PORT);
  await setupWebhook();
});
