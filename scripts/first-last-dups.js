#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'v1', 'raw', 'bus-routes.datamall.json');
if (!fs.existsSync(dataPath)) {
  console.error('data file not found:', dataPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const map = new Map();
for (const r of data) {
  const key = `${r.ServiceNo}||${r.BusStopCode}`;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(r);
}
const dups = Array.from(map.entries()).filter(([, arr]) => arr.length > 1);
const counts = dups.map(([, arr]) => arr.length).sort((a, b) => b - a);
const hist = counts.reduce((h, n) => { h[n] = (h[n] || 0) + 1; return h; }, {});

const pad = (value, width, align = 'left') => {
  const text = String(value);
  if (align === 'right') return text.padStart(width);
  return text.padEnd(width);
};

console.log('Duplicate routes summary');
console.log('------------------------');
console.log(`duplicate groups   : ${dups.length}`);
console.log(`max duplicate size: ${counts[0] || 0}`);
console.log('size histogram    :');
const rows = Object.keys(hist)
  .map((size) => ({ Size: Number(size), Count: hist[size] }))
  .sort((a, b) => a.Size - b.Size);
const maxCount = Math.max(...rows.map((row) => row.Count));
for (const row of rows) {
  const bar = '█'.repeat(Math.max(1, Math.round((row.Count / maxCount) * 20)));
  console.log(`  ${pad(row.Size, 3, 'right')} │ ${pad(row.Count, 4, 'right')} ${bar}`);
}

const sorted = dups.sort((a, b) => b[1].length - a[1].length).slice(0, 20);
console.log('\nTop 20 duplicate groups');
console.log('----------------------');
for (const [index, [key, arr]] of sorted.entries()) {
  const [service, stop] = key.split('||');
  console.log(`\n${pad(`${index + 1}.`, 4)} ${pad(service, 5)} @ ${stop} (${arr.length} rows)`);
  const table = arr.map((r) => ({
    D: r.Direction,
    Seq: r.StopSequence,
    'WD first': r.WD_FirstBus || '',
    'WD last': r.WD_LastBus || '',
    'SAT first': r.SAT_FirstBus || '',
    'SAT last': r.SAT_LastBus || '',
    'SUN first': r.SUN_FirstBus || '',
    'SUN last': r.SUN_LastBus || '',
  }));
  console.table(table);
}
