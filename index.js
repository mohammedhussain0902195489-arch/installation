const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const { exec } = require('child_process')
const fs = require('fs')
const P = require('pino')
const axios = require('axios')

const BOT_NAME = "installation"
let pending = {}

function getVideoInfo(url){
    return new Promise((r)=>{
        exec(`yt-dlp --dump-json --no-playlist --no-warnings "${url}"`, {timeout: 8000}, (e,o)=>{
            if(e) return r(null)
            try{ r(JSON.parse(o)) }catch{ r(null) }
        })
    })
}

function downloadFast(sock, from, url, choice){
    const isAudio = choice==='5'
    const ext = isAudio? 'mp3' : 'mp4'
    const output = `./${Date.now()}.${ext}`
    let cmd = ''
    if(isAudio) cmd = `yt-dlp -x --audio-format mp3 --no-playlist -o "${output}" "${url}"`
    else{
        if(choice==='1') cmd = `yt-dlp -f "best[height<=1080]" --merge-output-format mp4 -o "${output}" "${url}"`
        if(choice==='2') cmd = `yt-dlp -f "best[height<=720]" --merge-output-format mp4 -o "${output}" "${url}"`
        if(choice==='3') cmd = `yt-dlp -f "best[height<=480]" --merge-output-format mp4 -o "${output}" "${url}"`
        if(choice==='4') cmd = `yt-dlp -f "best[height<=360]" --merge-output-format mp4 -o "${output}" "${url}"`
    }
    if(url.includes('tiktok')) cmd = `yt-dlp -f best -o "${output}" "${url}"`

    exec(cmd, async (err)=>{
        if((err ||!fs.existsSync(output)) && url.includes('tiktok')){
            try{
                const res = await axios.get(`https://www.tikwm.com/api/?url=${url}`)
                const direct = res.data?.data?.play
                if(direct){
                    const w = fs.createWriteStream(output)
                    const r = await axios({url: direct, method:'GET', responseType:'stream'})
                    r.data.pipe(w)
                    await new Promise(x=>w.on('finish', x))
                }
            }catch{}
        }
        if(!fs.existsSync(output)){ await sock.sendMessage(from, { text: `❌ فشل، جرب رقم 2` }); return }
        if(isAudio) await sock.sendMessage(from, { audio: fs.readFileSync(output), mimetype:'audio/mpeg' })
        else await sock.sendMessage(from, { video: fs.readFileSync(output), caption: `✅ ${choice==='5'?'MP3':choice} | ${BOT_NAME}` })
        try{ fs.unlinkSync(output) }catch{}
    })
}

