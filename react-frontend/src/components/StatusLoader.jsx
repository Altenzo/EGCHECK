import { useState, useEffect } from 'react';

const MESSAGES = [
    "Изучаем почерк автора...",
    "Переводим рукопись в цифру...",
    "Ищем сомнения в словах...",
    "Сверяем каждую букву с фото...",
    "Почти готово, наводим лоск..."
];

function StatusLoader() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setIndex((prev) => {
                // Если дошли до конца (индекс 4), больше не прибавляем
                if (prev >= MESSAGES.length - 1) {
                    clearInterval(interval);
                    return prev;
                }
                return prev + 1;
            });
        }, 2200);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="status-loader">
            <div className="loader-visual">
                <div className="ring"></div>
                <div className="pulse-core"></div>
            </div>
            <div className="loader-text-wrapper">
                <p className="loader-main-text">{MESSAGES[index]}</p>
                <p className="loader-sub-text">GPT-4o Vision анализирует контекст...</p>
            </div>
        </div>
    );
}

export default StatusLoader;
