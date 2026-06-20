import { useViewerStore } from "../store/useViewerStore";

// 무역풍(동→서)·해수면 온도 슬라이더로 만들어지는 ENSO 상태를 인포그래픽처럼 보여준다.
// 데이터 자체는 화면에서 눈으로 잡기 어려우니, 지금 어떤 상태인지 그림으로 힌트를 준다.
const PHASES = {
  elnino: {
    label: "엘니뇨 경향",
    color: "#d9474f",
    note: "무역풍이 약해져 따뜻한 바닷물이 동쪽(남미 쪽)으로 퍼져요.",
    west: { emoji: "🔥", title: "호주·동남아", text: "비가 줄어 가뭄·산불 위험이 커져요" },
    east: { emoji: "🌧️", title: "페루·미국 남부", text: "비가 늘어 폭우·홍수가 잦아져요" },
  },
  lanina: {
    label: "라니냐 경향",
    color: "#2f7fb0",
    note: "무역풍이 강해져 따뜻한 바닷물이 서쪽(호주 쪽)에 쌓여요.",
    west: { emoji: "🌧️", title: "호주·동남아", text: "폭우가 잦아 홍수·수해가 늘어요" },
    east: { emoji: "🔥", title: "미국 중서부·남미", text: "가뭄으로 농산물 생산이 줄어요" },
  },
  neutral: {
    label: "평년",
    color: "#6f8a91",
    note: "무역풍과 바닷물 흐름이 평년과 비슷해요.",
    west: { emoji: "🌤️", title: "호주·동남아", text: "평년과 비슷한 날씨" },
    east: { emoji: "🌤️", title: "아메리카", text: "평년과 비슷한 날씨" },
  },
} as const;

export function EnsoSchematic() {
  const { draftInputs } = useViewerStore();
  const wind = draftInputs.tradeWindChange; // -5(강) ~ +5(약)
  const sst = draftInputs.sstAnomaly; // -2 ~ +2

  // 따뜻한 SST + 약한 무역풍(+) = 엘니뇨, 반대는 라니냐
  const index = sst + wind * 0.3;
  const phase = index > 0.4 ? "elnino" : index < -0.4 ? "lanina" : "neutral";
  const meta = PHASES[phase];

  // 적도 무역풍(동풍) 세기: 라니냐일수록 강함 (데이터 기준 -5→5.2, 0→3.6, +5→2.0 m/s)
  const easterly = 3.6 - 0.31 * wind;
  const strength = Math.max(0.12, Math.min(1, (easterly - 2) / 3.2));
  const windLen = 28 + 60 * strength;

  // 따뜻한 바닷물: 라니냐/평년은 서쪽으로, 엘니뇨는 동쪽으로 퍼진다.
  const waterEast = phase === "elnino";
  const rainWest = phase !== "elnino"; // 평년/라니냐는 서태평양에 비, 엘니뇨는 동쪽에 비

  return (
    <section className="enso-explainer panel">
      <div className="panel-heading compact">
        <div><span className="eyebrow">원리 해설</span><h2>엘니뇨·라니냐</h2></div>
        <span className="enso-phase" style={{ background: meta.color }}>{meta.label}</span>
      </div>

      <div className="enso-scene">
        <div className="enso-side">
          <span className="enso-emoji">{rainWest ? "🌧️" : "☀️"}</span>
          <strong>{rainWest ? "저기압·비" : "고기압·맑음"}</strong>
          <small>서태평양<br />(호주·동남아)</small>
        </div>

        <svg className="enso-arrows" viewBox="0 0 120 92" role="img" aria-label="적도 무역풍과 바닷물 흐름">
          <defs>
            <marker id="enso-head" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">
              <path d="M0,0 L5,3 L0,6 Z" fill="currentColor" />
            </marker>
          </defs>
          {/* 무역풍 (항상 동→서, 세기만 변함) */}
          <g style={{ color: "#5fb3c4" }}>
            <line x1={105} y1={22} x2={105 - windLen} y2={22} stroke="currentColor" strokeWidth={3} markerEnd="url(#enso-head)" />
            <text x={60} y={14} className="enso-arrow-text">무역풍</text>
          </g>
          {/* 적도 */}
          <line x1={6} y1={46} x2={114} y2={46} stroke="rgba(231,247,239,0.45)" strokeWidth={1} strokeDasharray="4 4" />
          <text x={60} y={44} className="enso-eq-text">적도</text>
          {/* 따뜻한 바닷물 */}
          <g style={{ color: "#e8a44e" }}>
            {waterEast
              ? <line x1={20} y1={70} x2={20 + windLen * 0.9} y2={70} stroke="currentColor" strokeWidth={3} markerEnd="url(#enso-head)" />
              : <line x1={100} y1={70} x2={100 - windLen * 0.9} y2={70} stroke="currentColor" strokeWidth={3} markerEnd="url(#enso-head)" />}
            <text x={60} y={86} className="enso-arrow-text">따뜻한 바닷물</text>
          </g>
        </svg>

        <div className="enso-side">
          <span className="enso-emoji">{rainWest ? "☀️" : "🌧️"}</span>
          <strong>{rainWest ? "고기압·맑음" : "저기압·비"}</strong>
          <small>동태평양<br />(남미)</small>
        </div>
      </div>

      <p className="enso-note">{meta.note}</p>

      <div className="enso-impacts">
        <div className="enso-impact west">
          <span className="enso-impact-emoji">{meta.west.emoji}</span>
          <div><strong>{meta.west.title}</strong><span>{meta.west.text}</span></div>
        </div>
        <div className="enso-impact east">
          <span className="enso-impact-emoji">{meta.east.emoji}</span>
          <div><strong>{meta.east.title}</strong><span>{meta.east.text}</span></div>
        </div>
      </div>
    </section>
  );
}
