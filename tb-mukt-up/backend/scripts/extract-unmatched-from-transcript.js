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
  const hits = [];

  for await (const line of rl) {
    i += 1;
    if (!line.includes('"role":"user"')) continue;
    let text = '';
    try {
      const j = JSON.parse(line);
      text = (j.message?.content || []).map((c) => c.text || '').join('\n');
    } catch {
      continue;
    }
    const low = text.toLowerCase();
    const interesting =
      low.includes('unmatched') ||
      low.includes('excel banke') ||
      low.includes('not matched') ||
      low.includes('line list') ||
      text.includes('Award') ||
      text.includes('PanchayatName') ||
      text.includes('panchayat') ||
      /"sno"\s*:/i.test(text) ||
      /"S\.?No/i.test(text);

    if (!interesting) continue;

    const preview = text.slice(0, 400).replace(/\n/g, ' ');
    hits.push({
      line: i,
      len: text.length,
      preview,
      hasArray: text.includes('[{') || text.includes('[\n'),
    });

    // Save large payloads that look like JSON lists
    if (text.length > 2000 && (text.includes('[') || text.includes('{'))) {
      const fname = path.join(outDir, `user-msg-${i}.txt`);
      fs.writeFileSync(fname, text, 'utf8');
      console.log('saved', fname, 'len', text.length);
    }
  }

  console.log('total lines', i);
  console.log(JSON.stringify(hits, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
