"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { STORE_KEY } from "@/hooks/useStore";
import { useToast } from "@/context/ToastContext";
import { useStoreMutation, type StoreProfile } from "@/hooks/useStore";
import { useStoreProfileFull, STORE_PROFILE_FULL_KEY } from "@/hooks/useStoreProfileFull";
import { useStoreVerificationData } from "@/hooks/useStoreVerificationData";
import { ChangeAddressModal } from "./ChangeAddressModal";
import { StoreProfileSkeleton } from "./StoreProfileSkeleton";
import { ProfilePageContent } from "./ProfilePageContent";
import { useStoreVerificationSheet } from "@/context/StoreVerificationSheetContext";
import { useCanStoreVerify } from "@/hooks/useCanStoreVerify";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { isStoreDelisted } from "@/lib/merchants/store-delist";

export function StoreProfileClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    store: displayStoreFromApi,
    documents,
    operatingHours,
    agreementAcceptance,
    bankAccounts,
    areaManager,
    legalDocsRestricted,
    isLoading: profileLoading,
  } = useStoreProfileFull(storeId);
  const { agreementAcceptance: verificationAgreement } = useStoreVerificationData(storeId);
  const { openVerificationSheet } = useStoreVerificationSheet();
  const { canStoreVerify } = useCanStoreVerify();
  const { canManageStore, canManageBank, isViewOnly } = useMerchantDashboardAccess();
  const canEditProfile = canManageStore && !isViewOnly;
  const canEditBank = canManageBank && !isViewOnly;
  const updateStore = useStoreMutation(storeId);

  const openDocumentsVerification = () => openVerificationSheet(storeId, 4);
  const openProfileMediaVerification = () => openVerificationSheet(storeId, 1);
  const openBankVerification = () => openVerificationSheet(storeId, 6);

  const [editData, setEditData] = useState<Partial<StoreProfile> | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const displayStore = displayStoreFromApi as StoreProfile | null;

  // Defer "Store not found" until after the profile request has settled on the client,
  // so server and first client paint both show skeleton and hydration matches.
  const [hasSettled, setHasSettled] = useState(false);
  useEffect(() => {
    if (!profileLoading) setHasSettled(true);
  }, [profileLoading]);

  useEffect(() => {
    if (displayStore) {
      setEditData({
        ...displayStore,
        store_phones: displayStore.store_phones ?? undefined,
      });
    }
  }, [displayStore?.id, displayStore?.updated_at]);

  const startEditing = (field: string) => setEditingField(field);
  const stopEditing = () => setEditingField(null);

  const handleSaveField = async (field: string) => {
    if (!canEditProfile) {
      toast("View-only access — editing is disabled");
      return;
    }
    if (!storeId || !editData) return;
    setSavingField(field);
    try {
      let payload: Partial<StoreProfile> = {};
      if (field === "store_phones_alternate") {
        const primary = displayStore?.store_phones?.[0];
        const alt = editData.store_phones?.[1];
        payload.store_phones = alt ? (primary ? [primary, alt] : [alt]) : (primary ? [primary] : []);
      } else {
        (payload as Record<string, unknown>)[field] = (editData as Record<string, unknown>)[field];
      }
      await updateStore.mutateAsync(payload);
      toast("Saved successfully");      setEditingField(null);
      queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
      queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save");    } finally {
      setSavingField(null);
    }
  };

  const uploadImage = async (file: File, type: "banner" | "gallery"): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch(`/api/merchant/stores/${storeId}/profile-media`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Upload failed");
    return data?.url ? String(data.url) : null;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "gallery") => {
    if (!canEditProfile) {
      toast("View-only access — uploads are disabled");
      return;
    }
    const files = Array.from(e.target.files || []);
    if (!files.length || !storeId || !editData) return;
    e.target.value = "";
    setUploadingImages(files.map((f) => URL.createObjectURL(f)));
    try {
      if (type === "banner") {
        const url = await uploadImage(files[0]!, "banner");
        if (!url) throw new Error("Banner upload failed");
        const next = { ...editData, banner_url: url };
        setEditData(next);
        await updateStore.mutateAsync(next);
        toast("Banner updated");        queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
        queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
        router.refresh();
      } else {
        const urls = await Promise.all(
          files.map((f) => uploadImage(f, "gallery"))
        );
        const valid = urls.filter(Boolean) as string[];
        const current = (editData.gallery_images ?? []) as string[];
        const newGallery = [...current, ...valid].slice(0, 5);
        const next = { ...editData, gallery_images: newGallery };
        setEditData(next);
        await updateStore.mutateAsync(next);
        toast("Gallery updated");        queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
        queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
        router.refresh();
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed");    } finally {
      setUploadingImages([]);
    }
  };

  const handleRemoveGalleryImage = async (index: number) => {
    if (!canEditProfile) {
      toast("View-only access — changes are disabled");
      return;
    }
    if (!editData?.gallery_images) return;
    const next = [...(editData.gallery_images as string[])];
    next.splice(index, 1);
    const nextData = { ...editData, gallery_images: next };
    setEditData(nextData);
    try {
      await updateStore.mutateAsync(nextData);
      toast("Image removed");      queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
      queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
      router.refresh();
    } catch {
      toast("Failed to remove image");    }
  };

  // Show skeleton until we have data or the request has settled (avoids hydration mismatch:
  // server and first client paint both show skeleton; "Store not found" only after hasSettled).
  if (!hasSettled || (profileLoading && !displayStore)) {
    return <StoreProfileSkeleton />;
  }

  if (!displayStore) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        Store not found.
      </div>
    );
  }

  const statusUpper = (displayStore.approval_status || "").toUpperCase();
  const isVerified = statusUpper === "APPROVED";
  const isDelisted = isStoreDelisted(displayStore);
  const agreement = (verificationAgreement ?? agreementAcceptance ?? {}) as Record<string, unknown>;

  const revertAlternatePhone = () => {
    setEditData((d) =>
      d ? { ...d, store_phones: displayStore.store_phones ?? undefined } : d
    );
    stopEditing();
  };

  return (
    <>
      <ProfilePageContent
        storeId={storeId}
        displayStore={displayStore}
        editData={editData ?? displayStore}
        documents={(documents ?? null) as Record<string, unknown> | null}
        operatingHours={(operatingHours ?? null) as Record<string, unknown> | null}
        agreement={agreement}
        areaManager={areaManager ?? null}
        bankAccounts={bankAccounts ?? []}
        profileLoading={profileLoading}
        isVerified={isVerified}
        isDelisted={isDelisted}
        editingField={editingField}
        savingField={savingField}
        startEditing={startEditing}
        stopEditing={stopEditing}
        setEditData={setEditData}
        handleSaveField={handleSaveField}
        revertAlternatePhone={revertAlternatePhone}
        canStoreVerify={canStoreVerify}
        canEditProfile={canEditProfile}
        canEditBank={canEditBank}
        legalDocsRestricted={legalDocsRestricted}
        openDocumentsVerification={openDocumentsVerification}
        openBankVerification={openBankVerification}
        openProfileMediaVerification={openProfileMediaVerification}
        onChangeAddress={() => {
          if (!canEditProfile) {
            toast("View-only access — address changes are disabled");
            return;
          }
          setAddressModalOpen(true);
        }}
        bannerInputRef={bannerInputRef}
        galleryInputRef={galleryInputRef}
        onBannerUpload={(e) => handleImageUpload(e, "banner")}
        onGalleryUpload={(e) => handleImageUpload(e, "gallery")}
        onRemoveGalleryImage={handleRemoveGalleryImage}
        uploadingImages={uploadingImages}
      />

      <ChangeAddressModal
        open={addressModalOpen && canEditProfile}
        onClose={() => setAddressModalOpen(false)}
        storeId={storeId}
        initialAddress={{
                full_address: displayStore.full_address ?? "",
                landmark: displayStore.landmark ?? "",
                city: displayStore.city ?? "",
                state: displayStore.state ?? "",
                postal_code: displayStore.postal_code ?? "",
                latitude: displayStore.latitude ?? null,
                longitude: displayStore.longitude ?? null,
        }}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
          queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
          router.refresh();
          toast("Address updated successfully");
        }}
      />
    </>
  );
}
