module.exports = async (req, res) => {
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

  const results = await Promise.all(
    chatIds.map(async (chatId) => {
      try {
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
            throw new Error("Telegram API " + r.status + ": " + body.slice(0, 300));
          }
        }
        return { chatId, ok: true };
      } catch (err) {
        console.error("Не удалось отправить chat " + chatId + ":", err.message);
        return { chatId, ok: false, error: err.message };
      }
    })
  );

  const delivered = results.filter((r) => r.ok).length;

  if (delivered === 0) {
    // Ни один получатель не получил заявку — это уже настоящая проблема
    // (неверный токен, все chat_id недействительны и т.д.), сообщаем клиенту.
    return res.status(502).json({
      ok: false,
      error: "Не удалось доставить ни одному получателю: " + results.map((r) => r.error).join("; "),
    });
  }

  // Хотя бы один получатель получил заявку — для заявителя это успех,
  // даже если кто-то из получателей пока недоступен.
  res.status(200).json({ ok: true, delivered: delivered, total: chatIds.length });
};