import fs from 'fs';

const path = 'c:/Users/HP/OneDrive/Desktop/expo_app/partnersite/src/app/mx/profile/page.tsx';
let s = fs.readFileSync(path, 'utf8');

const start = s.indexOf('                                {/* PAN Document */}');
const end = s.indexOf('                              </>', start);
if (start < 0 || end < 0) {
  console.log('markers not found', start, end);
  process.exit(1);
}

const replacement = `                                {PROFILE_LEGAL_DOC_CONFIG.map((cfg) => {
                                  const doc = storeDocuments as Record<string, unknown>;
                                  const num = doc[cfg.numberKey];
                                  if (!num || String(num).trim() === "") return null;
                                  const label =
                                    cfg.typeKey && doc[cfg.typeKey]
                                      ? String(doc[cfg.typeKey])
                                      : cfg.label;
                                  const meta = doc[cfg.metaKey];
                                  const renewalPending =
                                    meta &&
                                    typeof meta === "object" &&
                                    (meta as { renewal_pending?: boolean }).renewal_pending === true;
                                  return (
                                    <LegalDocumentCard
                                      key={cfg.prefix}
                                      label={label}
                                      prefix={cfg.prefix}
                                      documentNumber={String(num)}
                                      holderName={
                                        cfg.holderKey ? (doc[cfg.holderKey] as string | null) : null
                                      }
                                      expiryDate={(doc[cfg.expiryKey] as string | null) ?? null}
                                      documentUrl={(doc[cfg.urlKey] as string | null) ?? null}
                                      isVerified={doc[cfg.verifiedKey] as boolean | null}
                                      isExpiredFlag={doc[cfg.expiredKey] as boolean | null}
                                      renewalPending={renewalPending}
                                      onRenew={(p) => {
                                        setLicenseUploadPrefix(p);
                                        setLicenseModalOpen(true);
                                      }}
                                    />
                                  );
                                })}
`;

s = s.slice(0, start) + replacement + s.slice(end);

const modalInsert = `      <LicenseExpiredModal
        storeId={store.store_id}
        open={licenseModalOpen}
        expired={licenseEvaluation?.expired ?? []}
        pendingVerification={licenseEvaluation?.pending_verification ?? []}
        initialStepPrefix={licenseUploadPrefix}
        onClose={() => {
          setLicenseModalOpen(false);
          setLicenseUploadPrefix(null);
        }}
        onUploaded={async () => {
          const id = storeInternalIdRef.current;
          if (id) {
            const docs = await fetchStoreDocuments(id);
            setStoreDocuments(docs);
          }
        }}
      />
`;

if (!s.includes('LicenseExpiredModal')) {
  s = s.replace('      </MXLayoutWhite>\n    </ProfileErrorBoundary>', `${modalInsert}      </MXLayoutWhite>\n    </ProfileErrorBoundary>`);
}

fs.writeFileSync(path, s, 'utf8');
console.log('patched profile legal docs');
