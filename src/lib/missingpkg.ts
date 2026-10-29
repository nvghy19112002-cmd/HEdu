// Biên dịch đề báo lỗi vì THIẾU GÓI: đọc nhật ký/chẩn đoán, đoán gói cần (chỉ những lệnh/môi trường đặc trưng, không đoán bừa)
// và thêm gói vào hedu-goithem.tex (tệp gói riêng của bộ đề, hedu.sty tự nạp). Hàm thuần, có kiểm thử.
import type { Diag } from './examcompile';

/** lệnh → gói (lệnh chỉ gói đó định nghĩa) */
const CMD: Record<string, string> = {
  SI: 'siunitx', si: 'siunitx', qty: 'siunitx', unit: 'siunitx', num: 'siunitx', ang: 'siunitx', SIrange: 'siunitx',
  cancel: 'cancel', bcancel: 'cancel', xcancel: 'cancel', cancelto: 'cancel',
  ce: 'mhchem', multirow: 'multirow', toprule: 'booktabs', midrule: 'booktabs', bottomrule: 'booktabs', cmidrule: 'booktabs',
  diagbox: 'diagbox', ding: 'pifont', polylongdiv: 'polynom', polyhornerscheme: 'polynom',
  opadd: 'xlop', opsub: 'xlop', opmul: 'xlop', opdiv: 'xlop', coloneqq: 'mathtools', mathclap: 'mathtools',
  xlongequal: 'extarrows', systeme: 'systeme', tdplotsetmaincoords: 'tikz-3dplot', tkzTabInit: 'tkz-tab', tkzTabLine: 'tkz-tab', tkzTabVar: 'tkz-tab',
  vv: 'esvect', wideparen: 'yhmath', overparen: 'yhmath', columncolor: 'colortbl', rowcolor: 'colortbl', cellcolor: 'colortbl',
  uline: 'ulem', uuline: 'ulem', sout: 'ulem', mathscr: 'mathrsfs', mathbbm: 'bbm',
};
/** môi trường → gói */
const ENV: Record<string, string> = {
  tikzcd: 'tikz-cd', circuitikz: 'circuitikz', tabularx: 'tabularx', longtable: 'longtable', dcases: 'mathtools', 'dcases*': 'mathtools',
  CD: 'amscd', axis: 'pgfplots', multicols: 'multicol', wrapfigure: 'wrapfig', tcolorbox: 'tcolorbox', forest: 'forest',
};

export interface PkgHint { pkg: string; why: string; /** gói đã cài (thiếu khai báo) hay chưa cài trong TeX */ installed: boolean }

/** Gói nên thêm, suy từ chẩn đoán biên dịch + nhật ký thô. Mỗi gói một lần. */
export function missingPackages(diags: readonly Diag[], rawLog = ''): PkgHint[] {
  const out = new Map<string, PkgHint>();
  const add = (pkg: string, why: string, installed = true) => { if (!out.has(pkg)) out.set(pkg, { pkg, why, installed }); };
  const texts = [...diags.map((d) => [d.message, ...d.context].join('\n')), rawLog];
  for (const t of texts) {
    // Undefined control sequence: lệnh cuối cùng ở dòng "l.<số> …"
    if (/Undefined control sequence/.test(t)) {
      for (const m of t.matchAll(/^l\.\d+ .*$/gm)) {
        const cs = [...m[0].matchAll(/\\([A-Za-z]+)/g)].map((x) => x[1]).pop();
        if (cs && CMD[cs]) add(CMD[cs], `lệnh \\${cs}`);
      }
    }
    for (const m of t.matchAll(/Environment ([A-Za-z*]+) undefined/g)) if (ENV[m[1]]) add(ENV[m[1]], `môi trường ${m[1]}`);
    for (const m of t.matchAll(/File `([A-Za-z0-9._-]+)\.sty' not found/g)) add(m[1], `tệp ${m[1]}.sty chưa có trong TeX`, false);
  }
  return [...out.values()];
}

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const line = (p: string) => `\\@ifpackageloaded{${p}}{}{\\usepackage{${p}}}`;

/** Thêm gói vào nội dung hedu-goithem.tex (null = tệp chưa có). Gói đã có trong tệp thì giữ nguyên. */
export function addToGoiThem(text: string | null, pkgs: readonly string[]): { text: string; added: string[] } {
  const want = [...new Set(pkgs.filter((p) => SAFE.test(p)))];
  let t = text ?? '% hedu-goithem.tex — gói riêng mà câu hỏi của bộ đề này cần.\n\\makeatletter\n\\makeatother\n';
  const added = want.filter((p) => !new RegExp(`\\\\usepackage(?:\\[[^\\]]*\\])?\\{${p.replace(/[.]/g, '\\.')}\\}`).test(t));
  if (!added.length) return { text: t, added };
  const block = added.map((p) => `${line(p)} % thêm khi biên dịch báo thiếu`).join('\n') + '\n';
  const k = t.lastIndexOf('\\makeatother');
  t = k >= 0 ? t.slice(0, k) + block + t.slice(k) : `${t.replace(/\n?$/, '\n')}\\makeatletter\n${block}\\makeatother\n`;
  return { text: t, added };
}
