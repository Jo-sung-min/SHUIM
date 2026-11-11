"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isAllowedModel, MODEL_OPTIONS } from "@/lib/prompts";

type Settings = { model: string; configured: boolean };
async function request(model?: string, signal?: AbortSignal): Promise<Settings> {
  const response = await fetch("/api/admin/ai", {
    method: model ? "PUT" : "GET", credentials: "same-origin", cache: "no-store", signal,
    ...(model ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "AI 설정을 불러오거나 저장하지 못했어요.");
  if (!isAllowedModel(data?.model) || typeof data?.configured !== "boolean") throw new Error("AI 설정을 확인하지 못했어요.");
  return { model: data.model, configured: data.configured };
}

export default function AiModelAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try { setSettings(await request(undefined, signal)); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "설정을 불러오지 못했어요."); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const pick = async (model: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null); setSaved(false);
    try { setSettings(await request(model)); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : "설정을 저장하지 못했어요."); }
    finally { lock.current = false; setBusy(false); }
  };

  return <section aria-busy={busy}>
    <div className="section-title"><span>사용할 GPT 모델</span><span className="tiny muted">모든 사용자 공통</span></div>
    {error && <p role="alert">{error} {!settings && <button type="button" className="text-btn" onClick={() => void load()}>다시 불러오기</button>}</p>}
    {!settings && !error && <p className="tiny muted">AI 설정을 불러오고 있어요…</p>}
    {settings && <>
      <div className="stack" style={{ gap: 8 }}>
        {MODEL_OPTIONS.map(option => <button key={option.id} type="button"
          className={`reason glass ${settings.model === option.id ? "on" : ""}`}
          aria-pressed={settings.model === option.id} disabled={busy}
          onClick={() => void pick(option.id)}>
          <span className="radio" /><span><b>{option.label}</b><small>{option.desc}</small></span>
        </button>)}
      </div>
      <p className="tiny muted" role="status">{busy ? "저장 중…" : saved ? "저장했어요. 다음 AI 요청부터 적용돼요." : "선택하면 서버에 저장되고 모든 AI 기능에 적용돼요."}</p>
      <p className="tiny muted">{settings.configured ? "OpenAI API 키가 설정되어 있어요." : "OpenAI API 키가 없어요. 서버의 OPENAI_API_KEY 환경변수를 설정해 주세요. 현재는 규칙 기반으로 응답해요."}</p>
    </>}
  </section>;
}
