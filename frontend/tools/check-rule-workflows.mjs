// Browser checks for rule creation, editing, AI review, execution, filtering and saving.
// No external packages, live services or database writes are used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp, access } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dist = path.join(root, 'frontend/dist/data-controls/browser');
const edge =
  process.env.BROWSER_TEST_EXECUTABLE ??
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await access(path.join(dist, 'index.html'));
await access(edge);
const artifacts = await mkdtemp(path.join(os.tmpdir(), 'data-controls-workflows-'));
const catalog = JSON.parse(
  await readFile(path.join(root, 'backend/DataControls.Api/Metadata/metadata.json'), 'utf8'),
);
const metadata = {
  version: catalog.version,
  entities: catalog.entities.map((e) => ({
    id: e.id,
    label: e.label,
    fields: e.fields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
  })),
  relationships: catalog.relationships.map((r) => ({
    id: r.id,
    label: r.label,
    fromEntity: r.fromEntity,
    toEntity: r.toEntity,
    cardinality: r.cardinality,
  })),
};
const definition = {
  name: 'בדיקת שכר',
  description: 'בקרת דוגמה',
  rootEntityId: 'employee',
  condition: {
    kind: 'comparison',
    left: { fieldId: 'salary' },
    operator: 'greaterThan',
    right: { kind: 'constant', value: 15000 },
  },
};
let saved = { id: 1, definition, definitionVersion: 1, createdAtUtc: '', updatedAtUtc: '' };
let aiDelay = 0;
let writes = 0;
let validationRequests = 0;
const executionRequests = [];
const saveRequests = [];
const createdRules = [];
let rejectNextSave = false;
const resultColumns = [
  { id: 'firstName', label: 'שם פרטי', type: 'text' },
  { id: 'salary', label: 'שכר', type: 'number' },
  { id: 'age', label: 'גיל', type: 'number' },
  { id: 'isActive', label: 'עובד פעיל', type: 'boolean' },
  { id: 'startDate', label: 'תחילת העסקה', type: 'date' },
  { id: 'employeeDepartment.name', label: 'שם מחלקה', type: 'text' },
];
const resultRecords = [
  {
    id: 101,
    values: {
      firstName: 'דנה',
      salary: 20000,
      age: 26,
      isActive: true,
      startDate: '2026-01-01',
      'employeeDepartment.name': 'תפעול',
    },
    failureReason: 'השכר 20,000 גבוה מ־15,000.',
  },
  {
    id: 102,
    values: {
      firstName: 'מיה',
      salary: 25000,
      age: 33,
      isActive: false,
      startDate: '2026-02-01',
      'employeeDepartment.name': 'כספים',
    },
    failureReason: 'השכר 25,000 גבוה מ־15,000.',
  },
];
function matchesFilter(condition, values) {
  if (!condition) return true;
  if (condition.kind === 'group')
    return condition.operator === 'and'
      ? condition.children.every((child) => matchesFilter(child, values))
      : condition.children.some((child) => matchesFilter(child, values));
  const value =
    values[[...(condition.left.relationshipPath ?? []), condition.left.fieldId].join('.')];
  if (condition.operator === 'isNull') return value === null || value === undefined;
  if (condition.operator === 'isNotNull') return value !== null && value !== undefined;
  if (condition.operator === 'greaterThan') return value > condition.right.value;
  if (condition.operator === 'equals') return value === condition.right.value;
  throw new Error('Unsupported test filter: ' + condition.operator);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (url.pathname === '/api/metadata') return res.end(JSON.stringify(metadata));
      if (
        (url.pathname === '/api/rules' && req.method === 'POST') ||
        (url.pathname === '/api/rules/1' && req.method === 'PUT')
      ) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        saveRequests.push({
          method: req.method,
          definition: body,
          createdWithAi: url.searchParams.get('createdWithAi') === 'true',
        });
        if (rejectNextSave) {
          rejectNextSave = false;
          res.statusCode = 500;
          return res.end('{}');
        }
        if (req.method === 'PUT') {
          saved = { ...saved, definition: body };
          return res.end(JSON.stringify(saved));
        }
        const created = {
          ...saved,
          id: 8 + createdRules.length,
          definition: body,
          createdWithAi: url.searchParams.get('createdWithAi') === 'true',
        };
        createdRules.push(created);
        return res.end(JSON.stringify(created));
      }
      if (url.pathname === '/api/rules' && req.method === 'GET') {
        return res.end(
          JSON.stringify({
            items: [
              { ...saved, ...saved.definition, createdWithAi: false },
              { ...saved, ...definition, id: 7, name: 'בקרת שכר בעזרת AI', createdWithAi: true },
              ...createdRules.map((rule) => ({ ...rule, ...rule.definition })),
            ],
            totalCount: 2 + createdRules.length,
            page: 1,
            pageSize: 20,
          }),
        );
      }
      if (url.pathname === '/api/rules/1') return res.end(JSON.stringify(saved));
      if (url.pathname === '/api/rules/validate') {
        validationRequests++;
        return res.end(JSON.stringify({ isValid: true, errors: [] }));
      }
      if (url.pathname === '/api/rules/execute') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        executionRequests.push(body);
        const records = resultRecords.filter(
          (record) =>
            (!body.options?.search ||
              [record.values.firstName, record.values['employeeDepartment.name']].some((value) =>
                value.includes(body.options.search),
              )) &&
            matchesFilter(body.options?.filter, record.values),
        );
        return res.end(
          JSON.stringify({
            totalCount: records.length,
            evaluatedCount: 30,
            returnedCount: records.length,
            truncated: false,
            columns: resultColumns,
            records: records.map((record) => ({
              ...record,
              explanation: {
                path: 'condition',
                kind: 'comparison',
                operator: 'greaterThan',
                message: record.failureReason,
                left: null,
                right: null,
                children: [],
              },
            })),
          }),
        );
      }
      if (url.pathname === '/api/ai/proposals/examples') {
        return res.end(
          JSON.stringify(['Example A', 'Example B', 'Example C', 'Example D', 'Example E']),
        );
      }
      if (url.pathname === '/api/ai/proposals') {
        setTimeout(() => {
          if (!res.destroyed) res.end(JSON.stringify(definition));
        }, aiDelay);
        return;
      }
      writes++;
      res.writeHead(500);
      return res.end('{}');
    }
    const candidate = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    assert.ok(candidate.startsWith(dist + path.sep) || candidate === dist);
    let filename = candidate;
    try {
      await access(filename);
      if (!path.extname(filename)) filename = path.join(dist, 'index.html');
    } catch {
      filename = path.join(dist, 'index.html');
    }
    const type =
      { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[
        path.extname(filename)
      ] ?? 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.end(await readFile(filename));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const probe = net.createServer();
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
const debugPort = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const browser = spawn(
  edge,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(artifacts, 'profile')}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let socket;
const pending = new Map();
let nextId = 0;
const errors = [];
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
  return response.result.value;
}
async function waitFor(selector) {
  await evaluate(
    `new Promise((resolve,reject)=>{let tries=0;const check=()=>{if(document.querySelector(${JSON.stringify(selector)}))resolve(true);else if(++tries>100)reject('Missing selector: '+${JSON.stringify(selector)});else setTimeout(check,50)};check()})`,
  );
}
async function click(selector) {
  await waitFor(selector);
  const position = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'left',
    clickCount: 1,
    ...position,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'left',
    clickCount: 1,
    ...position,
  });
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const filename = path.join(artifacts, name + '.png');
  await writeFile(filename, Buffer.from(result.data, 'base64'));
  return filename;
}

