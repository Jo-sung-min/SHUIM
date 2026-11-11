import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const entries = JSON.parse(await readFile(new URL('../lib/curation-nov11.json', import.meta.url), 'utf8'));
assert.equal(entries.length, 10);
assert.equal(new Set(entries.map(e => e.id)).size, 10);
assert.equal(new Set(entries.map(e => e.image)).size, 10);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const rows = entries.map((e, index) => {
  assert.equal(e.id, `curation-${index + 11}`);
  assert.ok(e.image.startsWith('https://images.metmuseum.org/CRDImages/'));
  assert.ok(['serif', 'song'].includes(e.font));
  assert.ok(e.quote.length < 120);
  const text = `${e.art} (${e.date})\n메트로폴리탄 미술관 · Open Access\n문장: ${e.author}, ${e.work} · 소로우 옮김\nhttps://www.metmuseum.org/art/collection/search/${e.metId}`;
  assert.ok(text.length <= 280);
  const overlays = [
    {text:e.quote,x:0.5,y:e.y,size:e.size,color:e.color,font:e.font,align:'center',style:'plain'},
    {text:`— ${e.author}`,x:0.5,y:e.y + (e.quote.split('\n').length * e.size * 1.42 * 0.5625 / 2) + 0.03,size:0.03,color:e.color,font:e.font,align:'center',style:'plain'},
  ];
  const pages = [{image:e.image,title:e.title,text,ratio:0.5625,overlays}];
  return `  (${quote(e.id)}, 'sorow-curator', ${quote(e.title)}, ${quote(text)}, 0, ${quote(e.image)}, ARRAY[${quote(e.image)}], ${quote(JSON.stringify(pages))}::jsonb, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '${index} seconds')`;
});
const sql = `-- Add ten curated posts; never modifies existing posts or account credentials.
-- Sources and Korean translations: frontend/lib/curation-nov11.json.
-- Artwork: Met Open Access, isPublicDomain=true checked 2026-11-11.
-- Fonts: Gowun Batang / Song Myung, SIL OFL 1.1. All overlays use plain (transparent) backgrounds.
-- Original museum image URLs remain absolute, so no CDN deployment is required.
-- Flyway applies this once, transactionally. Stable IDs also protect against duplicate seed data.

INSERT INTO users (id, nick, role, is_anonymous, created_at)
VALUES ('sorow-curator', '소로우', 'user', FALSE, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
ON CONFLICT (id) DO NOTHING;
INSERT INTO creators (user_id, bio)
VALUES ('sorow-curator', '매일 한 장, 오늘의 하늘과 공간')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO feed_posts (id, author_id, title, text, bg, image, images, pages, created_at) VALUES
${rows.join(',\n')}
ON CONFLICT (id) DO NOTHING;
`;
const destination = new URL('../../backend/src/main/resources/db/migration/V37__curated_feed_more.sql', import.meta.url);
if (process.argv.includes('--check')) {
  assert.equal(await readFile(destination, 'utf8'), sql, 'Migration does not match the preview data');
  console.log('10 unique posts validated; SQL and preview match. No DB connection made.');
} else {
  await writeFile(destination, sql);
  console.log('Generated V37__curated_feed_more.sql. No DB connection made.');
}
