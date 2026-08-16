import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Paperclip, 
  X, 
  RotateCcw, 
  Bot, 
  User, 
  Sparkles,
  MessageSquare,
  Image as ImageIcon,
  ChevronDown,
  Headset,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';
import { AgentConfig, Attachment, ChatMessage, KnowledgeSource, ProductItem, WidgetSettings } from '../types';
import { FormattedMessage } from './FormattedMessage';
import { fetchWithTimeout } from '../lib/fetchWithTimeout';

// [Bước 4] Các câu "tiếp nhận" hiện ngay khi khách gửi (xoay vòng cho đỡ lặp) -> khách không thấy trạng thái chờ vô hồn.
const ACK_LINES = [
  'Dạ em nhận được thông tin rồi ạ! Anh/Chị chờ em một chút, em phản hồi ngay ạ. 😊',
  'Dạ vâng, để em xem giúp mình ngay đây ạ, Anh/Chị đợi em xíu nhé!',
  'Dạ em đã nhận ạ! Em tìm thông tin cho mình trong giây lát, Anh/Chị chờ em chút xíu nha.',
  'Dạ em ghi nhận rồi ạ, Anh/Chị vui lòng đợi em một lát, em trả lời ngay ạ. 🌸',
];

interface StandaloneWidgetChatProps {
  agentConfig: AgentConfig;
  knowledgeSources: KnowledgeSource[];
  products: ProductItem[];
  widgetSettings?: WidgetSettings;
}

