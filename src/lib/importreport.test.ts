import { _setLogBackend, addToLog, appendLog, buildReport, clearLog, csvCell, LOG_MAX, LOG_ROWS_MAX, loadLog, parseLog, reportCsv, reportFileBase, reportMd, stringifyLog, toLogEntry, type ReportRow } from './importreport';
let fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const row = (o: Partial<ReportRow>): ReportRow => ({ file: 'de1.tex', rel: 'Lop12', line: 1, decision: 'import', reason: 'Mới', idState: 'ok', idPlace: 'dung-ma', preview: '', tex: '', uid: 'u1', seq: 1, ...o });
const rows: ReportRow[] = [
  row({}),
  row({ line: 20, idState: 'thieu-dang', idPlace: 'dang-dau', uid: 'u2', seq: 2 }),
  row({ file: 'de2.tex', rel: 'Lop12/Hàm số', line: 5, idState: 'khong-co', idPlace: 'vi-tri-chung', preview: 'canh', uid: 'u3', seq: 3 }),
  row({ file: 'de2.tex', rel: 'Lop12/Hàm số', line: 30, decision: 'skip-dup', reason: 'Trùng chắc với câu 12', idPlace: undefined, uid: undefined, seq: undefined }),
  row({ file: 'de2.tex', rel: 'Lop12/Hàm số', line: 40, decision: 'skip-user', reason: 'Bạn chọn bỏ', idState: 'khong-hop-le', idPlace: undefined, uid: undefined, seq: undefined, tex: 'loi' }),
];

console.log('Tổng hợp');
{
  const r = buildReport({ at: new Date(2026, 9, 25, 9, 30).getTime(), name: 'Đề thi thử', paste: false, restorePoint: true, rows });
  ok(r.found === 5 && r.imported === 3 && r.skippedDup === 1 && r.skippedUser === 1, 'đếm tìm thấy / đã nhập / bỏ qua theo từng loại');
  ok(r.ids.ok === 1 && r.ids.firstForm === 1 && r.ids.general === 1 && r.ids.ai === 0, 'thống kê vị trí chỉ tính câu đã nhập');
  ok(r.files.length === 2 && r.files[0].found === 2 && r.files[0].imported === 2 && r.files[1].found === 3 && r.files[1].skipped === 2, 'bảng theo tệp (cùng tên khác thư mục không gộp nhầm)');
  ok(r.previewWarnings === 1 && r.previewErrors === 0 && r.texChecked === 1 && r.texFailed === 1, 'đếm lỗi xem trước và TeX');
  ok(reportFileBase(r.at) === 'bao-cao-nhap-20261025-0930', 'tên tệp báo cáo');
  const same = buildReport({ at: 0, name: '', paste: false, restorePoint: false, rows: [row({ file: 'a.tex', rel: 'x' }), row({ file: 'a.tex', rel: 'y' })] });
  ok(same.files.length === 2, 'hai tệp trùng tên ở hai thư mục là hai dòng');
}

console.log('Kiểm chứng ID (PR 1B)');
{
  const vr: ReportRow[] = [
    row({ idPlace: 'ma-khop' }),
    row({ idPlace: 'ma-chua-kiem-chung', uid: 'u2', seq: 2 }),
    row({ idPlace: 'ma-giu-tay', uid: 'u3', seq: 3 }),
    row({ idPlace: 'dung-ma', uid: 'u4', seq: 4 }),
    row({ idPlace: 'ai', uid: 'u5', seq: 5 }),
    row({ decision: 'skip-user', idPlace: 'ma-chua-kiem-chung', uid: undefined, seq: undefined }),
  ];
  const r = buildReport({ at: 1, name: 'V', paste: false, restorePoint: false, rows: vr });
  ok(r.ids.ok === 4 && r.ids.ai === 1 && r.ids.unverified === 1 && r.ids.kept === 1, 'câu theo mã ID: khớp, chưa kiểm chứng, giữ tay, mã cũ đều tính vào "theo mã"; riêng chưa kiểm chứng / giữ tay được đếm; câu bỏ qua không tính');
  ok(reportMd(r).includes('chưa kiểm chứng: 1') && reportMd(r).includes('bạn giữ ID: 1'), 'bản tóm tắt .md ghi số câu chưa kiểm chứng và giữ ID');
  const old = { ...r, ids: { ok: 3, firstForm: 0, ai: 0, general: 0 } };
  ok(reportMd(old).includes('Theo mã ID đủ: 3') && !reportMd(old).includes('chưa kiểm chứng'), 'nhật ký cũ (không có trường mới) vẫn đọc và hiện bình thường');
}

