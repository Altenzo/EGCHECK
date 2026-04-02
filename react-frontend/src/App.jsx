import { useState, useRef } from 'react';

// Динамически берем IP того сервера, на котором открыт сайт
const currentHost = window.location.hostname;
const API_BASE_URL = `http://${currentHost}:8000/api`;

function App() {
    const [step, setStep] = useState('upload'); // upload, correction, evaluation
    const [files, setFiles] = useState([]);
    const [recognizedText, setRecognizedText] = useState('');
    const [doubts, setDoubts] = useState([]);
    const [evaluation, setEvaluation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [images, setImages] = useState([]);

    const handleFiles = async (e) => {
        const fileList = Array.from(e.target.files);
        setFiles(fileList);
        setLoading(true);
        setError('');

        const formData = new FormData();
        fileList.forEach(file => formData.append('files', file));

        try {
            const res = await fetch(`${API_BASE_URL}/recognize`, {
                method: 'POST',
                body: formData
            });
            if (!res.ok) throw new Error('Ошибка распознавания');
            const data = await res.json();
            
            setRecognizedText(data.text);
            setImages(data.images);

            const verifyRes = await fetch(`${API_BASE_URL}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: data.text, images: data.images })
            });
            const verifyData = await verifyRes.json();
            setDoubts(verifyData.doubts.map(d => ({ ...d, fixed: false })));
            
            setStep('correction');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEvaluate = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: recognizedText })
            });
            const data = await res.json();
            setEvaluation(data);
            setStep('evaluation');
        } catch (err) {
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
                                            <div key={index} className={`doubt-card ${d.fixed ? 'fixed' : ''}`}>
                                                <div className="doubt-header">
                                                    <span className="doubt-word">{d.word}</span>
                                                    <button onClick={() => toggleDoubtFixed(index)} className="fix-toggle">
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
                            {evaluation.criteria.map((c, idx) => (
                                <div key={idx} className="criteria-card">
                                    <div className="criteria-header">
                                        <span className="id-tag">{c.id}</span>
                                        <span className="score-tag">{c.score} / {c.max_score}</span>
                                    </div>
                                    <h4 className="criteria-name">{c.name}</h4>
                                    <p className="criteria-feedback">{c.feedback}</p>
                                </div>
                            ))}
                        </div>

                        <div className="support-box">
                            <h3>💎 Слова ободрения</h3>
                            <p>{evaluation.encouragement}</p>
                            <button onClick={() => setStep('upload')} className="restart-btn">ПРОВЕРИТЬ ЕЩЕ ОДНО</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
