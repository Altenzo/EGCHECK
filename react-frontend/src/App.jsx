import { useState, useRef } from 'react';

// Динамически берем URL бэкенда из переменных окружения Vercel (или работаем локально на 8000)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

function App() {
    const [step, setStep] = useState('upload');
    const [loadingText, setLoadingText] = useState('');
    const [recognizedText, setRecognizedText] = useState('');
    const [issues, setIssues] = useState([]);
    const [theme, setTheme] = useState('');
    const [results, setResults] = useState(null);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const [isDragOver, setIsDragOver] = useState(false);

    // Focus and select specific issue
    const highlightIssue = (word) => {
        if (!textareaRef.current) return;
        const text = recognizedText;
        const idx = text.indexOf(word);
        if (idx !== -1) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(idx, idx + word.length);
        }
    };

    // One-click correction
    const applyCorrection = (original, suggestion) => {
        setRecognizedText(prev => prev.replace(original, suggestion));
        setIssues(prev => prev.filter(i => {
            const w = typeof i === 'string' ? i : i.word;
            return w !== original;
        }));
    };

    // Fix all at once
    const applyAllCorrections = () => {
        let newText = recognizedText;
        issues.forEach(issue => {
            const word = typeof issue === 'string' ? issue : issue.word;
            if (issue.suggestion) {
                // Replace ONLY the first occurrence to avoid changing unintended identical words, just like single click
                newText = newText.replace(word, issue.suggestion);
            }
        });
        setRecognizedText(newText);
        // Filters out issues that were corrected (had a suggestion)
        setIssues(prev => prev.filter(i => !i.suggestion));
    };

    const handleFiles = async (filesList) => {
        const files = Array.from(filesList);
        for (let file of files) {
            if (!file.type.match(/^(image\/(jpeg|png|jpg|webp)|application\/pdf)$/i)) {
                return alert('Можно загружать только фотографии (форматы JPEG, PNG, WEBP) или документы PDF.');
            }
        }

        setStep('loading');
        setLoadingText(`Gemini обрабатывает ${files.length} файл(ов) (это займет пару секунд)...`);

        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        try {
            const response = await fetch(`${API_BASE_URL}/recognize`, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Ошибка сервера');
            const data = await response.json();

            setRecognizedText(data.text);
            setIssues(data.issues || []);

            if (data.is_not_essay) {
                alert('❌ Отклонено нейросетью: Это не похоже на сочинение!\n\nПожалуйста, загрузите фотографию реального рукописного/печатного текста сочинения.');
                setStep('upload');
                return;
            }

            if (data.is_poor_quality) {
                const proceed = window.confirm("⚠️ Нейросеть жалуется на очень плохое качество фото (размыто, плохое освещение или нечитаемый почерк).\n\nТекст мог распознаться с большими ошибками.\n\nНажмите 'ОК', чтобы продолжить с этим текстом, или 'Отмена', чтобы загрузить фото получше.");
                if (!proceed) {
                    setStep('upload');
                    return;
                }
            }

            setStep('edit');
        } catch (error) {
            console.error(error);
            alert('Ошибка распознавания.');
            setStep('upload');
        }
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    };

    const handleEvaluate = async () => {
        if (!recognizedText.trim()) return alert('Текст не может быть пустым');

        setStep('loading');
        setLoadingText('Оценка критериев экспертом Gemini (около 10-15 сек)...');

        try {
            const response = await fetch(`${API_BASE_URL}/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: recognizedText, theme: theme })
            });

            if (!response.ok) throw new Error('Ошибка оценки');
            const data = await response.json();

            if (data.is_not_essay) {
                alert('❌ Нейросеть отказывается проверять этот текст!\n\nЭто совершенно не похоже на сочинение ЕГЭ. Пожалуйста, отправьте релевантный текст.');
                setStep('edit');
                return;
            }

            setResults(data);
            setStep('results');
        } catch (error) {
            console.error(error);
            alert('Ошибка при проверке.');
            setStep('edit');
        }
    };

    return (
        <div className="container glass-panel" style={{ maxWidth: '1200px' }}>
            <header>
                <h1>EGCHECK</h1>
                <p>AI-оценка сочинений ЕГЭ по критериям ФИПИ</p>
            </header>

            <main>
                {step === 'upload' && (
                    <div className="step active">
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            {/* ЛЕВАЯ СТОРОНА: Загрузка файлов */}
                            <div style={{ flex: '1 1 300px' }}>
                                <div
                                    className={`upload-area ${isDragOver ? 'dragover' : ''}`}
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    onDrop={onDrop}
                                    style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                                >
                                    <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" hidden ref={fileInputRef} onChange={(e) => e.target.files?.length && handleFiles(e.target.files)} />
                                    <div className="upload-icon">📄</div>
                                    <h3>Загрузите фото или PDF</h3>
                                    <p>Перетащите скан или файл сюда</p>
                                </div>
                            </div>

                            {/* ПРАВАЯ СТОРОНА: Вставка текста */}
                            <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column' }}>
                                <textarea
                                    rows={8}
                                    placeholder="Или просто вставьте набранный текст сочинения сюда..."
                                    value={recognizedText}
                                    onChange={(e) => setRecognizedText(e.target.value)}
                                    style={{ flex: 1, padding: '1rem', borderRadius: '12px', background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', minHeight: '180px', marginBottom: '1rem' }}
                                />
                                <button
                                    className="primary-btn"
                                    onClick={() => {
                                        if (recognizedText.trim().length > 20) {
                                            setIssues([]);
                                            setStep('edit');
                                        } else {
                                            alert('Текст слишком короткий! Напишите хотя бы предложение.');
                                        }
                                    }}
                                    style={{ width: '100%', margin: 0 }}
                                >
                                    📝 Проверить без распознавания (Текст)
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {step === 'loading' && (
                    <div className="step active" style={{ textAlign: 'center', padding: '3rem 0' }}>
                        <div className="loader"></div>
                        <h3>{loadingText}</h3>
                    </div>
                )}

                {step === 'edit' && (
                    <div className="step active" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'stretch' }}>

                        <div className="edit-main" style={{ flex: '2 1 600px' }}>
                            <h3 style={{ marginBottom: '1rem' }}>Редактирование и проверка текста</h3>
                            <textarea
                                ref={textareaRef}
                                rows={16}
                                value={recognizedText}
                                onChange={(e) => setRecognizedText(e.target.value)}
                                style={{ width: '100%', marginBottom: '1rem' }}
                            />

                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <h4 style={{ marginBottom: '0.5rem', color: '#60a5fa' }}>Исходная проблема / Тема текста (Необязательно)</h4>
                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.8rem' }}>Впиши сюда проблему, по которой написано сочинение (например, "Проблема влияния природы на человека"), чтобы нейросеть точнее оценила логику К1-К4.</p>
                                <input
                                    type="text"
                                    placeholder="Проблема текста..."
                                    value={theme}
                                    onChange={e => setTheme(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
                                />
                            </div>

                            <button className="primary-btn" onClick={handleEvaluate} style={{ marginTop: '1.5rem', width: '100%' }}>Отправить на оценку эксперту</button>
                        </div>

                        <div className="edit-sidebar" style={{ flex: '1 1 300px' }}>
                            <div className="issues-panel" style={{ background: 'rgba(219, 39, 119, 0.05)', border: '1px solid rgba(219, 39, 119, 0.4)', padding: '1.5rem', borderRadius: '12px', height: '100%' }}>
                                <h3 style={{ color: '#fbcfe8', borderBottom: '1px solid rgba(219, 39, 119, 0.2)', paddingBottom: '0.8rem', marginBottom: '1rem' }}>Нейросеть сомневается</h3>
                                <p style={{ fontSize: '0.85rem', marginBottom: '1.5rem', color: '#f472b6', lineHeight: '1.4' }}>
                                    В этих словах AI не уверен, либо видит опечатку.
                                    <br /><br /><b>Кликай на кнопки ниже 👇</b>, чтобы мы подсветили их в тексте для ручной проверки.
                                </p>

                                {issues.length === 0 ? (
                                    <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: '2rem' }}>🎉 Всё распознано идеально!</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {issues.some(i => i.suggestion) && issues.length > 1 && (
                                            <button
                                                onClick={applyAllCorrections}
                                                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', color: 'white', padding: '0.8rem', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', boxShadow: '0 4px 6px rgba(16, 185, 129, 0.2)' }}
                                            >
                                                Исправить всё разом
                                            </button>
                                        )}
                                        {issues.map((issue, idx) => {
                                            const word = typeof issue === 'string' ? issue : issue.word;
                                            const suggestion = issue.suggestion;

                                            return (
                                                <div key={idx} style={{ background: 'rgba(219, 39, 119, 0.05)', border: '1px solid rgba(219, 39, 119, 0.3)', padding: '1rem', borderRadius: '10px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                                        <div style={{ wordBreak: 'break-word' }}>
                                                            <b
                                                                style={{ color: '#fbcfe8', cursor: 'pointer', fontSize: '1.1rem', borderBottom: '1px dashed #fbcfe8' }}
                                                                onClick={() => highlightIssue(word)}
                                                                title="Найти в тексте"
                                                            >
                                                                🔎 {word}
                                                            </b>
                                                        </div>
                                                        {suggestion && (
                                                            <button
                                                                onClick={() => applyCorrection(word, suggestion)}
                                                                style={{ background: '#10b981', border: 'none', color: 'white', padding: '0.5rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold', alignSelf: 'flex-start' }}
                                                            >
                                                                Заменить на «{suggestion}»
                                                            </button>
                                                        )}
                                                    </div>
                                                    {issue.reason && <div style={{ fontSize: '0.95rem', color: '#f9a8d4', lineHeight: '1.4', borderTop: '1px solid rgba(219, 39, 119, 0.2)', paddingTop: '0.6rem' }}>{issue.reason}</div>}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                )}

                {step === 'results' && results && (
                    <div className="step active">
                        <div className="score-card" style={{ marginBottom: '2rem' }}>
                            <div className="total-score" style={{ textAlign: 'center', marginBottom: '1rem' }}>
                                <h2>Итоговый балл по критериям</h2>
                                <div className="circle-score" style={{ margin: '1.5rem auto 0', background: results.total_score >= 15 ? '#10b981' : results.total_score >= 10 ? '#f59e0b' : '#ef4444' }}>
                                    {results.total_score || 0} / {results.max_total || 21}
                                </div>
                            </div>
                        </div>

                        {results.encouragement && (
                            <div className="encouragement-box" style={{ background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15), rgba(139, 92, 246, 0.15))', border: '1px solid rgba(236, 72, 153, 0.3)', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem', textAlign: 'center' }}>
                                <p style={{ fontSize: '1.2rem', color: '#fbcfe8', margin: 0, fontStyle: 'italic', fontWeight: '500', lineHeight: '1.5' }}>
                                    «{results.encouragement}» 💬
                                </p>
                            </div>
                        )}

                        <div className="feedback-section" style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h3 style={{ marginBottom: '1rem', color: '#a78bfa' }}>Общий вердикт эксперта</h3>
                            <p style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>{results.overall_feedback || 'Нет комментариев'}</p>

                            <h4 style={{ marginBottom: '0.8rem', color: '#34d399' }}>Главные рекомендации:</h4>
                            <ul className="recommendation-list" style={{ marginLeft: '1.5rem' }}>
                                {(results.recommendations || []).map((rec, idx) => (
                                    <li key={idx} style={{ marginBottom: '0.5rem', color: '#d1d5db' }}>{rec}</li>
                                ))}
                            </ul>
                        </div>

                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.4rem' }}>Детальный разбор К1-К12</h3>
                        <div className="criteria-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                            {(results.criteria || []).map((crit) => (
                                <div key={crit.id} className="criterion-card" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.8rem', marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '1.1rem', color: '#60a5fa', margin: 0 }}>{crit.id}: {crit.name}</h4>
                                        <div style={{ background: crit.score === crit.max_score ? 'rgba(16, 185, 129, 0.2)' : crit.score === 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: crit.score === crit.max_score ? '#34d399' : crit.score === 0 ? '#f87171' : '#fbbf24', padding: '0.4rem 1rem', borderRadius: '20px', fontWeight: 'bold' }}>
                                            Оценка: {crit.score} / {crit.max_score}
                                        </div>
                                    </div>
                                    <p style={{ lineHeight: '1.6', color: '#e2e8f0', margin: 0 }}>{crit.feedback}</p>

                                    {crit.corrections && crit.corrections.length > 0 && (
                                        <div style={{ marginTop: '1.5rem', background: 'rgba(248, 113, 113, 0.05)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                                            <b style={{ color: '#fca5a5', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '1.2rem' }}>⚠️</span> Найдены недочеты:
                                            </b>
                                            <ul style={{ marginTop: '0.8rem', marginLeft: '1.5rem', color: '#fca5a5', fontSize: '0.95rem' }}>
                                                {crit.corrections.map((corr, i) => <li key={i} style={{ marginBottom: '0.4rem' }}>{corr}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <button className="secondary-btn" onClick={() => {
                            setStep('upload');
                            setResults(null);
                            setRecognizedText('');
                            setTheme('');
                        }} style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}>Проверить еще одно сочинение</button>
                    </div>
                )}
            </main>
        </div>
    )
}

export default App;
