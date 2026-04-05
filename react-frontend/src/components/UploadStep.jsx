function UploadStep({ onFilesUploaded, loading }) {
    return (
        <div className="upload-zone">
            <input type="file" multiple onChange={onFilesUploaded} className="file-input" />
            <div className="icon">📸</div>
            <p className="upload-text">Загрузите фото или PDF сочинения</p>
            <p className="upload-subtext">GPT-4o проанализирует каждый штрих</p>
            {loading && (
                <div className="loader-box">
                    <div className="spinner"></div>
                    <p className="loader-text">ИИ изучает почерк...</p>
                </div>
            )}
        </div>
    );
}

export default UploadStep;