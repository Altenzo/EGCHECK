import { useState, useRef } from 'react';
import UploadStep from './components/UploadStep';
import StatusLoader from './components/StatusLoader';
import { recognizeImages, verifyText, evaluateEssay } from './services/api';

function App() {
    const [step, setStep] = useState('upload'); // upload, correction, evaluation
    const [recognizedText, setRecognizedText] = useState('');
    const [images, setImages] = useState([]);
    const [doubts, setDoubts] = useState([]);
    const [evaluation, setEvaluation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // 1. Логика загрузки (OCR)
    const handleFiles = async (e) => {
        const fileList = Array.from(e.target.files);
        setLoading(true);
        setError('');
        try {
            const ocrData = await recognizeImages(fileList);
            setRecognizedText(ocrData.text || '');
            setImages(ocrData.images || []);

            const verifyData = await verifyText(ocrData.text, ocrData.images);
            const rawDoubts = verifyData?.doubts || [];
            setDoubts(rawDoubts.map(d => ({ ...d, fixed: false })));
            setStep('correction');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. Логика оценки (GPT)
    const handleEvaluate = async () => {
        setLoading(true);
        try {
            const data = await evaluateEssay(recognizedText);
            setEvaluation(data);
            setStep('evaluation');
        } catch (err) {
            setError('Ошибка при оценке: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app-container">
            <div className="content-wrapper">
                <header className="main-header">
                    <h1 className="logo">EGCHECK.PRO</h1>
                    <p className="subtitle">Умная проверка сочинений ЕГЭ (GPT-4o Vision) 2026</p>
                </header>

                {error && <div className="error-banner">{error}</div>}

                {step === 'upload' && (
                    <UploadStep onFilesUploaded={handleFiles} loading={loading} />
                )}

                {step === 'correction' && (
                    <CorrectionStep 
                        text={recognizedText} 
                        setText={setRecognizedText} 
                        doubts={doubts} 
                        setDoubts={setDoubts}
                        onEvaluate={handleEvaluate}
                        loading={loading}
                        images={images}
                    />
                )}

                {step === 'evaluation' && evaluation && (
                    <EvaluationStep 
                        evaluation={evaluation} 
                        onRestart={() => setStep('upload')} 
                    />
                )}
            </div>
        </div>
    );
}

// ------ ПОД-КОМПОНЕНТЫ ДЛЯ СТРУКТУРЫ ------

// --- NEW COMPONENT FOR VIEWING PHOTOS ---
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
        
        // Очищаем слово от лишних знаков по краям (если ИИ прихватил точку или пробел)
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
                    
                    {/* Галерея загруженных фото */}
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

            {/* Модальное окно просмотра */}
            <FullImageModal 
                src={previewImg} 
                onClose={() => setPreviewImg(null)} 
            />
        </>
    );
}

function EvaluationStep({ evaluation, onRestart }) {
    return (
        <div className="evaluation-layout">
            <div className="score-hero">
                <div className="score-label">Общий балл</div>
                <div className="score-value">{evaluation.total_score} <span>/ {evaluation.max_total}</span></div>
                <p className="feedback-text">"{evaluation.overall_feedback}"</p>
                {evaluation.word_count && <p className="word-count">Слов: {evaluation.word_count}</p>}
            </div>

            <div className="criteria-grid">
                {evaluation.criteria.map((c, i) => {
                    // Принудительно приводим к числу на всякий случай
                    const score = Number(c.score);
                    const maxScore = Number(c.max_score);
                    const isPerfect = score >= maxScore;
                    
                    return (
                        <div key={i} className={`criteria-card ${isPerfect ? 'score-perfect' : score === 0 ? 'score-zero' : 'score-partial'}`}>
                            <div className="criteria-header">
                                <span className="id-tag">{c.id}</span>
                                <span className="score-tag">{score} / {maxScore}</span>
                            </div>
                            <h4 className="criteria-name">{c.name}</h4>
                            
                            <div className="criteria-details">
                                <p className="criteria-feedback">{c.feedback}</p>
                                
                                {c.quote && c.quote !== "" && (
                                    <div className="crit-quote">
                                        <strong>Цитата:</strong> <i>"{c.quote}"</i>
                                    </div>
                                )}
                                
                                {c.recommendation && c.recommendation !== "" && (
                                    <div className="crit-recommendation">
                                        <strong>💡 Совет:</strong> {c.recommendation}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="support-box">
                <p>{evaluation.encouragement}</p>
                <button onClick={onRestart} className="action-button upload-btn mt-4">✨ ПРОВЕРИТЬ ЕЩЕ ОДНО</button>
            </div>
        </div>
    );
}

export default App;
