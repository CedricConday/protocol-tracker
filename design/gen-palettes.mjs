import { writeFileSync } from 'node:fs';

const PALETTES = [
  {
    file: 'Main', artist: 'Raoul Dufy', cond: 'Rheumatoid arthritis · treated with cortisone, 1950',
    note: 'Cobalt and coral on a cool ivory ground — the blue-forward direction.',
    paper:'#F7F7F2', surface:'#ECEDE6', border:'#DBDDD3', ink:'#14213D', sub:'#5A6478', muted:'#9AA3B2',
    primary:'#1B58B8', primaryDk:'#12408C', wash:'#E7EEFB', washBorder:'#CBDBF5',
    due:'#F2603C', water:'#2AA6B8', taken:'#2F8F5B', onPrimary:'#F7F7F2',
  },
  {
    file: 'Klee', artist: 'Paul Klee', cond: 'Scleroderma · from 1935, line thickened as hands stiffened',
    note: 'Oxide red and chalk blue over a grey-brown ground, black bar-line.',
    paper:'#EDE8DE', surface:'#E2DACB', border:'#CFC5B2', ink:'#17140F', sub:'#5C5346', muted:'#948977',
    primary:'#A33B26', primaryDk:'#7E2B1A', wash:'#E8DCCF', washBorder:'#D2C0A9',
    due:'#A33B26', water:'#5E7C97', taken:'#6B7A3F', onPrimary:'#EDE8DE',
  },
  {
    file: 'Renoir', artist: 'Pierre-Auguste Renoir', cond: 'Rheumatoid arthritis · painted with brushes strapped to his hand',
    note: 'Rose and cream — warm, but the closest of the three to where you already are.',
    paper:'#FBF6F0', surface:'#F5EBE1', border:'#E5D5C6', ink:'#3A2A24', sub:'#7D6355', muted:'#B39C8C',
    primary:'#C25B62', primaryDk:'#9E434A', wash:'#F8E7E4', washBorder:'#EED2CE',
    due:'#C25B62', water:'#7C9BB5', taken:'#7A8F5C', onPrimary:'#FBF6F0',
  },
  {
    file: 'Current', artist: 'Current build', cond: 'The palette shipping today — shown as the control',
    note: 'Terracotta on warm paper. This is the one that reads as Anthropic.',
    paper:'#FAF7F4', surface:'#F2EDE8', border:'#E8E0D8', ink:'#2C2420', sub:'#7A6A62', muted:'#B0A098',
    primary:'#C96A50', primaryDk:'#A8503A', wash:'#FBF0ED', washBorder:'#F0DCD5',
    due:'#C96A50', water:'#4A7A9B', taken:'#5A8A5A', onPrimary:'#FAF7F4',
  },
];

const swatch = (p) => ['primary','due','water','taken','ink','surface','border','paper']
  .map((k) => `<div style="display: flex; flex-direction: column; gap: 5px;">
          <div style="height: 34px; border-radius: 8px; background: ${p[k]}; border: 1px solid ${p.border};"></div>
          <span style="font-size: 9px; letter-spacing: 0.4px; color: ${p.muted};">${p[k].toUpperCase()}</span>
        </div>`).join('\n        ');

const tabIcon = (p, active, path) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${active ? p.primary : p.muted}" stroke-width="1.8" stroke-linecap="round">${path}</svg>`;

const CLOCK = '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3.4 2"></path>';
const CAL = '<rect x="3.5" y="4.5" width="17" height="16" rx="3"></rect><path d="M3.5 9.5h17M8.5 3v3M15.5 3v3"></path>';
const GEAR = '<circle cx="12" cy="12" r="3.2"></circle><circle cx="12" cy="12" r="8.4"></circle><path d="M12 3.6v2M12 18.4v2M3.6 12h2M18.4 12h2"></path>';

const page = (p) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: 'Hanken Grotesk', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${p.primary}; text-decoration: none; } a:hover { color: ${p.primaryDk}; }
    * { box-sizing: border-box; }
  </style>
