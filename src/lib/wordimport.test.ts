import assert from 'node:assert/strict';
import { convertWord, parseWord } from './wordimport';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

const TN = String.raw`\textbf{PHẦN I.} \textbf{Câu trắc nghiệm nhiều phương án lựa chọn.} Học sinh trả lời từ câu 1 đến câu 2.

\textbf{Câu 1.} Cho hai vectơ $\overrightarrow{a},\overrightarrow{b}$ trong hình sau:

Đẳng thức nào sau đây đúng?

\textbf{A.} $\overrightarrow{a}=-2\overrightarrow{b}$. \textbf{\underline{B.}} $\overrightarrow{a}=\frac{1}{2}\overrightarrow{b}$. \textbf{C.} $x$. \textbf{D.} $2ab$.

\textbf{Câu 2.} Cho tập hợp A. Mệnh đề nào đúng?

\textbf{A.} Một. \textbf{B.} Hai. \textbf{C.} Ba. \textbf{D.} Bốn.

\textbf{Lời giải.} Vì $a=2$ nên chọn A.
`;

t('câu trắc nghiệm: tách đề, 4 phương án, phương án gạch chân là đáp án đúng, lời giải', () => {
  const { questions } = parseWord(TN);
  assert.equal(questions.length, 2);
  const q1 = questions[0];
  assert.equal(q1.type, 'tn'); assert.equal(q1.options.length, 4); assert.equal(q1.correct, 1);
  assert.ok(q1.stem.includes('Đẳng thức nào sau đây đúng?'));
  assert.equal(q1.options[0], '$\\overrightarrow{a}=-2\\overrightarrow{b}$');
  assert.equal(q1.options[3], '$2ab$');
  const q2 = questions[1];
  assert.ok(q2.stem.includes('tập hợp A.'), 'chữ "A." trong đề không bị nhầm là phương án');
  assert.equal(q2.correct, -1);
  assert.ok(q2.solution.includes('Vì $a=2$'));
});

t('xuất khối ex_test: \\choice, \\True ở phương án đúng, \\loigiai', () => {
  const c = convertWord(TN);
  assert.ok(c.tex.includes('\\begin{ex}') && c.tex.includes('\\choice\n'));
  assert.ok(c.tex.includes('{\\True $\\overrightarrow{a}=\\frac{1}{2}\\overrightarrow{b}$}'));
  assert.ok(c.tex.includes('\\loigiai{'));
  assert.equal(c.stats.total, 2); assert.equal(c.stats.byType.tn, 2); assert.equal(c.stats.noAnswer, 1); assert.equal(c.stats.withSolution, 1);
});

const DS = String.raw`\textbf{PHẦN II.} \textbf{Câu trắc nghiệm đúng sai.}

\textbf{Câu 13.} Cho tam giác $ABC$.

\textbf{a)} Một ý đúng.

\textbf{\underline{b)}} Một ý khác.

\textbf{c)} Ý ba.

\textbf{d)} Ý bốn.

\textbf{PHẦN III.} \textbf{Câu trắc nghiệm trả lời ngắn.}

\textbf{Câu 17}\textbf{.} Tính $1+1$.

\textbf{Câu 18 (1,0 điểm)} Tính $2+2$ (đơn vị cm).

\textbf{-\/-\/-\/- HẾT -\/-\/-\/-}
`;

t('câu đúng/sai (ý a–d, gạch chân là ý đúng), trả lời ngắn, nhãn dạng "Câu 17" + "." tách khối, bỏ dòng HẾT', () => {
  const { questions } = parseWord(DS);
  assert.deepEqual(questions.map((q) => [q.n, q.type]), [[13, 'ds'], [17, 'tln'], [18, 'tln']]);
  const q = questions[0];
  assert.equal(q.tf.length, 4); assert.deepEqual(q.tfTrue, [false, true, false, false]);
  assert.equal(questions[1].stem, 'Tính $1+1$.');
  assert.ok(questions[2].stem.startsWith('Tính $2+2$'));
  assert.ok(!questions[2].stem.includes('HẾT'));
  const c = convertWord(DS);
  assert.ok(c.tex.includes('\\choiceTF') && c.tex.includes('{\\True Một ý khác.}'));
  assert.ok(c.tex.includes('\\shortans{}'));
});

t('không có gợi ý loại và không có phương án: để dạng tự luận và báo rõ', () => {
  const { questions } = parseWord('\\textbf{Câu 1.} Chứng minh rằng $a>0$.\n');
  assert.equal(questions[0].type, 'tl'); assert.ok(questions[0].issues[0].startsWith('Không rõ loại'));
});

t('nhiều phương án bị gạch chân thì không đoán đáp án', () => {
  const { questions } = parseWord('\\textbf{Câu 1.} Đề.\n\n\\underline{A.} x \\underline{B.} y C. z D. w\n');
  assert.equal(questions[0].correct, -1); assert.ok(questions[0].issues.some((s) => s.startsWith('Nhiều phương án')));
});

t('danh sách enumerate 4 mục trong câu đúng/sai', () => {
  const tex = String.raw`\textbf{PHẦN II.} \textbf{Câu trắc nghiệm đúng sai.}

\textbf{Câu 1.} Cho hàm số.

\begin{enumerate}
\def\labelenumi{\alph{enumi})}
\tightlist
\item Một.
\item Hai.
\item Ba.
\item Bốn.
\end{enumerate}
`;
  const { questions } = parseWord(tex);
  assert.equal(questions[0].type, 'ds'); assert.deepEqual(questions[0].tf, ['Một.', 'Hai.', 'Ba.', 'Bốn.']);
});
