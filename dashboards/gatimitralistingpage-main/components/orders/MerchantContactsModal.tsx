'use client';

interface MerchantContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
  onCall?: (phone: string) => void;
}

export default function MerchantContactsModal({ isOpen, onClose, onCopy, onCall }: MerchantContactsModalProps) {
  if (!isOpen) return null;

  const contacts = [
    { label: 'Store Person', number: '+918822497520' },
    { label: 'Store Manager', number: '+919735053220' },
    { label: 'Store Owner', number: '+919373865361' },
  ];

  const handleCall = (number: string) => {
    if (onCall) {
      onCall(number);
    }
    window.location.href = `tel:${number}`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-[500px] shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gati-primary-super-light px-6 py-4 border-b border-gati-border-color flex justify-between items-center rounded-t-lg">
          <h3 className="text-base font-semibold text-gati-text-primary flex items-center gap-2 m-0">
            <i className="bi bi-shop"></i> Merchant Contact Numbers
          </h3>
          <span
            className="text-2xl cursor-pointer text-gati-text-light transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:text-gati-text-primary"
            onClick={onClose}
          >
            ×
          </span>
        </div>
        <div className="p-6">
          {contacts.map((contact, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-3 border-b border-gati-border-light last:border-b-0"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="text-sm font-semibold text-gati-text-primary min-w-[120px]">
                  {contact.label}:
                </div>
                <div className="text-[15px] text-gati-text-primary font-medium flex-1 text-right">
                  {contact.number}
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleCall(contact.number)}
                  className="bg-gati-success hover:bg-green-600 text-white px-3 py-1.5 rounded-sm text-[13px] font-medium cursor-pointer transition-all flex items-center gap-1.5 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                >
                  <i className="bi bi-telephone-outbound"></i>
                  Call
                </button>
                <button
                  onClick={() => {
                    onCopy(contact.number);
                    onClose();
                  }}
                  className="bg-gati-primary hover:bg-gati-primary-dark text-white px-3 py-1.5 rounded-sm text-[13px] font-medium cursor-pointer transition-all flex items-center gap-1.5 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                >
                  <i className="bi bi-clipboard"></i>
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
