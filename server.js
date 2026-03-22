require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const FormData = require('form-data');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CONFIG ─────────────────────────────────────────────────
const BOT_TOKEN     = '8788384268:AAHGQciMG0_RCwDDvPZeEibNObaCrzFIJpU';
const ADMIN_CHAT_ID = '7352381955';
const WEBHOOK_URL   = 'https://vfhf-production.up.railway.app';

const orders  = new Map();
const settings = { maintenance: false, announcement: '' };

// ── MULTER ─────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Hanya gambar'))
});

// ── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const all = [...orders.values()];
  res.json({
    status     : settings.maintenance ? 'Maintenance' : 'Online',
    maintenance: settings.maintenance,
    announcement: settings.announcement,
    orders     : { total: all.length, pending: all.filter(o=>o.status==='pending').length, confirmed: all.filter(o=>o.status==='confirmed').length, rejected: all.filter(o=>o.status==='rejected').length },
    uptime     : Math.floor(process.uptime()) + 's'
  });
});

// ── SUBMIT ORDER ───────────────────────────────────────────
app.post('/api/order', upload.single('bukti'), async (req, res) => {
  if (settings.maintenance)
    return res.status(503).json({ ok:false, message:'Website sedang maintenance. Coba lagi nanti.' });
  try {
    if (!req.file) return res.status(400).json({ ok:false, message:'Upload bukti dulu!' });
    const b = req.body;
    if (!b.orderId || !b.userId || !b.paket)
      return res.status(400).json({ ok:false, message:'Data tidak lengkap!' });

    orders.set(b.orderId, {
      orderId: b.orderId, game: b.game, gameName: b.gameName,
      uidLabel: b.uidLabel, userId: b.userId, server: b.server||'',
      phone: b.phone||'-', paket: b.paket, total: b.total,
      status: 'pending', time: new Date().toISOString(),
      imageBuffer: req.file.buffer, imageMime: req.file.mimetype
    });

    await notifAdmin(b.orderId);
    res.json({ ok:true, orderId: b.orderId });
  } catch(e) {
    console.error('order:', e.message);
    res.status(500).json({ ok:false, message: e.message });
  }
});

// ── NOTIF ADMIN ────────────────────────────────────────────
async function notifAdmin(orderId) {
  const o = orders.get(orderId); if (!o) return;
  const wkt = new Date(o.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});

  await tg('sendMessage',{
    chat_id: ADMIN_CHAT_ID, parse_mode:'Markdown',
    text:
`🔔 *ORDER BARU!*
━━━━━━━━━━━━━━━━━━━━
🆔 *ID:* \`#${o.orderId}\`
🎮 *Game:* ${o.gameName}
👤 *${o.uidLabel}:* \`${o.userId}\`${o.server?`\n🖥 *Server:* \`${o.server}\``:''}
📱 *HP:* ${o.phone}
💎 *Paket:* ${o.paket}
💰 *Total:* *${o.total}*
⏰ *Waktu:* ${wkt} WIB
━━━━━━━━━━━━━━━━━━━━
📸 _Bukti terlampir_`
  });

  const fd = new FormData();
  fd.append('chat_id', ADMIN_CHAT_ID);
  fd.append('photo', o.imageBuffer, { filename:`bukti_${o.orderId}.jpg`, contentType: o.imageMime });
  fd.append('caption', `📸 Bukti #${o.orderId}\n${o.gameName} | ${o.paket}\n${o.total}\n${o.userId}${o.server?' / '+o.server:''}\n📱 ${o.phone}`);
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, fd,
    { headers: fd.getHeaders(), timeout:30000 }).catch(e=>console.error('photo:',e.message));

  const sid = o.orderId.substring(0,20);
  await tg('sendMessage',{
    chat_id: ADMIN_CHAT_ID, parse_mode:'Markdown',
    text:`⚡ *Aksi untuk Order #${o.orderId}*`,
    reply_markup: JSON.stringify({ inline_keyboard:[[
      {text:'✅ KONFIRMASI', callback_data:`ok:${sid}`},
      {text:'❌ TOLAK',      callback_data:`no:${sid}`}
    ],[
      {text:'📋 Detail', callback_data:`det:${sid}`}
    ]]})
  });
}

