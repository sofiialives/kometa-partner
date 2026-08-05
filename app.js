/* ==========================================================================
   app.js — вся логика анкеты партнёра: шаги, ветвящийся тест, отправка в TG.
   ========================================================================== */

(function () {
  "use strict";

  // ==========================================================================
  // Question banks
  // ==========================================================================
  const QUESTIONS = {
    novice: [
      { block: "Логика и мышление", text: "Как ты думаешь, зачем бизнесу нужны услуги продвижения, дизайна и разработки?" },
      { block: "Логика и мышление", context: "Ситуация: у проекта есть сайт и соцсети, но мало клиентов.", text: "У проекта есть сайт и соцсети, но мало клиентов. Какие причины?" },
      { block: "Логика и мышление", text: "Что бы ты предложил такому проекту, чтобы улучшить ситуацию?" },
      { block: "Поиск клиентов", text: "Если тебе нужно найти клиентов, где ты начнёшь искать? Назови минимум 5 мест или способов." },
      { block: "Поиск клиентов", text: "Как ты поймёшь, что проекту реально нужны наши услуги?" },
      { block: "Коммуникация", context: "Ситуация: тебе ответили «Не интересно».", text: "Что ты сделаешь дальше?" },
      { block: "Личное поведение", text: "Ты не знаешь, как выполнять задачу — что будешь делать?" },
      { block: "Личное поведение", text: "Как ты планируешь свой рабочий день, если у тебя нет опыта?" },
      { block: "Мотивация", text: "Почему ты хочешь работать в продажах и именно в digital / web3?" },
    ],
    experienced: [
      { block: "Аналитика", context: "Представь: к нам пришёл клиент — онлайн-проект с хорошим продуктом, но без продаж.", text: "Какие 3–5 проблем ты бы предположил у проекта? Какие точки роста предложил?" },
      { block: "Аналитика", text: "Как ты будешь анализировать конкурентов клиента? Какие параметры? (минимум 5)" },
      { block: "Поиск клиентов", text: "Назови минимум 5 источников, где будешь искать клиентов. Конкретно — какие и как." },
      { block: "Возражения", context: "Клиент говорит: «У нас уже есть маркетолог».", text: "Как ты ответишь?" },
      { block: "Возражения", context: "Клиент говорит: «Это дорого».", text: "Как ты объяснишь ценность наших услуг?" },
      { block: "Коммуникация", context: "Клиент игнорит, отвечает раз в 3 дня и постоянно «кормит завтраками».", text: "Что ты будешь делать?" },
      { block: "Дисциплина", text: "Что для тебя означает «быть эффективным менеджером»? Конкретные действия, не абстракция." },
    ],
  };

  // ==========================================================================
  // State
  // ==========================================================================
  const state = {
    name: "", age: "", experience: "",
    step2Feedback: "", step3Direction: "", step4Feedback: "",
    clients: [
      { direction: "Закупка", link: "", contact: "", why: "" },
      { direction: "Закупка", link: "", contact: "", why: "" },
      { direction: "Упаковка", link: "", contact: "", why: "" },
      { direction: "Упаковка", link: "", contact: "", why: "" },
      { direction: "Любая услуга", link: "", contact: "", why: "" },
      { direction: "Любая услуга", link: "", contact: "", why: "" },
    ],
    msgPurchase: "", msgPackaging: "", msgUniversal: "",
    level: null, // 'novice' | 'experienced'
    answers: [], // filled in as user progresses
  };

  // Linear step order; step 7 is handled specially (level -> questions)
  const STEP_ORDER = ["1", "2", "3", "4", "5", "6", "7-level", "8"];
  let stepIndex = 0;
  let questionIndex = 0;
  let cameFromStep6 = true; // for "back" from level screen

  // ==========================================================================
  // Utilities
  // ==========================================================================
  function $(id) { return document.getElementById(id); }
  function showView(id) {
    document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("is-active"));
    $("view-" + id).classList.add("is-active");
  }
  function setProgress(stepNum) {
    const pct = Math.min(100, Math.round((stepNum / 8) * 100));
    $("stepProgressFill").style.width = pct + "%";
    $("stepProgressLabel").innerHTML = "ШАГ <b>" + stepNum + "</b> ИЗ 8";
  }
  function setBusy(v) { $("busyOverlay").classList.toggle("is-visible", v); }
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : s;
    return d.innerHTML;
  }
  // Turns "@username" or a bare "username" or a t.me link into a clickable TG link
  function tgLink(raw) {
    if (!raw) return "—";
    const text = escapeHtml(raw);
    const m = raw.match(/(?:t\.me\/|@)([a-zA-Z0-9_]{4,})/) || raw.match(/^([a-zA-Z0-9_]{4,})$/);
    if (m) {
      return '<a href="https://t.me/' + m[1] + '">' + text + "</a>";
    }
    return text;
  }

  function clearFieldError(fieldEl) {
    fieldEl.classList.remove("field--error");
  }
  function setFieldError(fieldEl) {
    fieldEl.classList.add("field--error");
  }

  function validateRequired(ids) {
    let ok = true;
    ids.forEach((id) => {
      const el = $(id);
      const wrap = el.closest(".field");
      if (!el.value.trim()) {
        if (wrap) setFieldError(wrap);
        ok = false;
      } else if (wrap) {
        clearFieldError(wrap);
      }
    });
    return ok;
  }

  // "Имя @username" — текст, затем пробел, затем @username (5-32 символа, латиница/цифры/_)
  function validateNameFormat() {
    const el = $("f-name");
    const wrap = el.closest(".field");
    const val = el.value.trim();
    const ok = /\s@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(val);
    if (!ok) {
      setFieldError(wrap);
      wrap.querySelector(".field__error").textContent = "Формат: Имя @username (через пробел и собачку)";
    } else {
      clearFieldError(wrap);
    }
    return ok;
  }

  function validateAgeFormat() {
    const el = $("f-age");
    const wrap = el.closest(".field");
    const val = el.value.trim();
    const ok = /^\d{1,2}$/.test(val) && parseInt(val, 10) >= 14 && parseInt(val, 10) <= 90;
    if (!ok) {
      setFieldError(wrap);
      wrap.querySelector(".field__error").textContent = "Укажи возраст цифрами (например: 21)";
    } else {
      clearFieldError(wrap);
    }
    return ok;
  }

  function validateClientEntries() {
    let ok = true;
    for (let i = 1; i <= 6; i++) {
      ["link", "contact", "why"].forEach((suffix) => {
        const el = $("c" + i + "-" + suffix);
        const wrap = el.closest(".field");
        if (!el.value.trim()) {
          setFieldError(wrap);
          ok = false;
        } else {
          clearFieldError(wrap);
        }
      });
    }
    return ok;
  }

  // ==========================================================================
  // localStorage — survive accidental page reloads
  // ==========================================================================
  const STORAGE_KEY = "kometa_partner_app_progress_v1";

  function getCurrentViewId() {
    const active = document.querySelector(".app-view.is-active");
    return active ? active.id.replace("view-", "") : "1";
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: state,
        currentView: getCurrentViewId(),
        questionIndex: questionIndex,
      }));
    } catch (e) { /* ignore quota/private-mode errors */ }
  }

  function clearLocalStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  function restoreFormFields() {
    $("f-name").value = state.name || "";
    $("f-age").value = state.age || "";
    $("f-experience").value = state.experience || "";
    $("f-step2-feedback").value = state.step2Feedback || "";
    $("f-step3-direction").value = state.step3Direction || "";
    $("f-step4-feedback").value = state.step4Feedback || "";
    state.clients.forEach((c, i) => {
      const n = i + 1;
      if ($("c" + n + "-link")) $("c" + n + "-link").value = c.link || "";
      if ($("c" + n + "-contact")) $("c" + n + "-contact").value = c.contact || "";
      if ($("c" + n + "-why")) $("c" + n + "-why").value = c.why || "";
    });
    $("f-msg-purchase").value = state.msgPurchase || "";
    $("f-msg-packaging").value = state.msgPackaging || "";
    $("f-msg-universal").value = state.msgUniversal || "";
  }

  function restoreProgress() {
    let saved;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      saved = JSON.parse(raw);
    } catch (e) { return; }
    if (!saved || !saved.state) return;

    Object.assign(state, saved.state);
    restoreFormFields();

    if (saved.currentView === "7-question" && state.level && QUESTIONS[state.level]) {
      questionIndex = Math.min(saved.questionIndex || 0, QUESTIONS[state.level].length - 1);
      renderQuestion();
      goToStep("7-question");
    } else if (saved.currentView === "7-level") {
      goToStep("7-level");
    } else if (saved.currentView && saved.currentView !== "8") {
      goToStep(saved.currentView);
    }
  }

  // ==========================================================================
  // Step navigation (linear steps 1-6)
  // ==========================================================================
  function goToStep(id) {
    if (id === "7-level") {
      showView("7-level");
      setProgress(7);
    } else {
      showView(id);
      setProgress(parseInt(id, 10));
    }
  }

  function initLinearNav() {
    $("btn-step1-next").addEventListener("click", () => {
      const okRequired = validateRequired(["f-name", "f-age", "f-experience"]);
      if (!okRequired) return;
      const okName = validateNameFormat();
      const okAge = validateAgeFormat();
      if (!okName || !okAge) return;
      state.name = $("f-name").value.trim();
      state.age = $("f-age").value.trim();
      state.experience = $("f-experience").value.trim();
      saveToLocalStorage();
      goToStep("2");
    });

    document.querySelectorAll('[data-back]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.closest(".app-view");
        const id = view.id.replace("view-", "");
        if (id === "7-level") { goToStep("6"); return; }
        if (id === "7-question") { backFromQuestion(); return; }
        const n = parseInt(id, 10);
        if (n > 1) goToStep(String(n - 1));
      });
    });

    document.querySelectorAll('[data-next]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.closest(".app-view");
        const id = view.id.replace("view-", "");
        const n = parseInt(id, 10);

        if (n === 3) {
          if (!validateRequired(["f-step3-direction"])) return;
        }
        if (n === 5) {
          if (!validateClientEntries()) return;
        }
        if (n === 6) {
          if (!validateRequired(["f-msg-purchase", "f-msg-packaging", "f-msg-universal"])) return;
        }

        if (n === 2) state.step2Feedback = $("f-step2-feedback").value.trim();
        if (n === 3) state.step3Direction = $("f-step3-direction").value.trim();
        if (n === 4) state.step4Feedback = $("f-step4-feedback").value.trim();
        if (n === 5) {
          for (let i = 1; i <= 6; i++) {
            state.clients[i - 1].link = $("c" + i + "-link").value.trim();
            state.clients[i - 1].contact = $("c" + i + "-contact").value.trim();
            state.clients[i - 1].why = $("c" + i + "-why").value.trim();
          }
        }
        if (n === 6) {
          state.msgPurchase = $("f-msg-purchase").value.trim();
          state.msgPackaging = $("f-msg-packaging").value.trim();
          state.msgUniversal = $("f-msg-universal").value.trim();
        }
        saveToLocalStorage();
        if (n === 6) { goToStep("7-level"); return; }
        goToStep(String(n + 1));
      });
    });
  }

  // ==========================================================================
  // Step 7 — level select + question-by-question
  // ==========================================================================
  function initLevelSelect() {
    $("level-novice").addEventListener("click", () => startQuestions("novice"));
    $("level-experienced").addEventListener("click", () => startQuestions("experienced"));
  }

  function startQuestions(level) {
    state.level = level;
    state.answers = QUESTIONS[level].map(() => "");
    questionIndex = 0;
    renderQuestion();
    showView("7-question");
    setProgress(7);
    saveToLocalStorage();
  }

  function renderQuestion() {
    const list = QUESTIONS[state.level];
    const q = list[questionIndex];
    const total = list.length;
    $("q-meta").textContent = "Блок: " + q.block.toUpperCase() + " · Вопрос " + (questionIndex + 1) + " из " + total;
    const ctxEl = $("q-context");
    if (q.context) { ctxEl.style.display = "block"; ctxEl.textContent = q.context; }
    else { ctxEl.style.display = "none"; ctxEl.textContent = ""; }
    $("q-text").textContent = q.text;
    $("q-answer").value = state.answers[questionIndex] || "";
    $("q-error").style.display = "none";
    $("q-answer").closest(".glass").classList.remove("field--error");

    $("q-change-level").style.display = questionIndex === 0 ? "inline-flex" : "none";
    $("q-back").disabled = questionIndex === 0 ? false : false; // back always allowed
    const isLast = questionIndex === total - 1;
    const nextBtn = $("q-next");
    if (isLast) {
      nextBtn.innerHTML = 'Отправить на проверку <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    } else {
      nextBtn.innerHTML = 'Следующий <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    }
  }

  function saveCurrentAnswer() {
    state.answers[questionIndex] = $("q-answer").value.trim();
  }

  function backFromQuestion() {
    saveCurrentAnswer();
    if (questionIndex === 0) {
      goToStep("7-level");
    } else {
      questionIndex--;
      renderQuestion();
    }
    saveToLocalStorage();
  }

  function initQuestionNav() {
    $("q-back").addEventListener("click", backFromQuestion);
    $("q-change-level").addEventListener("click", () => goToStep("7-level"));
    $("q-next").addEventListener("click", () => {
      const val = $("q-answer").value.trim();
      if (!val) {
        $("q-error").style.display = "block";
        return;
      }
      saveCurrentAnswer();
      const total = QUESTIONS[state.level].length;
      if (questionIndex < total - 1) {
        questionIndex++;
        renderQuestion();
        saveToLocalStorage();
      } else {
        submitApplication();
      }
    });
    document.querySelectorAll('#view-7-question [data-back]').forEach((el) => {
      el.addEventListener("click", () => goToStep("7-level"));
    });
  }

  // ==========================================================================
  // Telegram submission
  // ==========================================================================
  // Отправляет собранные сообщения на серверную функцию /api/submit —
  // токен бота и chat_id живут только там, в переменных окружения Vercel,
  // сюда, в клиентский код, они вообще не попадают.
  async function submitToApi(messages) {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || ("Сервер ответил " + res.status));
    }
  }

  // Собирает анкету в несколько Telegram-сообщений (профиль / клиенты /
  // сообщения / тест) — без кнопок, просто чистая информация в чат.
  function buildMessages() {
    const levelLabel = state.level === "novice" ? "Новичок" : "Опытный";
    const msgs = [];

    msgs.push(
      "🆕 <b>Новая заявка партнёра</b>\n\n" +
      "<b>" + tgLink(state.name) + "</b>\n" +
      "Возраст: " + escapeHtml(state.age) + "\n" +
      "Опыт: " + escapeHtml(state.experience) + "\n" +
      "Тип теста: " + levelLabel + "\n\n" +
      "<b>Обратная связь — о компании:</b>\n" + escapeHtml(state.step2Feedback || "—") + "\n\n" +
      "<b>Ближе направление:</b>\n" + escapeHtml(state.step3Direction || "—") + "\n\n" +
      "<b>Обратная связь — процесс:</b>\n" + escapeHtml(state.step4Feedback || "—")
    );

    let clientsMsg = "📋 <b>Найденные клиенты</b>\n";
    state.clients.forEach((c, i) => {
      clientsMsg +=
        "\n<b>Клиент " + (i + 1) + "</b> (" + escapeHtml(c.direction) + ")\n" +
        "Ссылка: " + (c.link ? escapeHtml(c.link) : "—") + "\n" +
        "Контакт: " + tgLink(c.contact) + "\n" +
        "Почему подходит: " + escapeHtml(c.why || "—") + "\n";
    });
    msgs.push(clientsMsg);

    msgs.push(
      "✉️ <b>Сообщения</b>\n\n" +
      "<b>Закупка:</b>\n" + escapeHtml(state.msgPurchase || "—") + "\n\n" +
      "<b>Упаковка:</b>\n" + escapeHtml(state.msgPackaging || "—") + "\n\n" +
      "<b>Универсальное:</b>\n" + escapeHtml(state.msgUniversal || "—")
    );

    const list = QUESTIONS[state.level];
    let testMsg = "🧠 <b>Бриф-тест (" + levelLabel + ")</b>\n";
    list.forEach((q, i) => {
      testMsg +=
        "\n<b>Вопрос " + (i + 1) + "</b> [" + escapeHtml(q.block) + "]\n" +
        escapeHtml(q.text) + "\n" +
        "<i>Ответ:</i> " + escapeHtml(state.answers[i] || "—") + "\n";
    });
    msgs.push(testMsg);

    return msgs;
  }

  function showDone(title, text, isError) {
    $("doneTitle").textContent = title;
    $("doneText").textContent = text;
    const errEl = $("submitError");
    if (isError) {
      errEl.textContent = "Проверьте интернет-соединение и нажмите «Отправить на проверку» ещё раз — все ваши ответы сохранены и никуда не денутся.";
      errEl.classList.add("is-visible");
    } else {
      errEl.classList.remove("is-visible");
    }
    const icon = document.querySelector(".done-icon");
    icon.innerHTML = isError
      ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/><circle cx="12" cy="12" r="10"/></svg>'
      : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    icon.style.background = isError ? "rgba(255,92,108,0.1)" : "rgba(74,222,128,0.1)";
    icon.style.borderColor = isError ? "rgba(255,92,108,0.3)" : "rgba(74,222,128,0.3)";
    icon.style.color = isError ? "#FF8A96" : "var(--green)";
    goToStep("8");
  }

  async function submitApplication() {
    saveCurrentAnswer();
    setBusy(true);

    try {
      const messages = buildMessages();
      await submitToApi(messages);
      setBusy(false);
      clearLocalStorage();
      showDone(
        "Спасибо!",
        "Твои ответы отправлены на проверку. Мы посмотрим внимательно и свяжемся с тобой в Telegram в ближайшее время.",
        false
      );
    } catch (err) {
      setBusy(false);
      showDone(
        "Не получилось отправить",
        "Заявка не дошла: " + err.message,
        true
      );
    }
  }

  // ==========================================================================
  // Starfield particles (purely decorative, same as other KOMETA sites)
  // ==========================================================================
  function initParticles() {
    const container = $("particles");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!container || prefersReducedMotion) return;
    const BLUE = "#504CFF";
    const PURPLE = "#854CFF";
    const particles = [
      { l: "6%", dur: 18, del: 0, c: BLUE }, { l: "13%", dur: 24, del: 3.5, c: PURPLE },
      { l: "21%", dur: 20, del: 6, c: BLUE }, { l: "29%", dur: 22, del: 1.5, c: PURPLE },
      { l: "38%", dur: 17, del: 8, c: BLUE }, { l: "46%", dur: 25, del: 4, c: PURPLE },
      { l: "54%", dur: 19, del: 9.5, c: BLUE }, { l: "63%", dur: 23, del: 2.5, c: PURPLE },
      { l: "71%", dur: 21, del: 7, c: BLUE }, { l: "79%", dur: 18, del: 5.5, c: PURPLE },
      { l: "87%", dur: 26, del: 11, c: BLUE }, { l: "94%", dur: 16, del: 13, c: PURPLE },
      { l: "33%", dur: 22, del: 15, c: BLUE }, { l: "57%", dur: 19, del: 10.5, c: PURPLE },
    ];
    const fragment = document.createDocumentFragment();
    particles.forEach((p, i) => {
      const el = document.createElement("div");
      el.className = "particle";
      const size = i % 3 === 0 ? 2.5 : 1.5;
      el.style.left = p.l;
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.background = p.c;
      el.style.animation = "particleRise " + p.dur + "s " + p.del + "s linear infinite";
      fragment.appendChild(el);
    });
    container.appendChild(fragment);
  }

  // ==========================================================================
  // Boot
  // ==========================================================================
  document.addEventListener("DOMContentLoaded", function () {
    initLinearNav();
    initLevelSelect();
    initQuestionNav();
    initParticles();
    restoreProgress();
  });
})();