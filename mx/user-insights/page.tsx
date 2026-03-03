'use client';
import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { fetchRestaurantById as fetchStoreById } from '@/lib/database';
import { MerchantStore } from '@/lib/merchantStore';
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants';
import { 
  Star, 
  MessageSquare, 
  AlertTriangle, 
  Send, 
  UserCheck, 
  UserPlus, 
  UserX, 
  Filter,
  Calendar,
  CheckCircle,
  Inbox,
  X,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  MoreVertical,
  ChevronLeft
} from 'lucide-react';
import { SkeletonReviewRow } from '@/components/PageSkeleton';
import { getTicketAttachmentViewUrl } from '@/lib/ticket-attachment-url';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Review {
  id: number;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  customerMobile: string | null;
  orderId: number | null;
  date: string;
  type: 'Review' | 'Complaint';
  message: string;
  response: string;
  respondedAt: string | null;
  userType: 'repeated' | 'new' | 'fraud';
  rating: number;
  foodQualityRating: number | null;
  deliveryRating: number | null;
  packagingRating: number | null;
  reviewImages: string[];
  reviewTags: string[];
  orderCount: number;
  isVerified: boolean;
  isFlagged: boolean;
  flagReason: string | null;
}

interface Stats {
  total: number;
  reviews: number;
  complaints: number;
  repeatedUsers: number;
  newUsers: number;
  fraudUsers: number;
}

interface ImagePreview {
  file: File;
  preview: string;
  uploadProgress: number;
  uploadedUrl?: string;
}

// Normalize ticket status for consistent comparison (API may return PENDING, pending, etc.)
const normalizedTicketStatus = (s: string | undefined): string =>
  (s || '').toUpperCase().trim();

const UserInsightsContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [responseImages, setResponseImages] = useState<Record<string, ImagePreview[]>>({});
  const [filter, setFilter] = useState('all');
  
  // Default to User Insights view (reviews/complaints). Support Inbox only when user clicks "Inbox".
  const [showQueueView, setShowQueueView] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('userInsights_ticketStatusFilter');
      return saved || null;
    }
    return null;
  });
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);
  const [ticketRating, setTicketRating] = useState<number | null>(null);
  const [ticketRatingFeedback, setTicketRatingFeedback] = useState('');
  const [ratingLoading, setRatingLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [ticketReply, setTicketReply] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [ticketReplyImages, setTicketReplyImages] = useState<ImagePreview[]>([]);
  const [reopenInProgress, setReopenInProgress] = useState(false);
  const ticketReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const ticketReplyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    reviews: 0,
    complaints: 0,
    repeatedUsers: 0,
    newUsers: 0,
    fraudUsers: 0
  });
  const [sendingResponse, setSendingResponse] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get('storeId') ?? null;

      if (!id) {
        id = typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null;
      }

      if (!id) {
        id = DEMO_STORE_ID;
      }

      setStoreId(id);
    };

    getStoreId();
  }, [searchParams]);

  // Load store data
  useEffect(() => {
    if (!storeId) return;

    const loadStore = async () => {
      try {
        const storeData = await fetchStoreById(storeId);
        if (storeData) {
          setStore(storeData as MerchantStore);
        }
      } catch (error) {
        console.error('Error loading store:', error);
      }
    };

    loadStore();
  }, [storeId]);

  // Fetch reviews
  useEffect(() => {
    if (!storeId) return;

    const fetchReviews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/merchant/reviews?storeId=${storeId}`);
        const data = await res.json();
        if (data.success) {
          setReviews(data.reviews || []);
          setStats(data.stats || {
            total: 0,
            reviews: 0,
            complaints: 0,
            repeatedUsers: 0,
            newUsers: 0,
            fraudUsers: 0
          });
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [storeId]);

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const res = await fetch('/api/merchant/tickets/list');
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setTicketsLoading(false);
    }
  };

  // Restore view from URL on load (strict refresh persistence)
  useEffect(() => {
    const view = searchParams?.get('view');
    if (view === 'inbox') setShowQueueView(true);
  }, [searchParams]);

  // Load tickets when queue view is shown
  useEffect(() => {
    if (showQueueView) {
      fetchTickets();
    }
  }, [showQueueView]);

  // Restore selected ticket from URL (priority) or localStorage after tickets load
  useEffect(() => {
    if (!showQueueView || tickets.length === 0 || selectedTicket) return;
    const urlTicketId = searchParams?.get('ticket');
    const savedTicketId = typeof window !== 'undefined' ? localStorage.getItem('userInsights_selectedTicketId') : null;
    const ticketIdToRestore = urlTicketId || savedTicketId;
    if (ticketIdToRestore) {
      const ticket = tickets.find((t: any) => t.id.toString() === ticketIdToRestore);
      if (ticket) {
        const normalized = { ...ticket, status: normalizedTicketStatus(ticket.status) || ticket.status };
        setSelectedTicket(normalized);
        setShowTicketDetail(true);
        fetchTicketMessages(ticket.id);
        if (normalizedTicketStatus(ticket.status) === 'RESOLVED' && ticket.satisfaction_rating) {
          setTicketRating(ticket.satisfaction_rating);
          setTicketRatingFeedback(ticket.satisfaction_feedback || '');
        }
      }
    }
  }, [tickets, showQueueView, searchParams]);

  // Auto-scroll to bottom when new messages arrive (WhatsApp-like: only if user is near bottom)
  useEffect(() => {
    if (!messagesEndRef.current || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    if (nearBottom) {
      const t = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [ticketMessages, selectedTicket]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messagesEndRef.current && !messagesLoading) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  }, [messagesLoading, selectedTicket]);

  // Real-time: new messages and ticket status updates (no manual refresh)
  useEffect(() => {
    if (!selectedTicket?.id) return;
    const supabase = createClient();
    const ticketId = selectedTicket.id;

    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'unified_ticket_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.is_internal_note === true) return;
          // Normalize: DB columns are snake_case (message_text); ensure compatibility
          const msg = {
            ...row,
            message_text: row.message_text ?? (row as any).messageText,
            created_at: row.created_at ?? (row as any).createdAt,
          } as any;
          setTicketMessages((prev) => {
            const has = prev.some((m) => m.id === msg.id);
            if (has) return prev;
            const next = [...prev, msg].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'unified_tickets',
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          const normalized = {
            ...updated,
            status: normalizedTicketStatus((updated.status as string) || ''),
          };
          setSelectedTicket((prev: { id: number } | null) => (prev && prev.id === ticketId ? { ...prev, ...normalized } : prev));
          setTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, ...normalized } : t))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  // Polling fallback: refetch messages periodically so chat updates even without Realtime
  useEffect(() => {
    if (!selectedTicket?.id) return;
    const ticketId = selectedTicket.id;
    const interval = setInterval(() => {
      fetch(`/api/merchant/tickets/messages?ticket_id=${ticketId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.messages)) {
            setTicketMessages((prev) => {
              if (data.messages.length < prev.length) return prev;
              const prevIds = new Set(prev.map((m) => m.id));
              const newOnly = data.messages.filter((m: any) => !prevIds.has(m.id));
              if (newOnly.length === 0 && data.messages.length === prev.length) return prev;
              return data.messages;
            });
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  const handleQueueOpen = () => {
    setShowQueueView(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('userInsights_showQueueView', 'true');
    }
    router.replace(`${pathname ?? '/mx/user-insights'}?view=inbox`);
    fetchTickets();
  };

  const handleBackToInsights = () => {
    setShowQueueView(false);
    setShowTicketDetail(false);
    setSelectedTicket(null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('userInsights_showQueueView', 'false');
      localStorage.removeItem('userInsights_selectedTicketId');
    }
    router.replace(pathname ?? '/mx/user-insights');
  };

  const fetchTicketMessages = async (ticketId: number) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/merchant/tickets/messages?ticket_id=${ticketId}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setTicketMessages(data.messages);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleTicketClick = (ticket: any) => {
    const normalized = { ...ticket, status: normalizedTicketStatus(ticket.status) || ticket.status };
    setSelectedTicket(normalized);
    setShowTicketDetail(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('userInsights_selectedTicketId', ticket.id.toString());
    }
    router.replace(`${pathname ?? '/mx/user-insights'}?view=inbox&ticket=${ticket.id}`);
    fetchTicketMessages(ticket.id);
    // Load existing rating if ticket is resolved
    if (normalizedTicketStatus(ticket.status) === 'RESOLVED' && ticket.satisfaction_rating) {
      setTicketRating(ticket.satisfaction_rating);
      setTicketRatingFeedback(ticket.satisfaction_feedback || '');
    } else {
      setTicketRating(null);
      setTicketRatingFeedback('');
    }
  };

  const handleBackToQueue = () => {
    setShowTicketDetail(false);
    setSelectedTicket(null);
    setTicketReply('');
    setTicketReplyImages([]);
    setTicketMessages([]);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userInsights_selectedTicketId');
    }
    router.replace(`${pathname ?? '/mx/user-insights'}?view=inbox`);
  };

  const handleReopenTicket = async (ticketId: number) => {
    setReopenInProgress(true);
    try {
      const res = await fetch('/api/merchant/tickets/reopen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId })
      });
      
      const data = await res.json();
      if (data.success) {
        await fetchTickets();
        if (selectedTicket && selectedTicket.id === ticketId) {
          const updatedTicket = { 
            ...selectedTicket, 
            status: 'REOPENED', 
            resolution: null,
            resolved_by_name: null,
            reopened_at: new Date().toISOString(),
          };
          setSelectedTicket(updatedTicket);
          fetchTicketMessages(ticketId);
        }
      } else {
        alert(data.error || 'Failed to reopen ticket');
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
      alert('Failed to reopen ticket');
    } finally {
      setReopenInProgress(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedTicket || !ticketRating) return;
    
    setRatingLoading(true);
    try {
      const res = await fetch('/api/merchant/tickets/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          rating: ticketRating,
          feedback: ticketRatingFeedback.trim() || null
        })
      });
      
      const data = await res.json();
      if (data.success) {
        // Update selected ticket with rating
        setSelectedTicket({
          ...selectedTicket,
          satisfaction_rating: ticketRating,
          satisfaction_feedback: ticketRatingFeedback.trim() || null,
          satisfaction_collected_at: new Date().toISOString()
        });
        // Refresh tickets list to update counts
        await fetchTickets();
        setShowRatingModal(false);
      } else {
        alert(data.error || 'Failed to submit rating');
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      alert('Failed to submit rating');
    } finally {
      setRatingLoading(false);
    }
  };

  // Reset rating state when ticket changes
  useEffect(() => {
    if (selectedTicket) {
      if (selectedTicket.satisfaction_rating) {
        setTicketRating(selectedTicket.satisfaction_rating);
        setTicketRatingFeedback(selectedTicket.satisfaction_feedback || '');
      } else {
        setTicketRating(null);
        setTicketRatingFeedback('');
      }
    }
  }, [selectedTicket?.id]);

  const filteredTickets = ticketStatusFilter
    ? ticketStatusFilter === 'REOPENED'
      ? tickets.filter(t => t.status === 'REOPENED' || (t.status === 'OPEN' && (t.resolved_at || t.reopened_at)))
      : ticketStatusFilter === 'PENDING'
        ? tickets.filter(t => t.status === 'PENDING')
        : ticketStatusFilter === 'CLOSED'
          ? tickets.filter(t => t.status === 'CLOSED')
          : tickets.filter(t => t.status === ticketStatusFilter)
    : tickets;

  const handleTicketImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: ImagePreview[] = [];
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        newImages.push({
          file,
          preview,
          uploadProgress: 0
        });
      }
    });

    setTicketReplyImages(prev => [...prev, ...newImages]);
  };

  const removeTicketImage = (index: number) => {
    setTicketReplyImages(prev => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_: ImagePreview, i: number) => i !== index);
    });
  };

  const handleSendReply = async () => {
    if ((!ticketReply.trim() && ticketReplyImages.length === 0) || !selectedTicket) return;
    if (normalizedTicketStatus(selectedTicket.status) === 'CLOSED') return; // UI guard: never send when closed

    setReplyLoading(true);
    try {
      const uploadedImageUrls: string[] = [];
      for (let i = 0; i < ticketReplyImages.length; i++) {
        const image = ticketReplyImages[i];
        if (!image.uploadedUrl) {
          setTicketReplyImages(prev => prev.map((img, idx) =>
            idx === i ? { ...img, uploadProgress: 50 } : img
          ));

          const url = await uploadImageForTicket(image.file, selectedTicket.id);
          if (url) {
            uploadedImageUrls.push(url);
            setTicketReplyImages(prev => prev.map((img, idx) =>
              idx === i ? { ...img, uploadedUrl: url, uploadProgress: 100 } : img
            ));
          } else {
            setTicketReplyImages(prev => prev.map((img, idx) =>
              idx === i ? { ...img, uploadProgress: -1 } : img
            ));
            toast.error(`Failed to upload "${image.file.name}". Remove and try again.`);
          }
        } else {
          uploadedImageUrls.push(image.uploadedUrl);
        }
      }

      if (!ticketReply.trim() && uploadedImageUrls.length === 0) {
        setReplyLoading(false);
        return;
      }

      const res = await fetch('/api/merchant/tickets/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          message: ticketReply.trim(),
          images: uploadedImageUrls
        })
      });

      const data = await res.json();
      if (data.success) {
        setTicketReply('');
        setTicketReplyImages(prev => {
          prev.forEach(img => {
            if (img.preview) URL.revokeObjectURL(img.preview);
          });
          return [];
        });
        fetchTicketMessages(selectedTicket.id);
        // Reset reply textarea height to original after send
        setTimeout(() => {
          const ta = ticketReplyTextareaRef.current;
          if (ta) {
            ta.style.height = 'auto';
            ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
          }
        }, 0);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleImageSelect = (reviewId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: ImagePreview[] = [];
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const preview = URL.createObjectURL(file);
        newImages.push({
          file,
          preview,
          uploadProgress: 0
        });
      }
    });

    setResponseImages(prev => ({
      ...prev,
      [reviewId]: [...(prev[reviewId] || []), ...newImages]
    }));
  };

  const removeImage = (reviewId: string, index: number) => {
    setResponseImages(prev => {
      const images = prev[reviewId] || [];
      const removed = images[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return {
        ...prev,
        [reviewId]: images.filter((_: ImagePreview, i: number) => i !== index)
      };
    });
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parent', 'review-responses');
      formData.append('filename', `${Date.now()}_${file.name}`);

      const res = await fetch('/api/upload/r2', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success && data.url) {
        return data.url;
      }
      return null;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  /** Upload for ticket reply: uses tickets/{ticketId} so R2 returns key (no long signed URL). */
  const uploadImageForTicket = async (file: File, ticketId: number): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('parent', `tickets/${ticketId}`);
      formData.append('filename', `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`);

      const res = await fetch('/api/upload/r2', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success && data.url) {
        return data.url; // For tickets/ parent this is the R2 key, not signed URL
      }
      return null;
    } catch (error) {
      console.error('Error uploading ticket image:', error);
      return null;
    }
  };

  const handleSendResponse = async (reviewId: string) => {
    const message = responseText[reviewId]?.trim();
    const images = responseImages[reviewId] || [];

    if (!message && images.length === 0) return;

    setSendingResponse(prev => ({ ...prev, [reviewId]: true }));

    try {
      // Upload images first
      const uploadedImageUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        if (!image.uploadedUrl) {
          // Update progress
          setResponseImages(prev => ({
            ...prev,
            [reviewId]: (prev[reviewId] || []).map((img, idx) =>
              idx === i ? { ...img, uploadProgress: 50 } : img
            )
          }));

          const url = await uploadImage(image.file);
          if (url) {
            uploadedImageUrls.push(url);
            // Mark as uploaded
            setResponseImages(prev => ({
              ...prev,
              [reviewId]: (prev[reviewId] || []).map((img, idx) =>
                idx === i ? { ...img, uploadedUrl: url, uploadProgress: 100 } : img
              )
            }));
          }
        } else {
          uploadedImageUrls.push(image.uploadedUrl);
        }
      }

      // Send response
      const res = await fetch('/api/merchant/reviews/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: parseInt(reviewId),
          message: message || '',
          images: uploadedImageUrls
        })
      });

      const data = await res.json();
      if (data.success) {
        // Update local state
        setReviews(prev =>
          prev.map(r =>
            String(r.id) === reviewId
              ? {
                  ...r,
                  response: message || '',
                  respondedAt: new Date().toISOString()
                }
              : r
          )
        );

        // Clear form
        setResponseText(prev => ({ ...prev, [reviewId]: '' }));
        setResponseImages(prev => {
          const images = prev[reviewId] || [];
          images.forEach(img => {
            if (img.preview) URL.revokeObjectURL(img.preview);
          });
          return { ...prev, [reviewId]: [] };
        });
      }
    } catch (error) {
      console.error('Error sending response:', error);
    } finally {
      setSendingResponse(prev => ({ ...prev, [reviewId]: false }));
    }
  };

  const handleResponseChange = (id: string, value: string) => {
    setResponseText((prev) => ({ ...prev, [id]: value }));
  };

  const filteredReviews = filter === 'all' 
    ? reviews 
    : filter === 'review' 
    ? reviews.filter(r => r.type === 'Review')
    : reviews.filter(r => r.type === 'Complaint');

  const getUserTypeTag = (userType: string, fraudFlag = '') => {
    const config = {
      repeated: { 
        icon: <UserCheck size={14} />, 
        text: 'Repeated User', 
        bg: 'bg-blue-50', 
        textColor: 'text-blue-700',
        border: 'border-blue-100'
      },
      new: { 
        icon: <UserPlus size={14} />, 
        text: 'New User', 
        bg: 'bg-green-50', 
        textColor: 'text-green-700',
        border: 'border-green-100'
      },
      fraud: { 
        icon: <UserX size={14} />, 
        text: fraudFlag || 'Fraud Risk', 
        bg: 'bg-red-50', 
        textColor: 'text-red-700',
        border: 'border-red-100'
      }
    };
    
    const tag = config[userType as keyof typeof config] ?? config.new;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${tag.bg} ${tag.textColor} ${tag.border} border`}>
        {tag.icon}
        {tag.text}
      </span>
    );
  };

  const getReviewTypeTag = (type: string) => {
    return type === 'Review' ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
        <Star size={12} />
        Review
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
        <AlertTriangle size={12} />
        Complaint
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const parseResponseImages = (response: string): { text: string; images: string[] } => {
    if (!response || typeof response !== 'string') return { text: response || '', images: [] };
    const match = response.match(/\[IMAGES:([\s\S]*?)\]\s*$/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        const images = Array.isArray(parsed) ? parsed : [];
        const text = response.replace(/\n?\n?\[IMAGES:[\s\S]*?\]\s*$/, '').trim();
        return { text, images };
      } catch {
        const text = response.replace(/\n?\n?\[IMAGES:[\s\S]*?\]\s*$/, '').trim();
        return { text, images: [] };
      }
    }
    return { text: response.trim(), images: [] };
  };

  const getImageDisplayName = (urlOrKey: string): string => {
    if (!urlOrKey || typeof urlOrKey !== 'string') return 'Image';
    const s = urlOrKey.trim();
    try {
      if (s.startsWith('http://') || s.startsWith('https://')) {
        const u = new URL(s);
        const seg = u.pathname.split('/').filter(Boolean).pop();
        return seg ? decodeURIComponent(seg) : 'Image';
      }
      const seg = s.split('/').filter(Boolean).pop();
      return seg ? decodeURIComponent(seg).split('?')[0] : 'Image';
    } catch {
      return 'Image';
    }
  };

  // Filter cards component for sidebar (mobile only)
  const ticketFilterCards = showQueueView ? (
    <div className="space-y-2 md:hidden">
      <div className="text-xs font-semibold text-gray-700 mb-2 px-1">Ticket Filters</div>
      <div className="space-y-1.5">
        <button
          onClick={() => {
            setTicketStatusFilter(null);
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', '');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === null ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Total</div>
          <div className="text-base font-bold text-gray-900">{tickets.length}</div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('OPEN');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'OPEN');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'OPEN' ? 'border-blue-600 ring-2 ring-blue-600' : 'border-blue-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Open</div>
          <div className="text-base font-bold text-blue-600">
            {tickets.filter(t => t.status === 'OPEN').length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('IN_PROGRESS');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'IN_PROGRESS');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'IN_PROGRESS' ? 'border-yellow-600 ring-2 ring-yellow-600' : 'border-yellow-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">In Progress</div>
          <div className="text-base font-bold text-yellow-600">
            {tickets.filter(t => t.status === 'IN_PROGRESS').length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('RESOLVED');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'RESOLVED');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'RESOLVED' ? 'border-green-600 ring-2 ring-green-600' : 'border-green-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Resolved</div>
          <div className="text-base font-bold text-green-600">
            {tickets.filter(t => t.status === 'RESOLVED').length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('PENDING');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'PENDING');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'PENDING' ? 'border-amber-600 ring-2 ring-amber-600' : 'border-amber-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Pending</div>
          <div className="text-base font-bold text-amber-600">
            {tickets.filter(t => t.status === 'PENDING').length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('REOPENED');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'REOPENED');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'REOPENED' ? 'border-purple-600 ring-2 ring-purple-600' : 'border-purple-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Reopened</div>
          <div className="text-base font-bold text-purple-600">
            {tickets.filter(t => t.status === 'REOPENED' || (t.status === 'OPEN' && (t.resolved_at || t.reopened_at))).length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter('CLOSED');
            if (typeof window !== 'undefined') {
              localStorage.setItem('userInsights_ticketStatusFilter', 'CLOSED');
              if (window.innerWidth < 768) window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === 'CLOSED' ? 'border-gray-600 ring-2 ring-gray-600' : 'border-gray-200'
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Closed</div>
          <div className="text-base font-bold text-gray-600">
            {tickets.filter(t => t.status === 'CLOSED').length}
          </div>
        </button>
      </div>
    </div>
  ) : null;

  return (
    <MXLayoutWhite 
      restaurantName={store?.store_name} 
      restaurantId={storeId || DEMO_STORE_ID}
      hideHelpBadge={showTicketDetail && selectedTicket !== null}
      sidebarFilters={ticketFilterCards}
    >
      <div className="w-full p-3 sm:p-4 lg:p-5 relative h-full flex flex-col overflow-hidden">
        {/* Show Queue View or User Insights */}
        {showQueueView ? (
          showTicketDetail && selectedTicket ? (
            /* Ticket Detail Panel - Compact Chat */
            <>
            <div className="flex flex-col bg-white border border-gray-200 overflow-hidden rounded-lg w-full h-[calc(100dvh-3rem)] sm:h-[calc(100vh-80px)] min-h-[300px]">
              {/* Ticket Header - Compact SaaS-style */}
              <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-2.5 overflow-hidden">
                <div className="flex items-start sm:items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                  {/* Left: back + menu */}
                  <div className="flex items-center gap-1 flex-shrink-0 order-1">
                    <button
                      onClick={handleBackToQueue}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                      aria-label="Go back to inbox"
                      title="Go back"
                    >
                      <ChevronLeft size={20} className="text-gray-600" />
                    </button>
                    <MobileHamburgerButton />
                  </div>

                  {/* Center: title (primary) + metadata row (secondary) - full width when wrapped on mobile */}
                  <div className="flex-1 min-w-0 w-full sm:w-auto basis-full sm:basis-0 order-3 sm:order-2 flex flex-col items-center text-center">
                    <h1 
                      className="text-sm sm:text-base font-semibold text-gray-900 truncate w-full max-w-full leading-tight" 
                      title={selectedTicket.subject}
                    >
                      {selectedTicket.subject}
                    </h1>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 truncate w-full max-w-full">
                      <span className="font-mono">#{selectedTicket.ticket_id}</span>
                      <span className="mx-1.5 text-gray-400">·</span>
                      <span>{selectedTicket.ticket_category}</span>
                      <span className="mx-1.5 text-gray-400">·</span>
                      <span>{new Date(selectedTicket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </p>
                  </div>

                  {/* Right: status + priority + rating pills */}
                  <div className="flex items-center gap-1.5 flex-shrink-0 order-2 sm:order-3 flex-wrap justify-end">
                    <span className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                      normalizedTicketStatus(selectedTicket.status) === 'REOPENED'
                        ? 'bg-purple-50 text-purple-700 border border-purple-100'
                        : normalizedTicketStatus(selectedTicket.status) === 'OPEN'
                        ? 'bg-blue-50 text-blue-700 border border-blue-100'
                        : normalizedTicketStatus(selectedTicket.status) === 'IN_PROGRESS'
                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                        : normalizedTicketStatus(selectedTicket.status) === 'RESOLVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : normalizedTicketStatus(selectedTicket.status) === 'PENDING'
                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                        : 'bg-gray-50 text-gray-600 border border-gray-100'
                    }`}>
                      {selectedTicket.status || 'OPEN'}
                    </span>
                    <span className={`px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium whitespace-nowrap ${
                      selectedTicket.priority === 'HIGH' ? 'bg-red-50 text-red-700 border border-red-100' :
                      selectedTicket.priority === 'URGENT' ? 'bg-red-100 text-red-800 border border-red-200' :
                      selectedTicket.priority === 'MEDIUM' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                      'bg-gray-50 text-gray-600 border border-gray-100'
                    }`}>
                      {selectedTicket.priority}
                    </span>
                    {selectedTicket.satisfaction_rating != null && selectedTicket.satisfaction_rating > 0 && (
                      <span className="px-2 py-1 rounded-md text-[10px] sm:text-xs font-medium whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-100 inline-flex items-center gap-0.5">
                        <Star size={10} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                        <span>
                          {selectedTicket.satisfaction_rating >= 4 ? 'Excellent' : selectedTicket.satisfaction_rating >= 3 ? 'Good' : selectedTicket.satisfaction_rating >= 2 ? 'Okay' : 'Poor'}
                        </span>
                        <span className="text-amber-600/80">({selectedTicket.satisfaction_rating}/5)</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Chat Messages - Scrollable; padding-bottom reserves space so chat never overlaps fixed reply section */}
              <div 
                ref={chatContainerRef}
                className={`flex-1 min-h-0 overflow-y-auto bg-[#e5ddd5] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iYSIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiPjxwYXRoIGQ9Ik0wIDBoNTB2NTBIMHoiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii4wNSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCIgaGVpZ2h0PSIxMDAiIGZpbGw9InVybCgjYSkiLz48L3N2Zz4=')] p-2 sm:p-3 md:p-4 scrollbar-hide ${
                  normalizedTicketStatus(selectedTicket.status) !== 'CLOSED'
                    ? 'pb-[200px] sm:pb-[220px]'
                    : 'pb-4'
                }`}
              >
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin h-6 w-6 text-orange-600" />
                  </div>
                ) : (
                  <>
                    {/* Original Ticket Message - Merchant (Right Aligned) */}
                    <div className="flex items-start gap-1.5 mb-3 min-w-0 flex-row-reverse">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 mt-0.5">
                        {selectedTicket.raised_by_name ? selectedTicket.raised_by_name.charAt(0).toUpperCase() : 'M'}
                      </div>
                      <div className="flex flex-col gap-1 min-w-0 max-w-[75%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%] items-end">
                        <div className="mb-0.5 px-1 text-right w-full min-w-0">
                          <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block text-right">
                            {selectedTicket.raised_by_name || 'Merchant'}
                          </span>
                        </div>
                        <div className="bg-white rounded-2xl rounded-tr-sm px-3 py-2 sm:px-4 sm:py-2 shadow-sm break-words min-w-0 w-full">
                          <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap leading-relaxed break-words">{selectedTicket.description}</p>
                          {selectedTicket.attachments && selectedTicket.attachments.length > 0 && (
                            <div className="mt-1.5 space-y-1.5">
                              {selectedTicket.attachments.map((url: string, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => setSelectedImage(getTicketAttachmentViewUrl(url))}
                                  className="block w-full"
                                >
                                  <img
                                    src={getTicketAttachmentViewUrl(url)}
                                    alt={`Attachment ${idx + 1}`}
                                    className="w-full max-w-sm rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] text-gray-500 flex-shrink-0 px-1 text-right w-full">
                          {formatTime(selectedTicket.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* All Messages from Database */}
                    {ticketMessages.map((msg, idx) => {
                      const isMerchant = msg.sender_type === 'MERCHANT';
                      const isAgent = msg.sender_type === 'AGENT';
                      const isCustomer = msg.sender_type === 'CUSTOMER';
                      const { text, images } = parseResponseImages(msg.message_text || '');
                      const showSenderLabel = idx === 0 || 
                        (idx > 0 && ticketMessages[idx - 1].sender_type !== msg.sender_type) ||
                        (new Date(msg.created_at).getTime() - new Date(ticketMessages[idx - 1]?.created_at || msg.created_at).getTime()) > 300000; // 5 minutes
                      
                      return (
                        <div key={msg.id} className={`flex items-start gap-1.5 mb-3 min-w-0 ${isMerchant ? 'flex-row-reverse' : ''}`}>
                          {/* Avatar - Only show if new sender group */}
                          {showSenderLabel && (
                            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs flex-shrink-0 mt-0.5 ${
                              isMerchant 
                                ? 'bg-gradient-to-br from-orange-500 to-orange-600' 
                                : isAgent
                                ? 'bg-gradient-to-br from-[#25D366] to-[#128C7E]'
                                : 'bg-gradient-to-br from-blue-500 to-blue-600'
                            }`}>
                              {isMerchant 
                                ? (msg.sender_name ? msg.sender_name.charAt(0).toUpperCase() : 'M')
                                : isAgent
                                ? 'G'
                                : (msg.sender_name ? msg.sender_name.charAt(0).toUpperCase() : 'C')}
                            </div>
                          )}
                          {!showSenderLabel && <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0" />}
                          
                          <div className={`flex flex-col gap-1 min-w-0 max-w-[75%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%] ${isMerchant ? 'items-end' : ''}`}>
                            {/* Sender Label - Only for GatiMitra Team or new merchant messages */}
                            {showSenderLabel && (
                              <div className={`mb-0.5 px-1 min-w-0 overflow-hidden w-full ${isMerchant ? 'text-right' : ''}`}>
                                {isAgent ? (
                                  <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                    Responded by GatiMitra Team
                                  </span>
                                ) : isMerchant ? (
                                  <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                    {msg.sender_name || 'Merchant'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                    {msg.sender_name || (isCustomer ? 'Customer' : 'Merchant')}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {/* Message Bubble */}
                            <div className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-2 shadow-sm break-words min-w-0 w-full ${
                              isMerchant
                                ? 'bg-white rounded-tr-sm'
                                : isAgent
                                ? 'bg-[#DCF8C6] rounded-tl-sm'
                                : 'bg-[#E7F3FF] rounded-tl-sm'
                            }`}>
                              {/* Text Content */}
                              {text && (
                                <p className={`text-sm sm:text-base whitespace-pre-wrap leading-relaxed break-words ${
                                  isMerchant ? 'text-gray-900' : 'text-gray-900'
                                }`}>
                                  {text}
                                </p>
                              )}
                              
                              {/* Images - use proxy URL so R2 key works; show only original filename as caption */}
                              {images.length > 0 && (
                                <div className={`mt-1.5 space-y-1.5 ${images.length > 1 ? 'grid grid-cols-2 gap-1.5' : ''}`}>
                                  {images.map((img, imgIdx) => (
                                    <div key={imgIdx} className="space-y-0.5">
                                      <button
                                        onClick={() => setSelectedImage(getTicketAttachmentViewUrl(img))}
                                        className="block rounded-lg overflow-hidden w-full"
                                      >
                                        <img
                                          src={getTicketAttachmentViewUrl(img)}
                                          alt={getImageDisplayName(img)}
                                          className="w-full max-w-xs rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                          loading="lazy"
                                        />
                                      </button>
                                      <p className="text-[10px] text-gray-500 truncate" title={getImageDisplayName(img)}>
                                        {getImageDisplayName(img)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Attachments */}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-1.5 space-y-1.5">
                                  {msg.attachments.map((url: string, attIdx: number) => (
                                    <button 
                                      key={attIdx}
                                      onClick={() => setSelectedImage(getTicketAttachmentViewUrl(url))}
                                      className="block rounded-lg overflow-hidden w-full"
                                    >
                                      <img
                                        src={getTicketAttachmentViewUrl(url)}
                                        alt={`Attachment ${attIdx + 1}`}
                                        className="w-full max-w-xs rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        loading="lazy"
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            {/* Timestamp - own row with gap so no overlap */}
                            <span className={`text-[9px] text-gray-500 flex-shrink-0 px-1 w-full ${isMerchant ? 'text-right' : ''}`}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Resolution Message - GatiMitra Team (Left Aligned) */}
                    {selectedTicket.resolution && (
                      <>
                        <div className="flex justify-center my-2">
                          <div className="px-2.5 py-0.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full text-[10px] sm:text-xs text-gray-600 flex items-center gap-1 shadow-sm">
                            <CheckCircle size={10} />
                            Ticket Resolved
                          </div>
                        </div>
                        <div className="flex items-start gap-1.5 mb-3">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-[#25D366] to-[#128C7E] rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                            <CheckCircle size={12} />
                          </div>
                          <div className="flex flex-col gap-1 min-w-0 max-w-[75%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%]">
                            <div className="mb-0.5 px-1 min-w-0">
                              <span className="text-[10px] sm:text-xs text-gray-600 font-medium">
                                Responded by GatiMitra Team
                              </span>
                            </div>
                            <div className="bg-[#DCF8C6] rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-2 shadow-sm break-words w-full">
                              <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap leading-relaxed break-words">{selectedTicket.resolution}</p>
                            </div>
                            <span className="text-[9px] text-gray-500 flex-shrink-0 px-1">
                              {selectedTicket.resolved_at && formatTime(selectedTicket.resolved_at)}
                            </span>
                          </div>
                        </div>
                      </>
                    )}

                    {/* Ticket Closing, Rating & Reopen Section - Compact Inline Panel */}
                    {(normalizedTicketStatus(selectedTicket.status) === 'CLOSED' || normalizedTicketStatus(selectedTicket.status) === 'RESOLVED') && (
                      <>
                        {/* Closing Banner - Compact */}
                        <div className="flex justify-center my-2 px-2">
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-sm animate-fade-in">
                            <CheckCircle size={12} className="text-green-600 flex-shrink-0" />
                            <span className="text-[10px] sm:text-xs font-medium text-gray-800">
                              {normalizedTicketStatus(selectedTicket.status) === 'CLOSED' ? 'This ticket is permanently closed' : 'This conversation has been closed'}
                            </span>
                          </div>
                        </div>

                        {/* CLOSED: no reopen option */}
                        {normalizedTicketStatus(selectedTicket.status) === 'CLOSED' && (
                          <div className="px-2 sm:px-3 mb-2">
                            <p className="text-[10px] sm:text-xs text-gray-500 text-center">
                              Reopening is not available for closed tickets.
                            </p>
                          </div>
                        )}

                        {/* Rating Panel - Compact, Redirects on Click (RESOLVED only) */}
                        {normalizedTicketStatus(selectedTicket.status) === 'RESOLVED' && !selectedTicket.satisfaction_rating && (
                          <div className="px-2 sm:px-3 mb-2 animate-fade-in">
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5 sm:p-3">
                              {/* Rating Prompt - Compact */}
                              <p className="text-[10px] sm:text-xs text-gray-700 mb-2 text-center">
                                Please rate your overall experience with our support
                              </p>

                              {/* Emoji Rating System - Compact */}
                              <div className="mb-2">
                                <p className="text-[9px] sm:text-[10px] text-gray-600 mb-1.5 text-center">
                                  How well were we able to solve your problem?
                                </p>
                                <div className="flex justify-center items-center gap-1 sm:gap-1.5 flex-wrap">
                                  {[
                                    { value: 1, emoji: '😠', label: 'Very Poor' },
                                    { value: 2, emoji: '😢', label: 'Poor' },
                                    { value: 3, emoji: '😐', label: 'Neutral' },
                                    { value: 4, emoji: '😊', label: 'Good' },
                                    { value: 5, emoji: '😍', label: 'Excellent' }
                                  ].map(({ value, emoji, label }) => (
                                    <button
                                      key={value}
                                      onClick={() => {
                                        // Redirect to feedback page immediately
                                        window.location.href = `/mx/user-insights/feedback/${selectedTicket.id}`;
                                      }}
                                      className="flex flex-col items-center gap-0.5 p-1 sm:p-1.5 rounded-lg transition-all duration-200 bg-gray-50 hover:bg-gray-100 hover:scale-105"
                                    >
                                      <span className="text-lg sm:text-xl">
                                        {emoji}
                                      </span>
                                      <span className="text-[8px] sm:text-[9px] font-medium text-gray-500">
                                        {label}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Already Rated Display - Compact */}
                        {normalizedTicketStatus(selectedTicket.status) === 'RESOLVED' && selectedTicket.satisfaction_rating && (
                          <div className="px-2 sm:px-3 mb-2">
                            <div className="bg-green-50 rounded-lg border border-green-200 p-2.5 sm:p-3">
                              <p className="text-[10px] sm:text-xs text-gray-700 mb-0.5 text-center">
                                <span className="font-semibold">Thank you! You rated this ticket </span>
                                <span className="inline-flex items-center gap-0.5">
                                  {Array.from({ length: selectedTicket.satisfaction_rating }).map((_: unknown, i: number) => (
                                    <Star key={i} size={12} className="text-yellow-400 fill-current" />
                                  ))}
                                </span>
                              </p>
                              {selectedTicket.satisfaction_feedback && (
                                <p className="text-[9px] sm:text-[10px] text-gray-600 text-center italic mt-0.5">
                                  "{selectedTicket.satisfaction_feedback}"
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Chat with Us - RESOLVED only (never for CLOSED) */}
                        {normalizedTicketStatus(selectedTicket.status) === 'RESOLVED' && (
                          <div className="px-2 sm:px-3 mb-2">
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5 sm:p-3">
                              <p className="text-[9px] sm:text-[10px] text-gray-600 mb-1.5 text-center">
                                Still having an issue?
                              </p>
                              <button
                                onClick={() => handleReopenTicket(selectedTicket.id)}
                                disabled={reopenInProgress}
                                className="w-full px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium text-[10px] sm:text-xs hover:bg-orange-700 transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                              >
                                {reopenInProgress ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                                    Opening chat…
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    Chat with us
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    
                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
            </div>

            {/* Image Modal Popup */}
            {selectedImage && (
              <div 
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1200] flex items-center justify-center p-4"
                onClick={() => setSelectedImage(null)}
              >
                <div className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center">
                  <button
                    onClick={() => setSelectedImage(null)}
                    className="absolute top-4 right-4 bg-white/90 hover:bg-white text-gray-800 rounded-full p-2 shadow-lg transition-colors z-10"
                    aria-label="Close"
                  >
                    <X size={24} />
                  </button>
                  <img
                    src={selectedImage}
                    alt="Full size"
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}

            {/* Chat Input - WhatsApp Style - Fixed at Bottom. Visible for PENDING, OPEN, IN_PROGRESS, REOPENED, RESOLVED; disabled only when CLOSED */}
            {normalizedTicketStatus(selectedTicket.status) !== 'CLOSED' && (
              <div className="fixed bottom-0 bg-[#F0F2F5] border-t border-gray-300 p-1.5 sm:p-2 md:p-2.5 left-0 md:left-64 right-0 z-[1100]" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}>
                <div className="max-w-6xl mx-auto">
                  {/* Image Previews */}
                  {ticketReplyImages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5 pb-1.5 border-b border-gray-300">
                      {ticketReplyImages.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={img.preview}
                            alt={`Preview ${idx + 1}`}
                            className={`w-14 h-14 sm:w-16 sm:h-16 object-cover rounded-lg border-2 shadow-sm ${
                              img.uploadProgress === -1 ? 'border-red-400' : 'border-gray-300'
                            }`}
                          />
                          {img.uploadProgress >= 0 && img.uploadProgress < 100 && (
                            <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                              <Loader2 className="animate-spin h-3.5 w-3.5 text-white" />
                            </div>
                          )}
                          {img.uploadProgress === -1 && (
                            <div className="absolute inset-0 bg-red-900/30 rounded-lg flex items-center justify-center">
                              <span className="text-[9px] font-semibold text-white px-1 text-center">Failed</span>
                            </div>
                          )}
                          <button
                            onClick={() => removeTicketImage(idx)}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Input Area */}
                  <div className="flex items-end gap-1.5 bg-white rounded-3xl px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-sm border border-gray-200">
                    <input
                      ref={ticketReplyFileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleTicketImageSelect(e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => normalizedTicketStatus(selectedTicket.status) !== 'CLOSED' && ticketReplyFileInputRef.current?.click()}
                      disabled={normalizedTicketStatus(selectedTicket.status) === 'CLOSED'}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Attach image"
                    >
                      <Paperclip size={18} className="sm:w-4 sm:h-4" />
                    </button>
                    <textarea
                      ref={ticketReplyTextareaRef}
                      value={ticketReply}
                      onChange={(e) => {
                        setTicketReply(e.target.value);
                        // Auto-resize textarea
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                      }}
                      placeholder="Type a message"
                      rows={1}
                      disabled={normalizedTicketStatus(selectedTicket.status) === 'CLOSED'}
                      className="flex-1 min-h-[24px] px-2 sm:px-2.5 py-1.5 text-sm sm:text-base bg-transparent border-none focus:outline-none resize-none max-h-[100px] scrollbar-hide disabled:opacity-60 disabled:cursor-not-allowed"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if ((ticketReply.trim() || ticketReplyImages.length > 0) && !replyLoading && normalizedTicketStatus(selectedTicket.status) !== 'CLOSED') {
                            handleSendReply();
                          }
                        }
                      }}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={normalizedTicketStatus(selectedTicket.status) === 'CLOSED' || (!ticketReply.trim() && ticketReplyImages.length === 0) || replyLoading}
                      className={`p-1.5 rounded-full flex-shrink-0 transition-all ${
                        (ticketReply.trim() || ticketReplyImages.length > 0) && !replyLoading
                          ? 'bg-[#25D366] text-white hover:bg-[#20BA5A] shadow-md' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                      title="Send message"
                    >
                      {replyLoading ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : (
                        <Send size={18} className="sm:w-4 sm:h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 text-center">
                    Press Enter to send • Shift+Enter for new line
                  </p>
                </div>
              </div>
            )}

          </>
        ) : (
          /* Queue View - Full Page */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Queue Header - Redesigned */}
            <div className="mb-3 sm:mb-4 flex-shrink-0 rounded-b-xl bg-gradient-to-r from-orange-50 via-white to-amber-50 border-b border-orange-100 shadow-sm px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowQueueView(false);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem('userInsights_showQueueView', 'false');
                    }
                    router.replace(pathname ?? '/mx/user-insights');
                  }}
                  className="p-2.5 hover:bg-orange-100/80 rounded-xl transition-colors flex-shrink-0 text-gray-700 hover:text-orange-700"
                  aria-label="Back to User Insights"
                  title="Back to User Insights"
                >
                  <ChevronLeft size={22} strokeWidth={2} />
                </button>
                <MobileHamburgerButton />
                <div className="flex items-center gap-3 flex-1 min-w-0 justify-center">
                  <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-500 text-white shadow-md flex-shrink-0">
                    <Inbox className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="text-center min-w-0">
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 tracking-tight">Support Inbox</h1>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 font-medium">Store & GatiMitra concern tickets</p>
                  </div>
                </div>
                <div className="w-10 sm:w-12 flex-shrink-0" aria-hidden />
              </div>
            </div>

            {/* Tickets Stats - Desktop: grid with Pending & Closed */}
            <div className="hidden md:grid md:grid-cols-4 lg:grid-cols-7 gap-2 mb-3 flex-shrink-0">
              <button
                onClick={() => {
                  setTicketStatusFilter(null);
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', '');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === null ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Total</div>
                <div className="text-lg font-bold text-gray-900">{tickets.length}</div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('OPEN');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'OPEN');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'OPEN' ? 'border-blue-600 ring-2 ring-blue-600' : 'border-blue-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Open</div>
                <div className="text-lg font-bold text-blue-600">
                  {tickets.filter(t => t.status === 'OPEN').length}
                </div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('IN_PROGRESS');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'IN_PROGRESS');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'IN_PROGRESS' ? 'border-yellow-600 ring-2 ring-yellow-600' : 'border-yellow-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">In Progress</div>
                <div className="text-lg font-bold text-yellow-600">
                  {tickets.filter(t => t.status === 'IN_PROGRESS').length}
                </div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('RESOLVED');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'RESOLVED');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'RESOLVED' ? 'border-green-600 ring-2 ring-green-600' : 'border-green-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Resolved</div>
                <div className="text-lg font-bold text-green-600">
                  {tickets.filter(t => t.status === 'RESOLVED').length}
                </div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('PENDING');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'PENDING');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'PENDING' ? 'border-amber-600 ring-2 ring-amber-600' : 'border-amber-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Pending</div>
                <div className="text-lg font-bold text-amber-600">
                  {tickets.filter(t => t.status === 'PENDING').length}
                </div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('REOPENED');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'REOPENED');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'REOPENED' ? 'border-purple-600 ring-2 ring-purple-600' : 'border-purple-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Reopened</div>
                <div className="text-lg font-bold text-purple-600">
                  {tickets.filter(t => t.status === 'REOPENED' || (t.status === 'OPEN' && (t.resolved_at || t.reopened_at))).length}
                </div>
              </button>
              <button
                onClick={() => {
                  setTicketStatusFilter('CLOSED');
                  if (typeof window !== 'undefined') localStorage.setItem('userInsights_ticketStatusFilter', 'CLOSED');
                }}
                className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow-md transition-all text-left ${
                  ticketStatusFilter === 'CLOSED' ? 'border-gray-600 ring-2 ring-gray-600' : 'border-gray-200'
                }`}
              >
                <div className="text-[10px] text-gray-500 mb-0.5">Closed</div>
                <div className="text-lg font-bold text-gray-600">
                  {tickets.filter(t => t.status === 'CLOSED').length}
                </div>
              </button>
            </div>

            {/* Tickets List */}
            <div className="space-y-2 sm:space-y-2.5 overflow-y-auto flex-1 min-h-0 pb-2 scrollbar-hide">
              {ticketsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_: unknown, i: number) => (
                    <div key={i} className="animate-pulse bg-white rounded-lg border border-gray-200 p-2.5 sm:p-3 lg:p-4">
                      <div className="h-3 bg-gray-200 rounded w-1/3 mb-2"></div>
                      <div className="h-2.5 bg-gray-200 rounded w-full mb-1"></div>
                      <div className="h-2.5 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  ))}
                </div>
              ) : filteredTickets.length > 0 ? (
                filteredTickets.map((ticket) => (
                  <div 
                    key={ticket.id} 
                    onClick={() => handleTicketClick(ticket)}
                    className="bg-white rounded-lg border border-gray-200 p-2.5 sm:p-3 lg:p-4 hover:shadow-md hover:border-orange-300 transition-all cursor-pointer"
                  >
                    {/* Compact Ticket Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          ticket.status === 'REOPENED'
                            ? 'bg-purple-50 text-purple-700'
                            : ticket.status === 'OPEN' 
                            ? 'bg-blue-50 text-blue-700'
                            : ticket.status === 'IN_PROGRESS' 
                            ? 'bg-yellow-50 text-yellow-700'
                            : ticket.status === 'RESOLVED' 
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-50 text-gray-700'
                        }`}>
                          {ticket.status || 'OPEN'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          ticket.priority === 'HIGH' ? 'bg-red-50 text-red-700' :
                          ticket.priority === 'URGENT' ? 'bg-red-100 text-red-800' :
                          ticket.priority === 'MEDIUM' ? 'bg-orange-50 text-orange-700' :
                          'bg-gray-50 text-gray-600'
                        }`}>
                          {ticket.priority || 'MEDIUM'}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">#{ticket.ticket_id}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(ticket.created_at).toLocaleDateString('en-IN', { 
                          day: 'numeric', 
                          month: 'short'
                        })}
                      </div>
                    </div>

                    {/* Compact Ticket Content */}
                    <h4 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{ticket.subject}</h4>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-2">{ticket.description}</p>

                    {/* Compact Ticket Meta */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 text-orange-700 text-xs font-medium">
                        {ticket.ticket_title?.replace(/_/g, ' ').substring(0, 20)}
                      </span>
                    </div>
                  </div>
                ))
              ) : filteredTickets.length === 0 && tickets.length > 0 ? (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Filter className="text-gray-400" size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-700 mb-1">No tickets found</h3>
                  <p className="text-sm text-gray-500">No tickets match the selected filter</p>
                  <button
                    onClick={() => setTicketStatusFilter(null)}
                    className="mt-3 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 transition-colors"
                  >
                    Show All Tickets
                  </button>
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Inbox className="text-gray-400" size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-700 mb-1">No tickets yet</h3>
                  <p className="text-sm text-gray-500">Your store tickets will appear here</p>
                </div>
              )}
            </div>
          </div>
          )
        ) : (
          /* User Insights View */
          <div className="flex flex-col h-full overflow-hidden">
        {/* Compact Header Section */}
        <div className="mb-3 sm:mb-4 flex-shrink-0 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Hamburger Menu - Left Side */}
            <MobileHamburgerButton />
            
            {/* Heading - Left Aligned */}
            <div className="flex-1 min-w-0 text-left">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">User Insights</h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Monitor customer feedback and respond to reviews</p>
            </div>
            
            {/* Right: Inbox Button */}
            <button
              onClick={handleQueueOpen}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-orange-600 text-white rounded-lg font-medium text-xs sm:text-sm hover:bg-orange-700 transition-all shadow-sm hover:shadow-md flex-shrink-0"
            >
              <Inbox size={14} className="sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Support Inbox</span>
              <span className="sm:hidden">Inbox</span>
            </button>
          </div>
        </div>

        {/* Compact Stats Overview */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Total</div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5 flex items-center gap-0.5">
              <Star size={9} className="sm:w-2.5 sm:h-2.5" />
              <span className="hidden sm:inline">Reviews</span>
              <span className="sm:hidden">Rev</span>
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-green-600">{stats.reviews}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5 flex items-center gap-0.5">
              <AlertTriangle size={9} className="sm:w-2.5 sm:h-2.5" />
              <span className="hidden sm:inline">Complaints</span>
              <span className="sm:hidden">Comp</span>
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-amber-600">{stats.complaints}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Repeated</div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-blue-600">{stats.repeatedUsers}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">New</div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-green-600">{stats.newUsers}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Fraud</div>
            <div className="text-base sm:text-lg lg:text-xl font-bold text-red-600">{stats.fraudUsers}</div>
          </div>
        </div>

        {/* Compact Navigation Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 flex-shrink-0">
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            <button
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs transition-all ${
                filter === 'all' 
                  ? 'bg-gray-900 text-white shadow-sm' 
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => {
                setFilter('all');
                // Close sidebar on mobile
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
                }
              }}
            >
              All
            </button>
            <button
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-all ${
                filter === 'review' 
                  ? 'bg-green-600 text-white shadow-sm' 
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => {
                setFilter('review');
                // Close sidebar on mobile
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
                }
              }}
            >
              <Star size={10} className="sm:w-3 sm:h-3" />
              Reviews
            </button>
            <button
              className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-all ${
                filter === 'complaint' 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
              onClick={() => {
                setFilter('complaint');
                // Close sidebar on mobile
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  window.dispatchEvent(new CustomEvent('closeMobileSidebar'));
                }
              }}
            >
              <AlertTriangle size={10} className="sm:w-3 sm:h-3" />
              Complaints
            </button>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-gray-600">
            <Filter size={10} className="sm:w-3 sm:h-3" />
            <span>Showing {filteredReviews.length} of {reviews.length}</span>
          </div>
        </div>

        {/* Compact Reviews/Complaints List */}
        <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pb-2 scrollbar-hide">
          {loading ? (
            Array.from({ length: 4 }).map((_: unknown, i: number) => <SkeletonReviewRow key={i} />)
          ) : filteredReviews.length > 0 ? (
            filteredReviews.map((review) => (
              <div 
                key={review.id} 
                className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 lg:p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Compact Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-gray-700 font-bold text-xs sm:text-sm lg:text-base flex-shrink-0">
                      {review.customerName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-gray-900 text-xs sm:text-sm lg:text-base truncate">{review.customerName}</h3>
                        <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                          <Calendar size={9} className="sm:w-2.5 sm:h-2.5" />
                          {formatDate(review.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                        {getReviewTypeTag(review.type)}
                        {getUserTypeTag(review.userType, review.flagReason || '')}
                        {review.orderCount > 0 && (
                          <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-50 px-1.5 sm:px-2 py-0.5 rounded border border-gray-100">
                            {review.orderCount} {review.orderCount === 1 ? 'order' : 'orders'}
                          </span>
                        )}
                        {review.rating && (
                          <div className="flex items-center gap-0.5">
                            {[...Array(5)].map((_: unknown, i: number) => (
                              <Star 
                                key={i} 
                                size={10} 
                                className={`sm:w-3 sm:h-3 ${i < review.rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} 
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] sm:text-xs text-gray-500 font-mono">#{review.id.toString().padStart(4, '0')}</div>
                  </div>
                </div>

                {/* Customer Message */}
                <div className="mb-3 sm:mb-4">
                  <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 lg:p-4 border-l-4 border-gray-300">
                    <p className="text-xs sm:text-sm lg:text-base text-gray-800 leading-relaxed">{review.message}</p>
                    {review.reviewImages && review.reviewImages.length > 0 && (
                      <div className="mt-2 sm:mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                        {review.reviewImages.map((img, idx) => (
                          <img
                            key={idx}
                            src={img}
                            alt={`Review image ${idx + 1}`}
                            className="w-full h-20 sm:h-24 lg:h-32 object-cover rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Premium Conversation Panel */}
                {review.response ? (
                  <div className="space-y-2 sm:space-y-3">
                    {/* Store Response */}
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] sm:text-xs flex-shrink-0">
                        {store?.store_name?.charAt(0).toUpperCase() || 'S'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <span className="font-semibold text-gray-900 text-xs sm:text-sm">
                            {store?.store_name || 'Store'}
                          </span>
                          <span className="text-[10px] sm:text-xs text-gray-500">
                            {review.respondedAt && `${formatDate(review.respondedAt)} • ${formatTime(review.respondedAt)}`}
                          </span>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-lg rounded-tl-none p-2.5 sm:p-3 lg:p-4 shadow-sm">
                          {(() => {
                            const { text, images } = parseResponseImages(review.response);
                            return (
                              <>
                                {text && (
                                  <p className="text-xs sm:text-sm lg:text-base text-gray-800 whitespace-pre-wrap leading-relaxed mb-2">
                                    {text}
                                  </p>
                                )}
                                {images.length > 0 && (
                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                                    {images.map((img, idx) => (
                                      <a
                                        key={idx}
                                        href={img}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                      >
                                        <img
                                          src={img}
                                          alt={`Response image ${idx + 1}`}
                                          className="w-full h-20 sm:h-24 lg:h-32 object-cover rounded-lg border-2 border-orange-300 hover:border-orange-400 transition-colors"
                                        />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-2.5 sm:p-3 lg:p-4 bg-gray-50">
                    <div className="space-y-2 sm:space-y-3">
                      {/* Image Previews */}
                      {responseImages[String(review.id)] && responseImages[String(review.id)].length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {responseImages[String(review.id)].map((img, idx) => (
                            <div key={idx} className="relative group">
                              <img
                                src={img.preview}
                                alt={`Preview ${idx + 1}`}
                                className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 object-cover rounded-lg border-2 border-gray-300"
                              />
                              {img.uploadProgress < 100 && (
                                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                                  <Loader2 className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-white" />
                                </div>
                              )}
                              <button
                                onClick={() => removeImage(String(review.id), idx)}
                                className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 bg-red-500 text-white rounded-full p-0.5 sm:p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={10} className="sm:w-3 sm:h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Input Area */}
                      <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2">
                        <div className="flex-1 relative">
                          <textarea
                            value={responseText[String(review.id)] || ''}
                            onChange={(e) => handleResponseChange(String(review.id), e.target.value)}
                            placeholder="Type your response..."
                            rows={2}
                            className="w-full px-2.5 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 border border-gray-300 rounded-lg text-xs sm:text-sm lg:text-base focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                          />
                          <input
                            ref={(el) => {
                              fileInputRefs.current[String(review.id)] = el;
                            }}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handleImageSelect(String(review.id), e.target.files)}
                          />
                        </div>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            onClick={() => fileInputRefs.current[String(review.id)]?.click()}
                            className="px-2.5 sm:px-3 lg:px-4 py-2 sm:py-2.5 lg:py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center flex-shrink-0"
                            title="Attach image"
                          >
                            <Paperclip size={16} className="sm:w-[18px] sm:h-[18px]" />
                          </button>
                          <button
                            onClick={() => handleSendResponse(String(review.id))}
                            disabled={(!responseText[String(review.id)]?.trim() && (!responseImages[String(review.id)] || responseImages[String(review.id)].length === 0)) || sendingResponse[String(review.id)]}
                            className={`px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 lg:py-3 rounded-lg font-semibold text-xs sm:text-sm lg:text-base flex items-center justify-center gap-1.5 sm:gap-2 transition-all flex-shrink-0 ${
                              (responseText[String(review.id)]?.trim() || (responseImages[String(review.id)] && responseImages[String(review.id)].length > 0)) && !sendingResponse[String(review.id)]
                                ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-sm' 
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {sendingResponse[String(review.id)] ? (
                              <>
                                <Loader2 className="animate-spin h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="hidden sm:inline">Sending...</span>
                              </>
                            ) : (
                              <>
                                <Send size={14} className="sm:w-4 sm:h-4" />
                                <span className="hidden sm:inline">Send</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-8 sm:p-12 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <MessageSquare className="text-gray-400" size={24} />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-1 sm:mb-2">No feedback found</h3>
              <p className="text-sm sm:text-base text-gray-500">There are no {filter === 'all' ? '' : filter} entries to display.</p>
            </div>
          )}
        </div>
          </div>
        )}
      </div>
    </MXLayoutWhite>
  );
};

const UserInsightsPage = () => {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    }>
      <UserInsightsContent />
    </Suspense>
  );
};

export default UserInsightsPage;
