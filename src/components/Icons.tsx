// Biểu tượng nét mảnh, vẽ bằng SVG (không dùng emoji).
type P = { size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true });

export const IcEdit = ({ size = 22 }: P) => <svg {...base(size)}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>;
export const IcBank = ({ size = 22 }: P) => <svg {...base(size)}><path d="M4 5h4v14H4zM10 5h4v14h-4z" /><path d="M16 6.5l3.5-1 3 13-3.5 1z" /></svg>;
export const IcLibrary = ({ size = 22 }: P) => <svg {...base(size)}><path d="M4 5h5v14H4zM11 5h5v14h-5zM18.5 6l2.5 13" /></svg>;
export const IcExam = ({ size = 22 }: P) => <svg {...base(size)}><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5M9.5 13h6M9.5 17h6" /></svg>;
export const IcImport = ({ size = 22 }: P) => <svg {...base(size)}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>;
export const IcTex = ({ size = 22 }: P) => <svg {...base(size)}><path d="M8 5c-2 0-3 1-3 3v2.5c0 1-.6 1.5-1.5 1.5.9 0 1.5.5 1.5 1.5V16c0 2 1 3 3 3M16 5c2 0 3 1 3 3v2.5c0 1 .6 1.5 1.5 1.5-.9 0-1.5.5-1.5 1.5V16c0 2-1 3-3 3" /><path d="M10 9.5l4 5M14 9.5l-4 5" /></svg>;
export const IcTree = ({ size = 22 }: P) => <svg {...base(size)}><path d="M6 4v16M6 8h7M6 15h7" /><path d="M13 6h6v4h-6zM13 13h6v4h-6z" /></svg>;
export const IcBackup = ({ size = 22 }: P) => <svg {...base(size)}><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z" /><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
export const IcSearch = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;
export const IcCopy = ({ size = 18 }: P) => <svg {...base(size)}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>;
export const IcMore = ({ size = 18 }: P) => <svg {...base(size)}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></svg>;
export const IcTrash = ({ size = 18 }: P) => <svg {...base(size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IcCheck = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2.25}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IcCheckCircle = ({ size = 22 }: P) => <svg {...base(size)} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>;
export const IcAlert = ({ size = 22 }: P) => <svg {...base(size)} strokeWidth={2}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.5" /></svg>;
export const IcPlus = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>;
export const IcX = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IcLock = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
export const IcUnlock = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></svg>;
export const IcSwap = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" /></svg>;
export const IcDice = ({ size = 16 }: P) => <svg {...base(size)} strokeWidth={2}><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.2" fill="currentColor" /><circle cx="15" cy="15" r="1.2" fill="currentColor" /><circle cx="15" cy="9" r="1.2" fill="currentColor" /><circle cx="9" cy="15" r="1.2" fill="currentColor" /></svg>;
