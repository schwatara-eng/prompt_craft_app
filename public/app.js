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


/* ==================================================
   CODE SNOW v4 — rotated glyph objects and true text silhouettes
   ================================================== */
(() => {
  const base = document.getElementById('digital-rain');
  if (!base || document.getElementById('code-snow')) return;
  const layer = document.createElement('canvas');
  layer.id = 'code-snow';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const ctx = layer.getContext('2d');
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const chars = '01{}[]<>/AI';
  const rand = (a, b) => a + Math.random() * (b - a);
  const glyph = () => chars[Math.floor(Math.random() * chars.length)];
  const SIZE = 9, STEP = 8;
  let W, H, targets = [], falling = [], debris = [], raf = 0, last = 0, frame = 0;
  const off = document.createElement('canvas');
  const maskCtx = off.getContext('2d', {willReadFrequently:true});

  function bounds(el) {
    const r = el.getBoundingClientRect();
    return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};
  }
  function textProfile(el, type) {
    const r = bounds(el);
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(el);
    const text = el.textContent.trim();
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    const left = Math.max(0, tr.left), right = Math.min(W, tr.right);
    if (right <= left) return null;
    const n = Math.max(1, Math.ceil((right-left)/STEP));
    const fontSize = parseFloat(cs.fontSize);
    const fontWeight = cs.fontWeight;
    const fontFamily = cs.fontFamily;
    const letterSpacing = parseFloat(cs.letterSpacing) || 0;
    const maskW = Math.ceil(tr.width)+12, maskH = Math.ceil(r.height)+20;
    off.width = maskW; off.height = maskH;
    maskCtx.clearRect(0,0,maskW,maskH);
    maskCtx.fillStyle = '#fff';
    maskCtx.textBaseline = 'alphabetic';
    maskCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    // Canvas letterSpacing is supported in current Chromium; fallback remains usable.
    if ('letterSpacing' in maskCtx) maskCtx.letterSpacing = `${letterSpacing}px`;
    // Use the actual glyph pixel bounds instead of the line-height rectangle.
    const metric = maskCtx.measureText(text);
    const textHeight = metric.actualBoundingBoxAscent + metric.actualBoundingBoxDescent;
    const baseline = Math.min(maskH-2, Math.max(textHeight+1, (r.height-textHeight)/2 + metric.actualBoundingBoxAscent + 8));
    maskCtx.fillText(text, 4, baseline);
    const pixels = maskCtx.getImageData(0,0,maskW,maskH).data;
    const cols=[];
    for(let i=0;i<n;i++) {
      const x=left+(i+.5)*STEP;
      const px=Math.min(maskW-1,Math.max(0,Math.floor(x-tr.left+4)));
      let first=-1;
      for(let y=0;y<maskH;y++) {
        if(pixels[(y*maskW+px)*4+3]>70){first=y;break;}
      }
      cols.push(first<0?null:r.top-8+first);
    }
    return {id:type, el, left, right, n, cols, cap:type==='eyebrow'?6:2};
  }
  function panelProfile(el) {
    const r=bounds(el), left=Math.max(0,r.left+7), right=Math.min(W,r.right-7);
    const n=Math.max(1,Math.floor((right-left)/STEP));
    return {id:'panel',el,left,right,n,cols:Array(n).fill(r.top),cap:18};
  }
  function updateTargets() {
    const eyebrow=document.querySelector('.hero .eyebrow');
    const title=document.querySelector('.hero h1')||document.querySelector('h1');
    const panel=document.querySelector('.input-panel');
    const old=new Map(targets.map(t=>[t.id,t]));
    const next=[];
    for(const [el,type] of [[eyebrow,'eyebrow'],[title,'title'],[panel,'panel']]) {
      if(!el)continue;
      const t=type==='panel'?panelProfile(el):textProfile(el,type);
      if(!t)continue;
      const prior=old.get(type);
      t.stacks=prior&&prior.n===t.n?prior.stacks:Array.from({length:t.n},()=>[]);
      next.push(t);
    }
    targets=next;
  }
  function makeParticle(x=rand(0,W),y=rand(-H,0)) {
    return {x,y,vx:rand(-.12,.12),vy:rand(.75,1.45),angle:rand(-.45,.45),spin:rand(-.008,.008),size:rand(8,12),char:glyph(),alpha:rand(.45,.9)};
  }
  function respawn(p) {
    const t=Math.random()<.77?targets.find(t=>t.id==='panel'):(Math.random()<.6?targets.find(t=>t.id==='eyebrow'):targets.find(t=>t.id==='title'));
    const valid=t?t.cols.map((v,i)=>v===null?-1:i).filter(i=>i>=0):[];
    p.x=valid.length?t.left+(valid[Math.floor(Math.random()*valid.length)]+.5)*STEP:rand(0,W);
    p.y=rand(-H*.6,-15);p.vx=rand(-.12,.12);p.vy=rand(.8,1.5);
    p.char=glyph();p.angle=rand(-.5,.5);p.spin=rand(-.01,.01);
  }
  function resize() {
    const dpr=Math.min(devicePixelRatio||1,2);
    W=innerWidth;H=innerHeight;
    layer.width=Math.round(W*dpr);layer.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    targets=[];updateTargets();debris=[];
    falling=Array.from({length:W<700?125:265},()=>makeParticle());
  }
  function stackTop(t,i) {
    const baseY=t.cols[i];
    if(baseY===null)return -Infinity;
    return baseY-t.stacks[i].length*7;
  }
  function spill(t,i) {
    const pile=t.stacks[i];if(!pile.length)return;
    const item=pile.pop();
    const dir=i<t.n/2?-1:1;
    debris.push({...item,x:t.left+(i+.5)*STEP,y:stackTop(t,i)-3,
      vx:dir*rand(.7,1.7),vy:rand(-.5,.25),spin:rand(-.055,.055),life:210});
  }
  function land(t,i,p) {
    const valid=[i-1,i,i+1].filter(j=>j>=0&&j<t.n&&t.cols[j]!==null);
    if(!valid.length)return;
    // Prefer lower neighboring stacks while retaining an uneven, overlapping surface.
    const j=valid.reduce((best,k)=>stackTop(t,k)>stackTop(t,best)?k:best,valid[0]);
    const normalized=Math.abs(j-(t.n-1)/2)/Math.max(1,(t.n-1)/2);
    const limit=t.id==='title'?2:Math.max(2,Math.round(t.cap*(1-.83*normalized)));
    if(t.stacks[j].length>=limit) {
      if(Math.random()<.18)spill(t,j);
      return;
    }
    t.stacks[j].push({char:p.char,size:rand(8,12),angle:rand(-1.1,1.1),
      dx:rand(-3.2,3.2),dy:rand(-2,1),alpha:rand(.68,.97)});
  }
  function avalanche(t) {
    if(frame%4!==0)return;
    const max=Math.max(0,...t.stacks.map(s=>s.length));
    if(max<Math.min(t.cap,5))return;
    for(let attempt=0;attempt<2;attempt++) {
      const i=Math.floor(rand(0,t.n));
      if(t.cols[i]===null||!t.stacks[i].length)continue;
      const dir=i<t.n/2?-1:1, j=i+dir;
      if(j<0||j>=t.n||t.cols[j]===null) {if(Math.random()<.15)spill(t,i);continue;}
      const top=stackTop(t,i),next=stackTop(t,j);
      if(next-top>STEP*1.3) {
        const item=t.stacks[i].pop();
        t.stacks[j].push({...item,angle:item.angle+rand(-.4,.4)});
      }
    }
    if(frame%75===0) {
      const populated=t.stacks.map((s,i)=>s.length>0?i:-1).filter(i=>i>=0);
      if(populated.length) for(let k=0;k<3;k++)spill(t,populated[Math.floor(Math.random()*populated.length)]);
    }
  }
  function tick() {
    frame++;
    if(frame%20===0)updateTargets();
    targets.forEach(avalanche);
    for(const p of falling) {
      const prev=p.y;
      p.x+=p.vx;p.y+=p.vy*2;p.angle+=p.spin;
      let hit=false;
      for(const t of targets) {
        if(p.x<t.left||p.x>=t.right)continue;
        const i=Math.floor((p.x-t.left)/STEP);
        if(i<0||i>=t.n||t.cols[i]===null)continue;
        const top=stackTop(t,i);
        if(prev<=top&&p.y>=top) {land(t,i,p);respawn(p);hit=true;break;}
      }
      if(!hit&&(p.y>H+20||p.x<0||p.x>W))respawn(p);
    }
    for(let i=debris.length-1;i>=0;i--) {
      const p=debris[i];p.vy=Math.min(4,p.vy+.08);
      p.x+=p.vx;p.y+=p.vy;p.angle+=p.spin;p.life--;
      if(p.life<=0||p.y>H+30)debris.splice(i,1);
    }
  }
  function drawGlyph(p,x,y,alpha=1) {
    ctx.save();ctx.translate(x,y);ctx.rotate(p.angle);
    ctx.font=`${p.size}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=`rgba(57,187,209,${(p.alpha||.85)*alpha})`;
    ctx.fillText(p.char,0,0);ctx.restore();
  }
  function draw() {
    ctx.clearRect(0,0,W,H);
    for(const p of falling) {
      // Do not draw falling glyphs on top of the white panel.
      const panel=targets.find(t=>t.id==='panel');
      if(panel){const r=bounds(panel.el);if(p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom)continue;}
      drawGlyph(p,p.x,p.y);
    }
    for(const t of targets)for(let i=0;i<t.n;i++) {
      const base=t.cols[i];if(base===null)continue;
      for(let k=0;k<t.stacks[i].length;k++) {
        const p=t.stacks[i][k];
        drawGlyph(p,t.left+(i+.5)*STEP+p.dx,base-(k+.5)*7+p.dy);
      }
    }
    for(const p of debris)drawGlyph(p,p.x,p.y);
  }
  function animate(time) {
    raf=requestAnimationFrame(animate);
    if(time-last<33)return;
    last=time;tick();draw();
  }
  function restart() {
    if(raf)cancelAnimationFrame(raf);raf=0;
    resize();if(!reduced.matches&&!document.hidden)raf=requestAnimationFrame(animate);
  }
  addEventListener('resize',restart);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=0;}else restart();});
  reduced.addEventListener('change',restart);
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(restart);
  restart();
})();
