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

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);

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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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

  // Save to LocalStorage and sync to Server whenever core state changes
  useEffect(() => {
    try {
      localStorage.setItem('aistudio_knowledge_sources', JSON.stringify(knowledgeSources));
      localStorage.setItem('aistudio_products', JSON.stringify(products));
      localStorage.setItem('aistudio_agent_config', JSON.stringify(agentConfig));
      localStorage.setItem('aistudio_widget_settings', JSON.stringify(widgetSettings));

      // Post full configuration to server memory store so embedded widgets and /api/chat endpoints use actual data
      fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentConfig, widgetSettings, knowledgeSources, products }),
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to save config to localStorage or sync server:', e);
    }
  }, [agentConfig, widgetSettings, knowledgeSources, products]);

  useEffect(() => {
    try {
      localStorage.setItem('aistudio_chat_messages', JSON.stringify(messages));
    } catch (e) {
      console.error('Failed to save messages to localStorage:', e);
    }
  }, [messages]);

  // Check backend health & sync server config on boot
  useEffect(() => {
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
      .catch((err) => {
        console.warn('Could not verify API health status:', err);
      });

    // Sync with server configuration
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.agentConfig && data.agentConfig.name && data.agentConfig.name !== agentConfig.name) {
          setAgentConfig((prev) => ({ ...prev, ...data.agentConfig }));
        }
        if (Array.isArray(data.knowledgeSources) && data.knowledgeSources.length > 0) {
          setKnowledgeSources(data.knowledgeSources);
        }
        if (Array.isArray(data.products) && data.products.length > 0) {
          setProducts(data.products);
        }
        if (data.widgetSettings) {
          setWidgetSettings((prev) => ({ ...prev, ...data.widgetSettings }));
        }
      })
      .catch(() => {});
  }, []);

  // Check if URL requests standalone widget mode (e.g., when embedded on Sapo, WordPress, etc.)
  const isWidgetMode = typeof window !== 'undefined' && (
    window.location.search.includes('mode=widget') ||
    window.location.search.includes('embed=true') ||
    window.location.search.includes('widget=true') ||
    window.location.pathname.startsWith('/widget')
  );

  if (isWidgetMode) {
    return (
      <StandaloneWidgetChat
        agentConfig={agentConfig}
        knowledgeSources={knowledgeSources}
        products={products}
        widgetSettings={widgetSettings}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 font-sans text-slate-800 flex flex-col selection:bg-blue-500 selection:text-white">
      
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
