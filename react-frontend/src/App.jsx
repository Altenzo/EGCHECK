import { useState } from 'react';
import UploadStep from './components/UploadStep';
import CorrectionStep from './components/CorrectionStep';
import EvaluationStep from './components/EvaluationStep';
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

export default App;
