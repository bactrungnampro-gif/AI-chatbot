import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ChatSandbox } from './components/ChatSandbox';
import { KnowledgeManager } from './components/KnowledgeManager';
import { ProductCatalog } from './components/ProductCatalog';
import { AgentPersonaConfig } from './components/AgentPersonaConfig';
import { IntegrationWidget } from './components/IntegrationWidget';
import { ConversationHistory } from './components/ConversationHistory';

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

  // Core Application State
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(defaultAgentConfig);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSource[]>(defaultKnowledgeSources);
  const [products, setProducts] = useState<ProductItem[]>(defaultProducts);
  const [widgetSettings, setWidgetSettings] = useState<WidgetSettings>(defaultWidgetSettings);

  // Chat sandbox messages state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'agent',
      text: defaultAgentConfig.greetingMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Check backend health & Gemini API status on boot
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.hasApiKey === 'boolean') {
          setHasApiKey(data.hasApiKey);
        }
      })
      .catch((err) => {
        console.warn('Could not verify API health status:', err);
      });
  }, []);

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
