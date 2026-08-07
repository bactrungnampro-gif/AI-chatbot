export type AIProvider = 'google' | 'openai' | 'anthropic' | 'deepseek' | 'custom_openai';

export interface AgentConfig {
  id: string;
  name: string;
  title: string;
  avatarUrl?: string;
  greetingMessage: string;
  tone: 'friendly' | 'professional' | 'formal' | 'enthusiastic';
  businessName: string;
  businessIndustry: string;
  businessDescription: string;
  clarificationEnabled: boolean;
  clarificationStyle: 'polite' | 'direct' | 'guided';
  primaryLanguage: string;
  // Dynamic AI Provider & Model Configuration
  selectedProvider?: AIProvider;
  selectedModel?: string;
  customApiKey?: string;
  customApiEndpoint?: string;
  providerApiKeys?: Record<string, string>;
  providerEndpoints?: Record<string, string>;
  temperature?: number;
}

export type KnowledgeType = 'website' | 'document' | 'faq' | 'process_guide' | 'google_sheets' | 'google_drive' | 'api_endpoint';

export interface KnowledgeSource {
  id: string;
  title: string;
  type: KnowledgeType;
  url?: string;
  content: string;
  fileType?: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  wordCount: number;
  crawlMode?: 'hybrid' | 'sitemap' | 'sublinks' | 'single';
  pagesScrapedCount?: number;
  subPages?: { title: string; url: string }[];
}

export interface ProductItem {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  description: string;
  keyFeatures: string[];
  idealFor: string;
  usageInstructions: string;
  imageUrl?: string;
  inStock: boolean;
  sourceUrl?: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'document';
  name: string;
  mimeType: string;
  dataUrl: string; // base64 data URL
  sizeBytes?: number;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  attachments?: Attachment[];
  clarificationAsked?: boolean;
  sourcesUsed?: string[];
  suggestedFollowups?: string[];
}

export interface ConversationSession {
  id: string;
  customerName: string;
  customerPhone?: string;
  status: 'active' | 'resolved' | 'needs_clarification' | 'escalated';
  lastMessageAt: string;
  messages: ChatMessage[];
  topic?: string;
}

export interface WidgetSettings {
  primaryColor: string;
  headerTitle: string;
  subtitle: string;
  position: 'bottom-right' | 'bottom-left';
  buttonText: string;
  showAvatar: boolean;
  autoOpenDelay: number; // in seconds, 0 = disabled
}
