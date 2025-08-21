import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from "baileys"
import { Boom } from "@hapi/boom"
import qrcode from "qrcode-terminal"
import express from "express"
import bodyParser from "body-parser"
import fs from "fs"

// === Konfigurasi ===
const SESSION_DIR = "session"
const GROUP_ID = "120363148133798145@g.us" // ganti dgn ID grup target
const PORT = 3000
let sock
let lastSent = 0 // buat anti spam

// === Start Bot ===
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)
  const { version } = await fetchLatestBaileysVersion()

  sock = makeWASocket({
    version,
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.04"], // random supaya lebih natural
    printQRInTerminal: false, // QR manual
  })

  // === QR Code handler ===
  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log("📌 Scan QR berikut untuk login:")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "open") {
      console.log("✅ Bot berhasil login dan terhubung ke WhatsApp")
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode
      console.log("❌ Koneksi terputus, reason:", reason)
      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Mencoba reconnect...")
        setTimeout(startBot, 5000)
      } else {
        console.log("⚠️ Anda logout dari WA, hapus folder session dan login ulang.")
      }
    }
  })

  sock.ev.on("creds.update", saveCreds)
}

// === Mulai Bot ===
await startBot()

// === Webhook API ===
const app = express()
app.use(bodyParser.json({ limit: "50mb" }))

// Endpoint untuk kirim laporan ke grup
app.post("/send-laporan", async (req, res) => {
  try {
    const { imageBase64, caption } = req.body
    if (!imageBase64) return res.status(400).send("❌ Tidak ada imageBase64")

    // Anti-spam: delay minimal 3 detik antar pesan
    if (Date.now() - lastSent < 3000) {
      return res.status(429).send("⏳ Tunggu sebentar sebelum kirim lagi")
    }

    const buffer = Buffer.from(imageBase64, "base64")

    await sock.sendMessage(GROUP_ID, {
      image: buffer,
      caption: caption || "📊 Laporan Omset",
    })

    lastSent = Date.now()

    console.log("📤 Laporan terkirim ke grup:", GROUP_ID)
    res.send("✅ ok")
  } catch (e) {
    console.error("❌ Error webhook:", e)
    res.status(500).send("error")
  }
})

// Cek health bot
app.get("/", (req, res) => {
  res.send("🤖 WA Bot aktif & listening")
})

app.listen(PORT, () => console.log(`🌐 Webhook listening on :${PORT}`))

