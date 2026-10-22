import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import './styles.css';
import { App } from './App';
import { initStore } from './lib/store';

// Đọc dữ liệu đã lưu trước, rồi mới vẽ giao diện.
initStore().then((boot) => {
  createRoot(document.getElementById('root')!).render(<App boot={boot} />);
});
