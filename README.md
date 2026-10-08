# YOUR PROMPT — v0.1

Opal에서 사용하던 영상 콘텐츠 제작 워크플로를 독립 웹앱으로 옮기기 위한 1차 초안.

## 현재 구현한 흐름

주제 / 영상 분위기·장르 / 영상 길이
→ 핵심 내용 정리
→ 콘텐츠 기획구성
→ 스토리보드
→ 대본 / 이미지 프롬프트 / 영상 프롬프트
→ 내레이션 가이드
→ 웹 화면에서 탭별 결과 확인 및 복사

## 파일

- `public/index.html` : 화면
- `public/style.css` : 디자인
- `public/app.js` : 화면 동작과 API 요청
- `server.js` : Gemini API 호출 및 워크플로 실행
- `src/prompts.js` : Opal 노드에 해당하는 프롬프트
- `.env.example` : API 키 예시

## 실행

1. 폴더를 VSCode에서 연다.
2. 터미널에서 `npm install`
3. `.env.example`을 복사해 `.env` 파일을 만든다.
4. `.env`의 `GEMINI_API_KEY`에 본인의 키를 넣는다.
5. `npm run dev`
6. 브라우저에서 `http://localhost:3000`

## 중요한 점

API 키는 `public/app.js`에 넣지 않는다.
브라우저에 노출되지 않도록 서버의 `.env`에만 둔다.

## v0.1에서 일부러 하지 않은 것

- 로그인
- 데이터베이스
- 결과 저장
- 이미지/영상 자체 생성
- 특정 생성 모델별 프롬프트 최적화
- 복잡한 배포 설정

먼저 Opal의 핵심 기능을 재현한 뒤 하나씩 추가하는 방향이다.
