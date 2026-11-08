import assert from 'node:assert/strict';
import { answerText } from './banktable';
import type { Question } from './types';

const t = (name: string, f: () => void) => { f(); console.log('  ✓ ' + name); };
const q = (type: Question['type'], latex: string) => ({ type, latex } as unknown as Question);

t('trắc nghiệm → chữ cái đáp án đúng', () => assert.equal(answerText(q('tn', '\\begin{ex}\nA?\n\\choice\n{a}\n{b}\n{\\True c}\n{d}\n\\end{ex}')), 'C'));
t('đúng/sai → Đ/S theo từng ý', () => assert.equal(answerText(q('ds', '\\begin{ex}\nX\n\\choiceTF\n{\\True a}\n{b}\n{\\True c}\n{d}\n\\end{ex}')), 'Đ S Đ S'));
t('trả lời ngắn → đáp số', () => assert.equal(answerText(q('tln', '\\begin{ex}\nX\n\\shortans{0,17}\n\\end{ex}')), '0,17'));
t('tự luận → rỗng', () => assert.equal(answerText(q('tl', '\\begin{ex}\nChứng minh rằng…\n\\end{ex}')), ''));
t('câu chưa đánh dấu đáp án đúng → rỗng, không đoán', () => assert.equal(answerText(q('tn', '\\begin{ex}\nA?\n\\choice\n{a}\n{b}\n{c}\n{d}\n\\end{ex}')), ''));
