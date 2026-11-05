// Luồng thật: nhập tệp có đầu tệp ⇒ mỗi câu mang định nghĩa nó cần ⇒ dựng mã đề kèm định nghĩa (gộp, bỏ trùng).
import assert from 'node:assert/strict';
import { buildRows } from './importbatch';
import { variantTex, type Variant } from './examgen';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

const FILE = String.raw`\documentclass{article}
\newcommand{\vect}[1]{\overrightarrow{#1}}
\def\R{\mathbb{R}}
\begin{document}
\begin{ex}
  Cho $\vect{AB}$.
  \choice
  {\True $1$}
  {$2$}
  {$3$}
  {$4$}
\end{ex}
\begin{ex}
  Cho $\vect{CD}$ và tập $\R$.
  \choice
  {\True $1$}
  {$2$}
  {$3$}
  {$4$}
\end{ex}
\begin{ex}
  Câu không dùng macro nào.
  \choice
  {\True $1$}
  {$2$}
  {$3$}
  {$4$}
\end{ex}
`;

t('nhập: mỗi câu chỉ mang định nghĩa nó dùng', () => {
  const rows = buildRows([{ name: 'a.tex', rel: '', text: FILE }]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].preamble, String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}`);
  assert.equal(rows[1].preamble, String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}` + '\n' + String.raw`\def\R{\mathbb{R}}`);
  assert.equal(rows[2].preamble, '');
});

t('dựng mã đề: định nghĩa riêng của các câu được gộp, bỏ trùng, nằm trước khung tên', () => {
  const rows = buildRows([{ name: 'a.tex', rel: '', text: FILE }]);
  const qs = rows.map((r, i) => ({ uid: `u${i}`, seq: i, latex: r.latex, type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0, ...(r.preamble ? { preamble: r.preamble } : {}) } as unknown as Question));
  const v: Variant = { code: '101', parts: { p1: qs.map((q) => ({ q, latex: q.latex, key: 'A', shuffled: false })), p2: [], p3: [], p4: [] } };
  const tex = variantTex({ dept: '', school: '', group: '', title: 'T', subject: 'S', minutes: 45, note: '' }, v);
  assert.equal((tex.match(/\\newcommand\{\\vect\}/g) ?? []).length, 1, 'định nghĩa trùng chỉ xuất hiện một lần');
  assert.ok(tex.includes(String.raw`\def\R{\mathbb{R}}`));
  assert.ok(tex.indexOf(String.raw`\newcommand{\vect}`) < tex.indexOf(String.raw`\begin{name}`));
});

t('dựng mã đề: không câu nào có định nghĩa riêng ⇒ không thêm dòng nào', () => {
  const q = { uid: 'u', seq: 1, latex: 'x', type: 'tn', level: 'NB', tags: [], createdAt: 0, updatedAt: 0 } as unknown as Question;
  const v: Variant = { code: '101', parts: { p1: [{ q, latex: 'x', key: 'A', shuffled: false }], p2: [], p3: [], p4: [] } };
  const tex = variantTex({ dept: '', school: '', group: '', title: 'T', subject: 'S', minutes: 45, note: '' }, v);
  assert.ok(!tex.includes('newcommand'));
});
