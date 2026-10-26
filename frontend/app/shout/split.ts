/**
 * 외침 글에는 제목이 따로 없어서, 블라인드 목록처럼 보이도록 첫 문장(또는 첫 줄)을 제목으로, 나머지를 본문 미리보기로 나눈다.
 * 첫 문장이 너무 짧으면(4자 미만) 다음 문장까지 붙인다. 화면에서는 제목 2줄, 미리보기 2줄로 자른다.
 */
export function splitShout(text: string): { title: string; rest: string } {
  const t = text.trim();
  if (!t) return { title: "", rest: "" };
  const nl = t.indexOf("\n");
  const firstLine = nl >= 0 ? t.slice(0, nl) : t;
  const m = firstLine.match(/^.{4,}?[.?!…~]+(?=\s|$)/);
  const title = (m ? m[0] : firstLine).trim();
  const rest = t.slice(t.indexOf(title) + title.length).trim();
  return { title, rest };
}
