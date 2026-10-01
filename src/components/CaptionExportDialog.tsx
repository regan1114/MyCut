import { useState } from 'react';
import { Download, X } from 'lucide-react';
import { toSrt, type Project } from '../../shared/model';
import { safeFileName } from '../../shared/platform';
import { download } from '../api';

type Props = { project: Project; onClose: () => void; onError: (error: unknown) => void };

export default function CaptionExportDialog({ project, onClose, onError }: Props) {
  const [scope, setScope] = useState('captions');
  const all = project.clips.filter(clip => clip.kind === 'text');
  const captions = all.filter(clip => clip.captionType);
  const clips = scope === 'all' ? all : captions;
  const pending = project.pendingLyrics?.reduce((count, batch) => count + batch.lines.length, 0) ?? 0;
  return <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="caption-export-dialog" role="dialog" aria-modal="true" aria-label="匯出 SRT 字幕" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <div className="modal-header"><h2>匯出 SRT 字幕</h2><button aria-label="關閉字幕匯出" onClick={onClose}><X size={18}/></button></div>
      <div className="caption-export-content">
        <label>匯出範圍<select autoFocus aria-label="字幕匯出範圍" value={scope} onChange={event => setScope(event.target.value)}>
          <option value="captions">字幕與歌詞（{captions.length} 則）</option>
          <option value="all">全部文字，含標題（{all.length} 則）</option>
        </select></label>
        <p className="field-note">依開始時間排列所有軌道的內容。SRT 保存文字與時間，不含文字樣式或逐字高亮。</p>
        {pending > 0 && <p className="caption-export-pending">另有 {pending} 句待手動校時，尚未列入 SRT；原文仍保留在專案及字幕 JSON 中。</p>}
        {!clips.length && <p role="status" className="field-note">{all.length ? '此範圍沒有字幕，可改選「全部文字，含標題」。' : '請先新增字幕，或完成辨識與校時後再匯出。'}</p>}
      </div>
      <footer className="caption-export-actions"><span>{clips.length} 則文字</span><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!clips.length} onClick={() => {
        try { download(`${safeFileName(project.name)}.srt`, toSrt({ ...project, clips }), 'text/plain;charset=utf-8'); onClose(); }
        catch (error) { onError(error); }
      }}><Download size={15}/>下載 SRT</button></footer>
    </section>
  </div>;
}