console.log('CSV / Markdown');
{
  const r = buildReport({ at: 1, name: 'L', paste: false, restorePoint: false, rows: [row({ file: '=cmd.tex', reason: 'có "nháy", phẩy' })] });
  const csv = reportCsv(r);
  ok(csv.startsWith('﻿"Tệp"') && csv.includes('\r\n'), 'CSV có BOM UTF-8 và xuống dòng Windows');
  ok(csv.includes('"\'=cmd.tex"'), 'ô bắt đầu bằng = bị vô hiệu hoá (chống công thức Excel)');
  ok(csv.includes('"có ""nháy"", phẩy"'), 'nháy kép và dấu phẩy được bọc đúng');
  ok(csvCell(undefined) === '""' && csvCell(7) === '"7"', 'ô rỗng / số');
  const full = reportCsv(buildReport({ at: 1, name: 'L', paste: false, restorePoint: false, rows }));
  ok(full.trim().split('\r\n').length === 6, 'một dòng tiêu đề + mỗi câu một dòng');
  ok(!/begin\{ex\}|Câu số/.test(full) && !/begin\{ex\}/.test(reportMd(r)), 'không chứa nội dung câu hỏi');
  const md = reportMd(buildReport({ at: 1, name: 'Đề thi thử', paste: false, restorePoint: true, rows }));
  ok(md.includes('# Báo cáo nhập: Đề thi thử') && md.includes('Đã nhập: 3 câu') && md.includes('Vào vị trí chung (cần xếp lại sau): 1') && md.includes('Lop12/Hàm số/de2.tex'), 'Markdown có tổng quát, vị trí chung và bảng theo tệp');
}

console.log('Nhật ký nhập');
{
  const mk = (n: number) => buildReport({ at: n, name: `L${n}`, paste: true, restorePoint: false, rows: [row({})] });
  let list = addToLog([], mk(1));
  ok(list.length === 1 && list[0].rows.length === 0, 'câu bình thường không lưu lại trong nhật ký (chỉ giữ dòng có vấn đề)');
  for (let i = 2; i <= LOG_MAX + 5; i++) list = addToLog(list, mk(i));
  ok(list.length === LOG_MAX && list[0].at === LOG_MAX + 5, `chỉ giữ ${LOG_MAX} báo cáo gần nhất, mới nhất ở đầu`);
  const many = buildReport({ at: 9, name: 'nhiều', paste: false, restorePoint: false, rows: Array.from({ length: LOG_ROWS_MAX + 50 }, (_, i) => row({ line: i, decision: 'skip-dup', uid: undefined })) });
  const e = toLogEntry(many);
  ok(e.rows.length === LOG_ROWS_MAX && e.rowsTruncated === 50, 'dòng có vấn đề bị cắt ở mức tối đa và ghi rõ số dòng bị cắt');
  ok(parseLog(stringifyLog(list)).length === LOG_MAX, 'ghi rồi đọc lại giữ nguyên');
  ok(parseLog('không phải json').length === 0 && parseLog('{"v":2,"list":[]}').length === 0 && parseLog(null).length === 0, 'dữ liệu hỏng / sai phiên bản ⇒ nhật ký rỗng, không lỗi');

  let store: string | null = null;
  _setLogBackend({ async load() { return store; }, async save(j) { store = j; } });
  ok(await appendLog(mk(1)) && (await loadLog()).length === 1, 'appendLog ghi qua backend');
  await appendLog(mk(2));
  ok((await loadLog())[0].at === 2, 'báo cáo mới lên đầu');
  ok(await clearLog() && (await loadLog()).length === 0, 'xoá nhật ký');
  _setLogBackend({ async load() { return null; }, async save() { throw new Error('đĩa đầy'); } });
  ok((await appendLog(mk(3))) === false, 'lỗi ghi nhật ký ⇒ trả false, không ném lỗi (không làm hỏng việc nhập)');
  _setLogBackend(null);
}

if (fail) { console.error(`\n${fail} lỗi`); process.exit(1); }
console.log('\nimportreport: đạt hết.');
