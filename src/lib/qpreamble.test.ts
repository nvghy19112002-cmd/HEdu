import assert from 'node:assert/strict';
import { headOf, mergePreambles, neededFor, parseDefs, preambleFromSource } from './qpreamble';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };

const FILE = String.raw`\documentclass{article}
\usepackage{ex_test}
\usetikzlibrary{calc,arrows.meta}
% chú thích \newcommand{\ghost}{x}
\newcommand{\vect}[1]{\overrightarrow{#1}}
\newcommand{\goc}{\widehat}
\renewcommand{\epsilon}{\varepsilon}
\newcommand{\tamgiac}[3]{\vect{#1#2} + \vect{#2#3}}
\def\R{\mathbb{R}}
\def\pt#1#2{(#1;#2)}
\DeclareMathOperator{\cotan}{cotan}
\newenvironment{ghichu}{\begin{center}}{\end{center}}
\tikzset{mui/.style={->,>=Stealth}}
\begin{document}
\begin{ex}
  Cho $\vect{AB}$ và tập $\R$.
\end{ex}`;

t('đọc các loại định nghĩa trong đầu tệp, bỏ phần chú thích', () => {
  const d = parseDefs(headOf(FILE));
  const names = d.map((x) => `${x.kind}:${x.name}`);
  assert.deepEqual(names, ['cmd:vect', 'cmd:goc', 'cmd:epsilon', 'cmd:tamgiac', 'cmd:R', 'cmd:pt', 'cmd:cotan', 'env:ghichu', 'tikz:', 'tikz:']);
  assert.ok(!d.some((x) => x.name === 'ghost'));
  assert.equal(d[0].text, String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}`);
  assert.equal(d[5].text, String.raw`\def\pt#1#2{(#1;#2)}`);
});

t('mỗi câu chỉ nhận định nghĩa nó dùng, kể cả bắc cầu', () => {
  const defs = parseDefs(headOf(FILE));
  assert.equal(neededFor(defs, String.raw`Cho $\vect{AB}$ và $\R$.`), String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}` + '\n' + String.raw`\def\R{\mathbb{R}}`);
  assert.equal(neededFor(defs, String.raw`$\tamgiac{A}{B}{C}$`), String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}` + '\n' + String.raw`\newcommand{\tamgiac}[3]{\vect{#1#2} + \vect{#2#3}}`);
  assert.equal(neededFor(defs, 'Không dùng gì cả, $x^2$.'), '');
});

t('môi trường tự định nghĩa; thư viện TikZ chỉ kèm khi câu có hình', () => {
  const defs = parseDefs(headOf(FILE));
  assert.ok(neededFor(defs, String.raw`\begin{ghichu}x\end{ghichu}`).includes(String.raw`\newenvironment{ghichu}`));
  assert.ok(!neededFor(defs, 'x').includes('usetikzlibrary'));
  const withFig = neededFor(defs, String.raw`\begin{tikzpicture}\draw[mui](0,0)--(1,1);\end{tikzpicture}`);
  assert.ok(withFig.includes(String.raw`\usetikzlibrary{calc,arrows.meta}`) && withFig.includes(String.raw`\tikzset{mui/.style={->,>=Stealth}}`));
});

t('gộp nhiều phần đầu riêng: bỏ trùng, giữ thứ tự', () => {
  const a = String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}` + '\n' + String.raw`\def\R{\mathbb{R}}`;
  const b = String.raw`\def\R{\mathbb{R}}` + '\n' + String.raw`\newcommand{\goc}{\widehat}`;
  assert.equal(mergePreambles([a, undefined, b]), [String.raw`\newcommand{\vect}[1]{\overrightarrow{#1}}`, String.raw`\def\R{\mathbb{R}}`, String.raw`\newcommand{\goc}{\widehat}`].join('\n'));
});

t('tệp không có đầu hoặc không có định nghĩa ⇒ rỗng, không lỗi', () => {
  assert.equal(preambleFromSource(String.raw`\begin{ex}x\end{ex}`, 'x'), '');
  assert.equal(preambleFromSource('', 'x'), '');
  assert.equal(preambleFromSource(String.raw`\newcommand{\hong`, String.raw`\hong`), '');
});

t('preambleFromSource: lấy đúng phần câu cần từ cả tệp', () => {
  assert.equal(preambleFromSource(FILE, String.raw`$\goc{ABC}$`), String.raw`\newcommand{\goc}{\widehat}`);
});
