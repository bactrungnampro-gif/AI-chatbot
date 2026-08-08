import React, { useState, useEffect } from 'react';
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
  ArrowRight,
  FileSpreadsheet,
  HardDrive,
  Server,
  Upload,
  FileUp,
  FileType,
  Shield,
  LogOut,
  ExternalLink,
  Folder,
  File
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
  const [activeTab, setActiveTab] = useState<'file' | 'website' | 'sheets' | 'drive' | 'api'>('file');

  // Direct File Upload State
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  // Website Scraper State
  const [urlInput, setUrlInput] = useState('');
  const [scrapeMode, setScrapeMode] = useState<'hybrid' | 'sitemap' | 'sublinks' | 'single'>('hybrid');
  const [maxPages, setMaxPages] = useState<number>(10);
  const [isCustomPages, setIsCustomPages] = useState<boolean>(false);
  const [customPagesInput, setCustomPagesInput] = useState<string>('30');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);
  const [expandedSubPagesId, setExpandedSubPagesId] = useState<string | null>(null);

  // Google Sheets Integration State
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // Google Drive & OAuth 2.0 Integration State
  const [driveUrl, setDriveUrl] = useState('');
  const [folderUrlInput, setFolderUrlInput] = useState('');
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ email: string; name: string; picture?: string } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isCheckingGoogleAuth, setIsCheckingGoogleAuth] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }>>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [importingDriveFileId, setImportingDriveFileId] = useState<string | null>(null);

  // Check Google Auth Status on mount
  const checkGoogleAuthStatus = async () => {
    setIsCheckingGoogleAuth(true);
    try {
      const res = await fetch('/api/auth/google/me');
      const data = await res.json();
      if (data.connected && data.user) {
        setIsGoogleConnected(true);
        setGoogleUser(data.user);
        fetchDriveFiles();
      } else {
        setIsGoogleConnected(false);
        setGoogleUser(null);
      }
    } catch (e) {
      console.warn("Lỗi kiểm tra Google OAuth", e);
    } finally {
      setIsCheckingGoogleAuth(false);
    }
  };

  useEffect(() => {
    checkGoogleAuthStatus();

    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'GOOGLE_OAUTH_SUCCESS') {
        checkGoogleAuthStatus();
        setScrapeSuccess(`🎉 Đã kết nối thành công Google OAuth 2.0 tài khoản ${e.data.user?.email || ''}!`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch Drive Files
  const fetchDriveFiles = async () => {
    setIsLoadingDriveFiles(true);
    try {
      const res = await fetch('/api/google/drive/files');
      const data = await res.json();
      if (data.files) {
        setDriveFiles(data.files);
      } else if (data.error) {
        setScrapeError(data.error);
      }
    } catch (e: any) {
      setScrapeError("Lỗi tải danh sách tệp Google Drive: " + e.message);
    } finally {
      setIsLoadingDriveFiles(false);
    }
  };

  // Connect Google OAuth Popup
  const handleConnectGoogleOAuth = () => {
    const width = 550;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      '/api/auth/google',
      'GoogleOAuthPopup',
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
    );
  };

  // Logout Google OAuth
  const handleLogoutGoogleOAuth = async () => {
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsGoogleConnected(false);
      setGoogleUser(null);
      setDriveFiles([]);
      setScrapeSuccess("Đã ngắt kết nối tài khoản Google OAuth 2.0.");
    } catch (e: any) {
      setScrapeError("Lỗi khi ngắt kết nối: " + e.message);
    }
  };

  // Import File from Google Drive via OAuth
  const handleImportDriveFile = async (file: { id: string; name: string; mimeType: string }) => {
    setImportingDriveFileId(file.id);
    setScrapeError(null);
    setScrapeSuccess(null);
    try {
      const res = await fetch('/api/google/drive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });
      const data = await res.json();
      if (data.success && data.knowledgeSource) {
        const newSource: KnowledgeSource = {
          id: data.knowledgeSource.id,
          title: data.knowledgeSource.title,
          type: 'google_drive',
          url: data.knowledgeSource.url,
          content: data.knowledgeSource.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: data.knowledgeSource.content.split(/\s+/).length,
        };
        setKnowledgeSources((prev) => [newSource, ...prev]);
        setScrapeSuccess(`🎉 Đã nạp thành công tệp "${file.name}" (~${data.textLength} ký tự) từ Google Drive vào Tri thức Agent!`);
      } else {
        setScrapeError(data.error || "Không thể trích xuất tệp từ Google Drive.");
      }
    } catch (e: any) {
      setScrapeError("Lỗi kết nối khi nạp tệp Drive: " + e.message);
    } finally {
      setImportingDriveFileId(null);
    }
  };

  // Import Entire Google Drive Folder / Shared Folder
  const handleImportDriveFolder = async (folderIdUrlParam?: string, folderNameParam?: string) => {
    const targetFolder = folderIdUrlParam || folderUrlInput;
    if (!targetFolder || !targetFolder.trim()) return;

    setIsImportingFolder(true);
    setScrapeError(null);
    setScrapeSuccess(null);

    try {
      const res = await fetch('/api/google/drive/folder/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderIdUrl: targetFolder.trim(),
          folderName: folderNameParam
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.importedSources)) {
        const newSources: KnowledgeSource[] = data.importedSources.map((s: any) => ({
          id: s.id,
          title: s.title,
          type: 'google_drive',
          url: s.url,
          content: s.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: s.content.split(/\s+/).length,
        }));

        setKnowledgeSources((prev) => [...newSources, ...prev]);
        setScrapeSuccess(data.message || `🎉 Đã nạp thành công toàn bộ ${newSources.length} tệp từ Thư mục Google Drive vào Tri thức AI!`);
        setFolderUrlInput('');
      } else {
        setScrapeError(data.error || "Không thể trích xuất tệp từ Thư mục Google Drive.");
      }
    } catch (e: any) {
      setScrapeError("Lỗi khi nạp Thư mục Drive: " + e.message);
    } finally {
      setIsImportingFolder(false);
    }
  };

  // Custom REST API Integration State
  const [apiUrl, setApiUrl] = useState('');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST'>('GET');
  const [apiHeaders, setApiHeaders] = useState('{\n  "Authorization": "Bearer YOUR_API_KEY"\n}');
  const [apiBody, setApiBody] = useState('');
  const [apiTitle, setApiTitle] = useState('');
  const [isFetchingApi, setIsFetchingApi] = useState(false);

  // Auto product extraction state
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractedNotice, setExtractedNotice] = useState<string | null>(null);

  // Helper for safe JSON response parsing
  const safeFetchJson = async (url: string, options: RequestInit) => {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!text || !text.trim()) {
      throw new Error(`Máy chủ phản hồi rỗng (Mã lỗi ${response.status}). Có thể do quá trình xử lý quá lâu gây ra Timeout hoặc dịch vụ đang khởi động lại.`);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Máy chủ phản hồi định dạng không hợp lệ (HTTP ${response.status}). Dữ liệu phản hồi bị gián đoạn.`);
    }
  };

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
      const data = await safeFetchJson('/api/knowledge/extract-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: source.content,
          url: source.url,
          title: source.title,
        }),
      });

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
      const data = await safeFetchJson('/api/knowledge/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: urlInput.trim(),
          mode: scrapeMode,
          maxPages: maxPages
        }),
      });

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

  // Handle Google Sheets Sync
  const handleSyncGoogleSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;

    setIsFetchingSheet(true);
    setScrapeError(null);
    setScrapeSuccess(null);

    try {
      const data = await safeFetchJson('/api/knowledge/fetch-google-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          sheetName: sheetName.trim() || undefined
        }),
      });

      if (data.success) {
        const newSource: KnowledgeSource = {
          id: `kb_sheet_${Date.now()}`,
          title: data.title,
          type: 'google_sheets',
          url: data.url,
          content: data.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: data.wordCount,
        };

        setKnowledgeSources((prev) => [newSource, ...prev]);
        setScrapeSuccess(`🎉 Đã đồng bộ thành công dữ liệu Google Sheet (${data.rowCount} hàng) vào Tri thức AI!`);
        setSheetUrl('');
        setSheetName('');

        if (setProducts) {
          handleExtractProducts(newSource);
        }
      } else {
        setScrapeError(data.error || 'Không thể đồng bộ Google Sheet.');
      }
    } catch (err: any) {
      setScrapeError('Lỗi kết nối đến máy chủ Google Sheets: ' + (err.message || String(err)));
    } finally {
      setIsFetchingSheet(false);
    }
  };

  // Handle Google Drive Sync
  const handleSyncGoogleDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;

    setIsFetchingDrive(true);
    setScrapeError(null);
    setScrapeSuccess(null);

    try {
      const data = await safeFetchJson('/api/knowledge/fetch-google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driveUrl: driveUrl.trim() }),
      });

      if (data.success) {
        const newSource: KnowledgeSource = {
          id: `kb_drive_${Date.now()}`,
          title: data.title,
          type: 'google_drive',
          url: data.url,
          content: data.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: data.wordCount,
        };

        setKnowledgeSources((prev) => [newSource, ...prev]);
        setScrapeSuccess(`🎉 Đã đồng bộ tài liệu từ Google Drive/Docs (${data.wordCount} từ) vào Tri thức AI!`);
        setDriveUrl('');
      } else {
        setScrapeError(data.error || 'Không thể đồng bộ Google Drive.');
      }
    } catch (err: any) {
      setScrapeError('Lỗi kết nối đến máy chủ Google Drive: ' + (err.message || String(err)));
    } finally {
      setIsFetchingDrive(false);
    }
  };

  // Handle Custom REST API Sync
  const handleSyncRestApi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiUrl.trim()) return;

    setIsFetchingApi(true);
    setScrapeError(null);
    setScrapeSuccess(null);

    try {
      const data = await safeFetchJson('/api/knowledge/fetch-api-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          method: apiMethod,
          headers: apiHeaders,
          body: apiBody.trim() || undefined,
          title: apiTitle.trim() || undefined
        }),
      });

      if (data.success) {
        const newSource: KnowledgeSource = {
          id: `kb_api_${Date.now()}`,
          title: data.title,
          type: 'api_endpoint',
          url: data.url,
          content: data.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          active: true,
          wordCount: data.wordCount,
        };

        setKnowledgeSources((prev) => [newSource, ...prev]);
        setScrapeSuccess(`🎉 Đã kết nối và đồng bộ dữ liệu từ REST API Endpoint vào Tri thức AI!`);
        setApiUrl('');
        setApiTitle('');

        if (setProducts) {
          handleExtractProducts(newSource);
        }
      } else {
        setScrapeError(data.error || 'Không thể kết nối đến REST API Endpoint.');
      }
    } catch (err: any) {
      setScrapeError('Lỗi kết nối REST API: ' + (err.message || String(err)));
    } finally {
      setIsFetchingApi(false);
    }
  };

  // Handle Direct Document/PDF Multi-File Upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploadingFile(true);
    setScrapeError(null);
    setScrapeSuccess(null);
    setExtractedNotice(null);

    let successCount = 0;
    const newSources: KnowledgeSource[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as File;
        setUploadedFileName(`[Tệp ${i + 1}/${files.length}] ${file.name}`);

        try {
          const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const res = (e.target?.result as string)?.split(',')[1];
              if (res) resolve(res);
              else reject(new Error('Lỗi đọc dữ liệu Base64'));
            };
            reader.onerror = () => reject(new Error('Lỗi đọc tập tin từ thiết bị'));
            reader.readAsDataURL(file);
          });

          const data = await safeFetchJson('/api/knowledge/upload-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type,
              fileBase64: base64Data
            })
          });

          if (data.success && data.content) {
            const newSource: KnowledgeSource = {
              id: `kb_file_${Date.now()}_${i}`,
              title: data.title || `Tài liệu: ${file.name}`,
              type: 'document',
              url: undefined,
              content: data.content,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              active: true,
              wordCount: data.wordCount || 0,
            };
            newSources.push(newSource);
            successCount++;

            if (setProducts) {
              handleExtractProducts(newSource);
            }
          }
        } catch (fileErr: any) {
          console.error(`Lỗi trích xuất tệp ${file.name}:`, fileErr);
        }
      }

      if (newSources.length > 0) {
        setKnowledgeSources((prev) => [...newSources, ...prev]);
        setScrapeSuccess(`🎉 Đã nạp thành công ${successCount}/${files.length} tệp tin vào Tri thức Agent AI!`);
      } else {
        setScrapeError('Không thể trích xuất nội dung từ các tệp đã chọn.');
      }
    } catch (err: any) {
      setScrapeError('Lỗi tải tệp tin: ' + (err.message || String(err)));
    } finally {
      setIsUploadingFile(false);
      event.target.value = '';
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

        {/* Sample Data Cleanup Banner if sample items exist */}
        {knowledgeSources.some(k => ['kb_1', 'kb_2', 'kb_3', 'kb_4'].includes(k.id) || k.title.includes('TechLife')) && (
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <b>Mẹo:</b> Danh sách đang chứa dữ liệu mẫu ban đầu (TechLife). Khi bạn nạp dữ liệu thương hiệu mới, hệ thống sẽ tự động ưu tiên dữ liệu mới của bạn. Bạn cũng có thể dọn dẹp dữ liệu mẫu ban đầu để danh sách gọn gàng hơn.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Xóa tất cả các tài liệu mẫu mặc định ban đầu (TechLife)? các tài liệu do bạn nạp vẫn sẽ được giữ nguyên.')) {
                  setKnowledgeSources((prev) => prev.filter((item) => !['kb_1', 'kb_2', 'kb_3', 'kb_4'].includes(item.id) && !item.title.includes('TechLife')));
                  if (setProducts) {
                    setProducts((prev) => prev.filter((p) => !['prod_1', 'prod_2', 'prod_3'].includes(p.id) && !p.name.includes('TechLife')));
                  }
                  setScrapeSuccess('✨ Đã dọn dẹp xong dữ liệu mẫu ban đầu! Hiện tại Agent chỉ sử dụng nguồn dữ liệu mới do bạn cung cấp.');
                }
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg transition-colors shrink-0 shadow-sm flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa Dữ Liệu Mẫu (TechLife)</span>
            </button>
          </div>
        )}

        {/* Connector Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'file'
                ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileUp className="w-4 h-4 text-amber-400" />
            <span>1. Nạp File PDF / Word / Text</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('website')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'website'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 text-sky-400" />
            <span>2. Website Scraper</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sheets')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'sheets'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>3. Google Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drive')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'drive'
                ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span>4. Google Drive / Docs</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('api')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 border ${
              activeTab === 'api'
                ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4 text-purple-400" />
            <span>5. REST API Endpoint</span>
          </button>
        </div>

        {/* TAB 1: DIRECT FILE UPLOAD (PDF, DOCX, TXT, CSV) */}
        {activeTab === 'file' && (
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold mb-3 border border-amber-400/30">
              <FileUp className="w-3.5 h-3.5" />
              <span>Nạp Tệp Tin Trực Tiếp (Direct Document Upload)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
              Tải lên tài liệu PDF, Word, Báo giá hoặc Hướng dẫn
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
              Hỗ trợ tải lên trực tiếp các tệp <b>.pdf</b>, <b>.docx</b>, <b>.txt</b>, <b>.csv</b>, <b>.md</b>. Hệ thống sẽ tự động bóc tách văn bản (kể cả PDF scan bằng AI OCR) và trích xuất sản phẩm vào danh mục tự động.
            </p>

            <div className="bg-slate-800/90 border-2 border-dashed border-amber-500/40 rounded-2xl p-6 sm:p-8 text-center hover:border-amber-400/80 transition-all group relative overflow-hidden">
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.csv,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv"
                onChange={handleFileUpload}
                disabled={isUploadingFile}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />

              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                  {isUploadingFile ? (
                    <RefreshCw className="w-7 h-7 animate-spin" />
                  ) : (
                    <Upload className="w-7 h-7" />
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-slate-100 text-sm sm:text-base mb-1">
                    {isUploadingFile ? `Đang xử lý và bóc tách dữ liệu tệp ${uploadedFileName}...` : 'Nhấp hoặc Kéo thả NHIỀU TỆP TIN (PDF, Word, CSV, TXT) vào đây'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Hỗ trợ chọn hoặc kéo thả <b>nhiều tệp cùng lúc (Multi-file upload)</b>: PDF (.pdf), Word (.docx), CSV (.csv), Text (.txt, .md).
                  </p>
                </div>

                <div className="flex flex-wrap justify-center items-center gap-2 mt-2">
                  <span className="px-2.5 py-1 bg-slate-900/80 rounded-lg text-[11px] font-medium text-amber-300 border border-amber-500/20 flex items-center gap-1">
                    <FileType className="w-3.5 h-3.5" /> PDF (.pdf)
                  </span>
                  <span className="px-2.5 py-1 bg-slate-900/80 rounded-lg text-[11px] font-medium text-blue-300 border border-blue-500/20 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Word (.docx)
                  </span>
                  <span className="px-2.5 py-1 bg-slate-900/80 rounded-lg text-[11px] font-medium text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" /> CSV / Bảng giá
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: WEBSITE SCRAPER */}
        {activeTab === 'website' && (
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
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
                <span className="font-medium text-slate-300">Số trang thu thập tối đa:</span>
                <div className="flex items-center gap-2">
                  <select
                    value={isCustomPages ? 'custom' : maxPages}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomPages(true);
                        const val = parseInt(customPagesInput, 10);
                        if (!isNaN(val) && val > 0) {
                          setMaxPages(val);
                        } else {
                          setMaxPages(30);
                          setCustomPagesInput('30');
                        }
                      } else {
                        setIsCustomPages(false);
                        const parsed = parseInt(e.target.value, 10);
                        setMaxPages(parsed);
                      }
                    }}
                    className="bg-slate-900 border border-slate-700 text-white rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold cursor-pointer"
                  >
                    <option value={10}>10 trang (Nhanh)</option>
                    <option value={25}>25 trang (Tiêu chuẩn)</option>
                    <option value={50}>50 trang (Mở rộng)</option>
                    <option value={100}>100 trang (Cào Sâu - Deep Crawl)</option>
                    <option value={200}>200 trang (Quy mô Lớn)</option>
                    <option value={500}>500 trang (Doanh nghiệp)</option>
                    <option value={1000}>1000 trang (Tối đa 1000 trang)</option>
                    <option value="custom">⚙️ Nhập số tùy chỉnh (Tối đa 1000)...</option>
                  </select>

                  {isCustomPages && (
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={customPagesInput}
                      onChange={(e) => {
                        const strVal = e.target.value;
                        setCustomPagesInput(strVal);
                        const parsed = parseInt(strVal, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                          setMaxPages(Math.min(1000, parsed));
                        }
                      }}
                      className="w-24 bg-slate-900 border border-indigo-500 text-white rounded-lg px-2.5 py-1 text-xs font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      placeholder="Số trang"
                    />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  (Hệ thống tự động cào song song batch 8 trang/lần)
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
        </div>
        )}

        {/* TAB 2: GOOGLE SHEETS */}
        {activeTab === 'sheets' && (
          <div className="max-w-3xl space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold mb-2 border border-emerald-400/30">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Đồng Bộ Trực Tiếp Từ Google Sheets</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
                Nạp dữ liệu từ Bảng tính Google Sheet
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Nhập link Google Sheet (Bảng giá, Sản phẩm, FAQ, Tồn kho...). Đảm bảo file đã bật chế độ <b>"Bất kỳ ai có liên kết đều có thể xem" (Anyone with link)</b>.
              </p>
            </div>

            <form onSubmit={handleSyncGoogleSheet} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <FileSpreadsheet className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1ABC.../edit"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm"
                    required
                  />
                </div>
                <input
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Tên gợi nhớ (Ví dụ: Bảng Giá 2026)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs sm:text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] text-slate-400">
                  💡 Mẹo: Dữ liệu Google Sheet sau khi nạp sẽ tự động phân tích thành các cột thông tin cho AI đọc tra cứu.
                </p>
                <button
                  type="submit"
                  disabled={isFetchingSheet || !sheetUrl.trim()}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs shrink-0"
                >
                  {isFetchingSheet ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang đọc Bảng tính...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Đồng Bộ Google Sheet</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: GOOGLE DRIVE & GOOGLE OAUTH 2.0 */}
        {activeTab === 'drive' && (
          <div className="max-w-3xl space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold mb-2 border border-blue-400/30">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Google OAuth 2.0 & Google Drive Direct Connection</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
                Tích hợp Google OAuth 2.0 & Trích xuất Google Drive
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Đăng nhập trực tiếp bằng tài khoản Google để cấp quyền truy cập an toàn qua chuẩn <b>Google OAuth 2.0</b>. Sau khi kết nối, bạn có thể chọn bất kỳ tệp Google Docs, Google Sheet, PDF hoặc Text trong Google Drive để nạp vào Trợ lý AI chỉ với 1 click.
              </p>
            </div>

            {/* Google OAuth Status & Action Card */}
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
              {isCheckingGoogleAuth ? (
                <div className="flex items-center gap-3 py-3 text-slate-300 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                  <span>Đang kiểm tra trạng thái Google OAuth 2.0...</span>
                </div>
              ) : isGoogleConnected && googleUser ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-blue-950/40 border border-blue-500/30">
                    <div className="flex items-center gap-3">
                      {googleUser.picture ? (
                        <img src={googleUser.picture} alt="Avatar" className="w-10 h-10 rounded-full border border-blue-400/40" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center">
                          {googleUser.name?.charAt(0) || 'G'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-100">{googleUser.name}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            <Shield className="w-3 h-3" /> OAuth 2.0 Active
                          </span>
                        </div>
                        <p className="text-xs text-blue-300 font-mono">{googleUser.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={fetchDriveFiles}
                        disabled={isLoadingDriveFiles}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isLoadingDriveFiles ? 'animate-spin' : ''}`} />
                        <span>Làm mới danh sách</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLogoutGoogleOAuth}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-300 border border-rose-500/30 flex items-center gap-1.5 transition-all"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Ngắt kết nối</span>
                      </button>
                    </div>
                  </div>

                  {/* Google Drive File Picker / Browser */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Folder className="w-4 h-4 text-blue-400" />
                        Danh sách tệp & Thư mục trên Google Drive
                      </h3>
                      <span className="text-xs text-slate-400">{driveFiles.length} mục tìm thấy</span>
                    </div>

                    {isLoadingDriveFiles ? (
                      <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-800">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Đang truy vấn Google Drive API v3...</p>
                      </div>
                    ) : driveFiles.length === 0 ? (
                      <div className="p-6 text-center bg-slate-800/40 rounded-xl border border-slate-800">
                        <HardDrive className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                        <p className="text-xs text-slate-300 font-semibold mb-1">Chưa tìm thấy tài liệu tương thích trên Google Drive</p>
                        <p className="text-[11px] text-slate-400">Hệ thống hỗ trợ trích xuất Google Docs, Google Sheets, PDF và TXT.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                        {driveFiles.map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 hover:border-blue-500/50 transition-all gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                                {f.mimeType === 'application/vnd.google-apps.folder' ? (
                                  <Folder className="w-4 h-4 text-amber-400" />
                                ) : f.mimeType.includes('document') ? (
                                  <FileText className="w-4 h-4 text-blue-400" />
                                ) : f.mimeType.includes('spreadsheet') ? (
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <File className="w-4 h-4 text-amber-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-100 truncate">{f.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {f.mimeType === 'application/vnd.google-apps.folder' ? 'Thư mục Google Drive' : f.mimeType.includes('document') ? 'Google Doc' : f.mimeType.includes('spreadsheet') ? 'Google Sheet' : f.mimeType}
                                  {f.modifiedTime ? ` • Cập nhật: ${new Date(f.modifiedTime).toLocaleDateString('vi-VN')}` : ''}
                                </p>
                              </div>
                            </div>

                            {f.mimeType === 'application/vnd.google-apps.folder' ? (
                              <button
                                type="button"
                                onClick={() => handleImportDriveFolder(f.id, f.name)}
                                disabled={isImportingFolder}
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 shadow-xs"
                              >
                                {isImportingFolder ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang đọc...</span>
                                  </>
                                ) : (
                                  <>
                                    <Folder className="w-3.5 h-3.5" />
                                    <span>Nạp Thư Mục Này</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleImportDriveFile(f)}
                                disabled={importingDriveFileId === f.id}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 shadow-xs"
                              >
                                {importingDriveFileId === f.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Đang nạp...</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Nạp vào Tri Thức</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/80 border border-slate-700/80">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-100">Đăng Nhập Kết Nối Google OAuth 2.0</h3>
                      <p className="text-xs text-slate-400">Kết nối tài khoản Google để tự động duyệt & trích xuất văn bản từ Google Drive.</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleConnectGoogleOAuth}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all shrink-0"
                  >
                    <span>Kết Nối Google OAuth 2.0</span>
                    <ExternalLink className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              )}
            </div>

            {/* Google Drive Folder & Shared Folder Import Form */}
            <div className="pt-2">
              <h3 className="text-xs font-bold text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Folder className="w-4 h-4 text-blue-400" />
                Nạp Nguyên Thư Mục Google Drive (Bao gồm Thư mục được chia sẻ / Shared Folder)
              </h3>
              <form onSubmit={(e) => { e.preventDefault(); handleImportDriveFolder(); }} className="space-y-3">
                <div className="relative">
                  <Folder className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400" />
                  <input
                    type="text"
                    value={folderUrlInput}
                    onChange={(e) => setFolderUrlInput(e.target.value)}
                    placeholder="Dán URL thư mục Google Drive (VD: https://drive.google.com/drive/folders/1XYZ...) hoặc Folder ID"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] text-slate-400">
                    💡 Tự động duyệt qua tất cả các tệp Google Docs, Sheet, PDF, TXT bên trong Thư mục được chia sẻ (kể cả thư mục con).
                  </p>
                  <button
                    type="submit"
                    disabled={isImportingFolder || !folderUrlInput.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white text-xs font-semibold transition-colors shadow-xs shrink-0"
                  >
                    {isImportingFolder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang nạp toàn bộ thư mục...</span>
                      </>
                    ) : (
                      <>
                        <Folder className="w-4 h-4" />
                        <span>Nạp Thư Mục Drive</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Manual Google Docs URL Input Fallback */}
            <div className="pt-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Hoặc Nạp Thủ Công Bằng Đường Dẫn Google Docs Công Khai</h3>
              <form onSubmit={handleSyncGoogleDrive} className="space-y-3">
                <div className="relative">
                  <HardDrive className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-400" />
                  <input
                    type="url"
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://docs.google.com/document/d/1XYZ.../edit"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <p className="text-[11px] text-slate-400">
                    💡 Dán liên kết Google Docs công khai (Chế độ "Bất kỳ ai có liên kết đều có thể xem").
                  </p>
                  <button
                    type="submit"
                    disabled={isFetchingDrive || !driveUrl.trim()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 text-white text-xs font-semibold transition-colors border border-slate-700 shrink-0"
                  >
                    {isFetchingDrive ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang đọc...</span>
                      </>
                    ) : (
                      <>
                        <HardDrive className="w-4 h-4" />
                        <span>Nạp Từ URL</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 4: REST API ENDPOINT */}
        {activeTab === 'api' && (
          <div className="max-w-3xl space-y-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold mb-2 border border-purple-400/30">
                <Server className="w-3.5 h-3.5" />
                <span>Kết Nối API System / ERP / CRM Bên Ngoài</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">
                Kết nối REST API Endpoint bên thứ ba
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Nhập Endpoint API của hệ thống nội bộ (CRM, ERP, Kho hàng, POS, Webhook...). AI Agent sẽ tự động gửi HTTP Request để lấy dữ liệu JSON/Text làm tri thức học.
              </p>
            </div>

            <form onSubmit={handleSyncRestApi} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <select
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value as 'GET' | 'POST')}
                  className="bg-slate-800 border border-slate-700 text-white font-bold rounded-xl px-3 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="GET">GET Request</option>
                  <option value="POST">POST Request</option>
                </select>

                <div className="sm:col-span-3 relative">
                  <Server className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400" />
                  <input
                    type="url"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.yourdomain.com/v1/products"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs sm:text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Custom Headers (JSON - Ví dụ API Key / Authorization Header):
                  </label>
                  <textarea
                    rows={3}
                    value={apiHeaders}
                    onChange={(e) => setApiHeaders(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Tên gợi nhớ & Payload (Option):
                  </label>
                  <input
                    type="text"
                    value={apiTitle}
                    onChange={(e) => setApiTitle(e.target.value)}
                    placeholder="Tên nguồn (VD: Kho Hàng Tân Bình)"
                    className="w-full mb-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                  />
                  {apiMethod === 'POST' && (
                    <input
                      type="text"
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      placeholder='POST Body JSON (VD: {"action":"get_catalog"})'
                      className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <p className="text-[11px] text-slate-400">
                  ⚡ API Endpoint hỗ trợ các chuẩn dữ liệu JSON, RESTful và Plain Text.
                </p>
                <button
                  type="submit"
                  disabled={isFetchingApi || !apiUrl.trim()}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs shrink-0"
                >
                  {isFetchingApi ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Đang gọi API Endpoint...</span>
                    </>
                  ) : (
                    <>
                      <Server className="w-4 h-4" />
                      <span>Kết Nối API & Gọi Dữ Liệu</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

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

      {/* Knowledge Base Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-slate-900 text-base">Cơ Sở Tri Thức Dữ Liệu</h3>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200/60" title="Tự động lưu vào bộ nhớ trình duyệt local storage">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              <span>Đã tự động lưu (Auto-Saved)</span>
            </span>
          </div>
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
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-52 bg-slate-50"
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
