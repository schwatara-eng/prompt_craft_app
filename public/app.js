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
  resultTextEl.textContent = generated[currentKey] || "";
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

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        genre: genreEl.value,
        duration: Number(durationEl.value)
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "생성에 실패했어.");
    }

    generated = data;
    currentKey = "plan";

    renderTabs();
    renderCurrent();

    resultsEl.classList.remove("hidden");
    statusEl.textContent = "완료.";
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    statusEl.textContent = error.message;
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
