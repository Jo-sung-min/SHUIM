/**
 * 위로글 형광펜 강조.
 * - 작성자가 ==이렇게== 감싼 부분을 강조한다 (작성 화면의 "형광펜" 버튼이 넣어 준다)
 * - 표시가 하나도 없고 글이 두 줄 이상이면, 위로를 건네는 마지막 줄을 자동으로 강조한다
 * - 목록·알림처럼 평문이 필요한 곳은 stripHighlights 로 표시를 뗀다
 */
export interface HighlightSegment { text: string; mark: boolean }

const MARK = /==([^=\n](?:[^=]|=(?!=))*?)==/g;

export function hasHighlights(text: string): boolean {
  MARK.lastIndex = 0;
  return MARK.test(text);
}

export function stripHighlights(text: string): string {
  return text.replace(MARK, "$1");
}

/** 강조 구간과 평문 구간으로 나눈다 (순서대로) */
export function segmentHighlights(text: string): HighlightSegment[] {
  const out: HighlightSegment[] = [];
  if (hasHighlights(text)) {
    let last = 0;
    MARK.lastIndex = 0;
    for (let m = MARK.exec(text); m; m = MARK.exec(text)) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), mark: false });
      out.push({ text: m[1], mark: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), mark: false });
    return out;
  }
  // 자동: 두 줄 이상이면 마지막 줄(위로를 건네는 줄)
  const lines = text.split("\n");
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.trim());
  if (nonEmpty.length < 2) return [{ text, mark: false }];
  const lastIdx = nonEmpty[nonEmpty.length - 1].i;
  const before = lines.slice(0, lastIdx).join("\n") + "\n";
  const lastLine = lines[lastIdx];
  const lead = lastLine.match(/^\s*/)?.[0] ?? "";
  const trail = lastLine.match(/\s*$/)?.[0] ?? "";
  const core = lastLine.slice(lead.length, lastLine.length - trail.length);
  const after = trail + (lastIdx < lines.length - 1 ? "\n" + lines.slice(lastIdx + 1).join("\n") : "");
  const segs: HighlightSegment[] = [{ text: before + lead, mark: false }, { text: core, mark: true }];
  if (after) segs.push({ text: after, mark: false });
  return segs;
}
