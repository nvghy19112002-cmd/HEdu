import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, type FileOut, type Nav, type NavGuard, type Screen, useApp } from './app-context';
import { BootGate } from './components/BootGate';
import { CommandPalette } from './components/CommandPalette';
import { ZoomIndicator } from './components/ZoomControl';
import { startZoom } from './lib/zoom';
import { FileDialog } from './components/FileDialog';
import { IcBackup, IcBank, IcEdit, IcImport, IcLibrary } from './components/Icons';
import { isCtxKey, toggleCtx } from './lib/ctxcol';
import { featureOn, type FeatureKey } from './lib/features';
import type { BootResult } from './lib/store';
import { BankScreen } from './screens/Bank';
import { EditorScreen } from './screens/Editor';
import { ExamScreen } from './screens/Exam';
import { ExamLibraryScreen } from './screens/ExamLibrary';
import { KhoHinhScreen } from './screens/KhoHinh';
import { ImportScreen } from './screens/Extra';
import { OcrScreen } from './screens/OcrPdf';
import { TexScratchScreen } from './screens/TexScratch';
import { SlideHost } from './components/SlideShow';
import { SlidesScreen } from './screens/Slides';
import { CurriculumScreen } from './screens/Curriculum';
import { SystemScreen } from './screens/System';
import { TrashScreen } from './screens/Trash';
import { HealthScreen } from './screens/Health';
import { loadDecisions, trashCount, useDecisions } from './lib/dupdecisions';
import { loadIdReview } from './lib/idreview';
import { loadQHistory } from './lib/qhistory';
import { getStorageMode } from './lib/storage';
import { loadTemplates } from './lib/examtemplates';
import { UpdateProvider, useUpdates } from './update-context';
import { dataSig, runAutoBackup } from './lib/autobackup';
import { examList } from './lib/examlib';
import { getState, useBank } from './lib/store';
import { isDesktop } from './lib/platform';

// Điều hướng theo VIỆC của giáo viên (chủ dự án duyệt 26/11/2026): 3 khu + Hệ thống thay cho 12 mục ngang hàng.
// Mỗi khu gồm vài màn sẵn có; dải phân đoạn trên cùng chuyển giữa các màn trong khu. "Soạn thảo" (editor) thuộc khu Ngân hàng.
type KhuScreen = { s: Screen; label: string; feature?: FeatureKey };
type Khu = { id: string; label: string; Icon: typeof IcEdit; screens: KhuScreen[]; also?: Screen[] };
const KHU: Khu[] = [
  { id: 'nganhang', label: 'Ngân hàng', Icon: IcBank, also: ['editor'], screens: [
    { s: 'bank', label: 'Câu hỏi' }, { s: 'khohinh', label: 'Hình TikZ' }, { s: 'health', label: 'Sức khoẻ' }, { s: 'curriculum', label: 'Chương trình' }] },
  { id: 'dua', label: 'Đưa đề vào', Icon: IcImport, screens: [
    { s: 'import', label: 'Nhập tệp & đọc đề' }, { s: 'tex', label: 'Soạn TeX' }] },
  { id: 'dethi', label: 'Đề thi', Icon: IcLibrary, screens: [
    { s: 'examlib', label: 'Thư viện đề' }, { s: 'exam', label: 'Tạo đề', feature: 'exam' }, { s: 'slides', label: 'Trình chiếu' }] },
];
const KHU_SYS: Khu = { id: 'hethong', label: 'Hệ thống', Icon: IcBackup, screens: [{ s: 'system', label: 'Cài đặt' }, { s: 'trash', label: 'Thùng rác' }] };
const ALL_KHU = [...KHU, KHU_SYS];
const khuOf = (s: Screen) => ALL_KHU.find((k) => k.screens.some((x) => x.s === s) || k.also?.includes(s)) ?? KHU[0];
const LAST_KEY = 'hedu.khu.last.v1';
const loadLast = (): Record<string, Screen> => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') ?? {}; } catch { return {}; } };

export function App({ boot }: { boot: BootResult }) {
  if (!boot.ok) return <BootGate boot={boot} />;
  return <Shell recovered={boot.recovered} />;
}

