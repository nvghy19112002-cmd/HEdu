import { checkCau, ocrJob, OCR_TRANG_SYSTEM, parseTrang } from './ocrtrang';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

console.log('Nhiệm vụ AI ocr-trang');
const tn = String.raw`\begin{ex}%[2D1H2-1]
  Hàm số $y=f(x)$ đồng biến trên khoảng nào?
  \choice
  {$\left(-\infty;-1\right)$}
  {\True $(-1;1)$}
  {$(0;+\infty)$}
  {$(-2;2)$}
  \loigiai{ }
\end{ex}`;
ok(checkCau(tn, 'tn').length === 0, 'câu trắc nghiệm đúng khuôn: không lỗi');
ok(checkCau(tn.replace('\\loigiai{ }', '\\loigiai{Ta có...}'), 'tn').some((e) => e.includes('loigiai')), 'có nội dung lời giải ⇒ báo (OCR thuần)');
ok(checkCau(tn.replace('{\\True $(-1;1)$}', '{$(-1;1)$ \\True}'), 'tn').some((e) => e.includes('đầu nhóm')), '\\True không đứng đầu nhóm ⇒ báo');
ok(checkCau(tn.replace('{$(0;+\\infty)$}', '{\\True $(0;+\\infty)$}'), 'tn').some((e) => e.includes('hơn một')), 'hai \\True ⇒ báo');
ok(checkCau(tn.replace('\\end{ex}', ''), 'tn').length > 0, 'thiếu \\end{ex} ⇒ báo');
ok(checkCau(tn.replace('{$(-2;2)$}', '{$(-2;2)$'), 'tn').some((e) => e.includes('cân')), 'ngoặc không cân ⇒ báo');
ok(checkCau(tn.replace('{$(-2;2)$}', '{$\\frac{1}{2}$} % { trong chú thích'), 'tn').some((e) => e.includes('cấm')), '\\frac bị cấm, { trong chú thích không tính');
const tln = String.raw`\begin{ex}
  Tính $x$.
  \shortans{-1,5}
  \loigiai{ }
\end{ex}`;
ok(checkCau(tln, 'tln').length === 0 && checkCau(tln.replace('-1,5', '-12,5'), 'tln').length === 1 && checkCau(tln.replace('-1,5', ''), 'tln').length === 0, '\\shortans ≤ 4 ký tự, rỗng được');

const r = parseTrang(JSON.stringify({ trang_co_de: true, cau: [{ so_nguon: '3', dang: 'tn', tex: tn, hinh: [[100, 50, 300, 400], [5, 5, 1, 1], [0, 0, 2000, 10]], can_xac_minh: ['PA D: -2 hay -3?'] }], cau_dang_do: true }));
ok(r.coDe && r.cau.length === 1 && r.cau[0].hinh.length === 1 && r.cau[0].canXacMinh.length === 1 && r.dangDo, 'đọc JSON; bỏ toạ độ hình sai thang/ngược');
ok(parseTrang('{"trang_co_de":false,"cau":[{"so_nguon":"1","dang":"tn","tex":"x"}]}').cau.length === 0, 'trang không có đề ⇒ không lấy câu nào');
let threw = false; try { parseTrang('{"cau":1}'); } catch { threw = true; }
ok(threw, 'khuôn sai ⇒ ném lỗi cho riêng trang đó');
const j = ocrJob('j1', 'gemini-3.8-flash', [{ id: 'p1', mime: 'image/png', dataB64: 'AAAA' }]);
ok(j.thinkingLevel === 'low' && j.parallel === 2 && j.schema.required.includes('cau'), 'dựng lượt gửi ocr_run');
ok(/DỮ LIỆU/.test(OCR_TRANG_SYSTEM) && /\\loigiai\{ \}/.test(OCR_TRANG_SYSTEM) && /left\./.test(OCR_TRANG_SYSTEM), 'prompt có: chống tiêm lệnh, OCR thuần, ngoặc tự giãn');

if (fail) process.exit(1);
console.log('ai/tasks/ocrtrang: đạt hết.');
