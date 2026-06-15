'use client';

interface LogoutModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

export default function LogoutModal({ onClose, onConfirm }: LogoutModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-hover w-[90%] max-w-[500px]">
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-red-50 to-white">
          <h2 className="text-[22px] font-bold text-red-600 flex items-center gap-3">
            <i className="fas fa-exclamation-triangle"></i>
            Confirm Logout
          </h2>
        </div>
        <div className="p-8 text-center">
          <div className="text-5xl text-red-600 mb-5">
            <i className="fas fa-sign-out-alt"></i>
          </div>
          <p className="text-base text-neutral-dark mb-6 leading-relaxed">
            Are you sure you want to logout?<br />
            A session report will be generated and sent to your email.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={onClose}
              className="bg-neutral-light hover:bg-gray-200 text-neutral-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2 border border-gray-300"
            >
              <i className="fas fa-times"></i>
              Cancel
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('user');
                onConfirm();
              }}
              className="bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2"
            >
              <i className="fas fa-paper-plane"></i>
              Send Report & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