// ── WEBHOOK TELEGRAM ───────────────────────────────────────
app.post(`/webhook/${BOT_TOKEN}`, async (req, res) => {
  res.sendStatus(200); // Balas cepat DULU
  const u = req.body; if (!u) return;

  try {
    // ── CALLBACK QUERY ──
    if (u.callback_query) {
      const cb     = u.callback_query;
      const cbChat = String(cb.message.chat.id);
      const cbMsg  = cb.message.message_id;
      const data   = cb.data || '';

      await tg('answerCallbackQuery',{ callback_query_id:cb.id, text:'⏳' });
      if (cbChat !== ADMIN_CHAT_ID) return;

      const [pfx, ...rest] = data.split(':');
      const sid = rest.join(':');
      let found = null;
      orders.forEach(o=>{ if(o.orderId.substring(0,20)===sid) found=o; });
      const fid = found ? found.orderId : sid;

      if      (pfx==='ok')  await doKonfirmasi(fid,cbChat,cbMsg);
      else if (pfx==='no')  await doTolak(fid,cbChat,cbMsg);
      else if (pfx==='det') await doDetail(fid,cbChat);
      else if (data==='mu') await cmdOrders(cbChat);
      else if (data==='ms') await cmdStats(cbChat);
      else if (data==='mp') await cmdPending(cbChat);
      return;
    }

    // ── PESAN TEKS ──
    if (!u.message) return;
    const msg    = u.message;
    const chatId = String(msg.chat.id);
    const text   = (msg.text||'').trim();
    const first  = (msg.from&&msg.from.first_name)||'Admin';

    // Bukan admin
    if (chatId !== ADMIN_CHAT_ID) {
      await tg('sendMessage',{chat_id:chatId,parse_mode:'Markdown',
        text:`⛔ *Akses Ditolak*\nBot ini khusus admin.\n\nID kamu: \`${chatId}\``});
      return;
    }

    // ROUTING
    if (text==='/start')                      { await cmdStart(chatId,first); }
    else if (text==='/help'||text==='/menu')  { await cmdHelp(chatId); }
    else if (text==='/orders'||text==='/semua'){ await cmdOrders(chatId); }
    else if (text==='/pending')               { await cmdPending(chatId); }
    else if (text==='/confirmed'||text==='/selesai'){ await cmdConfirmed(chatId); }
    else if (text==='/stats'||text==='/statistik'){ await cmdStats(chatId); }
    else if (text==='/status')                { await cmdStatus(chatId); }
    else if (text==='/id')                    { await tgMsg(chatId, `🆔 Chat ID kamu: \`${chatId}\`\n👤 Nama: ${first}`); }
    else if (text==='/reset')                 {
      const n=orders.size; orders.clear();
      await tgMsg(chatId,`🗑 *${n} order* berhasil dihapus.`);
    }
    else if (text==='/maintenance')           { await cmdMaintenance(chatId); }
    else if (text==='/maintenance on')        {
      settings.maintenance=true;
      await tgMsg(chatId,'🔴 *Maintenance AKTIF*\nWeb tidak bisa menerima order sementara.');
    }
    else if (text==='/maintenance off')       {
      settings.maintenance=false;
      await tgMsg(chatId,'🟢 *Maintenance NONAKTIF*\nWeb kembali normal.');
    }
    else if (text.startsWith('/umumkan '))    {
      const ann = text.replace('/umumkan ','').trim();
      if (ann==='hapus') { settings.announcement=''; await tgMsg(chatId,'🗑 Pengumuman dihapus.'); }
      else { settings.announcement=ann; await tgMsg(chatId,`📢 *Pengumuman diset:*\n\n_${ann}_`); }
    }
    else if (text==='/umumkan')               {
      await tgMsg(chatId,`📢 *Pengumuman aktif:*\n\n${settings.announcement||'_(kosong)_'}\n\nUbah: \`/umumkan teks kamu\`\nHapus: \`/umumkan hapus\``);
    }
    else if (text.startsWith('/hapus '))      {
      const oid=text.replace('/hapus ','').trim();
      if (orders.has(oid)) { orders.delete(oid); await tgMsg(chatId,`🗑 Order \`#${oid}\` dihapus.`); }
      else await tgMsg(chatId,`❌ Order \`#${oid}\` tidak ditemukan.`);
    }
    else if (text.startsWith('/cek '))        { await doDetail(text.replace('/cek ','').trim(),chatId); }
    else if (text.startsWith('/konfirmasi ')) { await doKonfirmasi(text.replace('/konfirmasi ','').trim(),chatId,null); }
    else if (text.startsWith('/tolak '))      { await doTolak(text.replace('/tolak ','').trim(),chatId,null); }
    else {
      await tgMsg(chatId,`❓ Perintah tidak dikenal: \`${text}\`\n\nKetik /help untuk daftar perintah.`);
    }

  } catch(e) { console.error('webhook:',e.message); }
});