</helmet>

<div style="width: 430px; height: 1020px; background: ${p.paper}; display: flex; flex-direction: column; gap: 16px; padding: 20px; color: ${p.ink};">

  <div style="display: flex; flex-direction: column; gap: 3px;">
    <h2 style="margin: 0; font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 21px; font-weight: 700; letter-spacing: -0.4px; color: ${p.ink};">${p.artist}</h2>
    <span style="font-size: 12px; color: ${p.sub};">${p.cond}</span>
    <span style="font-size: 12px; color: ${p.muted};">${p.note}</span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 5px;">
        ${swatch(p)}
  </div>

  <div style="width: 390px; height: 844px; align-self: center; background: ${p.paper}; border: 1px solid ${p.border}; border-radius: 26px; overflow: hidden; display: flex; flex-direction: column;">

    <div style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 16px; padding: 40px 18px 10px;">

      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <h1 style="margin: 0; font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; color: ${p.ink};">Today</h1>
          <span style="font-size: 13px; color: ${p.sub};">Thursday, 10 September</span>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px; background: ${p.wash}; border: 1px solid ${p.washBorder}; border-radius: 12px; padding: 8px 12px;">
          <span style="font-size: 10px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; color: ${p.sub};">T=0 anchor</span>
          <span style="font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 17px; font-weight: 700; letter-spacing: -0.3px; color: ${p.primary};">07:40</span>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 9px; background: ${p.surface}; border: 1px solid ${p.border}; border-radius: 14px; padding: 15px 16px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between;">
          <span style="font-size: 15px; font-weight: 700;">2 of 5 doses</span>
          <span style="font-size: 13px; color: ${p.sub};">next in 42 min</span>
        </div>
        <div style="height: 8px; border-radius: 4px; background: ${p.border}; overflow: hidden;">
          <div style="width: 40%; height: 100%; border-radius: 4px; background: ${p.primary};"></div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: ${p.sub};">Doses</span>
        <sc-for list="{{doses}}" as="dose" hint-placeholder-count="4">
          <div style="position: relative; display: flex; align-items: center; border-radius: 12px; padding: 15px 14px; overflow: hidden; background: {{dose.bg}};">
            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 3px; border-radius: 3px; background: {{dose.accent}};"></div>
            <div style="width: 62px; display: flex; flex-direction: column; align-items: center; padding-left: 8px;">
              <span style="font-size: 14px; font-weight: 600; color: {{dose.timeColor}};">{{dose.time}}</span>
              <span style="font-size: 11px; margin-top: 1px; color: {{dose.timeColor}};">{{dose.ampm}}</span>
            </div>
            <div style="width: 1px; height: 34px; background: ${p.border}; margin: 0 12px;"></div>
            <div style="flex-grow: 1; display: flex; flex-direction: column; gap: 2px;">
              <span style="font-size: 15px; font-weight: 600; color: ${p.ink};">{{dose.name}}</span>
              <span style="font-size: 13px; color: ${p.sub};">{{dose.meta}}</span>
            </div>
            <span style="font-size: 12px; font-weight: 700; letter-spacing: 0.6px; color: {{dose.accent}};">{{dose.mark}}</span>
          </div>
        </sc-for>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; background: ${p.surface}; border: 1px solid ${p.border}; border-radius: 14px; padding: 15px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${p.water}" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.2s6.2 6.4 6.2 10.4a6.2 6.2 0 0 1-12.4 0C5.8 9.6 12 3.2 12 3.2z"></path></svg>
            <span style="font-size: 14px; font-weight: 600; color: ${p.sub};">Water</span>
          </div>
          <span style="font-size: 16px; font-weight: 700;">1.5L <span style="font-size: 14px; font-weight: 400; color: ${p.muted};">/ 2.5L</span></span>
        </div>
        <div style="display: flex; gap: 4px;">
          <div style="flex-grow: 1; height: 10px; border-radius: 5px; background: ${p.water};"></div>
          <div style="flex-grow: 1; height: 10px; border-radius: 5px; background: ${p.water};"></div>
          <div style="flex-grow: 1; height: 10px; border-radius: 5px; background: ${p.water};"></div>
          <div style="flex-grow: 1; height: 10px; border-radius: 5px; background: ${p.border};"></div>
          <div style="flex-grow: 1; height: 10px; border-radius: 5px; background: ${p.border};"></div>
        </div>
        <div style="display: flex; align-items: center; gap: 9px;">
          <button style="width: 46px; height: 46px; flex-shrink: 0; border: 1px solid ${p.border}; border-radius: 12px; background: ${p.paper}; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${p.sub}" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"></path></svg>
          </button>
          <div style="flex-grow: 1; height: 46px; display: flex; align-items: center; justify-content: center; gap: 4px; border: 1px solid ${p.border}; border-radius: 12px; background: ${p.paper};">
            <input value="250" style="width: 56px; border: none; background: transparent; text-align: right; font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 19px; font-weight: 700; color: ${p.ink};">
            <span style="font-size: 14px; font-weight: 600; color: ${p.muted};">ml</span>
          </div>
          <button style="width: 46px; height: 46px; flex-shrink: 0; border: 1px solid ${p.border}; border-radius: 12px; background: ${p.paper}; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${p.sub}" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>
          </button>
        </div>
        <button style="height: 48px; border: none; border-radius: 12px; background: ${p.water}; color: ${p.onPrimary}; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer;">Log 250 ml</button>
      </div>

    </div>

    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid ${p.border}; background: ${p.paper}; padding: 8px 0 18px;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 0;">
        ${tabIcon(p, true, CLOCK)}
        <span style="font-size: 11px; font-weight: 700; color: ${p.primary};">Today</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 0;">
        ${tabIcon(p, false, CAL)}
        <span style="font-size: 11px; font-weight: 600; color: ${p.muted};">History</span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 8px 0;">
        ${tabIcon(p, false, GEAR)}
        <span style="font-size: 11px; font-weight: 600; color: ${p.muted};">Settings</span>
      </div>
    </div>

  </div>

