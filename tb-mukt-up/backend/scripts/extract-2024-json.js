const fs = require('fs');
const path = require('path');
const readline = require('readline');

const transcript = path.join(
  process.env.USERPROFILE || '',
  '.cursor/projects/c-Users-Lakshya-Documents-GitHub-tb-mukt-gram-panchyat/agent-transcripts/6d596209-04b2-4014-8c0a-e879ec4ba7ac/6d596209-04b2-4014-8c0a-e879ec4ba7ac.jsonl'
);
const outDir = path.join(__dirname, '..', '..', 'exports');
fs.mkdirSync(outDir, { recursive: true });

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(transcript),
    crlfDelay: Infinity,
  });
  let i = 0;
  let last = null;
  for await (const line of rl) {
    i += 1;
    if (!line.includes('"role":"user"')) continue;
    try {
      const j = JSON.parse(line);
      const text = (j.message?.content || []).map((c) => c.text || '').join('\n');
      if (text.includes('2024 ki excel') || text.includes('lineListSNo') && text.includes('Madra')) {
        last = { line: i, len: text.length };
        fs.writeFileSync(path.join(outDir, 'user-msg-2024-raw.txt'), text, 'utf8');
      }
    } catch {}
  }
  console.log('last', last);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