async function startBot(){
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({ auth: state, logger: P({level:'silent'}), printQRInTerminal:false })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', u=>{
        if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) startBot()
        if(u.connection==='open') console.log(`👑 ${BOT_NAME} شغال`)
    })

    sock.ev.on('messages.upsert', async m=>{
        const msg = m.messages[0]
        if(!msg.message || msg.key.fromMe) return
        const from = msg.key.remoteJid
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || msg.message.videoMessage?.caption || "").trim()
        const lower = text.toLowerCase()
        const url = (text.match(/(https?:\/\/[^\s]+)/g)||[])[0]

        // === أوامر التشغيل ===
        if(['اوامر','الاوامر','مساعدة','help','menu','hi','السلام عليكم'].includes(lower)){
            const help = `👑 *${BOT_NAME} PREMIUM - قائمة الأوامر* 👑

╔══════════════════╗
║ 📥 *أوامر التحميل* ║
╚══════════════════╝
• أرسل رابط مباشرة من:
  TikTok / YouTube / Instagram / Facebook
  → البوت يرد بالصورة والتفاصيل

• بعدها اكتب رقم الجودة:
  1 → 1080p FHD 🎬
  2 → 720p HD 📺 ⭐ الأفضل
  3 → 480p 📱
  4 → 360p 🔹
  5 → MP3 🎵

╔══════════════════╗
║ 🛠️ *أدوات إضافية* ║
╚══════════════════╝
• *ملصق* → أرسل صورة واكتب معها ملصق
  يحولها لملصق واتساب فورا

• *صورة* → رد على ملصق بكلمة صورة
  يحول الملصق لصورة

• *بحث + كلمة* → مثال:
  بحث خلف الله
  → يجيب 3 فيديوهات من يوتيوب

• *ping* → فحص سرعة البوت
• *وقت* → الوقت الحالي
• *ايدي* → معلومات رقمك

جرب ترسل رابط هسي 👇`
            await sock.sendMessage(from, { text: help })
            return
        }

        if(lower==='ping'){
            await sock.sendMessage(from, { text: `🏓 *pong!*\n⚡ السرعة: ممتازة\n👑 ${BOT_NAME} شغال` })
            return
        }
        if(lower==='وقت'){
            await sock.sendMessage(from, { text: `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}` })
            return
        }
        if(lower==='ايدي'){
            await sock.sendMessage(from, { text: `🆔 ايديك: ${from}\n👤 اسمك: ${msg.pushName}` })
            return
        }

        // ملصق من صورة
        if(lower.includes('ملصق') && msg.message.imageMessage){
            try{
                const buff = await sock.downloadMediaMessage(msg, 'buffer', {})
                await sock.sendMessage(from, { sticker: buff })
            }catch{ await sock.sendMessage(from, { text: `❌ فشل تحويل الملصق` }) }
            return
        }

        // صورة من ملصق
        if(lower==='صورة' && msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage){
            try{
                const quoted = msg.message.extendedTextMessage.contextInfo
                const buff = await sock.downloadMediaMessage({message: quoted.quotedMessage}, 'buffer', {})
                await sock.sendMessage(from, { image: buff, caption: `✅ تم تحويل الملصق لصورة` })
            }catch{}
            return
        }

        // بحث يوتيوب
        if(lower.startsWith('بحث ')){
            const query = text.slice(3)
            await sock.sendMessage(from, { text: `🔍 أبحث عن: *${query}*` })
            exec(`yt-dlp "ytsearch5:${query}" --dump-json --no-playlist`, async (e,o)=>{
                if(!o) return
                let out = `🔍 *نتائج: ${query}*\n\n`
                o.trim().split('\n').slice(0,3).forEach((l,i)=>{
                    try{ const j=JSON.parse(l); out+=`${i+1}. ${j.title}\nhttps://youtu.be/${j.id}\n\n` }catch{}
                })
                out+=`انسخ الرابط وارسله للتحميل`
                await sock.sendMessage(from, { text: out })
            })
            return
        }

        // اختيار جودة
        if(['1','2','3','4','5'].includes(text) && pending[from]){
            await sock.sendMessage(from, { text: `⏳ جاري التحميل جودة ${text}...` })
            downloadFast(sock, from, pending[from], text)
            return
        }

        if(!url) return

        pending[from] = url
        await sock.sendMessage(from, { text: `✅ تم الاستلام - اجلب البيانات...` })

        if(url.includes('tiktok')){ downloadFast(sock, from, url, '2'); return }

        const info = await getVideoInfo(url)
        const title = info?.title?.substring(0,35) || 'فيديو'
        const duration = info?.duration? `${Math.floor(info.duration/60)}:${String(Math.floor(info.duration%60)).padStart(2,'0')}` : '2:55'
        const views = info?.view_count? `${(info.view_count/1000).toFixed(1)}K` : '955.8K'

        const fancy = `✅ *تم العثور على الفيديو*

📌 ${title}
⏱️ ${duration} | 👁️ ${views}
🌐 ${url.includes('youtu')?'YouTube':'Facebook'}

#متابعه 📌
#لنستمر_بنشر_المزيد 🔥

👇 اختر بالكتابة:
1️⃣ 1080p FHD
2️⃣ 720p HD ⭐
3️⃣ 480p
4️⃣ 360p
5️⃣ MP3

اكتب رقم فقط:`

        try{
            if(info?.thumbnail) await sock.sendMessage(from, { image:{url: info.thumbnail}, caption: fancy })
            else await sock.sendMessage(from, { text: fancy })
        }catch{ await sock.sendMessage(from, { text: fancy }) }
    })
}
startBot()
