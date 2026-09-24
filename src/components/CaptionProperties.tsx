import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LockKeyhole, Search, X } from 'lucide-react';
import { timecode, type Clip, type Project } from '../../shared/model';

type Props = { project: Project; clip: Clip; active: boolean; onSelect: (clip: Clip) => void };

export default function CaptionProperties({ project, clip, active, onSelect }: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const clips = useMemo(() => project.clips.filter(c => c.kind === 'text').sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), [project.clips]);
  const filtered = useMemo(() => { const term = query.toLocaleLowerCase(); return clips.filter(c => c.text.toLocaleLowerCase().includes(term)); }, [clips, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50)), currentPage = Math.min(page, pageCount - 1);
  // Selecting a distant timeline caption reveals its page without rendering thousands of rows.
  useEffect(() => {
    const index = filtered.findIndex(c => c.id === clip.id);
    if (index >= 0) setPage(Math.floor(index / 50));
    else { setQuery(''); setPage(Math.max(0, Math.floor(clips.findIndex(c => c.id === clip.id) / 50))); }
  }, [clip.id]);
  useLayoutEffect(() => {
    const container = list.current; if (!container || !active) return;
    container.scrollTop = 0;
    const selected = container.querySelector('[aria-pressed="true"]');
    if (selected) { const row = selected.getBoundingClientRect(), viewport = container.getBoundingClientRect(); if (row.bottom > viewport.bottom) container.scrollTop += row.bottom - viewport.bottom; }
  }, [clip.id, currentPage, query, active]);
  return <div className="caption-properties" hidden={!active}>
    <section className="property-section caption-list-section"><h4>全部文字與字幕 <span>{clips.length} 則</span></h4>
      <div className="search-box"><Search size={14}/><input aria-label="搜尋字幕內容" placeholder="搜尋字幕內容" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/>{query && <button aria-label="清除字幕搜尋" data-tooltip="清除字幕搜尋" onClick={() => { setQuery(''); setPage(Math.max(0, Math.floor(clips.findIndex(c => c.id === clip.id) / 50))); }}><X size={13}/></button>}</div>
      <div ref={list} className="caption-property-list" role="list" aria-label="專案字幕清單">{filtered.slice(currentPage * 50, (currentPage + 1) * 50).map(c => {
        const locked = project.tracks.find(t => t.id === c.trackId)?.locked;
        return <div role="listitem" key={c.id}><button className={c.id === clip.id ? 'selected' : ''} aria-pressed={c.id === clip.id} disabled={locked} data-tooltip={locked ? '此字幕的軌道已鎖定' : c.text.trim().length > 160 ? c.text.trim().slice(0,160)+'…' : c.text.trim() || '空白文字'} onClick={() => onSelect(c)}>
          <small>{timecode(c.start, project.fps)} → {timecode(c.start + c.duration, project.fps)}{locked && <LockKeyhole size={11}/>}</small><span>{c.text.trim() || '空白文字'}</span>
        </button></div>;
      })}{!filtered.length && <p className="field-note">找不到符合的字幕</p>}</div>
      {pageCount > 1 && <div className="caption-list-pages"><button aria-label="上一頁字幕" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一頁</button><span>{currentPage + 1} / {pageCount}</span><button aria-label="下一頁字幕" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>下一頁</button></div>}
    </section>
  </div>;
}
