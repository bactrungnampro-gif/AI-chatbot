import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ChatSandbox } from './components/ChatSandbox';
import { KnowledgeManager } from './components/KnowledgeManager';
import { ProductCatalog } from './components/ProductCatalog';
import { AgentPersonaConfig } from './components/AgentPersonaConfig';
import { IntegrationWidget } from './components/IntegrationWidget';
import { ConversationHistory } from './components/ConversationHistory';
import { StandaloneWidgetChat } from './components/StandaloneWidgetChat';

import {
  defaultAgentConfig,
  defaultKnowledgeSources,
  defaultProducts,
  defaultWidgetSettings,
} from './data/defaultData';
import { AgentConfig, ChatMessage, KnowledgeSource, ProductItem, WidgetSettings } from './types';
import { LoginScreen } from './components/LoginScreen';
import { initAuth, isAuthEnabled, getSession, onAuthChange, signOut } from './lib/auth';
import { LogOut } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

  // [Auth] Trạng thái xác thực quản trị (Supabase Auth). Khi tắt (AUTH_ENABLED=false) app hoạt động như cũ.
  const [authReady, setAuthReady] = useState(false);
  const [authOn, setAuthOn] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Core Application State with LocalStorage Persistence
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(() => {
    try {
      const saved = localStorage.getItem('aistudio_agent_config');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load agentConfig from localStorage:', e);
    }
    return defaultAgentConfig;
  });

  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(() => {
    try {
      const saved = localStorage.getItem('aistudio_knowledge_sources');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load knowledgeSources from localStorage:', e);
    }
    return defaultKnowledgeSources;
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    try {
      const saved = localStorage.getItem('aistudio_products');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load products from localStorage:', e);
    }
    return defaultProducts;
  });

  const [widgetSettings, setWidgetSettings] = useState<WidgetSettings>(() => {
    try {
      const saved = localStorage.getItem('aistudio_widget_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load widgetSettings from localStorage:', e);
    }
    return defaultWidgetSettings;
  });

  // Chat sandbox messages state
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('aistudio_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load messages from localStorage:', e);
    }
    return [
      {
        id: 'welcome_1',
        sender: 'agent',
        text: defaultAgentConfig.greetingMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ];
  });

  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const isInitialSyncRef = React.useRef(true);
  const hasInitializedRef = React.useRef(false); // đảm bảo init chỉ chạy 1 lần
  const saveTimerRef = React.useRef<any>(null);   // debounce POST cấu hình

  // Hợp nhất 2 danh sách theo id (giữ item mới ở client không bị đè mất khi init về chậm).
  const mergeById = <T extends { id?: string }>(current: T[], incoming: T[]): T[] => {
    const cur = Array.isArray(current) ? current : [];
    const inc = Array.isArray(incoming) ? incoming : [];
    const byId = new Map<string, T>();
    // server là nguồn nền, sau đó phủ các item hiện có ở client (ưu tiên bản client mới hơn)
    for (const it of inc) if (it && it.id) byId.set(it.id, it);
    for (const it of cur) if (it && it.id) byId.set(it.id, it);
    // giữ item client không có id (hiếm) để không mất
    const noId = cur.filter((it) => !it || !it.id);
    return [...Array.from(byId.values()), ...noId];
  };

  // [Auth] Khởi tạo xác thực 1 lần khi mount.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    initAuth().then(async ({ authEnabled }) => {
      setAuthOn(authEnabled);
      if (authEnabled) {
        const session = await getSession();
        setIsLoggedIn(!!session);
        unsub = onAuthChange((loggedIn) => setIsLoggedIn(loggedIn));
      }
      setAuthReady(true);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  // Chỉ tải cấu hình (gọi endpoint được bảo vệ) khi: auth tắt, HOẶC đã đăng nhập.
  const canLoad = authReady && (!authOn || isLoggedIn);

  // Sync with server store on initial mount (sau khi đủ điều kiện xác thực)
  useEffect(() => {
    if (!canLoad) return;
    if (hasInitializedRef.current) return; // chỉ khởi tạo 1 lần, tránh init chạy lại đè dữ liệu
    hasInitializedRef.current = true;
    // Check backend health
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      })
      .then((data) => {
        if (data && typeof data.hasApiKey === 'boolean') {
          setHasApiKey(data.hasApiKey);
        }
      })
      .catch((err) => console.warn('Could not verify API health status:', err));

    // Initialize configuration with server & client local backup sync
    const localAgentConfig = (() => {
      try {
        const saved = localStorage.getItem('aistudio_agent_config');
        return saved ? JSON.parse(saved) : null;
      } catch (e) { return null; }
    })();
    const localWidgetSettings = (() => {
      try {
        const saved = localStorage.getItem('aistudio_widget_settings');
        return saved ? JSON.parse(saved) : null;
      } catch (e) { return null; }
    })();
    const localKnowledgeSources = (() => {
      try {
        const saved = localStorage.getItem('aistudio_knowledge_sources');
        return saved ? JSON.parse(saved) : null;
      } catch (e) { return null; }
    })();
    const localProducts = (() => {
      try {
        const saved = localStorage.getItem('aistudio_products');
        return saved ? JSON.parse(saved) : null;
      } catch (e) { return null; }
    })();

    fetch('/api/config/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientAgentConfig: localAgentConfig,
        clientWidgetSettings: localWidgetSettings,
        clientKnowledgeSources: localKnowledgeSources,
        clientProducts: localProducts,
      })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.agentConfig && typeof data.agentConfig === 'object' && Object.keys(data.agentConfig).length > 0) {
          setAgentConfig((prev) => {
            const merged = {
              ...defaultAgentConfig,
              ...prev,
              ...data.agentConfig,
              customApiKey: data.agentConfig.customApiKey || prev.customApiKey || '',
            };
            try {
              localStorage.setItem('aistudio_agent_config', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }

        if (data.widgetSettings && typeof data.widgetSettings === 'object' && Object.keys(data.widgetSettings).length > 0) {
          setWidgetSettings(() => {
            const merged = {
              ...defaultWidgetSettings,
              ...data.widgetSettings,
            };
            try {
              localStorage.setItem('aistudio_widget_settings', JSON.stringify(merged));
            } catch (e) {}
            return merged;
          });
        }

        if (Array.isArray(data.knowledgeSources) && data.knowledgeSources.length > 0) {
          // Hợp nhất theo id thay vì đè — giữ mục người dùng vừa thêm trong lúc chờ init.
          setKnowledgeSources((prev) => {
            const merged = mergeById(prev, data.knowledgeSources);
            try { localStorage.setItem('aistudio_knowledge_sources', JSON.stringify(merged)); } catch (e) {}
            return merged;
          });
        }

        if (Array.isArray(data.products) && data.products.length > 0) {
          setProducts((prev) => {
            const merged = mergeById(prev, data.products);
            try { localStorage.setItem('aistudio_products', JSON.stringify(merged)); } catch (e) {}
            return merged;
          });
        }
      })
      .catch((err) => console.warn('Could not load initial config from server:', err))
      .finally(() => {
        setIsConfigLoaded(true);
      });
  }, [canLoad]);

  // Tin nhắn chat (sandbox) chỉ lưu localStorage — KHÔNG thuộc cấu hình, không đồng bộ server
  // (trước đây messages nằm trong effect đồng bộ cấu hình -> mỗi tin nhắn bắn 1 POST, tăng nguy cơ ghi đè sai thứ tự).
  useEffect(() => {
    if (!isConfigLoaded) return;
    try { localStorage.setItem('aistudio_chat_messages', JSON.stringify(messages)); } catch (e) {}
  }, [messages, isConfigLoaded]);

  // Lưu cấu hình (agent/widget/tri thức/sản phẩm) vào localStorage + đồng bộ server (có debounce).
  useEffect(() => {
    if (!isConfigLoaded) return;

    // Bỏ qua lần trigger đầu tiên sau khi load để không đè server bằng trạng thái khởi tạo
    if (isInitialSyncRef.current) {
      isInitialSyncRef.current = false;
      return;
    }

    try {
      // [Security] Không lưu/không gửi API key từ client. Key AI chỉ nằm ở biến môi trường server.
      const { customApiKey, providerApiKeys, providerEndpoints, customApiEndpoint, ...safeAgentConfig } = (agentConfig as any) || {};

      localStorage.setItem('aistudio_knowledge_sources', JSON.stringify(knowledgeSources));
      localStorage.setItem('aistudio_products', JSON.stringify(products));
      localStorage.setItem('aistudio_agent_config', JSON.stringify(safeAgentConfig));
      localStorage.setItem('aistudio_widget_settings', JSON.stringify(widgetSettings));

      // Debounce: gộp nhiều thay đổi liên tiếp thành 1 POST cuối cùng -> tránh POST đến sai thứ tự (bản cũ đè bản mới).
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentConfig: safeAgentConfig, widgetSettings, knowledgeSources, products }),
        }).catch(() => {});
      }, 600);
    } catch (e) {
      console.error('Failed to save config to localStorage or sync server:', e);
    }
  }, [agentConfig, widgetSettings, knowledgeSources, products, isConfigLoaded]);

  // Check if URL requests standalone widget mode (e.g., when embedded on Sapo, WordPress, etc.)
  const isWidgetMode = typeof window !== 'undefined' && (
    window.location.search.includes('mode=widget') ||
    window.location.search.includes('embed=true') ||
    window.location.search.includes('widget=true') ||
    window.location.pathname.startsWith('/widget')
  );

  if (isWidgetMode) {
    // Widget nhúng công khai — không yêu cầu đăng nhập.
    return (
      <StandaloneWidgetChat
        agentConfig={agentConfig}
        knowledgeSources={knowledgeSources}
        products={products}
        widgetSettings={widgetSettings}
      />
    );
  }

  // [Auth] Chờ khởi tạo xác thực; nếu bật auth và chưa đăng nhập -> hiển thị màn hình đăng nhập.
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-400 text-sm font-sans">
        Đang tải...
      </div>
    );
  }
  if (authOn && !isLoggedIn) {
    return <LoginScreen onSuccess={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-800 flex flex-col selection:bg-blue-500 selection:text-white">

      {/* [Auth] Nút đăng xuất (chỉ hiện khi bật auth) */}
      {authOn && (
        <button
          onClick={async () => { await signOut(); setIsLoggedIn(false); }}
          className="fixed top-2.5 right-3 z-50 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 bg-white/90 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm transition-colors"
          title="Đăng xuất"
        >
          <LogOut className="w-3.5 h-3.5" /> Đăng xuất
        </button>
      )}

      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasApiKey={hasApiKey}
        onOpenWidgetPreview={() => setActiveTab('integration')}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'chat' && (
          <ChatSandbox
            agentConfig={agentConfig}
            knowledgeSources={knowledgeSources}
            products={products}
            messages={messages}
            setMessages={setMessages}
          />
        )}

        {activeTab === 'knowledge' && (
          <KnowledgeManager
            knowledgeSources={knowledgeSources}
            setKnowledgeSources={setKnowledgeSources}
            products={products}
            setProducts={setProducts}
            onNavigateToProducts={() => setActiveTab('products')}
          />
        )}

        {activeTab === 'products' && (
          <ProductCatalog
            products={products}
            setProducts={setProducts}
            knowledgeSources={knowledgeSources}
          />
        )}

        {activeTab === 'persona' && (
          <AgentPersonaConfig
            agentConfig={agentConfig}
            setAgentConfig={setAgentConfig}
            setWidgetSettings={setWidgetSettings}
          />
        )}

        {activeTab === 'integration' && (
          <IntegrationWidget
            agentConfig={agentConfig}
            widgetSettings={widgetSettings}
            setWidgetSettings={setWidgetSettings}
          />
        )}

        {activeTab === 'history' && (
          <ConversationHistory messages={messages} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 text-center text-xs text-slate-400 mt-8">
        <p>Trợ Lý AI Tư Vấn Khách Hàng • Động cơ Gemini 3.6 Flash Multi-modal • Tích Hợp Website 24/7</p>
      </footer>

    </div>
  );
}
