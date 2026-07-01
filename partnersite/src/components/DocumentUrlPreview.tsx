'use client';

import React, { useState } from 'react';
import { Eye, FileText, X } from 'lucide-react';
import {
  partnerDocumentKindFromUrl,
  partnerDocumentPreviewHref,
} from '@/lib/partnerDocumentPreview';

type Props = {
  url?: string | null;
  backUrl?: string | null;
  title?: string;
  buttonClassName?: string;
};

function PreviewFrame({
  href,
  rawUrl,
  label,
}: {
  href: string;
  rawUrl?: string | null;
  label: string;
}) {
  const kind = partnerDocumentKindFromUrl(href, rawUrl ?? label);

  if (kind === 'image') {
    return (
      <img
        src={href}
        alt={label}
        className="mx-auto max-h-[min(260px,38vh)] w-auto max-w-full rounded-lg border border-gray-200 object-contain bg-white"
      />
    );
  }

  if (kind === 'pdf') {
    return (
      <iframe
        src={`${href}#toolbar=0&navpanes=0`}
        title={label}
        className="h-[min(260px,38vh)] w-full rounded-lg border border-gray-200 bg-gray-50"
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-gray-500">
      <FileText className="h-9 w-9 text-gray-400" />
      <p>Inline preview not available.</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sky-600 font-semibold text-xs hover:underline"
      >
        Open document in new tab
      </a>
    </div>
  );
}

export function DocumentUrlPreview({ url, backUrl, title = 'Document', buttonClassName }: Props) {
  const frontHref = partnerDocumentPreviewHref(url);
  const backHref = partnerDocumentPreviewHref(backUrl);
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'front' | 'back'>('front');

  if (!frontHref && !backHref) return null;

  const activeHref = side === 'back' && backHref ? backHref : frontHref ?? backHref;
  const activeRawUrl = side === 'back' && backUrl ? backUrl : url ?? backUrl;
  if (!activeHref) return null;

  const btnClass =
    buttonClassName ??
    'inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100';

  return (
    <div className="w-full">
      <button type="button" className={btnClass} onClick={() => setOpen((v) => !v)}>
        <Eye className="h-3 w-3" />
        {open ? 'Hide preview' : 'Preview'}
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/50 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-sky-100 bg-white/90">
            <span className="text-[11px] font-semibold text-gray-800 truncate">{title}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {frontHref && backHref ? (
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[10px] font-semibold">
                  <button
                    type="button"
                    className={`px-2 py-0.5 ${side === 'front' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600'}`}
                    onClick={() => setSide('front')}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    className={`px-2 py-0.5 ${side === 'back' ? 'bg-sky-600 text-white' : 'bg-white text-gray-600'}`}
                    onClick={() => setSide('back')}
                  >
                    Back
                  </button>
                </div>
              ) : null}
              <a
                href={activeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-sky-700 hover:underline"
              >
                Open full
              </a>
              <button
                type="button"
                className="p-1 rounded text-gray-500 hover:bg-gray-100"
                aria-label="Close preview"
                onClick={() => setOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="p-2.5 bg-white">
            <PreviewFrame href={activeHref} rawUrl={activeRawUrl} label={title} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
