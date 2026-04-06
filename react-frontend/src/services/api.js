const currentHost = window.location.hostname;
const API_BASE_URL = `http://${currentHost}:8000/api`;

// Вспомогательная функция для таймаута
const fetchWithTimeout = async (url, options = {}, timeout = 60000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
};

// Вспомогательная функция для ретраев
const fetchWithRetry = async (url, options = {}, retries = 2) => {
    try {
        const res = await fetchWithTimeout(url, options);
        if (!res.ok) {
            // Если сервер вернул 429 (Rate Limit) или 400 (Bad Request), ретрай делать не стоит
            if (res.status === 429 || res.status === 400) {
                const errorData = await res.json();
                throw new Error(errorData.detail || `Ошибка ${res.status}`);
            }
            if (retries > 0) {
                console.warn(`Запрос не удался (${res.status}), пробуем еще раз...`);
                await new Promise(r => setTimeout(r, 1000));
                return fetchWithRetry(url, options, retries - 1);
            }
            const errorData = await res.json();
            throw new Error(errorData.detail || "Внутренняя ошибка сервера");
        }
        return res.json();
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error("Запрос превысил время ожидания. Проверьте интернет.");
        }
        if (retries > 0) {
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
};

export const recognizeImages = async (files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    return fetchWithRetry(`${API_BASE_URL}/recognize`, {
        method: 'POST',
        body: formData
    });
};

export const verifyText = async (text, images) => {
    return fetchWithRetry(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, images })
    });
};

export const evaluateEssay = async (text, theme = "") => {
    return fetchWithRetry(`${API_BASE_URL}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, theme })
    });
};
