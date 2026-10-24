import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App';
import { StorageUpgrade } from './components/StorageUpgrade';
import { isDesktop } from './lib/platform';
import { detectStorage } from './lib/storage';
import { initStore } from './lib/store';

// Chọn nơi lưu (SQLite / JSON cũ), hỏi nâng cấp nếu cần, đọc dữ liệu đã lưu, rồi mới vẽ giao diện.
async function start() {
  const root = createRoot(document.getElementById('root')!);
  if (isDesktop()) {
    const d = await detectStorage();
    if (d.kind === 'legacy') await new Promise<void>((done) => root.render(<StorageUpgrade onDone={done} />));
  }
  const boot = await initStore();
  root.render(<App boot={boot} />);
}
void start();
