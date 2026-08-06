import React, { useState } from 'react';
import { 
  Globe, 
  FileText, 
  Plus, 
  Trash2, 
  CheckCircle, 
  AlertCircle, 
  Search, 
  RefreshCw, 
  Link as LinkIcon, 
  HelpCircle,
  FileCheck,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  ShoppingBag,
  ArrowRight
} from 'lucide-react';
import { KnowledgeSource, KnowledgeType, ProductItem } from '../types';

interface KnowledgeManagerProps {
  knowledgeSources: KnowledgeSource[];
  setKnowledgeSources: React.Dispatch<React.SetStateAction<KnowledgeSource[]>>;
  products?: ProductItem[];
  setProducts?: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  onNavigateToProducts?: () => void;
}

export const KnowledgeManager: React.FC<KnowledgeManagerProps> = ({
  knowledgeSources,
  setKnowledgeSources,
  products = [],
  setProducts,
  onNavigateToProducts,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [scrapeMode, setScrapeMode] = useState<'hybrid' | 'sitemap' | 'sublinks' | 'single'>('hybrid');
  const [maxPages, setMaxPages] = useState<number>(10);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const [expandedSubPagesId, setExpandedSubPagesId] = useState<string | null>(null);

  // Auto product extraction state
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractedNotice, setExtractedNotice] = useState<string | null>(null);

  // Manual Ingestion Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<KnowledgeType>('document');
  const [newContent, setNewContent] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const [searchTerm, setSearchTerm] = useState('');

  // Extract products from a knowledge source
  const handleExtractProducts = async (source: KnowledgeSource) => {
    if (!setProducts) return;
    setExtractingId(source.id);
    setExtractedNotice(null);

    try {
      const response = await fetch('/api/knowledge/extract-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: source.content,
          url: source.url,
          title: source.title,
        }),
      });

      const data = await response.json();
      if (data.success && Array.isArray(data.products) && data.products.length > 0) {
        setProducts((prev) => [...data.products, ...prev]);
        setExtractedNotice(`🎉 Đã tự động trích xuất ${data.products.length} sản phẩm từ "${source.title}" vào Danh mục Sản phẩm!`);
      } else {
        alert(data.error || 'Không thể trích xuất sản phẩm từ nội dung này.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi trích xuất sản phẩm: ' + (err.message || String(err)));
    } finally {
      setExtractingId(null);
    }
  };

  // Handle URL Scraping via backend
  const handleScrapeWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsScraping(true);
    setScrapeError(null);
    setScrapeSuccess(null);
    setExtractedNotice(null);

    try {
      const response = await fetch('/api/knowledge/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: urlInput.trim(),
          mode: scrapeMode,
          maxPages: maxPages
        }),
      });

      const data = await response.json();

      if (data.success && data.content) {
        const newSource: KnowledgeSource = {
          id: `kb_web_${Date.now()}`,
          title: data.title || `Trang web: ${urlInput}`,
          type: 'website',
          url: data.url,
          content: data.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: data.wordCount || data.content.split(/\s+/).length,
          crawlMode: data.crawlMode || scrapeMode,
          pagesScrapedCount: data.pagesScrapedCount || 1,
          subPages: data.subPages || [],
        };

        setKnowledgeSources((prev) => [newSource, ...prev]);
        const modeLabel = (data.crawlMode || scrapeMode).toUpperCase();
        const pagesStr = data.pagesScrapedCount ? `${data.pagesScrapedCount} trang` : '1 trang';
        setScrapeSuccess(`🎉 Đã thu thập thành công ${pagesStr} (~${data.wordCount} từ) bằng cơ chế ${modeLabel} từ ${data.url}`);
        setUrlInput('');

        // Automatically offer or trigger product catalog extraction
        if (setProducts) {
          handleExtractProducts(newSource);
        }
      } else {
        setScrapeError(data.error || 'Không thể trích xuất nội dung từ trang web này.');
      }
    } catch (err: any) {
      setScrapeError(`Lỗi kết nối khi tải trang: ${err.message || String(err)}`);
    } finally {
      setIsScraping(false);
    }
  };

  // Add Manual Knowledge Source
  const handleAddKnowledge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    const source: KnowledgeSource = {
      id: `kb_manual_${Date.now()}`,
      title: newTitle.trim(),
      type: newType,
      url: newUrl.trim() || undefined,
      content: newContent.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      active: true,
      wordCount: newContent.trim().split(/\s+/).length,
    };

    setKnowledgeSources((prev) => [source, ...prev]);
    setNewTitle('');
    setNewContent('');
    setNewUrl('');
    setShowAddModal(false);
  };

  // Toggle active status
  const toggleSourceActive = (id: string) => {
    setKnowledgeSources((prev) =>
      prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    );
  };

  // Delete Knowledge item
  const handleDeleteSource = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xoá mục tri thức này?')) {
      setKnowledgeSources((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const filteredSources = knowledgeSources.filter(
    (source) =>
      source.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Section: Website Crawler Tool & Hierarchy Notice */}
      <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-md border border-slate-800 space-y-6">
        
        {/* Data Hierarchy Strategy Card */}
        <div className="bg-slate-800/80 p-4 rounded-xl border border-indigo-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Cơ Chế Phản Hồi Theo Ưu Tiên Dữ Liệu</span>
            </div>
            <p className="text-xs text-slate-300">
              Agent sẽ luôn ưu tiên tra cứu <b>1. Dữ liệu Website & Tài liệu nạp</b> bên dưới. Nếu thông tin nạp không đủ, Agent sẽ tự động sử dụng <b>2. Tri thức Mô hình AI Gemini tích hợp</b> để giải đáp thỏa đáng cho khách hàng.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold">
              Ưu tiên 1: Nạp Dữ Liệu
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
              Ưu tiên 2: Gemini AI
            </span>
          </div>
        </div>

        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-400/30">
            <Globe className="w-3.5 h-3.5" />
            <span>Thu Thập Tự Động Từ Website (Website Scraping)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
            Nạp dữ liệu website cho Trợ lý AI
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
            Nhập đường dẫn trang web. Hệ thống sẽ tự động sử dụng <b>Chiến lược Cào Lai (Hybrid Strategy)</b>: Quét Sitemap XML chính chủ kết hợp với bóc tách liên kết con (sub-links) để gom toàn bộ dữ liệu chỉ trong 1 lần nhấn.
          </p>

          {/* Scrape Strategy & Config Selector */}
          <div className="mb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold mr-1">Cơ chế cào:</span>
              <button
                type="button"
                onClick={() => setScrapeMode('hybrid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  scrapeMode === 'hybrid'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>🚀 Hybrid (Sitemap + Sublinks)</span>
              </button>

              <button
                type="button"
                onClick={() => setScrapeMode('sitemap')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  scrapeMode === 'sitemap'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <span>🗺️ Sitemap XML</span>
              </button>

              <button
                type="button"
                onClick={() => setScrapeMode('sublinks')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  scrapeMode === 'sublinks'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <span>🔗 Quét Sub-links</span>
              </button>

              <button
                type="button"
                onClick={() => setScrapeMode('single')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                  scrapeMode === 'single'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                }`}
              >
                <span>📄 Trang Đơn (Single)</span>
              </button>
            </div>

            {scrapeMode !== 'single' && (
              <div className="flex items-center gap-3 text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-medium text-slate-300">Giới hạn số trang tối đa:</span>
                <select
                  value={maxPages}
                  onChange={(e) => setMaxPages(parseInt(e.target.value, 10))}
                  className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                >
                  <option value={5}>5 trang (Nhanh)</option>
                  <option value={10}>10 trang (Khuyên dùng)</option>
                  <option value={15}>15 trang (Sâu)</option>
                  <option value={20}>20 trang (Toàn bộ)</option>
                </select>
                <span className="text-[11px] text-slate-400">
                  (Tự động thu thập các trang Giới thiệu, Sản phẩm, Chính sách...)
                </span>
              </div>
            )}
          </div>

          <form onSubmit={handleScrapeWebsite} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <LinkIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://domain.com (hoặc https://domain.com/chinh-sach)"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isScraping || !urlInput.trim()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs shrink-0"
            >
              {isScraping ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang cào dữ liệu...</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  <span>Cào Website {scrapeMode === 'hybrid' ? 'Lai (Hybrid)' : ''}</span>
                </>
              )}
            </button>
          </form>

          {scrapeSuccess && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{scrapeSuccess}</span>
            </div>
          )}

          {scrapeError && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-400/30 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{scrapeError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Knowledge Base Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h3 className="font-bold text-slate-900 text-base">Cơ Sở Tri Thức Dữ Liệu</h3>
          <p className="text-xs text-slate-500">
            Tổng cộng: {knowledgeSources.length} nguồn tri thức ({knowledgeSources.filter((k) => k.active).length} đang hoạt động)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm tài liệu..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-60 bg-slate-50"
            />
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Dữ Liệu Mới</span>
          </button>
        </div>
      </div>

      {extractedNotice && (
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-semibold">{extractedNotice}</span>
          </div>
          {onNavigateToProducts && (
            <button
              onClick={onNavigateToProducts}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1 shrink-0"
            >
              <span>Xem Danh Mục Sản Phẩm</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Knowledge Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSources.map((source) => (
          <div
            key={source.id}
            className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between shadow-2xs ${
              source.active ? 'border-slate-200/80 hover:border-indigo-300' : 'border-slate-200 bg-slate-50/50 opacity-70'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                    source.type === 'website' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                    source.type === 'process_guide' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                    'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {source.type === 'website' && <Globe className="w-3 h-3" />}
                    {source.type === 'process_guide' && <FileCheck className="w-3 h-3" />}
                    {source.type === 'document' && <FileText className="w-3 h-3" />}
                    <span className="capitalize">{source.type}</span>
                  </span>

                  {source.crawlMode && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      source.crawlMode === 'hybrid' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      source.crawlMode === 'sitemap' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {source.crawlMode === 'hybrid' && '🚀 HYBRID'}
                      {source.crawlMode === 'sitemap' && '🗺️ SITEMAP'}
                      {source.crawlMode === 'sublinks' && '🔗 SUBLINKS'}
                      {source.crawlMode === 'single' && '📄 SINGLE'}
                      {source.pagesScrapedCount ? ` (${source.pagesScrapedCount} TRANG)` : ''}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => toggleSourceActive(source.id)}
                  title={source.active ? 'Tắt nguồn này' : 'Bật nguồn này'}
                  className="text-slate-400 hover:text-indigo-600 shrink-0"
                >
                  {source.active ? (
                    <ToggleRight className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-slate-400" />
                  )}
                </button>
              </div>

              <h4 className="font-bold text-slate-900 text-sm line-clamp-2 mb-2">{source.title}</h4>
              
              {source.url && (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 truncate mb-3"
                >
                  <LinkIcon className="w-3 h-3" />
                  <span className="truncate">{source.url}</span>
                </a>
              )}

              <p className="text-xs text-slate-600 line-clamp-4 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-[11px]">
                {source.content}
              </p>

              {/* Subpages inspector accordion */}
              {Array.isArray(source.subPages) && source.subPages.length > 0 && (
                <div className="mt-2.5 text-[11px]">
                  <button
                    onClick={() => setExpandedSubPagesId(expandedSubPagesId === source.id ? null : source.id)}
                    className="text-indigo-600 font-semibold hover:underline flex items-center gap-1 bg-indigo-50/70 px-2.5 py-1 rounded-lg border border-indigo-100"
                  >
                    <span>{expandedSubPagesId === source.id ? '▼ Ẩn danh sách trang con' : `▶ Xem danh sách ${source.subPages.length} trang đã cào`}</span>
                  </button>
                  {expandedSubPagesId === source.id && (
                    <ul className="mt-2 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] max-h-40 overflow-y-auto">
                      {source.subPages.map((sub, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 border-b border-slate-100 last:border-0 pb-1 pt-0.5">
                          <span className="font-medium text-slate-700 truncate">{i + 1}. {sub.title}</span>
                          <a href={sub.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline shrink-0 font-medium">Link ↗</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Extract to Product Catalog Action Button */}
              {setProducts && (
                <div className="mt-3">
                  <button
                    onClick={() => handleExtractProducts(source)}
                    disabled={extractingId === source.id}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200/80 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    {extractingId === source.id ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                        <span>Đang trích xuất sản phẩm...</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Trích xuất vào Danh mục Sản phẩm</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>{source.wordCount} từ</span>
              <button
                onClick={() => handleDeleteSource(source.id)}
                className="text-slate-400 hover:text-red-600 transition-colors"
                title="Xoá mục này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Manual Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-4">Thêm Tri Thức / Tài Liệu Mới</h3>

            <form onSubmit={handleAddKnowledge} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Têu đề tài liệu / Quy trình</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Quy trình hướng dẫn khách hàng thanh toán trả góp"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại nguồn tri thức</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as KnowledgeType)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                >
                  <option value="document">Tài liệu hướng dẫn (Document)</option>
                  <option value="process_guide">Hướng dẫn nghiệp vụ (Process Guide)</option>
                  <option value="faq">Hỏi đáp thường gặp (FAQ)</option>
                  <option value="website">Nội dung trang Web (Website)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Đường dẫn đính kèm (Tuỳ chọn)</label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nội dung văn bản chi tiết</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Dán toàn bộ văn bản quy định, chính sách, hướng dẫn chi tiết từng bước vào đây..."
                  rows={6}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
                >
                  Lưu Tri Thức
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
