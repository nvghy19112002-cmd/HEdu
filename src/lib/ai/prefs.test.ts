import { DEFAULT_MODEL, DEFAULT_PRO_MODEL, loadAiPrefs, saveAiPrefs, thinkingFor, validModelId } from './prefs';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
};

console.log('Cài đặt AI trên máy');
const d = loadAiPrefs();
ok(d.consent === false && d.model === DEFAULT_MODEL && d.proModel === DEFAULT_PRO_MODEL, 'mặc định: CHƯA đồng ý gửi dữ liệu, model 3.8 Flash');
saveAiPrefs({ consent: true, model: 'gemini-9.9-flash', proModel: DEFAULT_PRO_MODEL });
const r = loadAiPrefs();
ok(r.consent && r.model === 'gemini-9.9-flash', 'lưu và đọc lại đồng ý + model tự nhập');
ok(![...store.values()].some((v) => /AIza|key/i.test(v)) && ![...store.keys()].some((k) => /key/i.test(k)), 'không lưu khoá API ở đây');
store.set('hedu.ai.model', '../../x');
ok(loadAiPrefs().model === DEFAULT_MODEL, 'mã model không hợp lệ trong máy ⇒ dùng mặc định');
ok(validModelId('gemini-2.5-pro') && !validModelId('a/b') && !validModelId('X') && !validModelId('m:run'), 'kiểm mã model giống phía Rust');
saveAiPrefs({ consent: false, model: DEFAULT_MODEL, proModel: DEFAULT_PRO_MODEL });
ok(store.size === 0, 'tắt đồng ý + model mặc định ⇒ không để lại gì trong máy');

ok(thinkingFor('gemini-3.8-flash') === 'low' && thinkingFor('gemini-3.6-flash') === 'minimal' && thinkingFor('gemini-3.5-flash-lite') === 'minimal' && thinkingFor('gemini-2.5-pro') === 'low' && thinkingFor('gemini-2.5-flash') === undefined, 'mức suy nghĩ thấp nhất model cho phép (3.8 Flash không có minimal)');

if (fail) process.exit(1);
console.log('ai/prefs: đạt hết.');
