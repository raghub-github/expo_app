import React, { useState } from 'react';

const badgeColor = '#2ecc9b'; // Mint green

const NeedHelpBadge: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating Badge */}
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          right: -12,
          bottom: 40,
          zIndex: 1000,
          background: badgeColor,
          color: '#010004',
          border: 'none',
          borderRadius: 24,
          padding: '8px 20px',
          fontWeight: 600,
          fontSize: 12,
          boxShadow: '0 4px 24px rgba(44,204,155,0.18)',
          cursor: 'pointer',
        }}
      >
        Need a hand ?
      </button>

      {/* Modal Form */}
      {open && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.25)',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 32,
              minWidth: 340,
              boxShadow: '0 8px 32px rgba(44,204,155,0.18)',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'none',
                border: 'none',
                fontSize: 22,
                cursor: 'pointer',
                color: '#888',
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2 style={{ color: badgeColor, marginBottom: 16 }}>Need Help?</h2>
            <form
              onSubmit={e => {
                e.preventDefault();
                alert('Help request submitted!');
                setOpen(false);
              }}
            >
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Name</label>
                <input type="text" required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #eee' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Email</label>
                <input type="email" required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #eee' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>How can we help you?</label>
                <textarea required rows={4} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #eee' }} />
              </div>
              <button
                type="submit"
                style={{
                  background: badgeColor,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 24px',
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: 'pointer',
                }}
              >
                Submit
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default NeedHelpBadge;
