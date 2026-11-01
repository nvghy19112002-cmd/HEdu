import { clearImportHandoff, peekImportHandoff, setImportHandoff } from './importhandoff';
import { buildRows } from './importbatch';
import { scanScratch } from './texscratch';

let fails = 0;
const t = (name: string, ok: boolean) => { if (!ok) { fails++; console.log(`  ✗ ${name}`); } else console.log(`  ✓ ${name}`); };

const draft = '\\noindent Phần I\n\\begin{ex}\nCâu một $x^2$\n\\loigiai{ok}\n\\end{ex}\n\n\\begin{ex}\nCâu hai\n\\end{ex}\n';

setImportHandoff(draft);
t('peek giữ nguyên văn và không xoá', peekImportHandoff() === draft && peekImportHandoff() === draft);
t('số câu bàn nháp = số câu màn Nhập liệu đọc được', scanScratch(draft).blocks.length === 2 && buildRows([{ name: 'x', rel: '', text: peekImportHandoff()! }]).length === 2);
clearImportHandoff();
t('clear xoá', peekImportHandoff() === null);
setImportHandoff('   \n');
t('nội dung trống không được đặt', peekImportHandoff() === null);

if (fails) { console.log(`\n${fails} test lỗi`); process.exit(1); }
console.log('\nOK');