// ── COMMAND FUNCTIONS ──────────────────────────────────────
async function cmdStart(chatId, first) {
  const all=[...orders.values()], p=all.filter(o=>o.status==='pending').length;
  await tg('sendMessage',{
    chat_id:chatId, parse_mode:'Markdown',
    text:
`🎮 *Halo ${first}! Bot Admin GameStore ID* ✅
━━━━━━━━━━━━━━━━━━━━
📊 Status web: ${settings.maintenance?'🔴 Maintenance':'🟢 Normal'}
📦 Total order: *${all.length}*
🟡 Pending: *${p}*
${settings.announcement?`\n📢 Pengumuman: _${settings.announcement}_\n`:''}
Ketik /help untuk semua perintah.`,
    reply_markup: JSON.stringify({ inline_keyboard:[[
      {text:`🟡 Pending (${p})`, callback_data:'mp'},
      {text:'📊 Statistik',       callback_data:'ms'}
    ],[
      {text:'📦 Semua Order', callback_data:'mu'}
    ]]})
  });
}

async function cmdHelp(chatId) {
  await tgMsg(chatId,
`📖 *Daftar Perintah Bot Admin*
━━━━━━━━━━━━━━━━━━━━

*📊 INFO*
/start — Menu utama
/help — Panduan ini
/id — Chat ID kamu
/status — Status server
/stats — Statistik penjualan

*📦 ORDER*
/orders — Semua order
/pending — Order pending
/confirmed — Order selesai
/cek ORDERID — Detail order
/konfirmasi ORDERID — Konfirmasi
/tolak ORDERID — Tolak
/hapus ORDERID — Hapus 1 order
/reset — Hapus semua order

*⚙️ PENGATURAN*
/maintenance — Cek status
/maintenance on — Aktifkan
/maintenance off — Matikan
/umumkan TEKS — Set pengumuman
/umumkan hapus — Hapus pengumuman

*Contoh:*
\`/cek ABC123\`
\`/konfirmasi ABC123\`
\`/umumkan Server sedang ramai\`

💡 _Tombol ✅ ❌ muncul otomatis tiap order_`
  );
}

async function cmdOrders(chatId) {
  const all=[...orders.values()];
  if (!all.length) { await tgMsg(chatId,'📭 Belum ada order.'); return; }
  const p=all.filter(o=>o.status==='pending').length,
        c=all.filter(o=>o.status==='confirmed').length,
        r=all.filter(o=>o.status==='rejected').length;
  let t=`📦 *Order (${all.length})*\n━━━━━━━━━━━━━━━━━━━━\n🟡 ${p} | ✅ ${c} | ❌ ${r}\n━━━━━━━━━━━━━━━━━━━━\n`;
  all.slice(-10).reverse().forEach(o=>{
    const ic=o.status==='pending'?'🟡':o.status==='confirmed'?'✅':'❌';
    const wkt=new Date(o.time).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
    t+=`\n${ic} \`#${o.orderId.substring(0,12)}\`\n   ${o.gameName} — *${o.paket}*\n   👤 ${o.userId} | 💰 ${o.total} | ⏰ ${wkt}\n`;
  });
  if (all.length>10) t+=`\n_...dan ${all.length-10} lainnya_`;
  await tgMsg(chatId,t);
}

async function cmdPending(chatId) {
  const pending=[...orders.values()].filter(o=>o.status==='pending');
  if (!pending.length) { await tgMsg(chatId,'✅ Tidak ada order pending!'); return; }
  let t=`🟡 *Pending (${pending.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
  pending.forEach((o,i)=>{
    const wkt=new Date(o.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
    t+=`\n*${i+1}. \`#${o.orderId}\`*\n🎮 ${o.gameName} — *${o.paket}*\n👤 ${o.userId}${o.server?' / '+o.server:''}\n📱 ${o.phone}\n💰 *${o.total}* | ⏰ ${wkt}\n/konfirmasi ${o.orderId}\n`;
  });
  await tgMsg(chatId,t);
}

