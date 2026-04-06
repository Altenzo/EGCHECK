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

export default EvaluationStep;
