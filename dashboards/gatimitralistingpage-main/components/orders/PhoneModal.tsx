'use client';

interface PhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  phoneNumber: string;
  onCopy: (text: string) => void;
}

export default function PhoneModal({ isOpen, onClose, title, phoneNumber, onCopy }: PhoneModalProps) {
  if (!isOpen) return null;

  const handleCall = () => {
    onCopy(`Calling ${phoneNumber}...`);
    setTimeout(() => {
      window.location.href = `tel:${phoneNumber}`;
    }, 100);
  };

  return (
    <div
      className="gm-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
    >
      <div
        className="phone-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '400px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          animation: 'fadeIn 0.3s ease',
        }}
      >
        <div className="phone-modal-header" style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--gati-border-color)',
          background: 'var(--gati-primary-super-light)',
          borderRadius: '12px 12px 0 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: 600,
            color: 'var(--gati-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <i className="bi bi-telephone"></i> <span>{title}</span>
          </h3>
          <span
            className="gm-close"
            onClick={onClose}
            style={{
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--gati-text-light)',
              transition: 'color 0.2s ease',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
            }}
          >
            ×
          </span>
        </div>
        <div className="phone-modal-body" style={{ padding: '24px' }}>
          <ul className="phone-number-list" style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}>
            <li className="phone-number-item" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid var(--gati-border-light)',
            }}>
              <div className="phone-number" style={{
                fontSize: '15px',
                fontWeight: 500,
                color: 'var(--gati-text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <i className="bi bi-telephone-fill"></i>
                {phoneNumber}
              </div>
              <div className="phone-actions" style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="phone-action-btn call"
                  onClick={handleCall}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--gati-radius-sm)',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    background: 'var(--gati-success)',
                    color: 'white',
                  }}
                >
                  <i className="bi bi-telephone-outbound"></i>
                  Call
                </button>
                <button
                  className="phone-action-btn copy"
                  onClick={() => {
                    onCopy(phoneNumber);
                    onClose();
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--gati-radius-sm)',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    background: 'var(--gati-primary)',
                    color: 'white',
                  }}
                >
                  <i className="bi bi-clipboard"></i>
                  Copy
                </button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

