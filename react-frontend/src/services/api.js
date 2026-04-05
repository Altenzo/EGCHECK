const currentHost = window.location.hostname;
const API_BASE_URL = `http://${currentHost}:8000/api`;

export const recognizeImages = async (files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));

    const res = await fetch(`${API_BASE_URL}/recognize`, {
        method: 'POST',
        body: formData
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Ошибка распознавания (Status: ${res.status})`);
    }
    return res.json();
};

export const verifyText = async (text, images) => {
    const res = await fetch(`${API_BASE_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, images })
    });

    if (!res.ok) {
        throw new Error(`Ошибка верификации (Status: ${res.status})`);
    }
    return res.json();
};

export const evaluateEssay = async (text, theme = "") => {
    const res = await fetch(`${API_BASE_URL}/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, theme })
    });

    if (!res.ok) {
        throw new Error(`Ошибка при проверке (Status: ${res.status})`);
    }
    return res.json();
};