async function cmdConfirmed(chatId) {
  const done=[...orders.values()].filter(o=>o.status==='confirmed');
  if (!done.length) { await tgMsg(chatId,'📭 Belum ada order selesai.'); return; }
  let t=`✅ *Selesai (${done.length})*\n━━━━━━━━━━━━━━━━━━━━\n`;
  done.slice(-15).reverse().forEach((o,i)=>{
    t+=`\n*${i+1}.* \`#${o.orderId}\`\n   ${o.gameName} — ${o.paket}\n   👤 ${o.userId} | 💰 ${o.total}\n`;
  });
  await tgMsg(chatId,t);
}

async function cmdStats(chatId) {
  const all=[...orders.values()];
  const today=new Date().toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'});
  const todayO=all.filter(o=>new Date(o.time).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})===today);
  const gs={};
  all.forEach(o=>{ if(!gs[o.game]) gs[o.game]={name:o.gameName,n:0,d:0}; gs[o.game].n++; if(o.status==='confirmed') gs[o.game].d++; });
  const gl=Object.values(gs).sort((a,b)=>b.n-a.n).map(g=>`   • *${g.name}*: ${g.n} (${g.d} selesai)`).join('\n');
  const omzet=[...orders.values()].filter(o=>o.status==='confirmed').reduce((s,o)=>s+(parseInt((o.total||'').replace(/\D/g,''))||0),0);
  await tgMsg(chatId,
`📊 *Statistik GameStore ID*
━━━━━━━━━━━━━━━━━━━━
📅 *Hari ini (${today}):*
   Masuk: *${todayO.length}* | Selesai: *${todayO.filter(o=>o.status==='confirmed').length}*

📦 *Total:*
   🟡 Pending: *${all.filter(o=>o.status==='pending').length}*
   ✅ Selesai: *${all.filter(o=>o.status==='confirmed').length}*
   ❌ Ditolak: *${all.filter(o=>o.status==='rejected').length}*
   Total: *${all.length}*

💰 *Estimasi Omzet:* Rp ${omzet.toLocaleString('id-ID')}

🎮 *Per Game:*
${gl||'   Belum ada order'}

⚙️ Web: ${settings.maintenance?'🔴 Maintenance':'🟢 Normal'}`
  );
}

async function cmdStatus(chatId) {
  const up=process.uptime(), all=[...orders.values()];
  await tgMsg(chatId,
`🖥 *Status Server*
━━━━━━━━━━━━━━━━━━━━
✅ Server: *Online*
✅ Bot: *Aktif*
⏱ Uptime: *${Math.floor(up/3600)}j ${Math.floor((up%3600)/60)}m*
📦 Total Order: *${all.length}*
🟡 Pending: *${all.filter(o=>o.status==='pending').length}*
🌐 Web: ${settings.maintenance?'🔴 Maintenance':'🟢 Normal'}
${settings.announcement?`📢 Pengumuman: _${settings.announcement}_\n`:''}
🔗 \`${WEBHOOK_URL}/health\``
  );
}

async function cmdMaintenance(chatId) {
  await tgMsg(chatId,
`⚙️ *Mode Maintenance*
Status: *${settings.maintenance?'🔴 AKTIF':'🟢 NONAKTIF'}*

/maintenance on — Aktifkan
/maintenance off — Matikan`
  );
}