export const StandaloneWidgetChat: React.FC<StandaloneWidgetChatProps> = ({
  agentConfig: initialAgentConfig,
  knowledgeSources: initialKnowledgeSources,
  products: initialProducts,
  widgetSettings: initialWidgetSettings,
}) => {
  const [currentAgent, setCurrentAgent] = useState<AgentConfig>(() => {
    try {
      const saved = localStorage.getItem('aistudio_agent_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return initialAgentConfig;
  });

  const [currentSettings, setCurrentSettings] = useState<WidgetSettings | undefined>(() => {
    try {
      const saved = localStorage.getItem('aistudio_widget_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return initialWidgetSettings;
  });

  const [currentKnowledge, setCurrentKnowledge] = useState<KnowledgeSource[]>(initialKnowledgeSources);
  const [currentProducts, setCurrentProducts] = useState<ProductItem[]>(initialProducts);

  useEffect(() => {
    // [Tối ưu băng thông] Chỉ tải cấu hình NHẸ (persona + giao diện), KHÔNG tải toàn bộ kho tri thức.
    // Agent dùng tri thức ở phía máy chủ nên widget khách không cần tải kho -> tiết kiệm rất nhiều băng thông.
    fetch('/api/widget-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.agentConfig && data.agentConfig.name) {
          setCurrentAgent((prev) => ({ ...prev, ...data.agentConfig }));
        }
        if (data.widgetSettings) {
          setCurrentSettings((prev) => ({ ...prev, ...data.widgetSettings }));
        }
      })
      .catch((err) => console.warn('Could not fetch /api/widget-config in standalone widget:', err));
  }, []);

  const primaryColor = currentSettings?.primaryColor || '#2563eb';
  const agentDisplayName = currentAgent.name || 'Trợ Lý AI';
  
  // Dynamically compute header title prioritizing updated agent businessName and agent name over legacy defaults
  const isDefaultHeader = !currentSettings?.headerTitle || currentSettings.headerTitle === 'Hỗ Trợ Khách Hàng TechLife' || currentSettings.headerTitle === 'Hỗ Trợ Khách Hàng AI';
  const widgetHeaderTitle = (!isDefaultHeader && currentSettings?.headerTitle)
    ? currentSettings.headerTitle
    : (currentAgent.businessName 
        ? `Hỗ Trợ Khách Hàng ${currentAgent.businessName}` 
        : (currentAgent.name ? `${currentAgent.name}` : 'Hỗ Trợ Khách Hàng AI'));

  const agentSubtitle = currentAgent.title || currentSettings?.subtitle || 'Trả lời tự động 24/7 bằng Trợ lý AI';

  // [Nâng cấp] Câu hỏi gợi ý (nút bấm nhanh). Cấu hình ở màn "Cấu Hình Agent" -> mỗi câu 1 dòng.
  // Chấp nhận cả mảng lẫn chuỗi nhiều dòng; tối đa 4 nút để không rối khung chat.
  const quickReplies: string[] = (() => {
    const raw = (currentAgent as any)?.quickReplies;
    let list: string[] = [];
    if (Array.isArray(raw)) list = raw.map((x: any) => String(x || ''));
    else if (typeof raw === 'string') list = raw.split('\n');
    return list.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  })();

  // [Live chat] Theo dõi tin nhắn từ NHÂN VIÊN + trạng thái "nhân viên đang tiếp nhận".
  // Widget hỏi thăm máy chủ mỗi 5 giây (polling) — đơn giản, không cần WebSocket, đủ mượt cho tư vấn bán hàng.
  const [humanMode, setHumanMode] = useState(false);
  const lastPollIdRef = useRef<number>(-1);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const sid = sessionIdRef.current;
        if (!sid) return;
        // Lần đầu: chỉ lấy mốc id hiện tại (không tải lại lịch sử cũ).
        const url = lastPollIdRef.current < 0
          ? `/api/poll?session=${encodeURIComponent(sid)}`
          : `/api/poll?session=${encodeURIComponent(sid)}&after=${lastPollIdRef.current}`;
        const res = await fetch(url);
        if (!res.ok || stopped) return;
        const data = await res.json();
        setHumanMode(!!data.humanMode);
        if (typeof data.lastId === 'number' && data.lastId > lastPollIdRef.current) {
          lastPollIdRef.current = data.lastId;
        }
        const incoming = Array.isArray(data.messages) ? data.messages : [];
        if (incoming.length > 0) {
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const add = incoming
              .filter((r: any) => !existing.has(`staff_${r.id}`))
              .map((r: any) => ({
                id: `staff_${r.id}`,
                sender: 'agent' as const, // hiện ở phía trái như tin của bên shop
                text: r.text || '',
                timestamp: new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                _staff: true, // đánh dấu để hiện nhãn "Nhân viên tư vấn"
              }));
            return add.length > 0 ? [...prev, ...(add as any)] : prev;
          });
        }
      } catch {
        /* im lặng bỏ qua — mạng chập chờn không được làm hỏng trải nghiệm chat */
      }
    };
    poll();
    const timer = setInterval(poll, 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  // [Nâng cấp] Đánh giá 👍/👎 cho từng câu trả lời (lưu theo id tin nhắn để đổi màu nút đã bấm).
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, 'up' | 'down'>>({});
  const sendFeedback = (msgId: string, rating: 'up' | 'down', answerText: string) => {
    if (feedbackGiven[msgId]) return; // mỗi câu chỉ đánh giá 1 lần
    setFeedbackGiven((prev) => ({ ...prev, [msgId]: rating }));
    // Tìm câu hỏi của khách ngay trước câu trả lời này -> giúp chủ shop biết ngữ cảnh khi xem lại.
    let question = '';
    const idx = messages.findIndex((m) => m.id === msgId);
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].sender === 'user') { question = messages[i].text || ''; break; }
    }
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current, rating, question, answer: answerText }),
    }).catch(() => { /* bắn-và-quên, không ảnh hưởng trải nghiệm khách */ });
  };
  const avatarUrl = currentAgent.avatarUrl;

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // [Step 3] Mã phiên trò chuyện ổn định cho mỗi khách (lưu localStorage) để máy chủ ghi log hội thoại & gom lead theo phiên.
  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    try {
      let sid = localStorage.getItem('aistudio_widget_session') || '';
      if (!sid) {
        const rnd = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
        sid = 'sess_' + Date.now().toString(36) + '_' + rnd.slice(0, 12);
        localStorage.setItem('aistudio_widget_session', sid);
      }
      sessionIdRef.current = sid;
    } catch {
      sessionIdRef.current = 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14);
    }
  }
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // [Bước 4 - streaming] Bộ đếm giờ cho hiệu ứng "gõ chữ dần" của câu trả lời agent.
  const typingTimerRef = useRef<any>(null);
  // [Bước 4] Bong bóng "tiếp nhận" hiện NGAY khi khách gửi, sau đó biến thành câu trả lời thật.
  const pendingAckIdRef = useRef<string>('');
  const ackCounterRef = useRef<number>(0);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  // Hiện nút "xuống cuối" khi khách cuộn LÊN xem lịch sử; ẩn khi đã ở gần cuối.
  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setShowScrollBtn(!nearBottom);
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('aistudio_widget_standalone_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load standalone widget messages:', e);
    }
    return [
      {
        id: 'w_welcome_1',
        sender: 'agent',
        text: currentAgent.greetingMessage || 'Xin chào! Em có thể giúp gì cho bạn hôm nay?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  useEffect(() => {
    // [Bước 4 - streaming] Khi có tin đang "gõ dần" -> BỎ QUA việc lưu (tránh ghi localStorage ~55 lần/câu).
    // Lần cập nhật cuối (khi gõ xong) không còn cờ _typing nên sẽ lưu bản đầy đủ như bình thường.
    if (messages.some((m) => (m as any)._typing || (m as any)._pending)) return;
    // [Fix M15] Chỉ lưu ~60 tin gần nhất và LOẠI base64 (dataUrl) đính kèm khỏi localStorage
    // (tránh vượt hạn ngạch localStorage khiến không lưu được gì; ảnh phiên hiện tại vẫn hiện trong RAM).
    const persistMessages = (msgs: ChatMessage[]) =>
      msgs.slice(-60).map((m) => {
        const { _full, _typing, _ack, _pending, ...clean } = m as any; // không lưu trường nội bộ (hiệu ứng gõ / tiếp nhận)
        return clean.attachments && clean.attachments.length > 0
          ? { ...clean, attachments: clean.attachments.map((a: any) => ({ ...a, dataUrl: undefined })) }
          : clean;
      });
    try {
      localStorage.setItem('aistudio_widget_standalone_messages', JSON.stringify(persistMessages(messages)));
    } catch (e) {
      try {
        localStorage.setItem('aistudio_widget_standalone_messages', JSON.stringify(persistMessages(messages).slice(-30)));
      } catch (e2) {
        console.error('Failed to save standalone widget messages:', e2);
      }
    }
  }, [messages]);

  useEffect(() => {
    if (currentAgent.greetingMessage) {
      setMessages((prev) => {
        if (prev.length === 1 && prev[0].id === 'w_welcome_1') {
          if (prev[0].text !== currentAgent.greetingMessage) {
            return [{ ...prev[0], text: currentAgent.greetingMessage }];
          }
        }
        return prev;
      });
    }
  }, [currentAgent.greetingMessage]);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior
      });
    }
  };

  // [Bước 4 - streaming] Dừng hiệu ứng gõ chữ đang chạy (nếu có) và ép tin nhắn về NỘI DUNG ĐẦY ĐỦ ngay.
  // Gọi khi: khách gửi tin mới, reset chat, hoặc component unmount -> không để tin bị kẹt nửa chừng.
  const finishTyping = () => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    setMessages((prev) => prev.map((m) => (m as any)._full ? { ...m, text: (m as any)._full, _full: undefined, _typing: undefined } as any : m));
  };

  // [Bước 4 - streaming] Chạy hiệu ứng gõ chữ cho MỘT bong bóng có sẵn (theo id).
  const startTyping = (id: string, full: string) => {
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
    let shown = 0;
    // Tổng thời lượng ~1.1s bất kể độ dài (bước nhảy theo độ dài) -> câu dài không gõ lê thê.
    const step = Math.max(2, Math.ceil(full.length / 55));
    typingTimerRef.current = setInterval(() => {
      shown = Math.min(full.length, shown + step);
      const slice = full.slice(0, shown);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: slice } as any : m)));
      if (shown % (step * 6) === 0) scrollToBottom('auto');
      if (shown >= full.length) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: full, _full: undefined, _typing: undefined } as any : m)));
      }
    }, 20);
  };

  // [Bước 4] Giao câu trả lời thật: BIẾN bong bóng "tiếp nhận" (nếu có) thành câu trả lời, kèm hiệu ứng gõ chữ.
  // Máy chủ đã trả về văn bản HOÀN CHỈNH (đã lọc link/kiểm duyệt) -> đây chỉ là hiển thị, an toàn tuyệt đối.
  const deliverAgentAnswer = (fullText: string, clarificationAsked?: boolean, products?: any[]) => {
    const full = fullText || '';
    const enabled = (currentAgent as any)?.typingEffect !== false && full.length >= 12;
    const ackId = pendingAckIdRef.current;
    pendingAckIdRef.current = '';
    // [Nâng cấp] Thẻ sản phẩm do máy chủ đối chiếu với danh mục (chỉ sản phẩm CÓ THẬT).
    const cards = Array.isArray(products) && products.length > 0 ? products : undefined;

    if (ackId) {
      // Tái sử dụng bong bóng tiếp nhận -> khung chat sạch, không thêm bong bóng mới.
      if (!enabled) {
        setMessages((prev) => prev.map((m) => (m.id === ackId
          ? { ...m, text: full, clarificationAsked, _products: cards, _ack: undefined, _pending: undefined, _full: undefined, _typing: undefined } as any : m)));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === ackId
        ? { ...m, text: '', clarificationAsked, _products: cards, _ack: undefined, _pending: undefined, _full: full, _typing: true } as any : m)));
      startTyping(ackId, full);
      return;
    }

    // Không có bong bóng tiếp nhận (trường hợp hiếm) -> thêm bong bóng mới.
    const id = `msg_agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const base: any = {
      id, sender: 'agent', clarificationAsked, _products: cards,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    if (!enabled) { setMessages((prev) => [...prev, { ...base, text: full }]); return; }
    setMessages((prev) => [...prev, { ...base, text: '', _full: full, _typing: true }]);
    startTyping(id, full);
  };

  // Dọn bộ đếm giờ khi rời màn hình.
  useEffect(() => () => { if (typingTimerRef.current) clearInterval(typingTimerRef.current); }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Cuộn xuống CUỐI mỗi khi widget được mở (lúc ẩn scrollHeight=0 nên cuộn không ăn; mở lại không có tin nhắn mới
  // nên effect [messages] không chạy). Nhận tín hiệu 'AI_WIDGET_OPENED' từ trình bao + các sự kiện hiển thị/focus.
  useEffect(() => {
    const jumpToBottom = () => {
      // vài nhịp để chắc chắn layout đã hiện xong rồi mới cuộn (nhảy tức thì, không animation)
      setTimeout(() => scrollToBottom('auto'), 60);
      setTimeout(() => scrollToBottom('auto'), 250);
    };
    jumpToBottom(); // lần đầu mount
    const onMsg = (e: MessageEvent) => { if (e && e.data && e.data.type === 'AI_WIDGET_OPENED') jumpToBottom(); };
    const onVis = () => { if (!document.hidden) jumpToBottom(); };
    window.addEventListener('message', onMsg);
    window.addEventListener('focus', jumpToBottom);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('message', onMsg);
      window.removeEventListener('focus', jumpToBottom);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((f) => {
      const file = f as File;
      const reader = new FileReader();
      let type: 'image' | 'video' | 'document' = 'document';

      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      }

      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newAttachment: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          name: file.name,
          type,
          mimeType: file.type || 'image/png',
          dataUrl,
          sizeBytes: file.size,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      };

      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = textToSend !== undefined ? textToSend : inputText;
    if (!messageContent.trim() && attachments.length === 0) return;

    finishTyping(); // nếu câu trả lời trước còn đang gõ dở -> hiện đủ ngay trước khi gửi tin mới

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      sender: 'user',
      text: messageContent.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: [...attachments],
    };

    // [Bước 4] Hiện NGAY một bong bóng "tiếp nhận" (thay cho trạng thái chờ vô hồn).
    // Khi có câu trả lời thật, chính bong bóng này sẽ biến thành câu trả lời (deliverAgentAnswer).
    const ackId = `msg_ack_${Date.now()}`;
    pendingAckIdRef.current = ackId;
    const ackText = ACK_LINES[ackCounterRef.current % ACK_LINES.length];
    ackCounterRef.current++;
    const ackMsg: any = {
      id: ackId,
      sender: 'agent',
      text: ackText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      _ack: true,
      _pending: true,
    };

    // [Live chat] Khi NHÂN VIÊN đang phụ trách -> KHÔNG hiện câu tiếp nhận của AI (tránh nhấp nháy),
    // khách chỉ chờ tin trả lời của nhân viên.
    if (humanMode) {
      pendingAckIdRef.current = '';
      setMessages((prev) => [...prev, userMessage]);
    } else {
      setMessages((prev) => [...prev, userMessage, ackMsg]);
    }
    setInputText('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    setIsLoading(true);

    // [Fix H2] Lịch sử gửi lên NHẸ: chỉ 12 lượt gần nhất, CHỈ text (bỏ ảnh base64 của các lượt cũ)
    // -> payload không phình theo thời gian (tránh chậm/tốn/lỗi 413 sau khi khách gửi nhiều ảnh).
    const lightHistory = messages.slice(-12).map((m) => ({ id: m.id, sender: m.sender, text: (m as any)._full || m.text, timestamp: m.timestamp }));

    try {
      const response = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // [Tối ưu băng thông] KHÔNG gửi kèm knowledgeSources/products nữa — máy chủ tự dùng kho tri thức phía server.
          message: userMessage.text,
          history: lightHistory,
          agentConfig: currentAgent,
          attachments: currentAttachments,
          sessionId: sessionIdRef.current,
        }),
      }, 60000); // [Fix M14] timeout 60s -> không kẹt "đang gõ..." vô hạn nếu máy chủ treo

      const data = await response.json();

      if (!response.ok) {
        const errorText = data.details ? `${data.error} (${data.details})` : (data.error || 'Lỗi xử lý từ máy chủ');
        throw new Error(errorText);
      }

      // [Live chat] Nhân viên đang phụ trách -> AI không trả lời. Gỡ bong bóng "tiếp nhận",
      // khách sẽ nhận tin trực tiếp từ nhân viên qua polling.
      if (data.humanMode) {
        setHumanMode(true);
        const ackId = pendingAckIdRef.current;
        pendingAckIdRef.current = '';
        if (ackId) setMessages((prev) => prev.filter((m) => m.id !== ackId));
        return;
      }

      // [Bước 4] Biến bong bóng "tiếp nhận" thành câu trả lời thật (kèm hiệu ứng gõ chữ).
      deliverAgentAnswer(data.responseText, data.clarificationAsked, data.products);
    } catch (err: any) {
      console.error('Widget Chat error:', err);
      // KHONG pho bay loi ky thuat cho khach -> thong bao than thien; chi tiet log o console.
      const raw = (err && err.message) ? String(err.message) : '';
      let friendly = 'Xin lỗi, hệ thống đang gặp trục trặc kỹ thuật. Quý khách vui lòng thử lại sau giây lát ạ.';
      if (/429|rate limit|RESOURCE_EXHAUSTED|quota|giới hạn|quá nhiều/i.test(raw)) {
        friendly = 'Hệ thống đang có nhiều người dùng cùng lúc. Quý khách vui lòng thử lại sau ít phút ạ.';
      } else if (/network|failed to fetch|timeout|hết thời gian|mạng/i.test(raw)) {
        friendly = 'Kết nối đang chập chờn. Quý khách vui lòng kiểm tra mạng và gửi lại tin nhắn ạ.';
      }
      const errorMessage: ChatMessage = {
        id: `msg_err_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        sender: 'system',
        text: `⚠️ ${friendly}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      // [Bước 4] Bỏ bong bóng "tiếp nhận" đang chờ (nếu có) rồi hiện thông báo lỗi -> không để lại lời hứa "phản hồi ngay" cụt.
      const ackId = pendingAckIdRef.current;
      pendingAckIdRef.current = '';
      setMessages((prev) => [...prev.filter((m) => m.id !== ackId), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // [Bước 4 + nâng cấp] Khách bấm "Gặp tư vấn viên" -> MỞ FORM thu liên hệ (Tên + SĐT/Zalo + lời nhắn)
  // để nhân viên chắc chắn có cách liên hệ lại, thay vì rơi vào ngõ cụt khi khách không để số.
  const [handoffSent, setHandoffSent] = useState(false);
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [handoffName, setHandoffName] = useState('');
  const [handoffPhone, setHandoffPhone] = useState('');
  const [handoffNote, setHandoffNote] = useState('');
  const [handoffSubmitting, setHandoffSubmitting] = useState(false);

  const openHandoffForm = () => {
    if (handoffSent || isLoading) return;
    // Gợi ý sẵn nếu khách đã gõ gì đó trông giống SĐT trong ô nhập.
    const maybe = inputText.trim();
    if (/\d{6,}/.test(maybe)) setHandoffPhone(maybe);
    setShowHandoffForm(true);
  };

  // Gửi yêu cầu bàn giao. hasContact=false nghĩa là khách bấm "Bỏ qua" (không để lại liên hệ).
  const submitHandoff = async (hasContact: boolean) => {
    if (handoffSubmitting) return;
    const name = handoffName.trim();
    const phone = handoffPhone.trim();
    // Gửi kèm liên hệ nhưng chưa nhập gì -> không làm gì (nút đã bị vô hiệu ở trạng thái này).
    if (hasContact && !name && !phone) return;
    setHandoffSubmitting(true);
    const note = hasContact
      ? ('Khách để lại liên hệ qua form. ' + (handoffNote.trim() ? 'Lời nhắn: ' + handoffNote.trim() : ''))
      : 'Khách muốn gặp nhân viên nhưng CHƯA để lại liên hệ.';
    try {
      await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current, name, phone, note }),
      });
    } catch {
      /* bắn-và-quên, không chặn trải nghiệm */
    }
    setShowHandoffForm(false);
    setHandoffSent(true);
    setHandoffName(''); setHandoffPhone(''); setHandoffNote('');
    const confirmText = hasContact
      ? 'Dạ em đã gửi thông tin tới nhân viên tư vấn, mình sẽ được liên hệ lại trong thời gian sớm nhất ạ. Trong lúc chờ, Anh/Chị cứ tiếp tục nhắn tin, em vẫn hỗ trợ ạ. 💐'
      : 'Dạ em đã ghi nhận ạ. Nếu tiện, Anh/Chị để lại số điện thoại/Zalo bất cứ lúc nào để nhân viên liên hệ lại nhé. Em vẫn ở đây hỗ trợ mình ạ. 😊';
    const confirmMsg: ChatMessage = {
      id: `msg_handoff_${Date.now()}`,
      sender: 'agent',
      text: confirmText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, confirmMsg]);
    setHandoffSubmitting(false);
    setTimeout(() => setHandoffSent(false), 60000);
  };

  const handleResetChat = () => {
    if (typingTimerRef.current) { clearInterval(typingTimerRef.current); typingTimerRef.current = null; }
    setMessages([
      {
        id: 'w_welcome_1',
        sender: 'agent',
        text: currentAgent.greetingMessage || 'Xin chào! Em có thể giúp gì cho bạn hôm nay?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setAttachments([]);
  };

  return (
    <div className="w-full h-screen max-h-screen flex flex-col bg-slate-50 font-sans overflow-hidden border-0 relative">
      
      {/* Header Bar */}
      <header 
        className="px-4 py-3 text-white flex items-center justify-between shadow-md shrink-0 transition-colors"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={agentDisplayName}
              className="w-9 h-9 rounded-full object-cover ring-2 ring-white/30 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white font-bold shrink-0 border border-white/30">
              <Bot className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="font-bold text-sm leading-tight text-white flex items-center gap-1.5">
              <span>{widgetHeaderTitle}</span>
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-white/80 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{agentSubtitle}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleResetChat}
            title="Làm mới trò chuyện"
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'TOGGLE_AI_WIDGET', open: false }, '*');
              }
            }}
            title="Thu gọn khung chat"
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* [Live chat] Băng báo khi NHÂN VIÊN đang trực tiếp hỗ trợ (AI tạm ngừng) */}
      {humanMode && (
        <div className="px-3 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-center gap-1.5 shrink-0">
          <Headset className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-700">
            Nhân viên tư vấn đang trực tiếp hỗ trợ Anh/Chị
          </span>
        </div>
      )}

      {/* Chat Messages List */}
      <div ref={chatContainerRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 bg-slate-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2 max-w-[92%] ${
              msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            {/* Avatar */}
            {msg.sender === 'agent' && (
              avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={agentDisplayName}
                  className="w-7 h-7 rounded-full object-cover mt-0.5 shadow-xs shrink-0 ring-1 ring-slate-200"
                />
              ) : (
                <div 
                  className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Bot className="w-4 h-4" />
                </div>
              )
            )}
            {msg.sender === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 shadow-xs">
                <User className="w-4 h-4" />
              </div>
            )}

            {/* Bubble */}
            <div
              className={`rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                msg.sender === 'user'
                  ? 'text-white rounded-tr-none'
                  : msg.sender === 'system'
                  ? 'bg-amber-50 text-amber-900 border border-amber-200/80 rounded-tl-none'
                  : 'bg-white text-slate-800 border border-slate-200/80 rounded-tl-none'
              }`}
              style={msg.sender === 'user' ? { backgroundColor: primaryColor } : undefined}
            >
              {/* [Live chat] Nhãn phân biệt tin của NHÂN VIÊN THẬT với tin của AI */}
              {(msg as any)._staff && (
                <div className="flex items-center gap-1 mb-1 text-[9px] font-bold text-emerald-600">
                  <Headset className="w-2.5 h-2.5" /> NHÂN VIÊN TƯ VẤN
                </div>
              )}

              {/* Attachments preview */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="mb-2 space-y-1.5">
                  {msg.attachments.map((att) => (
                    <div key={att.id} className="rounded-lg overflow-hidden border border-black/10">
                      {att.type === 'image' && att.dataUrl && (
                        <img src={att.dataUrl} alt={att.name} className="max-h-40 w-auto object-cover rounded-md" />
                      )}
                      {(att.type !== 'image' || !att.dataUrl) && (
                        <div className="p-1.5 bg-black/5 text-[10px] font-mono flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          <span className="truncate">{att.type === 'image' ? '🖼️ ' + att.name : att.name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message text */}
              <FormattedMessage content={msg.text} isAgent={msg.sender === 'agent'} />

              {/* [Nâng cấp] Thẻ sản phẩm — chỉ hiện sau khi gõ xong, và chỉ gồm sản phẩm CÓ THẬT trong danh mục */}
              {msg.sender === 'agent' && !(msg as any)._typing && Array.isArray((msg as any)._products) && (
                <div className="mt-2 space-y-1.5">
                  {(msg as any)._products.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-lg object-cover shrink-0 bg-white" loading="lazy" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-bold text-slate-800 leading-tight line-clamp-2">{p.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {typeof p.price === 'number' && p.price > 0 && (
                            <span className="text-[11px] font-black" style={{ color: primaryColor }}>
                              {p.price.toLocaleString('vi-VN')}đ
                            </span>
                          )}
                          {typeof p.originalPrice === 'number' && p.originalPrice > (p.price || 0) && (
                            <span className="text-[9px] text-slate-400 line-through">{p.originalPrice.toLocaleString('vi-VN')}đ</span>
                          )}
                          {!p.inStock && <span className="text-[9px] text-rose-500 font-semibold">Tạm hết hàng</span>}
                        </div>
                      </div>
                      {p.productUrl && (
                        <a
                          href={p.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white shrink-0 shadow-2xs"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Xem
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`text-[9px] mt-1 flex items-center gap-1.5 ${
                  msg.sender === 'user' ? 'text-white/70 justify-end' : 'text-slate-400 justify-between'
                }`}
              >
                {/* [Nâng cấp] Nút đánh giá 👍/👎 — chỉ hiện ở câu trả lời của agent (bỏ lời chào & tin đang gõ). */}
                {msg.sender === 'agent' && msg.id !== 'w_welcome_1' && !(msg as any)._typing && !(msg as any)._pending && !(msg as any)._staff ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sendFeedback(msg.id, 'up', msg.text)}
                      className={`p-0.5 rounded transition-colors ${feedbackGiven[msg.id] === 'up' ? 'text-emerald-500' : 'text-slate-300 hover:text-emerald-500'}`}
                      title="Câu trả lời hữu ích"
                    >
                      <ThumbsUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => sendFeedback(msg.id, 'down', msg.text)}
                      className={`p-0.5 rounded transition-colors ${feedbackGiven[msg.id] === 'down' ? 'text-rose-500' : 'text-slate-300 hover:text-rose-500'}`}
                      title="Câu trả lời chưa hữu ích"
                    >
                      <ThumbsDown className="w-3 h-3" />
                    </button>
                  </span>
                ) : <span />}
                <span>{msg.timestamp}</span>
              </div>
            </div>
          </div>
        ))}

        {/* [Nâng cấp] Nút gợi ý câu hỏi — hiện khi agent vừa trả lời xong & không đang bận.
            Giảm ma sát: khách chỉ cần bấm là hỏi được, không phải nghĩ cách diễn đạt. */}
        {quickReplies.length > 0 && !isLoading && !showHandoffForm && !humanMode
          && messages.length > 0 && messages[messages.length - 1].sender === 'agent'
          && !(messages[messages.length - 1] as any)._typing
          && !(messages[messages.length - 1] as any)._pending && (
          <div className="flex flex-wrap gap-1.5 pt-1 pb-0.5">
            {quickReplies.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(q)}
                className="px-2.5 py-1.5 rounded-full text-[11px] font-medium bg-white border transition-colors hover:shadow-xs text-left"
                style={{ color: primaryColor, borderColor: primaryColor + '40' }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Loading Indicator — ẩn khi đã có bong bóng "tiếp nhận"/đang gõ (tránh trùng lặp trạng thái chờ) */}
        {isLoading && !messages.some((m) => (m as any)._pending || (m as any)._typing) && (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={agentDisplayName}
                className="w-7 h-7 rounded-full object-cover shadow-xs shrink-0 ring-1 ring-slate-200 animate-pulse"
              />
            ) : (
              <div 
                className="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs animate-spin"
                style={{ backgroundColor: primaryColor }}
              >
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="bg-white px-3 py-2 rounded-2xl border border-slate-200 text-slate-500 text-xs flex items-center gap-1.5 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-ping"></span>
              <span>{agentDisplayName} đang phản hồi...</span>
            </div>
          </div>
        )}
      </div>

      {/* Pending Attachments */}
      {attachments.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 flex flex-wrap gap-1.5 shrink-0">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="bg-white px-2 py-1 rounded-lg border border-slate-300 text-[10px] flex items-center gap-1 text-slate-700 shadow-2xs"
            >
              <span className="truncate max-w-[120px]">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="text-slate-400 hover:text-rose-500"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Nút "xuống cuối" — chỉ hiện khi khách đã cuộn lên xem lịch sử */}
      {showScrollBtn && (
        <button
          type="button"
          onClick={() => { scrollToBottom('smooth'); setShowScrollBtn(false); }}
          aria-label="Xuống tin nhắn mới nhất"
          title="Xuống tin nhắn mới nhất"
          className="absolute right-3 z-20 w-9 h-9 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-colors"
          style={{ bottom: '78px', color: primaryColor }}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Input Area */}
      <footer className="p-2.5 bg-white border-t border-slate-200 shrink-0">
        {/* [Nâng cấp] Form thu liên hệ khi khách muốn gặp tư vấn viên */}
        {showHandoffForm && (
          <div className="mb-2 p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Headset className="w-3.5 h-3.5" style={{ color: primaryColor }} /> Gặp nhân viên tư vấn
              </span>
              <button type="button" onClick={() => setShowHandoffForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Anh/Chị để lại thông tin để nhân viên liên hệ lại sớm nhất ạ:
            </p>
            <input
              type="text"
              value={handoffName}
              onChange={(e) => setHandoffName(e.target.value)}
              placeholder="Tên của Anh/Chị"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <input
              type="tel"
              value={handoffPhone}
              onChange={(e) => setHandoffPhone(e.target.value)}
              placeholder="Số điện thoại / Zalo"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <input
              type="text"
              value={handoffNote}
              onChange={(e) => setHandoffNote(e.target.value)}
              placeholder="Nội dung cần tư vấn (không bắt buộc)"
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => submitHandoff(true)}
                disabled={handoffSubmitting || (!handoffName.trim() && !handoffPhone.trim())}
                className="flex-1 py-1.5 rounded-lg text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                style={{ backgroundColor: primaryColor }}
              >
                {handoffSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
              <button
                type="button"
                onClick={() => submitHandoff(false)}
                disabled={handoffSubmitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-50"
              >
                Bỏ qua
              </button>
            </div>
          </div>
        )}

        {/* Nút yêu cầu gặp nhân viên tư vấn */}
        {!showHandoffForm && (
          <div className="flex justify-center mb-1.5">
            <button
              type="button"
              onClick={openHandoffForm}
              disabled={handoffSent || isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: primaryColor, borderColor: primaryColor + '55', backgroundColor: primaryColor + '10' }}
              title="Kết nối với nhân viên tư vấn"
            >
              <Headset className="w-3 h-3" />
              {handoffSent ? 'Đã gửi yêu cầu tới nhân viên' : 'Gặp nhân viên tư vấn'}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            multiple
            accept="image/*,.pdf,.txt,.doc,.docx"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Đính kèm tệp / ảnh"
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={'Nhập câu hỏi của bạn...'}
            disabled={isLoading}
            className="flex-1 bg-slate-100 border-0 focus:ring-2 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none transition-all"
          />

          <button
            type="submit"
            disabled={isLoading || (!inputText.trim() && attachments.length === 0)}
            className="p-2 rounded-xl text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-1.5 text-center text-[9px] text-slate-400 flex items-center justify-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
          <span>Hỗ trợ trực tuyến bởi Trợ Lý AI</span>
        </div>
      </footer>

    </div>
  );
};
