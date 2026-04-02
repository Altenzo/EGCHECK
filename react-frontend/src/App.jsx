import { useState, useRef } from 'react';

// Динамически берем IP того сервера, на котором открыт сайт
const currentHost = window.location.hostname;
const API_BASE_URL = `http://${currentHost}:8000/api`;
console.log('[Frontend] API_BASE_URL initialized as:', API_BASE_URL);

function App() {
    const [step, setStep] = useState('upload'); // upload, correction, evaluation
    const [files, setFiles] = useState([]);
    const [recognizedText, setRecognizedText] = useState('');
    const [doubts, setDoubts] = useState([]);
    const [evaluation, setEvaluation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [images, setImages] = useState([]);
    
    const textareaRef = useRef(null);

    const handleDoubtClick = (doubt) => {
        if (!textareaRef.current || !doubt.word) return;
        
        // 1. Пытаемся найти точное совпадение, если нет - без учета регистра
        let index = recognizedText.indexOf(doubt.word);
        if (index === -1) {
             index = recognizedText.toLowerCase().indexOf(doubt.word.toLowerCase());
        }

        if (index !== -1) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(index, index + doubt.word.length);
            
            // 2. Грубо вычисляем скролл внутри textarea (основываясь на количестве строк до индекса)
            const textBefore = recognizedText.substring(0, index);
            const lines = textBefore.split('\n').length;
            const lineHeight = 28; // примерно 1.7 * 18px (line-height)
            textareaRef.current.scrollTop = Math.max(0, (lines - 1) * lineHeight - 60);

            // 3. Плавно скроллим сам сайт до редактора
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const handleFiles = async (e) => {
        const fileList = Array.from(e.target.files);
        setFiles(fileList);
        setLoading(true);
        setError('');
        console.log('[Frontend] Starting handleFiles with', fileList.length, 'files');
        const formData = new FormData();
        fileList.forEach(file => formData.append('files', file));

        try {
            const recognizeUrl = `${API_BASE_URL}/recognize`;
            console.log('[Frontend] Fetching recognize from:', recognizeUrl);
            const res = await fetch(recognizeUrl, {
                method: 'POST',
                body: formData
            });
            console.log('[Frontend] Recognize status:', res.status);
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('[Frontend] Recognize failed with text:', errorText);
                try {
                    const errJson = JSON.parse(errorText);
                    if (errJson.detail) throw new Error(errJson.detail);
                } catch (e) {
                    if (e.message !== "Unexpected token u in JSON at position 0" && e.message !== "Unexpected token 'u', \"У бесплатн\"... is not valid JSON" && !e.message.includes("JSON")) {
                        throw e; // Reraise parsed message
                    }
                }
                throw new Error(`Ошибка распознавания (Status: ${res.status})`);
            }
            
            const data = await res.json();
            console.log('[Frontend] Recognize data received:', data);
            
            setRecognizedText(data.text || '');
            setImages(data.images || []);

            const verifyUrl = `${API_BASE_URL}/verify`;
            console.log('[Frontend] Fetching verify from:', verifyUrl);
            const verifyRes = await fetch(verifyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: data.text, images: data.images })
            });
            console.log('[Frontend] Verify status:', verifyRes.status);
            
            if (!verifyRes.ok) {
                const errorText = await verifyRes.text();
                console.error('[Frontend] Verify failed with text:', errorText);
                throw new Error(`Ошибка верификации (Status: ${verifyRes.status})`);
            }

            const verifyData = await verifyRes.json();
            console.log('[Frontend] Verify data received:', verifyData);
            
            // CRITICAL FIX: safety check for map
            const newDoubts = (verifyData && verifyData.doubts) ? verifyData.doubts : [];
            setDoubts(newDoubts.map(d => ({ ...d, fixed: false })));
            
            setStep('correction');
        } catch (err) {
            console.error('[Frontend] Global handleFiles error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEvaluate = async () => {
        setLoading(true);
        const evaluateUrl = `${API_BASE_URL}/evaluate`;
        console.log('[Frontend] Starting evaluate at:', evaluateUrl);
        try {
            const res = await fetch(evaluateUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: recognizedText })
            });
            console.log('[Frontend] Evaluate status:', res.status);
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error('[Frontend] Evaluate failed with text:', errorText);
                throw new Error(`Ошибка при проверке (Status: ${res.status})`);
            }

            const data = await res.json();
            console.log('[Frontend] Evaluate data received:', data);
            setEvaluation(data);
            setStep('evaluation');
        } catch (err) {
            console.error('[Frontend] handleEvaluate error:', err);
            setError('Ошибка при оценке');
        } finally {
            setLoading(false);
        }
    };

    const toggleDoubtFixed = (index) => {
        const newDoubts = [...doubts];
        newDoubts[index].fixed = !newDoubts[index].fixed;
        setDoubts(newDoubts);
    };

    return (
        <div className="app-container">
            <div className="content-wrapper">

                <header className="main-header">
                    <h1 className="logo">EGCHECK.PRO</h1>
                    <p className="subtitle">Умная проверка сочинений ЕГЭ (GPT-4o Vision)</p>
                </header>

                {error && <div className="error-banner">{error}</div>}

                {step === 'upload' && (
                    <div className="upload-zone">
                        <input type="file" multiple onChange={handleFiles} className="file-input" />
                        <div className="icon">📸</div>
                        <p className="upload-text">Загрузите фото или PDF сочинения</p>
                        <p className="upload-subtext">GPT-4o проанализирует каждый штрих</p>
                        {loading && <div className="loader-box">
                            <div className="spinner"></div>
                            <p className="loader-text">ИИ изучает почерк...</p>
                        </div>}
                    </div>
                )}

                {step === 'correction' && (
                    <div className="grid-layout">
                        <div className="editor-side">
                            <div className="glass-panel">
                                <h3 className="panel-title">📝 Исправьте текст, если нужно</h3>
                                <textarea
                                    ref={textareaRef}
                                    className="main-textarea"
                                    value={recognizedText}
                                    onChange={(e) => setRecognizedText(e.target.value)}
                                />
                                <button onClick={handleEvaluate} className="action-button">
                                    {loading ? 'Проверка...' : '✨ ПРОВЕРИТЬ СОЧИНЕНИЕ'}
                                </button>
                            </div>
                        </div>

                        <div className="info-side">
                            <div className="glass-panel h-fit">
                                <h3 className="panel-title">🧐 Сомнения ИИ</h3>
                                <div className="doubts-list">
                                    {doubts.length === 0 ? (
                                        <p className="empty-text">ИИ уверен в тексте на 100%</p>
                                    ) : (
                                        doubts.map((d, index) => (
                                            <div key={index} className={`doubt-card ${d.fixed ? 'fixed' : ''}`} onClick={() => handleDoubtClick(d)}>
                                                <div className="doubt-header">
                                                    <span className="doubt-word">{d.word}</span>
                                                    <button onClick={(e) => { e.stopPropagation(); toggleDoubtFixed(index); }} className="fix-toggle">
                                                        {d.fixed ? 'Отменить' : 'Исправлено'}
                                                    </button>
                                                </div>
                                                <p className="doubt-reason">{d.reason}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="footer-note">* Сомнения помогают найти куски, где ИИ запнулся об почерк.</div>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'evaluation' && evaluation && (
                    <div className="evaluation-layout">
                        <div className="score-hero">
                            <div className="score-label">Общий балл</div>
                            <div className="score-value">{evaluation.total_score} <span>/ {evaluation.max_total}</span></div>
                            <p className="feedback-text">"{evaluation.overall_feedback}"</p>
                        </div>

                        <div className="criteria-grid">
                            {evaluation.criteria && evaluation.criteria.map((c, idx) => {
                                const isPerfect = c.score === c.max_score;
                                const isZero = c.score === 0;
                                const scoreClass = isPerfect ? 'score-perfect' : isZero ? 'score-zero' : 'score-partial';
                                return (
                                    <div key={idx} className={`criteria-card ${scoreClass}`}>
                                        <div className="criteria-header">
                                            <span className="id-tag">{c.id}</span>
                                            <span className={`score-tag ${scoreClass}`}>{c.score} / {c.max_score}</span>
                                        </div>
                                        <h4 className="criteria-name">{c.name}</h4>
                                        <p className="criteria-feedback">{c.feedback}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="support-box">
                            <h3>💎 Итог и рекомендации</h3>
                            <p>{evaluation.encouragement}</p>
                            <button onClick={() => setStep('upload')} className="action-button upload-btn mt-4">✨ ПРОВЕРИТЬ ЕЩЕ ОДНО</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
