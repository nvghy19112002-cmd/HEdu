// Kiểm thử chuẩn hoá có xem trước và sắp xếp theo ID (texfix.ts). Câu tự viết, không dùng câu thật.
import { FIX_RULES, mapMath, planFix, planSort } from './texfix';
import { strictCode } from './idsync';
import { buildDefault } from './taxonomy';
import type { Level } from './types';

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failed++; console.log('  ✗ ' + msg); }
}
const all = (...ids: string[]) => new Set(ids);

console.log('Luật kỹ thuật (bật sẵn)');
ok(FIX_RULES.filter((r) => r.on).every((r) => r.group === 'ky-thuat') && FIX_RULES.filter((r) => r.group === 'cong-thuc').every((r) => !r.on), 'chỉ luật kỹ thuật bật sẵn; luật đổi công thức tắt sẵn');
const raw = '﻿Câu 1 \t\r\nA​b $x$  \r\n';
const p = planFix(raw, all('bom', 'an', 'cuoi-dong', 'xuong-dong'));
ok(p.out === 'Câu 1\nAb $x$\n', 'bỏ BOM, ký tự ẩn, khoảng trắng cuối dòng, CRLF: ' + JSON.stringify(p.out));
ok(p.changes.length === 2 && p.changes[0].line === 1 && p.changes[1].after === 'Ab $x$', 'danh sách thay đổi theo dòng để xem trước');
ok(planFix(raw, all()).out === raw && planFix(raw, all()).changes.length === 0, 'không chọn luật nào ⇒ không đổi gì');
ok(!FIX_RULES.some((r) => /chú thích|comment/i.test(r.label)), 'không có luật xoá chú thích (giữ %[ID])');

console.log('Luật công thức (chỉ trong công thức)');
const src = String.raw`Góc $30^0$ và \(x^{0}\), số 2^0 ngoài công thức. % $a^0$ trong chú thích
\begin{tikzpicture}\node at (0,0) {$45^0$}; \draw (1,2)--(3,4);\end{tikzpicture}
$$\frac{1}{2}$$ và $3,5$ cùng \$5^0\$`;
const deg = planFix(src, all('do')).out;
ok(deg.includes('$30^\\circ$') && deg.includes('\\(x^\\circ\\)') && deg.includes('số 2^0 ngoài') && deg.includes('% $a^0$') && deg.includes('{$45^0$}') && deg.includes('\\$5^0\\$'), '^0 → ^\\circ chỉ trong công thức; bỏ qua chữ thường, chú thích, tikzpicture, \\$ thoát');
const fr = planFix(src, all('dfrac', 'dollar2', 'phay')).out;
ok(fr.includes('\\[\\dfrac{1}{2}\\]') && fr.includes('$3{,}5$') && fr.includes('(1,2)--(3,4)'), '\\frac→\\dfrac, $$→\\[\\], 3,5→3{,}5; toạ độ trong tikzpicture không đổi');
ok(mapMath('$a$ $', (m) => m.toUpperCase()) === '$A$ $', 'dấu $ lẻ cuối không làm hỏng văn bản');
ok(planFix(src, all('do', 'dfrac')).out.split('\n').length === src.split('\n').length, 'không đổi số dòng');

console.log('Sắp xếp theo ID');
const tax = buildDefault();
const g = tax.grades.find((x) => x.grade === 10)!;
const forms = g.branches.flatMap((b) => b.chapters.flatMap((c) => c.lessons.flatMap((l) => l.forms.map((f) => ({ grade: g.grade, chapterId: c.id, lessonId: l.id, formId: f.id })))));
const code = (i: number, lv: Level) => { const s = strictCode(forms[i], lv, tax); if (!s.ok) throw new Error('mã'); return s.code; };
const last = forms.length - 1;
const ex = (id: string | null, body: string) => `\\begin{ex}${id ? `%[${id}]` : ''}\n${body}\n\\end{ex}`;
const doc = ['\\newcommand{\\vtt}{x}', '', ex(code(last, 'NB'), 'C'), '', ex(null, 'không ID'), '', ex(code(0, 'TH'), 'B'), '', ex(code(0, 'NB'), 'A')].join('\n');
const s1 = planSort(doc, tax);
ok(s1.ok && s1.sorted === 3 && s1.noId === 1 && s1.moved, 'sắp 3 câu có ID, 1 câu không ID');
if (s1.ok) {
  const order = ['A', 'B', 'C', 'không ID'].map((t) => s1.out.indexOf(`\n${t}\n`));
  ok(order.every((v, k) => v > 0 && (k === 0 || v > order[k - 1])), 'thứ tự: dạng đầu NB → dạng đầu TH → dạng cuối → câu không ID ở cuối');
  ok(s1.out.startsWith('\\newcommand{\\vtt}{x}\n\n%% ====='), 'phần khai báo ở đầu giữ nguyên ở đầu; có dòng tiêu đề chương');
  ok(['A', 'B', 'C', 'không ID'].every((t) => s1.out.includes(`\n${t}\n`)) && (s1.out.match(/\\begin\{ex\}/g) ?? []).length === 4, 'không mất câu nào, nội dung câu không đổi');
  const s2 = planSort(s1.out, tax);
  ok(s2.ok && s2.out === s1.out && !s2.moved, 'sắp lại lần nữa ra y hệt (dòng tiêu đề cũ không bị nhân đôi)');
}
ok(!planSort(doc + '\n\\begin{ex}\nchưa đóng', tax).ok, 'có khối chưa đóng ⇒ không sắp');
const withNote = [ex(code(last, 'NB'), 'C'), '% ghi chú riêng của thầy', ex(code(0, 'NB'), 'A')].join('\n');
ok(!planSort(withNote, tax).ok, 'có chú thích riêng giữa các câu ⇒ không sắp (tránh làm lệch chỗ)');

if (failed) { console.log(`texfix.test: ${failed} lỗi`); process.exit(1); }
console.log('texfix.test: OK');
