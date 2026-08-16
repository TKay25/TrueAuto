/* True Auto Zim — chatbot widget (web) */
document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("chatFab");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("chatClose");
  const body = document.getElementById("chatBody");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("chatSend");
  if (!fab || !panel) return;

  const toggleOpen = () => {
    const open = panel.classList.toggle("open");
    panel.setAttribute("aria-hidden", String(!open));
    if (open) input.focus();
  };
  fab.addEventListener("click", toggleOpen);
  closeBtn.addEventListener("click", toggleOpen);

  const appendMessage = (text, who) => {
    const div = document.createElement("div");
    div.className = `chat-msg ${who}`;
    div.textContent = text;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  };

  const sendMessage = async (text) => {
    const msg = (text || "").trim();
    if (!msg) return;
    appendMessage(msg, "user");
    input.value = "";
    const typing = appendMessage("", "typing");
    typing.innerHTML = `<span class="chat-typing"><span></span><span></span><span></span></span>`;
    try {
      const data = await apiFetch("/api/chat", { method: "POST", body: { message: msg } });
      typing.remove();
      appendMessage(data.reply, "bot");
    } catch (e) {
      typing.remove();
      appendMessage("Sorry, I hit a snag. Please try again or call us on WhatsApp. 🙏", "bot");
    }
  };

  sendBtn.addEventListener("click", () => sendMessage(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(input.value); });

  // Quick-reply chips
  document.querySelectorAll("#chatQuick .chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (!panel.classList.contains("open")) {
        panel.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
      }
      sendMessage(chip.dataset.q);
    });
  });
});
