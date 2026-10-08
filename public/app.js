const topicEl = document.querySelector("#topic");
const genreEl = document.querySelector("#genre");
const durationEl = document.querySelector("#duration");
const generateBtn = document.querySelector("#generateBtn");
const statusEl = document.querySelector("#status");

const resultsEl = document.querySelector("#results");
const tabsEl = document.querySelector("#tabs");
const resultTitleEl = document.querySelector("#resultTitle");
const resultTextEl = document.querySelector("#resultText");
const copyBtn = document.querySelector("#copyBtn");

let generated = {};
let currentKey = "plan";

const sections = [
  ["core", "핵심 내용"],
  ["plan", "콘텐츠 기획"],
  ["storyboard", "스토리보드"],
  ["script", "대본"],
  ["imagePrompts", "이미지 프롬프트"],
  ["videoPrompts", "영상 프롬프트"],
  ["narration", "내레이션"]
];

function renderTabs() {
  tabsEl.innerHTML = "";

  sections.forEach(([key, label]) => {
    const button = document.createElement("button");
    button.className = `tab ${key === currentKey ? "active" : ""}`;
    button.textContent = label;

    button.addEventListener("click", () => {
      currentKey = key;
      renderTabs();
      renderCurrent();
    });

    tabsEl.appendChild(button);
  });
}

function renderCurrent() {
  const section = sections.find(([key]) => key === currentKey);
  if (!section) return;

  resultTitleEl.textContent = section[1];
  renderMarkdown(resultTextEl, generated[currentKey] || "");
}

const progressEl = document.createElement("div");
progressEl.className = "progress-panel hidden";
progressEl.setAttribute("aria-live", "polite");
statusEl.insertAdjacentElement("afterend", progressEl);
const stepLabels = ["핵심 내용 분석", "콘텐츠 기획안", "스토리보드", "대본·이미지·영상 프롬프트", "내레이션", "최종 정리", "제작 완료"];

function showProgress(step, label) {
  progressEl.classList.remove("hidden");
  progressEl.replaceChildren();
  const heading = document.createElement("p");
  heading.className = "progress-heading";
  heading.textContent = `${step}/7 · ${label}`;
  progressEl.appendChild(heading);
  const list = document.createElement("ol");
  list.className = "progress-steps";
  stepLabels.forEach((name, index) => {
    const item = document.createElement("li");
    item.textContent = name;
    item.className = index + 1 < step ? "done" : index + 1 === step ? "active" : "";
    list.appendChild(item);
  });
  progressEl.appendChild(list);
}

function renderMarkdown(target, source) {
  target.replaceChildren();
  const lines = String(source).replace(/\\r/g, "").split("\\n");
  let list = null;
  const inline = (element, value) => {
    // textContent prevents model-generated HTML from executing.
    const parts = value.split(/(\\*\\*[^*]+\\*\\*)/g);
    parts.forEach(part => {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        element.appendChild(strong);
      } else element.appendChild(document.createTextNode(part));
    });
  };
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) { list = null; return; }
    const heading = trimmed.match(/^(#{1,4})\\s+(.+)$/);
    if (heading) {
      list = null;
      const h = document.createElement("h" + Math.min(heading[1].length + 1, 5));
      inline(h, heading[2]);
      target.appendChild(h);
      return;
    }
    const bullet = trimmed.match(/^(?:[-*]\\s+|\\d+[.)]\\s+)(.+)$/);
    if (bullet) {
      if (!list) {
        list = document.createElement("ul");
        target.appendChild(list);
      }
      const li = document.createElement("li");
      inline(li, bullet[1]);
      list.appendChild(li);
      return;
    }
    list = null;
    const p = document.createElement("p");
    inline(p, trimmed);
    target.appendChild(p);
  });
}

generateBtn.addEventListener("click", async () => {
  const topic = topicEl.value.trim();

  if (!topic) {
    statusEl.textContent = "먼저 주제를 입력해줘.";
    topicEl.focus();
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "만드는 중…";
  statusEl.textContent =
    "핵심 내용 → 기획 → 스토리보드 → 제작 프롬프트 순서로 생성하고 있어.";

  showProgress(1, "서버 연결 중");
  resultsEl.classList.add("hidden");
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, genre: genreEl.value, duration: Number(durationEl.value) })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    if (!response.body) throw new Error("응답 스트림이 없어.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;
    function processLine(line) {
      if (!line.trim()) return;
      const msg = JSON.parse(line);
      if (msg.type === "progress") {
        showProgress(msg.step, msg.label);
        statusEl.textContent = msg.label;
      } else if (msg.type === "error") {
        throw new Error(msg.message);
      } else if (msg.type === "result") {
        generated = msg.data;
        completed = true;
        currentKey = "plan";
        renderTabs();
        renderCurrent();
        resultsEl.classList.remove("hidden");
      }
    }
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach(processLine);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer);
    if (!completed) throw new Error("제작 결과가 도착하지 않았어.");
    statusEl.textContent = "완료.";
  } catch (error) {
    statusEl.textContent = `오류: ${error.message}`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "제작안 만들기";
  }
});

copyBtn.addEventListener("click", async () => {
  const text = generated[currentKey];
  if (!text) return;

  await navigator.clipboard.writeText(text);
  const old = copyBtn.textContent;
  copyBtn.textContent = "복사됨";
  setTimeout(() => (copyBtn.textContent = old), 1200);
});
