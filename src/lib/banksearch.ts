// Ô Tìm của màn Ngân hàng: tách chữ tìm thành từ thường và số thứ tự câu (#2086).

export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export interface BankQuery {
  /** từ thường: câu phải chứa MỌI từ */
  words: string[];
  /** số thứ tự gõ dạng #2086 hoặc #86: câu phải có MỘT trong các số này (gõ nhiều số ⇒ hiện cả các câu đó) */
  seqs: number[];
}

const SEQ_TERM = /^#0*(\d{1,9})$/;

export function parseBankQuery(text: string): BankQuery {
  const words: string[] = [];
  const seqs: number[] = [];
  for (const w of fold(text.trim()).split(/\s+/)) {
    if (!w) continue;
    const m = SEQ_TERM.exec(w);
    if (m) seqs.push(Number(m[1]));
    else words.push(w);
  }
  return { words, seqs };
}

/** `hay` = chữ tìm đã fold của câu, `seq` = số thứ tự của câu. */
export function queryOk(q: BankQuery, hay: string, seq: number): boolean {
  if (q.seqs.length && !q.seqs.includes(seq)) return false;
  return q.words.every((w) => hay.includes(w));
}
