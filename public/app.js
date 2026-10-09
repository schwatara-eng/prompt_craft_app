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


/* =========================================
   PROMPT CRAFT — CYBER CYAN DIGITAL RAIN
   ========================================= */

(() => {
  const canvas = document.getElementById("digital-rain");

  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const config = {
    fontSize: 15,
    columnGap: 24,
    speed: 0.35,
    color: "57, 187, 209",
    fade: 0.12,
    opacity: 0.85,
    fps: 30
  };

  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]<>/+=*";

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  let columns = [];
  let width = 0;
  let height = 0;
  let animationId = null;
  let lastFrame = 0;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gap = width < 768 ? 30 : config.columnGap;
    const count = Math.ceil(width / gap);

    columns = Array.from({ length: count }, (_, i) => ({
      x: i * gap,
      y: Math.random() * height - height,
      speed: 0.5 + Math.random() * 0.5,
      brightness: 0.35 + Math.random() * 0.55
    }));

    ctx.fillStyle = "#070d12";
    ctx.fillRect(0, 0, width, height);
  }

  function draw(timestamp = 0) {
    animationId = requestAnimationFrame(draw);

    if (timestamp - lastFrame < 1000 / config.fps) return;

    lastFrame = timestamp;

    ctx.fillStyle = `rgba(7, 13, 18, ${config.fade})`;
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${config.fontSize}px monospace`;
    ctx.textAlign = "left";

    columns.forEach((column) => {
      const char = characters[
        Math.floor(Math.random() * characters.length)
      ];

      const alpha =
        column.brightness * config.opacity;

      ctx.fillStyle =
        `rgba(${config.color}, ${alpha})`;

      ctx.fillText(char, column.x, column.y);

      column.y +=
        config.fontSize * column.speed * config.speed;

      if (column.y > height + config.fontSize * 10) {
        column.y = -Math.random() * height * 0.5;
      }
    });
  }

  function start() {
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    resizeCanvas();

    if (reducedMotion.matches) {
      // 정지된 배경을 유지
      return;
    }

    animationId = requestAnimationFrame(draw);
  }

  window.addEventListener("resize", start);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    } else {
      start();
    }
  });

  reducedMotion.addEventListener("change", start);

  start();
})();


/* ================================================
   PROMPT CRAFT — CODE SNOW / AVALANCHE
   Separate transparent canvas above the interface.
   Does not change API calls or production workflow.
   ================================================ */
(() => {
  const oldRain = document.getElementById('digital-rain');
  if (!oldRain) return;
  const layer = document.createElement('canvas');
  layer.id = 'code-snow';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const ctx = layer.getContext('2d');
  if (!ctx) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const glyphs = '01{}[]<>/AI';
  const cell = 10;
  const flakeCount = window.innerWidth < 700 ? 42 : 100;
  let W = 0, H = 0, flakes = [], slides = [], surfaces = [];
  let raf = null, previous = 0, accumulator = 0;
  const pick = () => glyphs[Math.floor(Math.random() * glyphs.length)];
  const random = (a, b) => a + Math.random() * (b - a);

  function findSurfaces() {
    const targets = [document.querySelector('.hero h1') || document.querySelector('h1'),
                     document.querySelector('.input-panel')];
    return targets.filter(Boolean).map((el, index) => {
      const r = el.getBoundingClientRect();
      const left = Math.max(0, r.left + (index === 0 ? 4 : 12));
      const right = Math.min(W, r.right - (index === 0 ? 4 : 12));
      const n = Math.max(1, Math.floor((right - left) / cell));
      const previousSurface = surfaces[index];
      const same = previousSurface && previousSurface.n === n && previousSurface.el === el;
      return {el, left, right, top: r.top, bottom: r.bottom, n,
        heights: same ? previousSurface.heights : new Array(n).fill(0),
        chars: same ? previousSurface.chars : Array.from({length:n},()=>[]),
        maxHeight: index === 0 ? 6 : 9,
        center: (n - 1) / 2};
    }).filter(s => s.right > s.left && s.top < H + 150 && s.bottom > -150);
  }

  function reset() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    layer.width = Math.round(W * dpr);
    layer.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    surfaces = [];
    flakes = Array.from({length: flakeCount}, () => ({
      x: random(0,W), y: random(-H, H), vx: random(-0.2,0.2),
      vy: random(0.6,1.3), char: pick(), alpha: random(.45,.85)
    }));
    slides = [];
  }
  function respawn(f) {
    f.x = random(0,W); f.y = random(-90,-10);
    f.vx = random(-.2,.2); f.vy = random(.6,1.3);
    f.char = pick();
  }
  function avalanche(s, col) {
    if (col < 0 || col >= s.n || s.heights[col] === 0) return;
    s.heights[col]--;
    const char = s.chars[col].pop() || pick();
    const x = s.left + (col + .5) * cell;
    const y = s.top - (s.heights[col] + 1) * cell;
    const dir = col < s.center ? -1 : 1;
    slides.push({x,y,vx:dir*random(.8,1.8),vy:random(-.3,.3),char,life:110});
  }
  function settle(s, x, char) {
    const col = Math.floor((x - s.left) / cell);
    if (col < 0 || col >= s.n) return;
    // Snow starts as a filled mound near the center, then grows outward.
    const dist = Math.abs(col - s.center) / Math.max(1,s.center);
    const allowed = Math.max(1, Math.round(s.maxHeight * (1 - dist * .83)));
    if (s.heights[col] >= allowed) {
      // A full slope sheds snow to the nearest downhill side.
      avalanche(s,col);
      return;
    }
    s.heights[col]++;
    s.chars[col].push(char);
  }
  function evolvePile(s) {
    // Each column is a solid stack of individual characters (not an outline).
    // When the gradient becomes steep, one cell slides downhill.
    for (let i = 0; i < 3; i++) {
      const col = Math.floor(random(0,s.n));
      const h = s.heights[col];
      if (!h) continue;
      const side = col < s.center ? -1 : 1;
      const next = col + side;
      if (next < 0 || next >= s.n) { if (h > 1) avalanche(s,col); continue; }
      if (h - s.heights[next] >= 3 || h > s.maxHeight) {
        const char = s.chars[col].pop() || pick();
        s.heights[col]--;
        if (s.heights[next] < s.maxHeight) {
          s.chars[next].push(char); s.heights[next]++;
        } else avalanche(s,col);
      }
    }
    // Intermittent small collapses after the peak reaches its threshold.
    const mid = Math.floor(s.center);
    if (s.heights[mid] >= s.maxHeight && Math.random() < .09) {
      for (let i=0;i<3;i++) avalanche(s,Math.max(0,Math.min(s.n-1,mid+Math.floor(random(-3,4)))));
    }
  }
  function tick() {
    surfaces = findSurfaces();
    for (const s of surfaces) evolvePile(s);
    for (const f of flakes) {
      const oldY = f.y;
      f.x += f.vx; f.y += f.vy * 2;
      let landed = false;
      for (const s of surfaces) {
        if (f.x < s.left || f.x >= s.right) continue;
        const col = Math.floor((f.x-s.left)/cell);
        const peak = s.top - s.heights[col]*cell;
        if (oldY <= peak && f.y >= peak) {
          settle(s,f.x,f.char); respawn(f); landed = true; break;
        }
      }
      if (!landed && (f.y > H+20 || f.x < 0 || f.x > W)) respawn(f);
    }
    for (let i=slides.length-1;i>=0;i--) {
      const p = slides[i];
      p.vy = Math.min(p.vy + .085,3.2);
      p.x += p.vx; p.y += p.vy; p.life--;
      if (p.life <= 0 || p.y > H+20) slides.splice(i,1);
    }
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    ctx.font = `${cell}px monospace`;
    ctx.textAlign = 'center';
    // Falling flakes are masked out inside the opaque input panel.
    for (const f of flakes) {
      if (surfaces.some(s => f.x > s.left && f.x < s.right && f.y > s.top && f.y < s.bottom)) continue;
      ctx.fillStyle = `rgba(57,187,209,${f.alpha})`;
      ctx.fillText(f.char,f.x,f.y);
    }
    for (const s of surfaces) {
      for (let col=0;col<s.n;col++) {
        for (let row=0;row<s.heights[col];row++) {
          ctx.fillStyle = row === s.heights[col]-1 ? '#9cecff' : 'rgba(57,187,209,.86)';
          ctx.fillText(s.chars[col][row] || '0',s.left+(col+.5)*cell,s.top-(row+.2)*cell);
        }
      }
    }
    for (const p of slides) {
      ctx.fillStyle = 'rgba(92,220,240,.9)';
      ctx.fillText(p.char,p.x,p.y);
    }
  }
  function animate(now) {
    raf = requestAnimationFrame(animate);
    if (now-previous < 33) return;
    previous = now;
    tick(); draw();
  }
  function restart() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    reset();
    if (!reduceMotion.matches && !document.hidden) raf = requestAnimationFrame(animate);
  }
  addEventListener('resize',restart);
  document.addEventListener('visibilitychange',()=>{
    if (document.hidden) {if(raf!==null) cancelAnimationFrame(raf);raf=null;}
    else restart();
  });
  reduceMotion.addEventListener('change',restart);
  restart();
})();
