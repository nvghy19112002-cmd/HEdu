import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppCtx, type FileOut, type Nav, type NavGuard, type Screen, useApp } from './app-context';
import { BootGate } from './components/BootGate';
import { CommandPalette } from './components/CommandPalette';
import { FileDialog } from './components/FileDialog';
import { IcBackup, IcBank, IcEdit, IcExam, IcImport, IcTree } from './components/Icons';
import { featureOn, type FeatureKey } from './lib/features';
import type { BootResult } from './lib/store';
import { BankScreen } from './screens/Bank';
import { EditorScreen } from './screens/Editor';
import { ExamScreen } from './screens/Exam';
import { ImportScreen } from './screens/Extra';
import { CurriculumScreen } from './screens/Curriculum';
import { SystemScreen } from './screens/System';
import { UpdateProvider, useUpdates } from './update-context';

// "Soạn thảo" không nằm ở thanh bên: nó mở ra khi bấm "+ Câu hỏi mới" hoặc sửa một câu.
const NAV: { s: Screen; label: string; Icon: typeof IcEdit; feature?: FeatureKey }[] = [
  { s: 'bank', label: 'Ngân hàng', Icon: IcBank },
  { s: 'exam', label: 'Tạo đề', Icon: IcExam, feature: 'exam' },
  { s: 'import', label: 'Nhập liệu', Icon: IcImport },
  { s: 'curriculum', label: 'Khung CT', Icon: IcTree },
];

export function App({ boot }: { boot: BootResult }) {
  if (!boot.ok) return <BootGate boot={boot} />;
  return <Shell recovered={boot.recovered} />;
}

function Shell({ recovered }: { recovered: boolean }) {
  const [nav, setNav] = useState<Nav>({ screen: 'bank' });
  const [msg, setMsg] = useState<string | null>(null);
  const [palette, setPalette] = useState(false);
  const [file, setFile] = useState<FileOut | null>(null);
  const timer = useRef<number>();

  const toast = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 4200);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
    };
    const onSaveErr = () => toast('Không ghi được dữ liệu xuống đĩa. Hãy tạo file sao lưu và kiểm tra ổ đĩa.');
    window.addEventListener('keydown', onKey);
    window.addEventListener('hedu-save-error', onSaveErr);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('hedu-save-error', onSaveErr); };
  }, [toast]);

  useEffect(() => {
    if (recovered) toast('File dữ liệu bị lỗi nên HEdu đã lấy lại từ bản dự phòng. Nên kiểm tra các câu vừa soạn gần đây.');
  }, [recovered, toast]);

  const onFound = useCallback((u: { version: string }) => toast(`Có bản mới v${u.version}. Vào mục Hệ thống để cập nhật.`), [toast]);

  return (
    <AppCtx.Provider value={api}>
      <UpdateProvider onFound={onFound}>
        <Frame screen={nav.screen} nav={nav} />
        {palette && <CommandPalette onClose={() => setPalette(false)} />}
        {file && <FileDialog file={file} onClose={() => setFile(null)} onToast={toast} />}
        {msg && <div className="toast" role="status">{msg}</div>}
      </UpdateProvider>
    </AppCtx.Provider>
  );
}

function Frame({ screen, nav }: { screen: Screen; nav: Nav }) {
  const { go } = useApp();
  const { available } = useUpdates();
  return (
    <div className="app">
      <nav className="rail" aria-label="Điều hướng chính">
        <div className="logo" aria-label="HEdu">√</div>
        {NAV.filter((n) => !n.feature || featureOn(n.feature)).map(({ s, label, Icon }) => (
          <button key={s} type="button" className="rb" aria-current={screen === s ? 'page' : undefined} onClick={() => go({ screen: s })}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
        <div className="rail-spacer" />
        <button type="button" className="rb" aria-current={screen === 'system' ? 'page' : undefined} onClick={() => go({ screen: 'system' })}>
          <span className="rb-ico"><IcBackup />{available && <span className="dot" role="img" aria-label={`Có bản mới v${available.version}`} />}</span>
          <span>Hệ thống</span>
        </button>
      </nav>
      <main className="main">
        {screen === 'editor' && <EditorScreen key={nav.editUid ?? 'new'} editUid={nav.editUid} />}
        {screen === 'bank' && <BankScreen />}
        {screen === 'exam' && featureOn('exam') && <ExamScreen pick={nav.examPick} />}
        {screen === 'import' && <ImportScreen />}
        {screen === 'curriculum' && <CurriculumScreen />}
        {screen === 'system' && <SystemScreen />}
      </main>
    </div>
  );
}