function Shell({ recovered }: { recovered: boolean }) {
  const [nav, setNav] = useState<Nav>({ screen: 'bank' });
  const [msg, setMsg] = useState<{ text: string; action?: { label: string; run(): void } } | null>(null);
  const [palette, setPalette] = useState(false);
  const [file, setFile] = useState<FileOut | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string, action?: { label: string; run(): void }) => {
    setMsg({ text: m, action });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), action ? 8000 : 4200);
  }, []);
  const guard = useRef<NavGuard | null>(null);
  const setGuard = useCallback((g: NavGuard | null) => { guard.current = g; }, []);
  const go = useCallback((n: Nav) => {
    // còn thay đổi chưa lưu thì hỏi trước; đồng ý mới đi tiếp
    if (guard.current && !guard.current(() => { guard.current = null; go(n); })) return;
    // Lối vào sót lại tới một màn đang tắt thì về Ngân hàng, không mở tính năng đã tắt.
    if (n.screen === 'exam' && !featureOn('exam')) {
      setNav({ screen: 'bank' });
      toast('Tạo đề đang tạm ngưng trong bản này.');
      window.scrollTo(0, 0);
      return;
    }
    setNav(n);
    window.scrollTo(0, 0);
  }, [toast]);
  const api = useMemo(() => ({ nav, go, toast, openPalette: () => setPalette(true), setGuard, showFile: setFile }), [nav, go, toast, setGuard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // trình soạn LaTeX dùng Ctrl+K để xoá dòng (như TeXstudio) và đã chặn sự kiện thì không mở bảng lệnh
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.defaultPrevented) { e.preventDefault(); setPalette((p) => !p); }
      // Ctrl+B: ẩn/hiện cột ngữ cảnh (Mục lục…); không bắt khi đang gõ trong ô nhập/trình soạn
      if (!e.defaultPrevented && isCtxKey(e, e.target as HTMLElement | null)) { e.preventDefault(); toggleCtx(); }
    };
    const onSaveErr = () => toast('Không ghi được dữ liệu xuống đĩa. Hãy tạo file sao lưu và kiểm tra ổ đĩa.');
    window.addEventListener('keydown', onKey);
    window.addEventListener('hedu-save-error', onSaveErr);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hedu-save-error', onSaveErr); };
  }, [toast]);

  useEffect(() => startZoom(), []);
  // nạp tệp phụ (quyết định trùng, thùng rác) ngay khi mở app để sao lưu luôn đầy đủ
  useEffect(() => { void loadDecisions(); void loadIdReview(); void loadTemplates(); void loadQHistory(isDesktop() ? (getStorageMode() === 'sqlite' ? 'sqlite' : 'none') : 'web'); }, []);
  // sao lưu tự động theo lịch (nếu đến hạn và dữ liệu đã đổi); chỉ bản cài Windows, trễ để không tranh việc lúc mở app
  useEffect(() => {
    if (!isDesktop()) return;
    const t = window.setTimeout(() => {
      void (async () => {
        const st = getState();
        const sig = dataSig({ count: st.questions.length, maxUpdated: st.questions.reduce((m, q) => Math.max(m, q.updatedAt), 0) }, await examList().catch(() => []));
        const r = await runAutoBackup(sig, Date.now());
        if (r.ran && r.message) toast(r.message);
      })();
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (recovered) toast('File dữ liệu bị lỗi nên HEdu đã lấy lại từ bản dự phòng. Nên kiểm tra các câu vừa soạn gần đây.');
  }, [recovered, toast]);

  const onFound = useCallback((u: { version: string }) => toast(`Có bản mới v${u.version}. Vào mục Cài đặt để cập nhật.`), [toast]);

  return (
    <AppCtx.Provider value={api}>
      <UpdateProvider onFound={onFound}>
        <Frame screen={nav.screen} nav={nav} />
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
        <SlideHost />
        {file && <FileDialog file={file} onClose={() => setFile(null)} onToast={toast} />}
        {msg && <div className="toast" role="status">{msg.text}{msg.action && <button type="button" className="toast-act" onClick={() => { const a = msg.action; setMsg(null); a?.run(); }}>{msg.action.label}</button>}</div>}
        <ZoomIndicator />
      </UpdateProvider>
    </AppCtx.Provider>
  );
}

function Frame({ screen, nav }: { screen: Screen; nav: Nav }) {
  const { go } = useApp();
  const { available } = useUpdates();
  useDecisions(); // theo dõi để số câu trong Thùng rác (badge) luôn đúng; tệp phụ được đọc ở Shell lúc mở app
  const trashN = trashCount();
  const { questions } = useBank();
  const khu = khuOf(screen);
  const shown = khu.screens.filter((x) => !x.feature || featureOn(x.feature));
  // nhớ màn cuối cùng của mỗi khu: bấm lại khu thì về đúng chỗ đang làm dở
  useEffect(() => { const m = loadLast(); if (m[khu.id] !== screen && khu.screens.some((x) => x.s === screen)) { m[khu.id] = screen; try { localStorage.setItem(LAST_KEY, JSON.stringify(m)); } catch { /* tiện lợi */ } } }, [khu, screen]);
  const openKhu = (k: Khu) => {
    const last = loadLast()[k.id];
    const ok = (s?: Screen) => !!s && k.screens.some((x) => x.s === s && (!x.feature || featureOn(x.feature)));
    go({ screen: ok(last) ? last! : k.screens[0].s });
  };
  return (
    <div className="app">
      <nav className="rail" aria-label="Điều hướng chính">
        <div className="logo" aria-label="HEdu">√</div>
        {KHU.map((k) => <RailBtn key={k.id} k={k} on={khu.id === k.id} go={openKhu} />)}
        <div className="rail-spacer" />
        <RailBtn k={KHU_SYS} on={khu.id === KHU_SYS.id} go={openKhu} dot={!!available} badge={trashN} />
        <div className="rail-store" title="Số câu trong kho đang mở"><i />Kho<b>{questions.length.toLocaleString('vi-VN')}</b>câu</div>
      </nav>
      <main className="main">
        {shown.length > 1 && (
          <div className="khu-bar">
            <span className="khu-name">{khu.label}</span>
            <div className="seg" role="tablist" aria-label={khu.label}>
              {shown.map((x) => (
                <button key={x.s} type="button" role="tab" aria-current={screen === x.s ? 'page' : undefined} aria-selected={screen === x.s} onClick={() => go({ screen: x.s })}>
                  {x.label}{x.s === 'trash' && trashN > 0 && <span className="seg-n">{trashN > 999 ? '999+' : trashN}</span>}{x.s === 'system' && available && <span className="dot" role="img" aria-label={`Có bản mới v${available.version}`} />}
                </button>
              ))}
            </div>
          </div>
        )}
        {screen === 'editor' && <EditorScreen key={nav.editUid ?? `new:${nav.newAt ? JSON.stringify(nav.newAt) : ''}`} editUid={nav.editUid} newAt={nav.newAt} fromBank={nav.fromBank} />}
        {screen === 'bank' && <BankScreen />}
        {screen === 'exam' && featureOn('exam') && <ExamScreen pick={nav.examPick} />}
        {screen === 'import' && <ImportScreen />}
        {screen === 'ocr' && <OcrScreen />}
        {screen === 'tex' && <TexScratchScreen />}
        {screen === 'examlib' && <ExamLibraryScreen />}
        {screen === 'curriculum' && <CurriculumScreen />}
        {screen === 'khohinh' && <KhoHinhScreen />}
        {screen === 'trash' && <TrashScreen />}
        {screen === 'health' && <HealthScreen />}
        {screen === 'system' && <SystemScreen />}
        {screen === 'slides' && <SlidesScreen />}
      </main>
    </div>
  );
}

function RailBtn({ k, on, go, dot, badge }: { k: Khu; on: boolean; go: (k: Khu) => void; dot?: boolean; badge?: number }) {
  const { Icon } = k;
  return (
    <button type="button" className="rb" title={k.screens.map((x) => x.label).join(' · ')} aria-current={on ? 'page' : undefined} onClick={() => go(k)}>
      <span className="rb-ico"><Icon />{dot && <span className="dot" role="img" aria-label="Có bản mới" />}{!!badge && !dot && <span className="rb-count" aria-hidden="true">{badge > 999 ? '999+' : badge}</span>}</span>
      <span>{k.label}</span>
    </button>
  );
}
