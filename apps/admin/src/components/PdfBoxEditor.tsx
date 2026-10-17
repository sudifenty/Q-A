import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import { Box, BUCKET, newBox } from '../lib/examTypes';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/* ---------------------------------------------------------------
   Click-to-place answer boxes.

   The admin picks a tool, then drags a rectangle anywhere on the PDF.
   The rectangle is stored as FRACTIONS of the page (0..1) so it lands in
   exactly the same place on a phone as it does here.
--------------------------------------------------------------- */
export default function PdfBoxEditor({ path, boxes, onChange }: {
  path: string; boxes: Box[]; onChange: (b: Box[]) => void;
}) {
  const [mode, setMode] = useState<'text' | 'mcq' | 'delete'>('text');
  const [pages, setPages] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ page: number; x0: number; y0: number; x1: number; y1: number } | null>(null);
  const doc = useRef<any>(null);

  /* 1 — open the PDF (private bucket: the owner's session signs the URL) */
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setErr(null); setPages(0);
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) throw new Error(error?.message || 'cannot open the PDF');
        const d = await pdfjs.getDocument({ url: data.signedUrl }).promise;
        if (cancel) return;
        doc.current = d;
        setPages(d.numPages);
      } catch (e: any) {
        if (!cancel) setErr(`PDF preview failed: ${e?.message || e}. The exam still saves — boxes can be placed once the bucket exists.`);
      }
    })();
    return () => { cancel = true; };
  }, [path]);

  /* 2 — paint the pages once the canvases are in the DOM */
  useEffect(() => {
    if (!pages || !doc.current) return;
    let cancel = false;
    (async () => {
      for (let p = 1; p <= pages; p++) {
        const canvas = document.getElementById(`pdfpage${p}`) as HTMLCanvasElement | null;
        if (!canvas) continue;
        try {
          const page = await doc.current.getPage(p);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(1.5, 760 / base.width) });
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = '100%'; canvas.style.display = 'block';
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        } catch { /* one bad page must not kill the editor */ }
        if (cancel) return;
      }
    })();
    return () => { cancel = true; };
  }, [pages]);

  const rel = (e: React.PointerEvent, page: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return {
      page,
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    };
  };

  const down = (e: React.PointerEvent, page: number) => {
    if (mode === 'delete') return;
    const p = rel(e, page);
    setDrag({ page, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const move = (e: React.PointerEvent, page: number) => {
    if (!drag || drag.page !== page) return;
    const p = rel(e, page);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };
  const up = () => {
    if (!drag || mode === 'delete') { setDrag(null); return; }   /* delete mode never draws */
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    let w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    if (w < 0.04 || h < 0.012) { w = Math.max(w, 0.34); h = Math.max(h, 0.045); }  // a tap places a default box
    const n = boxes.filter(b => b.page === drag.page).length + 1;
    onChange([...boxes, newBox(drag.page, x, y, Math.min(w, 1 - x), Math.min(h, 1 - y), mode, n)]);
    setDrag(null);
  };

  const drop = (id: string) => onChange(boxes.filter(b => b.id !== id));
  const patch = (id: string, p: Partial<Box>) => onChange(boxes.map(b => b.id === id ? { ...b, ...p } : b));
  const dragRect = drag ? {
    left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`,
    width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%`
  } : null;

  const Tool = ({ id, label }: { id: typeof mode; label: string }) => (
    <button onClick={() => setMode(id)}
      className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${mode === id ? 'bg-brand-600 text-white border-brand-600' : 'bg-surface-raised text-surface-muted border-surface-line'}`}>
      {label}
    </button>
  );

  return (
    <div className="grid lg:grid-cols-[1fr,300px] gap-3">
      <div>
        <div className="flex gap-2 items-center mb-2 flex-wrap">
          <Tool id="text" label="+ text answer box" />
          <Tool id="mcq" label="+ multiple-choice box" />
          <Tool id="delete" label="click a box to delete" />
          <span className="text-xs text-surface-faint ml-auto">drag a rectangle where the answer goes</span>
        </div>
        {err && <div className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-2">{err}</div>}
        <div className="space-y-3 bg-surface-sunken p-2 rounded-xl">
          {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
            <div key={p} className="relative bg-surface-raised shadow" style={{ touchAction: 'none' }}
              onPointerDown={e => down(e, p)} onPointerMove={e => move(e, p)} onPointerUp={up} onPointerLeave={up}>
              <canvas id={`pdfpage${p}`} />
              {boxes.filter(b => b.page === p).map(b => (
                <div key={b.id}
                  onClick={e => { if (mode === 'delete') { e.stopPropagation(); drop(b.id); } }}
                  className={`absolute border-2 text-[10px] leading-tight overflow-hidden ${mode === 'delete' ? 'border-red-500 bg-red-100/70 cursor-pointer' : b.type === 'mcq' ? 'border-brand-500 bg-brand-100/40 dark:bg-brand-900/30' : 'border-emerald-500 bg-emerald-100/40'}`}
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}>
                  <span className="px-1 font-bold">Q{b.n} · {b.marks}mk</span>
                </div>
              ))}
              {drag && drag.page === p && dragRect &&
                <div className="absolute border-2 border-dashed border-surface-line bg-surface-sunken" style={dragRect} />}
              <span className="absolute right-1 bottom-1 text-[10px] text-surface-faint">page {p}</span>
            </div>
          ))}
          {!pages && !err && <div className="text-sm text-surface-muted p-6 text-center">opening the PDF…</div>}
        </div>
      </div>

      <div className="space-y-2">
        <b className="text-sm">{boxes.length} answer box{boxes.length === 1 ? '' : 'es'}</b>
        {boxes.map(b => (
          <div key={b.id} className="border rounded-xl p-2 space-y-1 bg-surface-sunken">
            <div className="flex items-center gap-2 text-xs">
              <b>Q{b.n}</b>
              <span className="text-surface-faint">page {b.page}</span>
              <span className={b.type === 'mcq' ? 'text-brand-600 dark:text-brand-300' : 'text-emerald-600'}>{b.type === 'mcq' ? 'multiple choice' : 'written'}</span>
              <button onClick={() => drop(b.id)} className="ml-auto text-red-500">delete</button>
            </div>
            <input className="input text-xs" placeholder="Prompt beside the box (optional)"
              value={b.label || ''} onChange={e => patch(b.id, { label: e.target.value })} />
            <label className="text-xs text-surface-muted">marks
              <input type="number" min={1} className="w-14 ml-1 border rounded px-1"
                value={b.marks} onChange={e => patch(b.id, { marks: Number(e.target.value) })} />
            </label>
            {b.type === 'mcq' && ['A', 'B', 'C', 'D'].map((L, k) => (
              <div key={L} className="flex items-center gap-1">
                <input type="radio" name={b.id} checked={b.answer === L} onChange={() => patch(b.id, { answer: L })} />
                <span className="text-[10px] w-3">{L}</span>
                <input className="input text-xs" value={b.options?.[k] || ''}
                  onChange={e => patch(b.id, { options: (b.options || ['', '', '', '']).map((x, j) => j === k ? e.target.value : x) })} />
              </div>
            ))}
          </div>
        ))}
        {!boxes.length && <p className="text-xs text-surface-faint">No boxes yet — drag on the PDF.</p>}
      </div>
    </div>
  );
}
