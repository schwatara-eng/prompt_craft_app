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
let currentKey = "core";
let userSelectedTab = false;

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
  tabsEl.replaceChildren();
  sections.forEach(([key, label]) => {
    const ready = typeof generated[key] === "string" && !!generated[key].trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab ${ready ? "is-ready" : "is-pending"} ${key === currentKey && ready ? "active" : ""}`;
    button.textContent = label;
    button.disabled = !ready;
    button.setAttribute("aria-label", `${label} — ${ready ? "완료" : "생성 대기"}`);
    button.addEventListener("click", () => {
      currentKey = key;
      userSelectedTab = true;
      renderTabs();
      renderCurrent();
    });
    tabsEl.appendChild(button);
  });
}

function renderCurrent() {
  const section = sections.find(([key]) => key === currentKey);
  if (!section) return;
  const ready = !!generated[currentKey];
  resultTitleEl.textContent = section[1];
  renderMarkdown(resultTextEl, ready ? generated[currentKey] : "아직 생성되지 않았어.");
  copyBtn.disabled = !ready;
}

function showCompletedSection(key, content) {
  if (!sections.some(([id]) => id === key)) return;
  generated[key] = content;
  // Show each newly completed tab automatically until the user chooses one.
  if (!userSelectedTab) currentKey = key;
  resultsEl.classList.remove("hidden");
  renderTabs();
  renderCurrent();
}

const progressEl = document.createElement("div");
progressEl.className = "progress-panel hidden";
progressEl.setAttribute("aria-live", "polite");
statusEl.insertAdjacentElement("afterend", progressEl);
let elapsedTimer = null;
let startedAt = 0;
let stepStartedAt = 0;
let currentStep = 1;
let currentLabel = "서버 연결 중";
let progressState = "running";
function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateElapsed() {
  if (!startedAt) return;
  const total = Math.floor((Date.now() - startedAt) / 1000);
  const stage = Math.floor((Date.now() - stepStartedAt) / 1000);
  const totalEl = progressEl.querySelector(".total-time");
  const stageEl = progressEl.querySelector(".stage-time");
  if (totalEl) totalEl.textContent = formatElapsed(total);
  if (stageEl) stageEl.textContent = formatElapsed(stage);
}
function stopElapsed() {
  if (elapsedTimer !== null) clearInterval(elapsedTimer);
  elapsedTimer = null;
}
function showProgress(step, label, state = "running") {
  if (step !== currentStep || state !== progressState) stepStartedAt = Date.now();
  currentStep = step;
  currentLabel = label;
  progressState = state;
  progressEl.classList.remove("hidden");
  progressEl.replaceChildren();
  const head = document.createElement("div");
  head.className = "craft-progress-head";
  const title = document.createElement("strong");
  title.textContent = state === "done" ? "PROMPT CRAFT — 제작 완료" : state === "error" ? "PROMPT CRAFT — 제작 중단" : "PROMPT CRAFT — 제작 진행 중";
  const counter = document.createElement("span");
  counter.textContent = `${step} / 7단계`;
  head.append(title, counter);
  const track = document.createElement("div");
  track.className = "craft-progress-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "7");
  const completed = state === "done" ? 7 : Math.max(0, step - 1);
  track.setAttribute("aria-valuenow", String(completed));
  const fill = document.createElement("div");
  fill.className = "craft-progress-fill";
  fill.style.width = `${completed / 7 * 100}%`;
  track.appendChild(fill);
  const description = document.createElement("p");
  description.className = "craft-progress-description";
  description.textContent = label;
  const times = document.createElement("div");
  times.className = "craft-progress-times";
  [["경과시간", "total-time"], ["현재 단계 소요시간", "stage-time"]].forEach(([name, cls]) => {
    const box = document.createElement("div");
    const caption = document.createElement("span");
    caption.textContent = name;
    const value = document.createElement("strong");
    value.className = cls;
    value.textContent = "00:00";
    box.append(caption, value);
    times.appendChild(box);
  });
  progressEl.append(head, track, description, times);
  updateElapsed();
}

function renderMarkdown(target, source) {
  target.replaceChildren();

  // Normalize both real line breaks and literal "\n" returned by a model.
  let text = String(source ?? "").replace(/\r\n?/g, "\n").replace(/\\n/g, "\n");
  // Some models put several Markdown headings on one long line.
  text = text.replace(/([^\n])\s+(#{1,4}\s+)/g, "$1\n\n$2");
  text = text.replace(/([^\n])\s+(---+)\s*(?=\S)/g, "$1\n\n$2\n");
  const lines = text.split("\n");

  function inline(node, value) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
    String(value).split(pattern).forEach(part => {
      let child;
      if (part.startsWith("**") && part.endsWith("**")) {
        child = document.createElement("strong");
        child.textContent = part.slice(2, -2);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        child = document.createElement("code");
        child.textContent = part.slice(1, -1);
      } else if (part.startsWith("*") && part.endsWith("*")) {
        child = document.createElement("em");
        child.textContent = part.slice(1, -1);
      } else child = document.createTextNode(part);
      node.appendChild(child);
    });
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      if (i < lines.length) i++;
      const pre = document.createElement("pre");
      const element = document.createElement("code");
      element.textContent = code.join("\n");
      pre.appendChild(element);
      target.appendChild(pre);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const h = document.createElement("h" + Math.min(heading[1].length + 1, 5));
      inline(h, heading[2]);
      target.appendChild(h);
      i++;
      continue;
    }

    if (/^(?:---+|\*\*\*+)$/.test(line)) {
      target.appendChild(document.createElement("hr"));
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length &&
        /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
      const table = document.createElement("table");
      const splitCells = s => s.trim().replace(/^\||\|$/g, "").split("|").map(v => v.trim());
      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      splitCells(line).forEach(value => {
        const th = document.createElement("th");
        inline(th, value);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      i += 2;
      while (i < lines.length && lines[i].trim().includes("|")) {
        const tr = document.createElement("tr");
        splitCells(lines[i]).forEach(value => {
          const td = document.createElement("td");
          inline(td, value);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
        i++;
      }
      table.appendChild(tbody);
      const wrap = document.createElement("div");
      wrap.className = "markdown-table-wrap";
      wrap.appendChild(table);
      target.appendChild(wrap);
      continue;
    }

    const bullet = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      const ordered = /^\d/.test(bullet[1]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (i < lines.length) {
        const match = lines[i].trim().match(/^([-*]|\d+[.)])\s+(.+)$/);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        const li = document.createElement("li");
        inline(li, match[2]);
        list.appendChild(li);
        i++;
      }
      target.appendChild(list);
      continue;
    }

    const paragraph = document.createElement("p");
    // Preserve authored single newlines inside a paragraph.
    let first = true;
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,4}\s|[-*]\s|\d+[.)]\s|```|---+$)/.test(lines[i].trim())) {
      if (!first) paragraph.appendChild(document.createElement("br"));
      inline(paragraph, lines[i].trim());
      first = false;
      i++;
    }
    if (first) { inline(paragraph, line); i++; }
    target.appendChild(paragraph);
  }
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

  stopElapsed();
  startedAt = Date.now();
  stepStartedAt = startedAt;
  currentStep = 1;
  progressState = "running";
  showProgress(1, "서버 연결 중");
  elapsedTimer = setInterval(updateElapsed, 1000);
  generated = {};
  currentKey = "core";
  userSelectedTab = false;
  resultsEl.classList.remove("hidden");
  renderTabs();
  renderCurrent();
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
      } else if (msg.type === "section") {
        generated[msg.key] = msg.content;
        showCompletedSection(msg.key, msg.content);
      } else if (msg.type === "error") {
        throw new Error(msg.message);
      } else if (msg.type === "result") {
        generated = msg.data;
        completed = true;
        if (!userSelectedTab) currentKey = "narration";
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
    showProgress(7, "모든 제작 단계가 완료됐어.", "done");
    statusEl.textContent = "완료.";
  } catch (error) {
    showProgress(currentStep, `오류: ${error.message}`, "error");
    statusEl.textContent = `오류: ${error.message}`;
  } finally {
    stopElapsed();
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