try {
  let page;
  for (let i = 0; i < 100; i++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(
        (p) => p.type === 'page',
      );
      if (page) break;
    } catch {
      /* Browser is still starting. */
    }
    if (browser.exitCode !== null) throw new Error('Browser exited before CDP became available.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Browser became ready');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (message) => {
    const response = JSON.parse(message.data);
    if (response.method === 'Runtime.exceptionThrown')
      errors.push(response.params.exceptionDetails);
    const entry = pending.get(response.id);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(response.id);
      response.error
        ? entry.reject(new Error(JSON.stringify(response.error)))
        : entry.resolve(response.result);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: base + '/rules' });
  await waitFor('.rule-mark');
  assert.equal(
    await evaluate(`getComputedStyle(document.querySelector('.app-brand')).color`),
    'rgb(232, 244, 237)',
    'Brand uses readable light text on the dark rail',
  );
  assert.deepEqual(
    await evaluate(`Array.from(document.querySelectorAll('.rule-mark'), e=>e.textContent.trim())`),
    ['1', '2'],
    'Sequential numbering despite ID gaps',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.ai-origin').length`),
    1,
    'Only AI-created rule is badged',
  );
  await screenshot('numbered-rules');
  await click('.manual-create');
  await waitFor('main.editor-page input[name="name"]');
  assert.equal(await evaluate('location.pathname'), '/rules/new');
  assert.equal(await evaluate('!!document.querySelector("dialog")'), false);
  await screenshot('manual-creation-page');
  await click('app-rule-editor header button');
  assert.equal(
    await evaluate('!!document.querySelector("dialog[open]")'),
    false,
    'Empty editor closes',
  );
  await click('.manual-create');
  await waitFor('main.editor-page input[name="name"]');
  await evaluate(
    `(()=>{const e=document.querySelector('input[name="name"]');e.value='Modified';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('app-rule-editor header button');
  assert.equal(
    await evaluate(
      `document.activeElement===document.querySelector('.close-confirmation .primary')`,
    ),
    true,
    'Editor confirmation receives focus',
  );
  assert.equal(
    await evaluate(`document.querySelector('app-rule-editor .form-content').checkVisibility()`),
    false,
    'Editor is hidden during confirmation',
  );
  await screenshot('dirty-editor-after-close');
  await click('.close-confirmation .primary');
  assert.equal(
    await evaluate(`document.querySelector('input[name="name"]').value`),
    'Modified',
    'Continue keeps draft',
  );
  assert.equal(
    await evaluate(
      `document.activeElement===document.querySelector('app-rule-editor header button')`,
    ),
    true,
    'Focus returns after cancelling',
  );
  await click('app-rule-editor header button');
  await click('.close-confirmation button:last-of-type');
  assert.equal(
    await evaluate('!!document.querySelector("dialog[open]")'),
    false,
    'Confirmed editor closes',
  );
  await waitFor('.rule-mark');
  await click('.entity-field button:not(.primary)');
  await waitFor('main.editor-page input[name="name"]');
  assert.equal(await evaluate('location.pathname'), '/rules/1/edit', 'Edit uses a dedicated route');
  assert.equal(
    await evaluate('!!document.querySelector("dialog")'),
    false,
    'Saved-rule editing is not a modal',
  );
  await screenshot('full-page-editor');
  await evaluate('document.fonts.ready');
  assert.equal(
    await evaluate("document.fonts.check('16px Heebo')"),
    true,
    'Bundled Heebo is available',
  );
  await click('.mode-switch button:last-child');
  await waitFor('.read-view');
  assert.equal(await evaluate('document.querySelector("#rule-editor-form").hidden'), true);
  await screenshot('readable-rule-desktop');
  await click('.back-to-edit');

  await evaluate(
    `(()=>{const e=document.querySelector('input[name="name"]');e.value='Unsaved salary rule';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('.footer-actions button:nth-child(2)');
  await waitFor('app-rule-results input[type="search"]');
  await evaluate('new Promise(resolve=>setTimeout(resolve,400))');
  await evaluate(
    `(()=>{const e=document.querySelector('app-rule-results input[type="search"]');e.value='דנה';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('app-rule-results .search-form button[type="submit"]');
  assert.equal(
    await evaluate(`document.querySelectorAll('app-rule-results tbody tr').length`),
    1,
    'Search filters draft rows',
  );
  await click('app-rule-results button[aria-label="סינון לפי שכר"]');
  await evaluate(
    `(()=>{const s=document.querySelector('.column-panel select[name="operator"]');s.value='greaterThan';s.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('.column-panel input[name="value"]');e.value='18000';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('.column-panel button[type="submit"]');
  assert.equal(
    await evaluate(`document.querySelectorAll('.active-filters .chip').length`),
    2,
    'Search and column filter chips are visible',
  );
  assert.equal(
    executionRequests.at(-1).definition.name,
    'Unsaved salary rule',
    'Filtering uses unsaved executed snapshot',
  );
  assert.equal(
    executionRequests.at(-1).options.filter.right.value,
    18000,
    'Typed filter sent to server',
  );
  assert.ok(
    executionRequests.every((request) => request.definition.name === 'Unsaved salary rule'),
    'No saved definition replaces the draft during filtering',
  );
  await screenshot('filtered-draft-results');
  await evaluate(
    `(()=>{const e=document.querySelector('app-rule-results input[type="search"]');e.value='no matches';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('app-rule-results .search-form button[type="submit"]');
  assert.ok(
    await evaluate(
      `document.querySelector('app-rule-results').innerText.includes('לא נמצאו תוצאות התואמות')`,
    ),
    'No-match state preserves filters',
  );
  await click('app-rule-results .filter-toolbar > button');
  assert.equal(
    await evaluate(`document.querySelectorAll('app-rule-results tbody tr').length`),
    2,
    'Clear restores all draft results',
  );
  await click('app-rule-results button[aria-label="סינון לפי גיל"]');
  await evaluate(
    `(()=>{const s=document.querySelector('.column-panel select[name="operator"]');s.value='greaterThan';s.dispatchEvent(new Event('change',{bubbles:true}));const e=document.querySelector('.column-panel input[name="value"]');e.value='30';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('.column-panel button[type="submit"]');
  assert.equal(
    executionRequests.at(-1).options.filter.left.fieldId,
    'age',
    'Age uses the business field ID',
  );
  assert.equal(
    executionRequests.at(-1).options.filter.right.value,
    30,
    'Age filter is a JSON number',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('app-rule-results tbody tr').length`),
    1,
    'Age filter displays matching rows',
  );
  assert.equal(
    await evaluate(`document.querySelector('.evaluated-count').textContent.includes('30')`),
    true,
    'Filtered results keep the full entity count',
  );
  await screenshot('age-filtered-draft-results');
  await click('app-rule-results .filter-toolbar > button');
  await evaluate(
    `(()=>{const s=document.querySelector('.comparison select');s.value=Array.from(s.options).find(o=>o.textContent.includes('מחלקת העובד')&&o.textContent.includes('מחלקה פעילה')).value;s.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll('.comparison select')[1].options,o=>o.value)`,
    ),
    ['equals', 'notEquals', 'isNull', 'isNotNull'],
    'Related boolean operator choices',
  );
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll('.comparison select')[3].options).filter(o=>!o.disabled).map(o=>o.value)`,
    ),
    ['true', 'false'],
    'Boolean constants are yes/no only',
  );
  await screenshot('related-boolean-editor');
  await evaluate(
    `(()=>{const s=document.querySelectorAll('.comparison select')[2];s.value='field';s.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.deepEqual(
    await evaluate(
      `Array.from(document.querySelectorAll('.comparison select')[3].options).filter(o=>!o.disabled).map(o=>o.textContent.trim())`,
    ),
    ['עובד פעיל'],
    'Related field cannot be compared to itself',
  );
  assert.equal(
    await evaluate(
      `document.querySelectorAll('.comparison select')[0].value === document.querySelectorAll('.comparison select')[3].value`,
    ),
    false,
    'Comparison defaults to a distinct field',
  );
  await screenshot('related-distinct-field-comparison');
  await click('.app-rail nav a');
  await waitFor('.close-confirmation');
  await click('.close-confirmation .primary');
  assert.equal(
    await evaluate('location.pathname'),
    '/rules/1/edit',
    'Cancelled navigation preserves editor',
  );
  await click('main.editor-page header button');
  await click('.close-confirmation button:last-of-type');
  await waitFor('.ai-create');
  assert.equal(await evaluate('location.pathname'), '/rules', 'Discard returns to list');
  await click('.ai-create');
  await waitFor('main.ai-page');
  assert.equal(
    await evaluate('location.pathname'),
    '/rules/ai/new',
    'AI navigation has its own route',
  );
  assert.equal(
    await evaluate('!!document.querySelector("dialog")'),
    false,
    'AI creation is not a dialog',
  );
  assert.equal(
    await evaluate(`document.querySelector('.app-rail .ai-create').classList.contains('active')`),
    true,
    'AI navigation is active',
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.app-rail nav a.active').length`),
    1,
    'Only the AI navigation item is active',
  );
  await screenshot('ai-creation-page');
  await click('app-ai-rule-creator header button');
  await waitFor('.rule-mark');
  await click('.ai-create');
  await click('.examples button');
  await click('app-ai-rule-creator header button');
  assert.equal(
    await evaluate(`document.activeElement===document.querySelector('.confirmation .primary')`),
    true,
    'AI confirmation receives focus',
  );
  await screenshot('ai-after-close');
  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await evaluate('new Promise(resolve=>setTimeout(resolve,100))');
  assert.equal(
    await evaluate(
      `!!document.querySelector('main.ai-page') && !document.querySelector('.confirmation')`,
    ),
    true,
    'Escape cancels confirmation without losing input',
  );
  assert.ok(await evaluate(`document.querySelector('#ai-description').value.length`));
  await click('app-ai-rule-creator header button');
  await click('.confirmation button:last-of-type');
  await waitFor('.rule-mark');
  aiDelay = 1000;
  await click('.ai-create');
  await click('.examples button');
  await click('app-ai-rule-creator button[type="submit"]');
  await click('app-ai-rule-creator header button');
  await waitFor('.rule-mark');
  aiDelay = 0;
  await click('.ai-create');
  await click('.examples button');
  await click('app-ai-rule-creator button[type="submit"]');
  await waitFor('app-rule-editor .ai-review');
  assert.equal(
    await evaluate('!!document.querySelector("dialog")'),
    false,
    'AI review stays a full page',
  );
  await screenshot('ai-review-page');
  await click('app-rule-editor header button');
  await click('.close-confirmation button:last-of-type');
  await waitFor('.rule-mark');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await click('.manual-create');
  await waitFor('main.editor-page input[name="name"]');
  await evaluate(
    `(()=>{const e=document.querySelector('input[name="name"]');e.value='Mobile draft';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('app-rule-editor header button');
  const bounds = await evaluate(
    `(()=>{const r=document.querySelector('.close-confirmation').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}})()`,
  );
  assert.ok(
    bounds.top >= 0 && bounds.bottom <= bounds.height,
    'Mobile confirmation remains in viewport',
  );
  await screenshot('mobile-editor-confirmation');
  await click('.close-confirmation button:last-of-type');
  assert.equal(
    await evaluate('!!document.querySelector("dialog[open]")'),
    false,
    'Mobile editor closes',
  );
  await waitFor('.rule-mark');
  await screenshot('mobile-numbered-rules');
  await evaluate(`document.querySelector('.ai-origin').scrollIntoView({block:'center'})`);
  const badgeBounds = await evaluate(
    `(()=>{const r=document.querySelector('.ai-origin').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}})()`,
  );
  assert.ok(
    badgeBounds.left >= 0 && badgeBounds.right <= badgeBounds.width,
    'AI badge fits mobile viewport',
  );
  await screenshot('mobile-ai-badge');
  await waitFor('.rule-mark');
  await click('.entity-field button:not(.primary)');
  await waitFor('main.editor-page input[name="name"]');
  assert.equal(
    await evaluate('!!document.querySelector("dialog")'),
    false,
    'Mobile edit is also a page',
  );
  await screenshot('mobile-full-page-editor');
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    'Mobile editor has no horizontal overflow',
  );
  await click('.mode-switch button:last-child');
  await waitFor('.read-view');
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    'Mobile read view has no horizontal overflow',
  );
  await screenshot('readable-rule-mobile');
  await click('.back-to-edit');
  await click('.wrap-group');
  await click('.condition-group > .group-actions button:last-child');
  await evaluate(
    `(()=>{const s=document.querySelector('.condition-group .condition-group .group-operator select');s.value='or';s.dispatchEvent(new Event('change',{bubbles:true}))})()`,
  );
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    'Nested mobile groups have no horizontal overflow',
  );
  await evaluate(`document.querySelector('.condition-group').scrollIntoView({block:'start'})`);
  await screenshot('nested-rule-editor-mobile');
  await click('.mode-switch button:last-child');
  assert.equal(
    await evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    'Nested readable rule fits mobile',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".read-view .group").length'),
    2,
    'Readable view preserves both groups',
  );
  await evaluate(`document.querySelector('.read-view .group').scrollIntoView({block:'start'})`);
  await screenshot('nested-rule-readable-mobile');

  await click('main.editor-page header button');
  await click('.close-confirmation button:last-of-type');
  await waitFor('.rule-mark');
  await click('.ai-create');
  await waitFor('main.ai-page');
  assert.equal(
    await evaluate('!!document.querySelector("dialog")'),
    false,
    'Mobile AI creation is not a popup',
  );
  await screenshot('mobile-ai-creation-page');
  await click('.examples button');
  await click('app-ai-rule-creator button[type="submit"]');
  await waitFor('app-rule-editor .ai-review');
  await screenshot('mobile-ai-review-page');
  await click('main.editor-page header button');
  await click('.close-confirmation button:last-of-type');
  await waitFor('.rule-mark');

  await click('.entity-field button:not(.primary)');
  await waitFor('input[name="name"]');
  await evaluate(
    `(()=>{const e=document.querySelector('input[name="name"]');e.value='Saved from footer';e.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  rejectNextSave = true;
  await click('.footer-actions .primary');
  await waitFor('.error-summary');
  assert.equal(await evaluate('location.pathname'), '/rules/1/edit', 'Failed save keeps editor');
  assert.equal(
    await evaluate('document.activeElement===document.querySelector(".error-summary")'),
    true,
    'Save error is focused and visible',
  );
  await click('.footer-actions .primary');
  await waitFor('.save-notice');
  assert.equal(await evaluate('location.pathname'), '/rules', 'Successful PUT returns to library');
  assert.equal(saved.definition.name, 'Saved from footer', 'PUT persists edited definition');
  assert.equal(
    await evaluate(
      `(()=>{const r=document.querySelector('.save-notice').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()`,
    ),
    true,
    'Success notice is visible without scrolling',
  );
  await screenshot('save-success-library');
  await click('.entity-field button:not(.primary)');
  await waitFor('input[name="name"]');
  assert.equal(
    await evaluate(`document.querySelector('input[name="name"]').value`),
    'Saved from footer',
    'Reloaded editor receives persisted definition',
  );
  await click('main.editor-page header button');
  await waitFor('.rule-mark');
  await click('.manual-create');
  await waitFor('input[name="name"]');
  await evaluate(
    `(()=>{const e=document.querySelector('input[name="name"]');e.value='Created from footer';e.dispatchEvent(new Event('input',{bubbles:true}));const v=document.querySelector('.comparison input');v.value='Dana';v.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click('.footer-actions .primary');
  await waitFor('.save-notice');
  assert.equal(await evaluate('location.pathname'), '/rules', 'Successful POST returns to library');
  assert.equal(createdRules[0].definition.name, 'Created from footer');
  assert.equal(saveRequests.at(-1).createdWithAi, false);
  assert.equal(
    await evaluate(
      'document.querySelector(".rule-list").innerText.includes("Created from footer")',
    ),
    true,
    'Created rule appears after list refresh',
  );
  assert.equal(saveRequests.length, 3, 'One failed PUT, one successful PUT and one POST');
  for (const [route, selector] of [
    ['/rules/new', 'main.editor-page'],
    ['/rules/ai/new?page=2', 'main.ai-page'],
    ['/rules/1/edit', 'main.editor-page'],
    ['/rules/1/results', 'main.results-page'],
    ['/rules', '.rule-mark'],
  ]) {
    await send('Page.navigate', { url: base + route });
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(selector);
    assert.equal(
      await evaluate(route === '/rules' ? 'location.pathname' : 'location.pathname + location.search'),
      route,
      'Direct links still work',
    );
    await send('Page.reload');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor('.rule-mark');
    assert.equal(await evaluate('location.pathname'), '/rules', 'Refresh returns to library');
    assert.ok(
      await evaluate("[null, '1'].includes(new URL(location.href).searchParams.get('page'))"),
      'Refresh starts on first library page',
    );
  }
  assert.deepEqual(errors, [], 'No browser runtime errors');
  assert.equal(writes, 0, 'No unexpected API requests');
  assert.equal(validationRequests, 0, 'No redundant pre-validation requests');
  console.log(
    'PASS: full-page creation and editing, confirmation, focus, cancellation, draft filtering and AI flow on desktop/mobile. Artifacts:',
    artifacts,
  );
} catch (error) {
  console.error('Browser check artifacts:', artifacts);
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await screenshot('failure');
      console.error(
        await evaluate(
          `({path:location.pathname,description:document.querySelector('#ai-description')?.value,body:document.body.innerText.slice(-1500)})`,
        ),
      );
    } catch {
      /* Preserve the original test failure. */
    }
  }
  throw error;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      await send('Browser.close');
    } catch {
      /* Browser can close before replying. */
    }
    socket.close();
  }
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error('Browser test finished'));
  }
  browser.kill();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
