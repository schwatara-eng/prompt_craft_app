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

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
    })
  });

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
  try {
    const { topic, genre, duration } = req.body;

    if (!topic?.trim()) {
      return res.status(400).json({ error: "주제를 입력해줘." });
    }

    const input = {
      topic: topic.trim(),
      genre: genre?.trim() || "정보형",
      duration: Number(duration) || 60
    };

    const p = buildPrompts(input);

    // 1. 핵심 내용 정리
    const core = await callOpenRouter(p.core());

    // 2. 콘텐츠 기획구성
    const plan = await callOpenRouter(p.plan(core));

    // 3. 스토리보드
    const storyboard = await callOpenRouter(p.storyboard(core, plan));

    // 4. 스토리보드 이후 작업은 서로 독립적이므로 병렬 실행
    const [script, imagePrompts, videoPrompts] = await Promise.all([
      callOpenRouter(p.script(plan, storyboard)),
      callOpenRouter(p.imagePrompts(plan, storyboard)),
      callOpenRouter(p.videoPrompts(plan, storyboard))
    ]);

    // 5. 내레이션은 완성 대본을 받아 생성
    const narration = await callOpenRouter(p.narration(script));

    // 6. Opal의 '최종 결과 정리' 노드 역할
    // AI가 앞 결과를 다시 왜곡하지 않도록 웹앱 v1에서는 코드로 묶는다.
    const result = {
      input,
      core,
      plan,
      storyboard,
      script,
      imagePrompts,
      videoPrompts,
      narration
    };

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "서버 오류가 발생했어." });
  }
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, model: MODEL });
});

app.listen(PORT, () => {
  console.log(`YOUR PROMPT: http://localhost:${PORT}`);
});
