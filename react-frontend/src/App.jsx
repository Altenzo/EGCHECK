import { useState, useRef } from 'react';
import UploadStep from './components/UploadStep';
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

function CorrectionStep({ text, setText, doubts, setDoubts, onEvaluate, loading }) {
    const textareaRef = useRef(null);

    const handleDoubtClick = (doubt) => {
        if (!textareaRef.current || !doubt.word) return;
        
        // 1. Пытаемся найти точное совпадение
        let index = text.indexOf(doubt.word);
        
        // 2. Если не нашли - ищем без учета регистра (Аа/аа)
        if (index === -1) {
             index = text.toLowerCase().indexOf(doubt.word.toLowerCase());
        }

        if (index !== -1) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(index, index + doubt.word.length);
            
            // 3. Плавно скроллим сам сайт до редактора
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const toggleFixed = (index) => {
        const newDoubts = [...doubts];
        newDoubts[index].fixed = !newDoubts[index].fixed;
        setDoubts(newDoubts);
    };

    return (
        <div className="grid-layout">
            <div className="editor-side glass-panel">
                <h3 className="panel-title">📝 Исправьте текст, если нужно</h3>
                <textarea
                    ref={textareaRef}
                    className="main-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                />
                <button onClick={onEvaluate} className="action-button">
                    {loading ? 'Проверка...' : '✨ ПРОВЕРИТЬ СОЧИНЕНИЕ'}
                </button>
            </div>

            <div className="info-side glass-panel h-fit">
                <h3 className="panel-title">🧐 Сомнения ИИ (справа)</h3>
                <div className="doubts-list">
                    {doubts.length === 0 ? (
                        <p className="empty-text">ИИ уверен на 100%</p>
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
                    const isPerfect = c.score === c.max_score;
                    return (
                        <div key={i} className={`criteria-card ${isPerfect ? 'score-perfect' : c.score === 0 ? 'score-zero' : 'score-partial'}`}>
                            <div className="criteria-header">
                                <span className="id-tag">{c.id}</span>
                                <span className="score-tag">{c.score} / {c.max_score}</span>
                            </div>
                            <h4 className="criteria-name">{c.name}</h4>
                            
                            <div className="criteria-details">
                                <p className="criteria-feedback">{c.feedback}</p>
                                
                                {!isPerfect && c.quote && (
                                    <div className="crit-quote">
                                        <strong>Цитата:</strong> <i>"{c.quote}"</i>
                                    </div>
                                )}
                                
                                {!isPerfect && c.recommendation && (
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
