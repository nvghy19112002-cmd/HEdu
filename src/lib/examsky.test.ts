import assert from 'node:assert/strict';
import { schoolLine, skyExamFiles, skyVariantTex } from './examsky';
import { DEFAULT_INTRO } from './examsetup';
import { part_blocks_like } from './examsky.testutil';
import type { ExamInfo, Variant } from './examgen';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const q1 = '\\begin{ex}Câu một\\choice{\\True a}{b}{c}{d}\\end{ex}';
const q2 = '\\begin{ex}Câu hai\\choiceTF{\\True a}{b}{c}{d}\\end{ex}';
const slot = (latex: string) => ({ q: { uid: 'u', latex }, latex, key: 'A', shuffled: false }) as never;
const v = (code: string): Variant => ({ code, parts: { p1: [slot(q1), slot(q1)], p2: [slot(q2)], p3: [], p4: [] } });
const info = { dept: 'Sở GD&ĐT A', school: 'THPT B', group: '', title: 'Kiểm tra 50%', subject: 'Toán 10', minutes: 45, note: '' } as unknown as ExamInfo;
const W = { schoolYear: '2026–2027', teacher: 'GV' };

t('mã đề theo mẫu: tiêu đề \\TieuDeDeSo, dấu phần cho HEdu đếm câu, dòng PHẦN đánh số liên tục, câu nguyên văn', () => {
  const s = skyVariantTex(info, v('101'), DEFAULT_INTRO);
  assert.ok(s.includes('\\TieuDeDeSo{Sở GD\\&ĐT A--THPT B}{Kiểm tra 50\\%}{Toán 10}{45 phút}{101}'));
  assert.ok(s.includes('\\caulc') && s.includes('\\cauds') && !s.includes('\\caukq'));
  assert.ok(s.includes('\\textbf{PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.}') && s.includes('\\textbf{PHẦN II. Câu trắc nghiệm đúng sai.}'));
  assert.ok(s.includes('từ câu 1 đến câu 2') && s.includes('câu 1. Trong mỗi ý'));
  assert.equal(s.split(q1).length - 1, 2);
  assert.deepEqual(part_blocks_like(s), [2, 1, 0, 0]);
});

t('bộ tệp: tệp chính đầy đủ theo mẫu có \\CheDo, chỉ một lệnh nạp ex_test, không có bộ khai báo HEdu', () => {
  const f = skyExamFiles(info, [v('101'), v('102')], { withKeys: true }, 'hymath-13-sky-panel', W, DEFAULT_INTRO)!;
  assert.ok(f);
  const by = (p: string) => f.find((x) => x.path === p)?.text ?? '';
  for (const m of ['main.tex', 'main-101.tex', 'main-102.tex', 'main-dapan.tex']) {
    assert.ok(by(m).includes('\\def\\CheDo{mau}'), m);
    assert.ok(by(m).includes('\\providecommand{\\caulc}{}'), m);
  }
  assert.ok(by('main-101.tex').includes('\\input{de-101}') && !by('main-101.tex').includes('de-102'));
  assert.ok(by('main.tex').includes('\\input{de-101}\n\\newpage\n\\input{de-102}'));
  assert.ok(!by('main-101.tex').includes('dapan'), 'PDF đề không chèn đáp án');
  const exTest = f.filter((x) => /^[^%\n]*\\usepackage(\[[^\]]*\])?\{ex_test\}/m.test(x.text)).map((x) => x.path);
  assert.deepEqual(exTest, ['hymath-core.tex']);
  assert.ok(!f.some((x) => x.path === 'khaibaochung.tex' || x.path === 'hedu.sty'));
  assert.ok(f.some((x) => x.path === 'theme-13-sky-panel.tex'));
});

t('mẫu kiểu cũ HEdu thì không dựng theo mẫu (dùng đường cũ)', () => {
  assert.equal(skyExamFiles(info, [v('101')], { withKeys: false }, 'hedu', W), null);
});

t('dòng tên đơn vị bỏ phần trống', () => {
  assert.equal(schoolLine({ ...info, dept: '  ', school: 'THPT B' } as ExamInfo), 'THPT B');
});
