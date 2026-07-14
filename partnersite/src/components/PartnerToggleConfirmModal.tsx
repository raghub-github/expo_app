'use client';

import { ConfirmModal, type ConfirmModalProps } from '@/components/ConfirmModal';

/** @deprecated Prefer ConfirmModal — kept for existing Partner toggle call sites. */
export type PartnerToggleConfirmModalProps = ConfirmModalProps;

export function PartnerToggleConfirmModal(props: PartnerToggleConfirmModalProps) {
  return <ConfirmModal variant={props.variant ?? 'warning'} {...props} />;
}
