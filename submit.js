/* ==========================================================================
   api/submit.js — Vercel Serverless Function.

   Токен бота и список chat_id читаются из переменных окружения проекта на
   Vercel (Project → Settings → Environment Variables) — в коде их нет,
   клиенту они никогда не видны.

   Нужные переменные:
     TELEGRAM_BOT_TOKEN   = 123456:AAH...
     TELEGRAM_CHAT_IDS    = 6516814090,725100934,8926534835   (через запятую)

   Деплой: просто положите этот файл в папку /api в корне репозитория —
   Vercel сам подхватит его как serverless-функцию по адресу /api/submit,
   никакой отдельной настройки не требуется.
   ========================================================================== */

module.exports = async (req, res) => {
  // CORS — на случай, если фронтенд когда-нибудь будет жить не на том же
  // домене, что и функция (на Vercel обычно они на одном домене, но пусть
  // будет на всякий случай).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdsRaw = process.env.TELEGRAM_CHAT_IDS || "";
  const chatIds = chatIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (!token || chatIds.length === 0) {
    console.error("Не заданы TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_IDS в переменных окружения Vercel.");
    return res.status(500).json({ ok: false, error: "Сервер не настроен (нет токена или chat_id)." });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "Нет сообщений для отправки." });
  }

  try {
    for (const chatId of chatIds) {
      for (const text of messages) {
        const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: String(text).slice(0, 4096), // предел одного сообщения в Telegram
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
        if (!r.ok) {
          const body = await r.text();
          throw new Error("Telegram API " + r.status + " (chat " + chatId + "): " + body.slice(0, 300));
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Ошибка отправки в Telegram:", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
};