async function doDetail(oid, chatId) {
  const o=orders.get(oid);
  if (!o) { await tgMsg(chatId,`❌ Order \`#${oid}\` tidak ditemukan.\nPastikan huruf kapital semua.`); return; }
  const wkt=new Date(o.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'});
  const st=o.status==='pending'?'🟡 Pending':o.status==='confirmed'?'✅ Selesai':'❌ Ditolak';
  const txt=
`📋 *Detail #${oid}*
━━━━━━━━━━━━━━━━━━━━
🎮 ${o.gameName}
👤 ${o.uidLabel}: \`${o.userId}\`${o.server?`\n🖥 Server: \`${o.server}\``:''}
📱 HP: ${o.phone}
💎 ${o.paket}
💰 *${o.total}*
⏰ ${wkt} WIB
📌 ${st}`;
  if (o.status==='pending') {
    const sid=oid.substring(0,20);
    await tg('sendMessage',{ chat_id:chatId, parse_mode:'Markdown', text:txt,
      reply_markup:JSON.stringify({inline_keyboard:[[
        {text:'✅ KONFIRMASI',callback_data:`ok:${sid}`},
        {text:'❌ TOLAK',    callback_data:`no:${sid}`}
      ]]})
    });
  } else await tgMsg(chatId,txt);
}

async function doKonfirmasi(oid, chatId, msgId) {
  const o=orders.get(oid);
  if (!o) { await tgMsg(chatId,`❌ Order \`#${oid}\` tidak ditemukan.`); return; }
  if (o.status!=='pending') { await tgMsg(chatId,`⚠️ Sudah diproses: *${o.status}*`); return; }
  o.status='confirmed';
  if (msgId) await tg('editMessageReplyMarkup',{chat_id:chatId,message_id:msgId,
    reply_markup:JSON.stringify({inline_keyboard:[[{text:'✅ DIKONFIRMASI',callback_data:'done'}]]})}).catch(()=>{});
  await tgMsg(chatId,
`✅ *ORDER #${oid} DIKONFIRMASI!*
━━━━━━━━━━━━━━━━━━━━
🎮 ${o.gameName}
👤 ${o.uidLabel}: \`${o.userId}\`${o.server?`\n🖥 Server: \`${o.server}\``:''}
📱 HP: ${o.phone}
💎 ${o.paket}
💰 *${o.total}*
━━━━━━━━━━━━━━━━━━━━
⚡ *Proses top up sekarang!*`
  );
}

async function doTolak(oid, chatId, msgId) {
  const o=orders.get(oid);
  if (!o) { await tgMsg(chatId,`❌ Order \`#${oid}\` tidak ditemukan.`); return; }
  if (o.status!=='pending') { await tgMsg(chatId,`⚠️ Sudah diproses: *${o.status}*`); return; }
  o.status='rejected';
  if (msgId) await tg('editMessageReplyMarkup',{chat_id:chatId,message_id:msgId,
    reply_markup:JSON.stringify({inline_keyboard:[[{text:'❌ DITOLAK',callback_data:'done'}]]})}).catch(()=>{});
  await tgMsg(chatId,
`❌ *ORDER #${oid} DITOLAK*
━━━━━━━━━━━━━━━━━━━━
🎮 ${o.gameName} — ${o.paket}
👤 ${o.userId}
📱 ${o.phone}
💰 ${o.total}`
  );
}

// ── HELPERS ────────────────────────────────────────────────
async function tgMsg(chatId, text) {
  return tg('sendMessage',{ chat_id:chatId, text, parse_mode:'Markdown' });
}

async function tg(method, data, retry=3) {
  for (let i=0; i<retry; i++) {
    try {
      const r = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, data, { timeout:12000 });
      return r.data;
    } catch(e) {
      const code=(e.response&&e.response.data&&e.response.data.error_code)||0;
      const desc=(e.response&&e.response.data&&e.response.data.description)||e.message;
      if (code===400||code===403) { console.error(`TG ${code}: ${desc}`); return null; }
      if (i===retry-1) { console.error(`TG ${method} gagal: ${desc}`); return null; }
      await new Promise(r=>setTimeout(r,800*(i+1)));
    }
  }
  return null;
}

// ── SETUP WEBHOOK ──────────────────────────────────────────
async function setupWebhook() {
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`,{},{timeout:10000});
    await new Promise(r=>setTimeout(r,1500));
    const url=`${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
    const r=await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      { url, allowed_updates:['message','callback_query'], drop_pending_updates:true },
      { timeout:10000 }
    );
    if (r.data.ok) {
      console.log('✅ Webhook:', url);
      await tg('sendMessage',{
        chat_id:ADMIN_CHAT_ID, parse_mode:'Markdown',
        text:'🚀 *Bot GameStore ID Online!*\n\nWebhook aktif ✅\nKetik /start untuk mulai.'
      });
    } else console.log('⚠️ Webhook gagal:', r.data.description);
  } catch(e) { console.error('setupWebhook:', e.message); }
}

// ── START ──────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🚀 Port ${PORT} | Admin: ${ADMIN_CHAT_ID}`);
  await setupWebhook();
});
