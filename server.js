import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { buildPrompts } from "./src/prompts.js";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let nextGroqRequestAt = 0;
// Prevent overlapping requests, even if multiple browser tabs start generation.
let groqQueue = Promise.resolve();
function queuedGroq(prompt, send, step) {
  const job = groqQueue.catch(() => {}).then(async () => {
    const wait = Math.max(0, nextGroqRequestAt - Date.now());
    if (wait) {
      send("progress", { step, label: `Groq 요청 간격 조절 중 (${Math.ceil(wait / 1000)}초 대기)` });
      await sleep(wait);
    }
    try {
      return await callGroqWithRateRetry(prompt, send, step);
    } finally {
      nextGroqRequestAt = Date.now() + 2500;
    }
  });
  groqQueue = job.catch(() => {});
  return job;
}
function retryWaitMs(response, detail) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
    const dateMs = Date.parse(retryAfter);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  }
  const match = detail.match(/(?:try again in|retry after)\s*([\d.]+)\s*(ms|s|seconds?|m|minutes?)/i);
  if (match) {
    const n = Number(match[1]);
    return Math.ceil(n * (/^m(?:in)/i.test(match[2]) ? 60000 : /^ms$/i.test(match[2]) ? 1 : 1000));
  }
  return 30000;
}
async function callGroqWithRateRetry(prompt, send, step) {
  for (let attempt = 0; attempt <= 5; attempt++) {
    try { return await callGroq(prompt); }
    catch (err) {
      if (err.status !== 429 || attempt === 5) throw err;
      const waitMs = Math.min(120000, Math.max(2000, err.retryMs || 30000) + 1500);
      send("progress", { step, label: `Groq 분당 사용량 제한 — ${Math.ceil(waitMs / 1000)}초 기다린 후 자동 재시도 (${attempt + 1}/5)` });
      await sleep(waitMs);
    }
  }
}
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY가 설정되지 않았어. .env 파일을 확인해줘.");
  }

  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_completion_tokens: 4096
      }),
      signal: AbortSignal.timeout(120000)
    });
  } catch (error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      throw new Error("Groq 요청 시간이 초과됐어. 다시 시도해줘.");
    }
    throw new Error(`Groq 연결 오류: ${error.message}`);
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Groq 응답 형식 오류 (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`;
    if (response.status === 429) {
      const error = new Error(`Groq 요청 한도를 초과했어. 잠시 후 다시 시도해줘. (${detail})`);
      error.noRetry = true;
      error.status = 429;
      error.retryMs = retryWaitMs(response, detail);
      throw error;
    }
    if (response.status === 401 || response.status === 403) {
      const error = new Error(`Groq API 키 또는 접근 권한을 확인해줘. (${detail})`);
      error.noRetry = true;
      throw error;
    }
    if (response.status === 400 || response.status === 404) {
      const error = new Error(`Groq 모델명 또는 요청 설정을 확인해줘. (${detail})`);
      error.noRetry = true;
      throw error;
    }
    throw new Error(`Groq API 오류 (${response.status}): ${detail}`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Groq AI 응답이 비어 있어.");
  }
  return { text: text.trim(), model: data.model || MODEL };
}

const REQUIRED = {
  core: { min: 110, terms: [/핵심/, /확인|배경/] },
  plan: { min: 180, terms: [/제목/, /콘셉트/, /메시지/, /시청자/] },
  storyboard: { min: 240, terms: [/scene\s*1|장면\s*1/i, /시간|00:|0:0/, /화면/, /내레이션|대사/] },
  script: { min: 160, terms: [/scene\s*1|장면\s*1/i, /내레이션/, /전체 통합 대본/] },
  imagePrompts: { min: 170, terms: [/scene\s*1|장면\s*1/i, /영문 이미지 프롬프트/, /한국어 설명/] },
  videoPrompts: { min: 170, terms: [/scene\s*1|장면\s*1/i, /영문 영상 프롬프트/, /움직임/] },
  narration: { min: 160, terms: [/TTS용 대본/, /속도/, /호흡|강조/] }
};
function validate(key, text, duration) {
  const rule = REQUIRED[key];
  if (/^\s*(user safety\s*:\s*safe|safe|ok|완료)\s*[.!]?\s*$/i.test(text)) return '결과 대신 상태 메시지만 반환됨';
  if (text.length < rule.min) return `내용 부족 (${text.length}자)`;
  const missing = rule.terms.filter(re => !re.test(text));
  if (missing.length) return `필수 항목 누락 (${missing.length}개)`;
  if (key === 'storyboard') {
    const count = (text.match(/(?:^|\n)\s*#{0,3}\s*(?:scene|장면)\s*\d+/gim) || []).length;
    const expected = duration <= 35 ? 4 : duration <= 65 ? 5 : 7;
    if (count < expected) return `장면 수 부족 (${count}/${expected})`;
  }
  return null;
}
function currentStageFor(key) {
  return ({ core: 1, plan: 2, storyboard: 3, script: 4, imagePrompts: 4, videoPrompts: 4, narration: 5 })[key] || 1;
}

async function generateValidated(key, prompt, duration, send) {
  let issue = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const correction = attempt === 1 ? '' : `\n\n[재작성 필수] 이전 출력의 문제: ${issue}. 반드시 요청한 결과물만, 모든 필수 항목을 포함해 작성해. 상태 메시지만 답하지 마.`;
      const result = await queuedGroq(prompt + correction, send, currentStageFor(key));
      issue = validate(key, result.text, duration);
      console.log(`[${key}] model=${result.model} attempt=${attempt} chars=${result.text.length} validation=${issue || 'OK'}`);
      if (!issue) return result.text;
    } catch (err) {
      issue = err.message;
      if (err.noRetry || attempt === 3) throw err;
    }
    if (attempt < 3) send('progress', { step: currentStageFor(key), label: `${key} 품질 검사 재시도 (${attempt}/2)` });
  }
  throw new Error(`${key} 결과 검증 실패: ${issue}. 이전 단계 결과는 유지돼.`);
}

/*
  Opal 원본 흐름을 웹앱에서 재현한다.

  입력
   ├─ 주제
   ├─ 영상 분위기/장르
   └─ 영상 길이
        ↓
  핵심 내용 정리
        ↓
  콘텐츠 기획구성
        ↓
  스토리보드
      ├─ 대본 → 내레이션 프롬프트
      ├─ 이미지 프롬프트
      └─ 영상 프롬프트
        ↓
  최종 결과 정리
*/
app.post("/api/generate", async (req, res) => {
  const { topic, genre, duration } = req.body || {};
  if (typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "주제를 입력해줘." });
  }
  if (!Number.isFinite(Number(duration)) || Number(duration) < 10 || Number(duration) > 300) return res.status(400).json({error:"영상 길이는 10~300초로 지정해줘."});
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const send = (type, payload) => {
    if (!res.destroyed) res.write(JSON.stringify({ type, ...payload }) + "\n");
  };
  const input = {
    topic: topic.trim(),
    genre: typeof genre === "string" && genre.trim() ? genre.trim() : "정보형",
    duration: Number(duration) || 60
  };
  const p = buildPrompts(input);
  const gen = (key, prompt) => generateValidated(key, prompt, input.duration, send);
  try {
    send("progress", { step: 1, label: "핵심 내용 분석 중" });
    const core = await gen("core", p.core());
    send("section", { key: "core", content: core });
    send("progress", { step: 2, label: "콘텐츠 기획안 작성 중" });
    const plan = await gen("plan", p.plan(core));
    send("section", { key: "plan", content: plan });
    send("progress", { step: 3, label: "스토리보드 생성 중" });
    const storyboard = await gen("storyboard", p.storyboard(core, plan));
    send("section", { key: "storyboard", content: storyboard });
    send("progress", { step: 4, label: "대본 생성 중 (순차 처리)" });
    const script = await gen("script", p.script(plan, storyboard));
    send("section", { key: "script", content: script });
    send("progress", { step: 4, label: "이미지 프롬프트 생성 중 (순차 처리)" });
    const imagePrompts = await gen("imagePrompts", p.imagePrompts(plan, storyboard));
    send("section", { key: "imagePrompts", content: imagePrompts });
    send("progress", { step: 4, label: "영상 프롬프트 생성 중 (순차 처리)" });
    const videoPrompts = await gen("videoPrompts", p.videoPrompts(plan, storyboard));
    send("section", { key: "videoPrompts", content: videoPrompts });
    send("progress", { step: 5, label: "내레이션 프롬프트 생성 중" });
    const narration = await gen("narration", p.narration(script));
    send("section", { key: "narration", content: narration });
    send("progress", { step: 6, label: "최종 결과 정리 중" });
    send("result", { data: { input, core, plan, storyboard, script, imagePrompts, videoPrompts, narration } });
    send("progress", { step: 7, label: "제작 완료" });
  } catch (error) {
    console.error(error);
    send("error", { message: error.message || "서버 오류가 발생했어." });
  } finally {
    res.end();
  }
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, model: MODEL });
});

app.listen(PORT, () => {
  console.log(`PROMPT CRAFT: http://localhost:${PORT}`);
});
