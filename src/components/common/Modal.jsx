export default function Modal({ open, title, onClose, children, width = '720px' }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose}>✕</button>
        </div>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}
