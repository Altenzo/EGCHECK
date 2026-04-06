import { useState, useRef } from 'react';

// --- ПОД-КОМПОНЕНТ ДЛЯ ПРОСМОТРА ФОТО ---
function FullImageModal({ src, onClose }) {
    if (!src) return null;
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <img src={src} alt="Full size scanned page" className="full-res-image" />
                <button className="modal-close" onClick={onClose}>✕</button>
            </div>
        </div>
    );
}

function CorrectionStep({ text, setText, doubts, setDoubts, onEvaluate, loading, images }) {
    const textareaRef = useRef(null);
    const [previewImg, setPreviewImg] = useState(null);

    const handleDoubtClick = (doubt) => {
        if (!textareaRef.current || !doubt.word) return;
        
        const cleanWord = doubt.word.replace(/^[.\s,!?]+|[.\s,!?]+$/g, "");
        
        let index = text.indexOf(cleanWord);
        if (index === -1) {
             index = text.toLowerCase().indexOf(cleanWord.toLowerCase());
        }

        if (index !== -1) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(index, index + cleanWord.length);
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const toggleFixed = (index) => {
        const newDoubts = [...doubts];
        newDoubts[index].fixed = !newDoubts[index].fixed;
        setDoubts(newDoubts);
    };

    const getSafeSrc = (imgData) => {
        if (imgData.startsWith('data:image')) return imgData;
        return `data:image/jpeg;base64,${imgData}`;
    };

    return (
        <>
            <div className="grid-layout">
                <div className="editor-side glass-panel">
                    <header className="panel-header-row">
                        <h3 className="panel-title">📝 Исправьте текст, если нужно</h3>
                        <div className="page-counter">
                            {images?.length > 0 && `Всего страниц: ${images.length}`}
                        </div>
                    </header>
                    
                    {images && images.length > 0 && (
                        <div className="image-gallery-container animate-fade-in">
                            <div className="image-gallery">
                                {images.map((img, idx) => {
                                    const src = getSafeSrc(img);
                                    return (
                                        <div key={idx} className="gallery-item" onClick={() => setPreviewImg(src)}>
                                            <img 
                                                src={src} 
                                                alt={`Страница ${idx + 1}`} 
                                                className="gallery-thumb"
                                            />
                                            <div className="gallery-overlay">
                                                <span className="page-id">Стр {idx + 1}</span>
                                                <div className="expand-icon">
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="textarea-wrapper">
                        <textarea
                            ref={textareaRef}
                            className="main-textarea"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Ваш текст появится здесь после распознавания..."
                        />
                        <div className="textarea-status">
                            {text.length} символов
                        </div>
                    </div>

                    <button onClick={onEvaluate} className="action-button shine-effect">
                        {loading ? (
                            <div className="flex-center gap-2">
                                <div className="mini-spinner"></div>
                                Проверка...
                            </div>
                        ) : (
                            '✨ ПРОВЕРИТЬ СОЧИНЕНИЕ'
                        )}
                    </button>
                </div>

                <div className="info-side glass-panel h-fit">
                    <h3 className="panel-title">🧐 Сомнения ИИ</h3>
                    <div className="doubts-list">
                        {doubts.length === 0 ? (
                            <div className="empty-state">
                                <span className="icon">🎨</span>
                                <p className="empty-text">ИИ уверен на 100%, правок не требуется</p>
                            </div>
                        ) : (
                            doubts.map((d, i) => (
                                <div key={i} className={`doubt-card ${d.fixed ? 'fixed' : ''}`} onClick={() => handleDoubtClick(d)}>
                                    <div className="doubt-header">
                                        <span className="doubt-word">{d.word}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleFixed(i); }} 
                                            className="fix-toggle"
                                        >
                                            {d.fixed ? 'Отменить' : '✅ Исправлено'}
                                        </button>
                                    </div>
                                    <p className="doubt-reason">{d.reason}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <FullImageModal 
                src={previewImg} 
                onClose={() => setPreviewImg(null)} 
            />
        </>
    );
}

export default CorrectionStep;
