import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { buildPrompts } from "./src/prompts.js";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.OPENROUTER_MODEL || "openrouter/free";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY가 설정되지 않았어. .env 파일을 확인해줘.");
  }

  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 8192
    }),
    signal: AbortSignal.timeout(90000)
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("AI 응답이 90초를 초과했어. 잠시 후 다시 시도해줘.");
    throw error;
  }

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenRouter 응답 형식 오류 (HTTP ${response.status}): ${raw.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenRouter API 오류 (HTTP ${response.status})`);
  }

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("OpenRouter AI 응답이 비어 있어.");
  }
  return text.trim();
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
  try {
    send("progress", { step: 1, label: "핵심 내용 분석 중" });
    const core = await callOpenRouter(p.core());
    send("progress", { step: 2, label: "콘텐츠 기획안 작성 중" });
    const plan = await callOpenRouter(p.plan(core));
    send("progress", { step: 3, label: "스토리보드 생성 중" });
    const storyboard = await callOpenRouter(p.storyboard(core, plan));
    send("progress", { step: 4, label: "대본·이미지·영상 프롬프트 생성 중" });
    const [script, imagePrompts, videoPrompts] = await Promise.all([
      callOpenRouter(p.script(plan, storyboard)),
      callOpenRouter(p.imagePrompts(plan, storyboard)),
      callOpenRouter(p.videoPrompts(plan, storyboard))
    ]);
    send("progress", { step: 5, label: "내레이션 프롬프트 생성 중" });
    const narration = await callOpenRouter(p.narration(script));
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
  console.log(`YOUR PROMPT: http://localhost:${PORT}`);
});
