import StatusLoader from './StatusLoader';

function UploadStep({ onFilesUploaded, loading }) {
    return (
        <div className="upload-zone">
            {!loading ? (
                <>
                    <input type="file" multiple accept="image/*" onChange={onFilesUploaded} className="file-input" />
                    <div className="icon">📸</div>
                    <p className="upload-text">Загрузите фото сочинения</p>
                    <p className="upload-subtext">GPT-4o Vision проанализирует каждый штрих</p>
                </>
            ) : (
                <StatusLoader />
            )}
        </div>
    );
}

export default UploadStep;