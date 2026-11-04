// Ảnh thu nhỏ của một hình trong Kho hình: chỉ dịch khi thẻ vào vùng nhìn thấy, tối đa 2 hình dịch cùng lúc,
// cuộn ra khỏi màn hình trước khi tới lượt thì huỷ. Kết quả dịch được nhớ trên đĩa bởi tikz_render (không dịch lại lần sau).
import { useEffect, useRef, useState } from 'react';
import { CancelledError, Limiter } from '../lib/limiter';
import { nextSvgPrefix, scopeSvgIds } from '../lib/svgids';
import { asTikzErr, renderTikz } from '../lib/tikz';

const limiter = new Limiter(2);

export interface ThumbResult { id: string; ok: boolean; err: string }

type St = { s: 'cho' } | { s: 'dang' } | { s: 'xong'; svg: string } | { s: 'loi'; msg: string };

export function KhoThumb({ id, code, defs, onResult, big, again }: { id: string; code: string; defs: string; onResult?(r: ThumbResult): void; big?: boolean; /** đổi số này để dịch lại */ again?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<St>({ s: 'cho' });
  const prefix = useRef(nextSvgPrefix());
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    let job: { cancel(): void } | null = null;
    const start = () => {
      if (job) return;
      setSt((s) => (s.s === 'xong' ? s : { s: 'dang' }));
      const j = limiter.add(() => renderTikz(code, defs));
      job = j;
      j.promise
        .then((r) => { if (!alive) return; setSt({ s: 'xong', svg: r.svg }); cb.current?.({ id, ok: true, err: '' }); })
        .catch((e) => {
          if (job === j) job = null;
          if (!alive || e instanceof CancelledError) return;
          const er = asTikzErr(e);
          if (er.stage === 'huy') { setSt({ s: 'cho' }); return; } // bị dừng theo lệnh: không phải hình lỗi, dịch lại khi cuộn tới
          setSt({ s: 'loi', msg: er.message });
          cb.current?.({ id, ok: false, err: er.message });
        });
    };
    const stop = () => {
      if (!job) return;
      job.cancel(); // việc đang chạy thì chạy nốt (huỷ chỉ bỏ việc còn chờ)
      job = null;
      setSt((s) => (s.s === 'dang' ? { s: 'cho' } : s));
    };
    // trình duyệt không có IntersectionObserver (thử nghiệm) thì dịch ngay
    if (typeof IntersectionObserver === 'undefined') { start(); return () => { alive = false; stop(); }; }
    const io = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) start(); else stop(); } }, { rootMargin: '300px' });
    io.observe(el);
    return () => { alive = false; io.disconnect(); stop(); };
  }, [id, code, defs, again]);

  return (
    <div ref={host} className={`kh-thumb${big ? ' big' : ''}`} role="img" aria-label="Hình vẽ TikZ">
      {st.s === 'xong'
        ? <span className="kh-svg" dangerouslySetInnerHTML={{ __html: scopeSvgIds(st.svg, prefix.current) }} />
        : st.s === 'loi'
          ? <span className="kh-thumb-err" title={st.msg}>Không dịch được{big ? `: ${st.msg}` : ''}</span>
          : <span className="kh-thumb-wait">{st.s === 'dang' ? 'Đang vẽ…' : ''}</span>}
    </div>
  );
}
