"use client";

import { useEffect, useRef, useState } from "react";
import { formatPhone } from "@/lib/storage";
import { MyProfile, updateMyProfile } from "@/lib/social";
import { uploadImage } from "@/lib/upload";
import PhotoEditor from "@/components/PhotoEditor";
import photoStyles from "@/components/PhotoEditor.module.css";
import { Sheet } from "@/components/ui";
import { BadgeIcon } from "@/components/BadgeShelf";
import styles from "@/app/account-screens.module.css";
import profileStyles from "@/components/Profile.module.css";

/** MBTI 의 네 자리: 자리마다 둘 중 하나를 고른다 */
const MBTI_AXES: [string, string][] = [["E", "I"], ["S", "N"], ["T", "F"], ["J", "P"]];
const mbtiLetters = (value: string | undefined): string[] => MBTI_AXES.map((axis, i) => (axis.includes((value ?? "").charAt(i).toUpperCase()) ? (value ?? "").charAt(i).toUpperCase() : ""));

/**
 * 프로필 편집: 사진·닉네임·소개·칭호(공개) + 이름·전화·MBTI(비공개). 나 화면(사진 누르기)과 설정에서 연다.
 * MBTI 는 고르지 않아도 된다. 적어 두면 홈의 칭찬받기·사랑받기가 그 유형이 위로받고 싶어 하는 방향으로 말한다 (서버 mbti_comfort_guides)
 */