</div>
</x-dc>
<script data-dc-script data-props='{}'>
class Component extends DCLogic {
  renderVals() {
    return {
      doses: [
        { time: '7:40',  ampm: 'AM', name: 'Vitamin D3',        meta: '60,000 IU · capsule', bg: '${p.surface}', accent: '${p.taken}', timeColor: '${p.muted}', mark: 'TAKEN' },
        { time: '8:10',  ampm: 'AM', name: 'Vitamin K2 (MK7)',  meta: '400 mcg · with food', bg: '${p.surface}', accent: '${p.taken}', timeColor: '${p.muted}', mark: 'TAKEN' },
        { time: '12:40', ampm: 'PM', name: 'Magnesium citrate', meta: '400 mg · capsule',    bg: '${p.wash}',    accent: '${p.due}',   timeColor: '${p.due}',   mark: 'NOW' },
        { time: '4:40',  ampm: 'PM', name: 'Riboflavin B2',     meta: '400 mg · tablet',     bg: '${p.surface}', accent: '${p.water}', timeColor: '${p.sub}',   mark: '' },
      ],
    };
  }
}
</script>
</body>
</html>
`;

const boards = [];
PALETTES.forEach((p, i) => {
  writeFileSync(`palettes/${p.file}.dc.html`, page(p));
  boards.push({ file: `${p.file}.dc.html`, title: p.artist, x: i * 510, y: 0, w: 430, h: 1020 });
});
writeFileSync('palettes/canvas.json', JSON.stringify({
  artboards: boards,
  annotations: [{ id: 'why', x: 0, y: -150, w: 470, text: 'Same screen, four palettes. Dufy and Renoir both had rheumatoid arthritis; Klee had scleroderma. The last board is the palette shipping today, for comparison.' }],
  launch: { view: 'canvas' },
}, null, 2));
console.log('wrote', boards.length, 'artboards');
