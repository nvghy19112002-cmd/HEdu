import { aiKeySet, aiKeyStatus, aiRun, AiError, retryable } from './client';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };
const g = globalThis as unknown as { window?: unknown };

console.log('AI dùng chung: lớp gọi phía giao diện');
g.window = {};
ok((await aiKeyStatus()).hasKey === false, 'bản web: coi như chưa có khoá, không gọi gì');
const web = await aiRun({ provider: 'gemini', model: 'm', system: 's', user: 'u' }).catch((e: unknown) => e);
ok(web instanceof AiError && web.kind === 'not_desktop', 'bản web: không chạy AI, báo rõ');

const calls: [string, unknown][] = [];
let reply: unknown = { text: '{}', finish: 'STOP', promptTokens: 1, outputTokens: 1, model: 'm' };
let throwIt: unknown = null;
g.window = { __TAURI__: {
  core: { async invoke(cmd: string, args: unknown) { calls.push([cmd, args]); if (throwIt) throw throwIt; return cmd === 'ai_key_status' ? { hasKey: true } : reply; } },
  event: { async listen() { return () => {}; } },
} };
ok((await aiKeyStatus()).hasKey === true && calls[0][0] === 'ai_key_status', 'hỏi trạng thái khoá (không lấy khoá)');
await aiKeySet('KHOA-0123456789');
ok(calls[1][0] === 'ai_key_set' && (calls[1][1] as { key: string; profileId: string }).key === 'KHOA-0123456789', 'lưu khoá: gửi xuống Rust một lần');
const r = await aiRun({ provider: 'gemini', model: 'gemini-3.8-flash', system: 'S', user: 'U', schema: { type: 'object' } });
const sent = calls[2][1] as { req: { model: string; schema: unknown } };
ok(calls[2][0] === 'ai_run' && sent.req.model === 'gemini-3.8-flash' && !!sent.req.schema && r.text === '{}', 'chạy một lượt: gửi đủ model/prompt/khuôn, nhận câu trả lời');
throwIt = { kind: 'quota_day', message: 'Đã hết lượt miễn phí hôm nay.', retryAfterSecs: null };
const q = await aiRun({ provider: 'gemini', model: 'm', system: 's', user: 'u' }).catch((e: unknown) => e);
ok(q instanceof AiError && q.kind === 'quota_day' && !retryable(q.kind), 'lỗi từ Rust giữ đúng loại; hết lượt ngày ⇒ không gợi ý thử lại ngay');
throwIt = { kind: 'rate', message: 'Gọi AI quá nhanh', retryAfterSecs: 17 };
const rt = await aiRun({ provider: 'gemini', model: 'm', system: 's', user: 'u' }).catch((e: unknown) => e);
ok(rt instanceof AiError && rt.retryAfterSecs === 17 && retryable(rt.kind), 'quá nhịp: giữ số giây chờ, cho thử lại');

if (fail) process.exit(1);
console.log('ai/client: đạt hết.');