export default function ProfileSheet({ open, profile, onClose, onSaved }: { open: boolean; profile: MyProfile; onClose: () => void; onSaved: (p: MyProfile) => void }) {
  const [nick, setNick] = useState(profile.nick);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState(profile.avatarUrl ?? "");
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
  const [titleBadge, setTitleBadge] = useState(profile.titleBadge ?? "");
  const [mbti, setMbti] = useState<string[]>(() => mbtiLetters(profile.mbti));
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [editingPhoto, setEditingPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const pickerRef = useRef<HTMLInputElement>(null);
  const uploadController = useRef<AbortController | null>(null);
  const uploadedPhoto = useRef<{ file: File; url: string } | null>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; uploadController.current?.abort(); };
  }, []);
  const digits = phone.replace(/\D/g, "");
  const phoneOk = digits.length === 0 || (digits.length >= 10 && digits.length <= 11);
  const canMbti = profile.mbti !== undefined; // 옛 서버는 MBTI 를 모른다: 칸을 숨기고 보내지 않는다
  const mbtiPicked = mbti.filter(Boolean).length;
  const mbtiOk = mbtiPicked === 0 || mbtiPicked === MBTI_AXES.length;

  const pickFile = (file: File | undefined) => {
    if (!file || savingRef.current) return;
    setError(null);
    setEditingPhoto(file);
  };

  const save = async () => {
    if (savingRef.current || editingPhoto || !phoneOk || !mbtiOk || nick.trim().length < 2) return;
    savingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      let avatarUrl = avatar;
      if (photo) {
        if (uploadedPhoto.current?.file === photo) avatarUrl = uploadedPhoto.current.url;
        else {
          const controller = new AbortController();
          uploadController.current = controller;
          setUploading(0);
          const result = await uploadImage(photo, { onProgress: setUploading, signal: controller.signal });
          avatarUrl = result.url;
          uploadedPhoto.current = { file: photo, url: result.url };
          setUploading(null);
        }
      }
      const saved = await updateMyProfile({ nick: nick.trim(), bio, avatarUrl: avatarUrl || null, name, phone: digits, titleBadge, ...(canMbti ? { mbti: mbti.join("") } : {}) });
      if (mountedRef.current) onSaved(saved);
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error && e.name === "AbortError" ? "사진 전송을 취소했어요. 편집한 사진은 그대로 있어요." : e instanceof Error ? e.message : "저장하지 못했어요. 작성한 내용은 그대로 있어요.");
    } finally {
      uploadController.current = null;
      savingRef.current = false;
      if (mountedRef.current) { setUploading(null); setBusy(false); }
    }
  };

  return (
    <>
    <div inert={Boolean(editingPhoto)} aria-hidden={Boolean(editingPhoto)}>
    <Sheet open={open} onClose={() => { if (!savingRef.current && !editingPhoto) onClose(); }} title="프로필 수정">
      <div className="stack" aria-busy={busy || uploading !== null}>
        <section className={photoStyles.profilePhoto} aria-label="프로필 사진">
          <div className={photoStyles.profilePhotoPreview}>
            {photoPreview || avatar ? <img src={photoPreview || avatar} alt="프로필 사진 미리보기" /> : nick.slice(0, 1)}
          </div>
          <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} aria-label="프로필 사진 선택" onChange={(event) => { pickFile(event.target.files?.[0]); event.target.value = ""; }} />
          <div className={photoStyles.profilePhotoActions}>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => pickerRef.current?.click()}>사진 선택</button>
            {photo && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setEditingPhoto(photo)}>다시 편집</button>}
            {(photo || avatar) && <button type="button" className="text-btn muted" disabled={busy} onClick={() => { setPhoto(null); setAvatar(""); uploadedPhoto.current = null; }}>사진 삭제</button>}
          </div>
          <p className={photoStyles.profilePhotoNote}>{photo ? "저장을 누르면 새 사진이 적용돼요." : "사진·닉네임·소개는 다른 사람에게 보여요."}</p>
          {uploading !== null && <><progress className={photoStyles.progress} value={uploading} max={100} aria-label="프로필 사진 전송 진행률" /><p className={photoStyles.profilePhotoNote} role="status">사진을 보내고 있어요 · {uploading}%</p><button type="button" className="text-btn" onClick={() => uploadController.current?.abort()}>전송 취소</button></>}
        </section>
        <div className="field"><label htmlFor="profile-nick">닉네임</label><input id="profile-nick" value={nick} disabled={busy} onChange={(e) => setNick(e.target.value)} maxLength={12} placeholder="2~12자" autoComplete="nickname" /></div>
        <div className="field">
          <label htmlFor="profile-bio">소개</label>
          <textarea id="profile-bio" value={bio} disabled={busy} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="나를 소개하는 짧은 한마디" style={{ minHeight: 80 }} />
          <span className="tiny muted" style={{ textAlign: "right" }}>{bio.length}/160</span>
        </div>
        <div className="field">
          <span className={profileStyles.fieldLabel} id="profile-title-label">칭호</span>
          {profile.badges.length === 0 ? (
            <span className="tiny muted">위로 배지를 얻으면 닉네임 옆에 칭호로 달 수 있어요.</span>
          ) : (
            <div className="chips wrap" role="radiogroup" aria-labelledby="profile-title-label">
              <button type="button" role="radio" aria-checked={titleBadge === ""} className={`chip ${titleBadge === "" ? "on" : ""}`} disabled={busy} onClick={() => setTitleBadge("")}>칭호 없음</button>
              {profile.badges.map((b) => (
                <button key={b.id} type="button" role="radio" aria-checked={titleBadge === b.id} className={`chip ${titleBadge === b.id ? "on" : ""}`} disabled={busy} onClick={() => setTitleBadge(b.id)}>
                  <span className={profileStyles.chipIco}><BadgeIcon id={b.id} /></span>{b.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="field"><label htmlFor="profile-name">이름 (나만 보기)</label><input id="profile-name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름" autoComplete="name" /></div>
        <div className="field">
          <label htmlFor="profile-phone">전화번호 (나만 보기)</label>
          <input id="profile-phone" value={phone} disabled={busy} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" inputMode="tel" autoComplete="tel" />
          {!phoneOk && <span className="form-error">숫자 10~11자리로 입력해요.</span>}
        </div>
        {canMbti && <div className="field">
          <span className={profileStyles.fieldLabel} id="profile-mbti-label">MBTI (나만 보기 · 선택)</span>
          <div className={profileStyles.mbti} role="group" aria-labelledby="profile-mbti-label">
            {MBTI_AXES.map((axis, i) => (
              <div key={axis[0]} className={profileStyles.mbtiPair} role="radiogroup" aria-label={`${axis[0]} 또는 ${axis[1]}`}>
                {axis.map((letter) => (
                  <button key={letter} type="button" role="radio" aria-checked={mbti[i] === letter} className={`chip ${mbti[i] === letter ? "on" : ""}`} disabled={busy}
                    onClick={() => setMbti((current) => current.map((value, at) => (at !== i ? value : value === letter ? "" : letter)))}>{letter}</button>
                ))}
              </div>
            ))}
            {mbtiPicked > 0 && <button type="button" className="text-btn muted" disabled={busy} onClick={() => setMbti(MBTI_AXES.map(() => ""))}>지우기</button>}
          </div>
          {mbtiOk ? <span className="tiny muted">적어 두면 칭찬받기·사랑받기가 내가 위로받고 싶은 방향으로 말해 줘요. 다른 사람에게는 보이지 않아요.</span>
            : <span className="form-error">네 자리를 모두 고르거나, 모두 비워 주세요.</span>}
        </div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className="sheet-actions">
        <button type="button" className="btn ghost" disabled={busy || uploading !== null} onClick={onClose}>취소</button>
        <button type="button" className="btn" disabled={!phoneOk || !mbtiOk || busy || uploading !== null || nick.trim().length < 2} onClick={save}>{uploading !== null ? `사진 전송 중 ${uploading}%` : busy ? "저장 중…" : "저장"}</button>
      </div>
    </Sheet>
    </div>
    {editingPhoto && <PhotoEditor file={editingPhoto} aspectRatio={1} allowAspectChange={false} onClose={() => setEditingPhoto(null)} onSave={(edited) => { setPhoto(edited); uploadedPhoto.current = null; setEditingPhoto(null); }} />}
    </>
  );
}
