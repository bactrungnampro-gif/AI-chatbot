import React, { useState, useEffect, useMemo } from 'react';
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
  File,
  Flame,
  Zap,
  Key
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

  // Firecrawl API Integration State
  const [firecrawlApiKey, setFirecrawlApiKey] = useState<string>(() => localStorage.getItem('firecrawl_api_key') || '');
  const [showFirecrawlKey, setShowFirecrawlKey] = useState<boolean>(false);
  const [isTestingFirecrawl, setIsTestingFirecrawl] = useState<boolean>(false);
  const [firecrawlTestResult, setFirecrawlTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [crawlerEngine, setCrawlerEngine] = useState<'auto' | 'firecrawl' | 'native'>('auto');

  const handleSaveFirecrawlKey = (key: string) => {
    setFirecrawlApiKey(key);
    localStorage.setItem('firecrawl_api_key', key.trim());
  };

  const handleTestFirecrawlKey = async () => {
    if (!firecrawlApiKey.trim()) {
      setFirecrawlTestResult({ success: false, error: 'Vui lòng nhập API Key Firecrawl trước khi kiểm tra.' });
      return;
    }
    setIsTestingFirecrawl(true);
    setFirecrawlTestResult(null);
    try {
      const res = await fetch('/api/firecrawl/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: firecrawlApiKey.trim() }),
      });
      const data = await res.json();
      setFirecrawlTestResult(data);
      if (data.success) {
        localStorage.setItem('firecrawl_api_key', firecrawlApiKey.trim());
      }
    } catch (e: any) {
      setFirecrawlTestResult({ success: false, error: 'Lỗi kiểm tra Key Firecrawl: ' + e.message });
    } finally {
      setIsTestingFirecrawl(false);
    }
  };

  // Google Sheets Integration State
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // Google Drive & OAuth 2.0 Integration State
  const [driveUrl, setDriveUrl] = useState('');
  const [folderUrlInput, setFolderUrlInput] = useState('');
  const [isImportingFolder, setIsImportingFolder] = useState(false);
  const [importingFolderId, setImportingFolderId] = useState<string | null>(null);
  const [isFetchingDrive, setIsFetchingDrive] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ email: string; name: string; picture?: string } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isCheckingGoogleAuth, setIsCheckingGoogleAuth] = useState(false);
  const [driveFiles, setDriveFiles] = useState<Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; size?: string }>>([]);
  const [isLoadingDriveFiles, setIsLoadingDriveFiles] = useState(false);
  const [importingDriveFileId, setImportingDriveFileId] = useState<string | null>(null);

  // Duplicate File Detection & Resolution Modal State
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateFileList, setDuplicateFileList] = useState<string[]>([]);
  const [pendingImportTask, setPendingImportTask] = useState<{
    type: 'file_upload' | 'drive_file' | 'drive_folder' | 'sheet' | 'drive_url' | 'scrape' | 'manual';
    files?: File[];
    driveFile?: { id: string; name: string; mimeType: string };
    folderParams?: { folderIdUrlParam?: string; folderNameParam?: string };
    sheetData?: { source: KnowledgeSource };
    driveData?: { source: KnowledgeSource };
    scrapeData?: { source: KnowledgeSource };
    manualData?: KnowledgeSource;
    importedFolderSources?: KnowledgeSource[];
  } | null>(null);

  // Helper to check if a title or URL already exists in knowledge sources
  const checkDuplicateTitle = (title: string, url?: string) => {
    const normTitle = title.toLowerCase().trim();
    const normUrl = url ? url.toLowerCase().trim() : '';
    return knowledgeSources.find((s) => {
      const sTitle = s.title.toLowerCase().trim();
      const sUrl = s.url ? s.url.toLowerCase().trim() : '';
      if (normTitle && (sTitle === normTitle || sTitle === `tài liệu: ${normTitle}` || sTitle === `trang web: ${normTitle}`)) return true;
      if (normUrl && sUrl && sUrl === normUrl) return true;
      return false;
    });
  };

  // Helper to save knowledge sources with either overwrite or append
  const saveKnowledgeSources = (sourcesToSave: KnowledgeSource[], mode: 'overwrite' | 'append') => {
    setKnowledgeSources((prev) => {
      if (mode === 'append') {
        return [...sourcesToSave, ...prev];
      }
      let updated = [...prev];
      for (const inc of sourcesToSave) {
        const normTitle = inc.title.toLowerCase().trim();
        const normUrl = inc.url ? inc.url.toLowerCase().trim() : '';
        const matchIndex = updated.findIndex((s) => {
          const sTitle = s.title.toLowerCase().trim();
          const sUrl = s.url ? s.url.toLowerCase().trim() : '';
          return (normTitle && (sTitle === normTitle || sTitle === `tài liệu: ${normTitle}` || sTitle === `trang web: ${normTitle}`)) ||
                 (normUrl && sUrl && sUrl === normUrl);
        });

        if (matchIndex !== -1) {
          updated[matchIndex] = {
            ...inc,
            id: updated[matchIndex].id,
            createdAt: updated[matchIndex].createdAt,
            updatedAt: new Date().toISOString(),
          };
        } else {
          updated = [inc, ...updated];
        }
      }
      return updated;
    });
  };

  const handleConfirmOverwrite = () => {
    if (!pendingImportTask) return;
    setDuplicateModalOpen(false);

    if (pendingImportTask.type === 'file_upload' && pendingImportTask.files) {
      executeFileUpload(pendingImportTask.files, 'overwrite');
    } else if (pendingImportTask.type === 'drive_file' && pendingImportTask.driveFile) {
      executeImportDriveFile(pendingImportTask.driveFile, 'overwrite');
    } else if (pendingImportTask.type === 'drive_folder' && pendingImportTask.importedFolderSources) {
      saveKnowledgeSources(pendingImportTask.importedFolderSources, 'overwrite');
      setScrapeSuccess(`🎉 Đã nạp thành công và ghi đè ${pendingImportTask.importedFolderSources.length} tệp từ Thư mục Google Drive!`);
    } else if (pendingImportTask.type === 'sheet' && pendingImportTask.sheetData) {
      saveKnowledgeSources([pendingImportTask.sheetData.source], 'overwrite');
      setScrapeSuccess(`🎉 Đã cập nhật ghi đè dữ liệu Google Sheet vào Tri thức AI!`);
    } else if (pendingImportTask.type === 'drive_url' && pendingImportTask.driveData) {
      saveKnowledgeSources([pendingImportTask.driveData.source], 'overwrite');
      setScrapeSuccess(`🎉 Đã cập nhật ghi đè tài liệu Google Drive vào Tri thức AI!`);
    } else if (pendingImportTask.type === 'scrape' && pendingImportTask.scrapeData) {
      saveKnowledgeSources([pendingImportTask.scrapeData.source], 'overwrite');
      setScrapeSuccess(`🎉 Đã cập nhật ghi đè nội dung Website vào Tri thức AI!`);
    } else if (pendingImportTask.type === 'manual' && pendingImportTask.manualData) {
      saveKnowledgeSources([pendingImportTask.manualData], 'overwrite');
      setScrapeSuccess(`🎉 Đã cập nhật ghi đè nguồn tri thức thủ công!`);
    }

    setPendingImportTask(null);
  };

  const handleConfirmSkipDuplicates = () => {
    if (!pendingImportTask) return;
    setDuplicateModalOpen(false);

    if (pendingImportTask.type === 'file_upload' && pendingImportTask.files) {
      const nonDuplicates = pendingImportTask.files.filter(f => !checkDuplicateTitle(f.name));
      if (nonDuplicates.length > 0) {
        executeFileUpload(nonDuplicates, 'append');
      } else {
        setScrapeSuccess('ℹ️ Tất cả tệp đã chọn đều bị trùng lặp và đã được bỏ qua.');
      }
    } else if (pendingImportTask.type === 'drive_file' && pendingImportTask.driveFile) {
      setScrapeSuccess(`ℹ️ Tệp "${pendingImportTask.driveFile.name}" bị trùng lặp và đã được bỏ qua.`);
    } else if (pendingImportTask.type === 'drive_folder' && pendingImportTask.importedFolderSources) {
      const nonDuplicates = pendingImportTask.importedFolderSources.filter(s => !checkDuplicateTitle(s.title, s.url));
      if (nonDuplicates.length > 0) {
        saveKnowledgeSources(nonDuplicates, 'append');
        setScrapeSuccess(`🎉 Đã nạp ${nonDuplicates.length} tệp mới (đã bỏ qua các tệp trùng lặp) vào Tri thức AI!`);
      } else {
        setScrapeSuccess('ℹ️ Tất cả các tệp trong thư mục đều bị trùng lặp và đã được bỏ qua.');
      }
    } else if (pendingImportTask.type === 'sheet') {
      setScrapeSuccess('ℹ️ Nguồn Google Sheet bị trùng lặp và đã được bỏ qua.');
    } else if (pendingImportTask.type === 'drive_url') {
      setScrapeSuccess('ℹ️ Nguồn Google Drive bị trùng lặp và đã được bỏ qua.');
    } else if (pendingImportTask.type === 'scrape') {
      setScrapeSuccess('ℹ️ Trang web bị trùng lặp và đã được bỏ qua.');
    } else if (pendingImportTask.type === 'manual') {
      setScrapeSuccess('ℹ️ Tri thức thủ công bị trùng lặp và đã được bỏ qua.');
    }

    setPendingImportTask(null);
  };

  const handleCancelDuplicateModal = () => {
    setDuplicateModalOpen(false);
    setPendingImportTask(null);
  };

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
    if (checkDuplicateTitle(file.name)) {
      setDuplicateFileList([file.name]);
      setPendingImportTask({
        type: 'drive_file',
        driveFile: file
      });
      setDuplicateModalOpen(true);
      return;
    }
    await executeImportDriveFile(file, 'append');
  };

  const executeImportDriveFile = async (file: { id: string; name: string; mimeType: string }, mode: 'overwrite' | 'append') => {
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
        saveKnowledgeSources([newSource], mode);
        const modeLabel = mode === 'overwrite' ? ' (đã cập nhật ghi đè)' : '';
        setScrapeSuccess(`🎉 Đã nạp thành công tệp "${file.name}" (~${data.textLength} ký tự)${modeLabel} từ Google Drive vào Tri thức Agent!`);
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
    setImportingFolderId(folderIdUrlParam || 'manual');
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

        const duplicateTitles = newSources
          .filter((s) => checkDuplicateTitle(s.title, s.url))
          .map((s) => s.title);

        if (duplicateTitles.length > 0) {
          setDuplicateFileList(duplicateTitles);
          setPendingImportTask({
            type: 'drive_folder',
            importedFolderSources: newSources,
          });
          setDuplicateModalOpen(true);
          setFolderUrlInput('');
          return;
        }

        saveKnowledgeSources(newSources, 'append');
        setScrapeSuccess(data.message || `🎉 Đã nạp thành công toàn bộ ${newSources.length} tệp từ Thư mục Google Drive vào Tri thức AI!`);
        setFolderUrlInput('');
      } else {
        setScrapeError(data.error || "Không thể trích xuất tệp từ Thư mục Google Drive.");
      }
    } catch (e: any) {
      setScrapeError("Lỗi khi nạp Thư mục Drive: " + e.message);
    } finally {
      setIsImportingFolder(false);
      setImportingFolderId(null);
    }
  };

  // Custom REST API Integration State
  const [apiUrl, setApiUrl] = useState('');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST'>('GET');
  const [apiHeaders, setApiHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [apiBody, setApiBody] = useState('');
  const [apiTitle, setApiTitle] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem('rest_api_key') || '');
  const [apiSecretInput, setApiSecretInput] = useState(() => localStorage.getItem('rest_api_secret') || '');
  const [isFetchingApi, setIsFetchingApi] = useState(false);

  const handleApiKeyChange = (val: string) => {
    setApiKeyInput(val);
    localStorage.setItem('rest_api_key', val.trim());
  };

  const handleApiSecretChange = (val: string) => {
    setApiSecretInput(val);
    localStorage.setItem('rest_api_secret', val.trim());
  };

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
        // [Fix M7] Chống trùng: nếu trích xuất lại cùng một nguồn, KHÔNG thêm bản sao.
        // Ghép theo khóa (id nếu có, nếu không thì tên đã chuẩn hóa) — bản mới GHI ĐÈ bản cũ.
        setProducts((prev) => {
          const keyOf = (p: any) =>
            String(p?.id || '').trim() ||
            'name:' + String(p?.name || '').trim().toLowerCase();
          const map = new Map<string, any>();
          for (const p of prev) map.set(keyOf(p), p);
          for (const p of data.products) map.set(keyOf(p), p); // bản mới thắng
          return Array.from(map.values());
        });
        const added = data.products.length;
        setExtractedNotice(`🎉 Đã tự động trích xuất ${added} sản phẩm từ "${source.title}" vào Danh mục Sản phẩm!`);
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
          maxPages: maxPages,
          firecrawlApiKey: firecrawlApiKey.trim(),
          engine: crawlerEngine
        }),
      });

      if (data.success && data.content) {
        const engineLabel = data.crawlEngine === 'firecrawl' ? '🔥 FIRECRAWL AI' : '⚡ HYBRID NATIVE';
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

        if (checkDuplicateTitle(newSource.title, newSource.url)) {
          setDuplicateFileList([newSource.title]);
          setPendingImportTask({
            type: 'scrape',
            scrapeData: { source: newSource }
          });
          setDuplicateModalOpen(true);
          setUrlInput('');
          return;
        }

        saveKnowledgeSources([newSource], 'append');
        const modeLabel = (data.crawlMode || scrapeMode).toUpperCase();
        const pagesStr = data.pagesScrapedCount ? `${data.pagesScrapedCount} trang` : '1 trang';
        setScrapeSuccess(`🎉 Đã thu thập thành công ${pagesStr} (~${data.wordCount} từ) bằng Động Cơ [${engineLabel}] (${modeLabel}) từ ${data.url}`);
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

        if (checkDuplicateTitle(data.title, data.url)) {
          setDuplicateFileList([data.title]);
          setPendingImportTask({
            type: 'sheet',
            sheetData: { source: newSource }
          });
          setDuplicateModalOpen(true);
          setSheetUrl('');
          setSheetName('');
          return;
        }

        saveKnowledgeSources([newSource], 'append');
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

        if (checkDuplicateTitle(data.title, data.url)) {
          setDuplicateFileList([data.title]);
          setPendingImportTask({
            type: 'drive_url',
            driveData: { source: newSource }
          });
          setDuplicateModalOpen(true);
          setDriveUrl('');
          return;
        }

        saveKnowledgeSources([newSource], 'append');
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

    // Prepare headers and auto-inject Basic Auth if API Key / Secret exist
    let requestHeaders = apiHeaders;
    if (apiKeyInput.trim() || apiSecretInput.trim()) {
      try {
        const parsed = JSON.parse(apiHeaders || '{}');
        if (!parsed['Authorization'] && !parsed['authorization']) {
          const key = apiKeyInput.trim();
          const secret = apiSecretInput.trim();
          const authVal = 'Basic ' + btoa(`${key}:${secret}`);
          parsed['Authorization'] = authVal;
          requestHeaders = JSON.stringify(parsed, null, 2);
        }
      } catch (err) {
        console.warn("Lỗi parse custom headers JSON:", err);
      }
    }

    try {
      const data = await safeFetchJson('/api/knowledge/fetch-api-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiUrl: apiUrl.trim(),
          method: apiMethod,
          headers: requestHeaders,
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

        saveKnowledgeSources([newSource], 'append');
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
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from(fileList);

    // Check for duplicate files
    const duplicates = files.filter((f: File) => checkDuplicateTitle(f.name));
    if (duplicates.length > 0) {
      setDuplicateFileList(duplicates.map((f: File) => f.name));
      setPendingImportTask({
        type: 'file_upload',
        files
      });
      setDuplicateModalOpen(true);
      event.target.value = '';
      return;
    }

    await executeFileUpload(files, 'append');
    event.target.value = '';
  };

  const executeFileUpload = async (files: File[], mode: 'overwrite' | 'append') => {
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
        saveKnowledgeSources(newSources, mode);
        const modeLabel = mode === 'overwrite' ? ' (đã cập nhật ghi đè)' : '';
        setScrapeSuccess(`🎉 Đã nạp thành công ${successCount}/${files.length} tệp tin${modeLabel} vào Tri thức Agent AI!`);
      } else {
        setScrapeError('Không thể trích xuất nội dung từ các tệp đã chọn.');
      }
    } catch (err: any) {
      setScrapeError('Lỗi tải tệp tin: ' + (err.message || String(err)));
    } finally {
      setIsUploadingFile(false);
      setUploadedFileName(null);
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

    if (checkDuplicateTitle(source.title, source.url)) {
      setDuplicateFileList([source.title]);
      setPendingImportTask({
        type: 'manual',
        manualData: source
      });
      setDuplicateModalOpen(true);
      setShowAddModal(false);
      setNewTitle('');
      setNewContent('');
      setNewUrl('');
      return;
    }

    saveKnowledgeSources([source], 'append');
    setNewTitle('');
    setNewContent('');
    setNewUrl('');
    setShowAddModal(false);
  };

  // Re-sync State
  const [resyncingId, setResyncingId] = useState<string | null>(null);
  const [isResyncingAll, setIsResyncingAll] = useState<boolean>(false);

  // [RAG] Trạng thái chỉ mục + nút lập chỉ mục (nền, resumable)
  const [ragStatus, setRagStatus] = useState<{ ragEnabled: boolean; chunkCount: number | null; hasSupabase?: boolean; hasGeminiKey?: boolean } | null>(null);
  const [isIndexingRag, setIsIndexingRag] = useState<boolean>(false);
  const [ragMessage, setRagMessage] = useState<string | null>(null);

  const fetchRagStatus = async () => {
    try {
      const res = await fetch('/api/rag/status');
      const data = await res.json();
      setRagStatus(data);
      return data;
    } catch { return null; }
  };

  useEffect(() => { fetchRagStatus(); }, []);

  const handleBuildRagIndex = async () => {
    setIsIndexingRag(true);
    setRagMessage('⏳ Đang bắt đầu lập chỉ mục...');
    try {
      const startRes = await fetch('/api/rag/index', { method: 'POST' });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok && startRes.status !== 202) {
        setRagMessage('❌ ' + (startData?.error || `Không thể bắt đầu (HTTP ${startRes.status})`));
        setIsIndexingRag(false);
        return;
      }
      let tries = 0;
      const poll = async (): Promise<void> => {
        tries++;
        const st = await fetchRagStatus();
        if (!st) { if (tries > 400) { setIsIndexingRag(false); return; } setTimeout(poll, 2000); return; }
        const pg = st.progress || {};
        if (st.indexing) {
          setRagMessage(`⏳ Đang lập chỉ mục... mới ${pg.chunks || 0} đoạn · đã có ${pg.already || 0} · bỏ qua ${pg.skipped || 0} · nguồn có nội dung ${pg.activeSources ?? '?'}${pg.noContentSources ? ` · rỗng nội dung ${pg.noContentSources}` : ''}.`);
          if (tries > 400) { setRagMessage('⚠️ Vẫn đang chạy nền — bấm "Lập chỉ mục RAG" lại sau ít phút để xem tiến độ.'); setIsIndexingRag(false); return; }
          setTimeout(poll, 2000); return;
        }
        // Kết thúc một đợt — báo chi tiết để biết chính xác vì sao 0 đoạn (nếu có).
        if (pg.error) {
          setRagMessage('❌ Lỗi khi lập chỉ mục: ' + pg.error);
        } else if ((pg.activeSources ?? 0) === 0) {
          setRagMessage(`⚠️ Không có nguồn nào có nội dung để lập chỉ mục${pg.noContentSources ? ` (${pg.noContentSources} nguồn đang RỖNG nội dung)` : ''}. Hãy kiểm tra/nạp lại nội dung nguồn trước.`);
        } else if ((pg.chunks || 0) === 0 && (pg.skipped || 0) > 0) {
          setRagMessage(`⚠️ Không thêm được đoạn nào — bị bỏ qua ${pg.skipped} đoạn (thường do giới hạn tốc độ/hạn ngạch embedding của Gemini). Chờ vài phút rồi bấm lại.`);
        } else if (pg.complete && (pg.chunks || 0) === 0) {
          setRagMessage(`✅ Đã lập chỉ mục đầy đủ! Tổng ${st.chunkCount ?? '?'} đoạn (không còn đoạn mới).`);
        } else if (pg.complete) {
          setRagMessage(`✅ Hoàn tất! Thêm ${pg.chunks} đoạn, tổng ${st.chunkCount ?? '?'} đoạn.`);
        } else {
          setRagMessage(`✔️ Đã xử lý một đợt: mới ${pg.chunks || 0} đoạn${pg.skipped ? `, bỏ qua ${pg.skipped}` : ''} (tổng ${st.chunkCount ?? '?'}). Kho lớn — bấm "Lập chỉ mục RAG" lại cho tới khi báo "đầy đủ".`);
        }
        setIsIndexingRag(false);
      };
      setTimeout(poll, 1500);
    } catch (e: any) {
      setRagMessage('❌ Lỗi kết nối: ' + (e?.message || String(e)));
      setIsIndexingRag(false);
    }
  };

  // Manual Re-sync single source handler
  const handleResyncSource = async (source: KnowledgeSource) => {
    setResyncingId(source.id);
    try {
      const res = await fetch('/api/knowledge/resync-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: source.id, source })
      });
      const result = await res.json();
      if (result.success && result.data) {
        const updatedData = result.data;
        const nowIso = new Date().toISOString();
        setKnowledgeSources((prev) =>
          prev.map((item) =>
            item.id === source.id
              ? {
                  ...item,
                  content: updatedData.content || item.content,
                  wordCount: updatedData.wordCount || item.wordCount,
                  pagesScrapedCount: updatedData.pagesScrapedCount || item.pagesScrapedCount,
                  subPages: updatedData.subPages || item.subPages,
                  updatedAt: updatedData.updatedAt || nowIso,
                  lastSyncedAt: updatedData.lastSyncedAt || nowIso
                }
              : item
          )
        );
        alert(`✅ Đã cập nhật thành công dữ liệu mới nhất từ nguồn "${source.title}"!`);
      } else {
        alert(`❌ Không thể cập nhật: ${result.error || 'Lỗi không xác định'}`);
      }
    } catch (err: any) {
      alert(`❌ Lỗi kết nối khi cập nhật: ${err?.message || String(err)}`);
    } finally {
      setResyncingId(null);
    }
  };

  // Re-sync all active sources handler
  const handleResyncAll = async () => {
    const activeSources = knowledgeSources.filter(s => s.active);
    if (activeSources.length === 0) {
      alert("Không có nguồn tri thức nào đang bật để làm mới.");
      return;
    }
    setIsResyncingAll(true);
    let successCount = 0;
    const nowIso = new Date().toISOString();
    for (const source of activeSources) {
      try {
        const res = await fetch('/api/knowledge/resync-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: source.id, source })
        });
        const result = await res.json();
        if (result.success && result.data) {
          successCount++;
          const updatedData = result.data;
          setKnowledgeSources((prev) =>
            prev.map((item) =>
              item.id === source.id
                ? {
                    ...item,
                    content: updatedData.content || item.content,
                    wordCount: updatedData.wordCount || item.wordCount,
                    pagesScrapedCount: updatedData.pagesScrapedCount || item.pagesScrapedCount,
                    subPages: updatedData.subPages || item.subPages,
                    updatedAt: updatedData.updatedAt || nowIso,
                    lastSyncedAt: updatedData.lastSyncedAt || nowIso
                  }
                : item
            )
          );
        }
      } catch (err) {}
    }
    setIsResyncingAll(false);
    alert(`✅ Hoàn tất làm mới! Đã cập nhật ${successCount}/${activeSources.length} nguồn tri thức.`);
  };

  // Toggle Auto-sync on a source
  const handleToggleAutoSync = (sourceId: string, enabled: boolean) => {
    setKnowledgeSources((prev) =>
      prev.map((item) =>
        item.id === sourceId
          ? {
              ...item,
              autoSyncEnabled: enabled,
              syncIntervalHours: item.syncIntervalHours || 24
            }
          : item
      )
    );
  };

  // Change Auto-sync interval
  const handleChangeSyncInterval = (sourceId: string, intervalHours: number) => {
    setKnowledgeSources((prev) =>
      prev.map((item) =>
        item.id === sourceId
          ? {
              ...item,
              syncIntervalHours: intervalHours
            }
          : item
      )
    );
  };

  // Toggle active status
  const toggleSourceActive = (id: string) => {
    setKnowledgeSources((prev) =>
      prev.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    );
  };

  // Delete Knowledge item — PHẢI xóa trên máy chủ + Supabase, nếu không redeploy/đồng bộ sẽ khiến mục quay lại.
  const handleDeleteSource = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xoá mục tri thức này?')) return;
    try {
      const res = await fetch('/api/knowledge/delete-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        alert('⚠️ Đã xóa khỏi màn hình nhưng máy chủ báo lỗi — mục có thể quay lại sau khi tải lại trang. Vui lòng thử lại. Chi tiết: ' + (data?.error || `HTTP ${res.status}`));
      }
    } catch (e: any) {
      alert('⚠️ Không kết nối được máy chủ để xóa vĩnh viễn — mục có thể quay lại sau khi tải lại trang. Lỗi: ' + (e?.message || String(e)));
    }
    setKnowledgeSources((prev) => prev.filter((item) => item.id !== id));
  };

  // [Fix M6] Lọc nguồn tri thức: dùng useMemo để CHỈ tính lại khi danh sách hoặc từ khóa đổi
  // (trước đây .filter chạy MỖI lần render, kèm .toLowerCase() toàn bộ nội dung -> chậm khi kho lớn).
  // Khi không tìm kiếm -> trả nguyên danh sách, không quét nội dung. Chuẩn hóa từ khóa 1 lần.
  const filteredSources = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return knowledgeSources;
    return knowledgeSources.filter(
      (source) =>
        (source.title || '').toLowerCase().includes(q) ||
        (source.content || '').toLowerCase().includes(q)
    );
  }, [knowledgeSources, searchTerm]);

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
              onClick={async () => {
                if (!window.confirm('Xóa tất cả các tài liệu mẫu mặc định ban đầu (TechLife)? các tài liệu do bạn nạp vẫn sẽ được giữ nguyên.')) return;
                // Xóa trên máy chủ + Supabase cho từng mục mẫu, nếu không chúng sẽ quay lại sau khi tải lại/redeploy.
                const toDelete = knowledgeSources.filter((item) => ['kb_1', 'kb_2', 'kb_3', 'kb_4'].includes(item.id) || item.title.includes('TechLife'));
                for (const it of toDelete) {
                  try {
                    await fetch('/api/knowledge/delete-source', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: it.id })
                    });
                  } catch { /* bỏ qua, vẫn xóa cục bộ bên dưới */ }
                }
                setKnowledgeSources((prev) => prev.filter((item) => !['kb_1', 'kb_2', 'kb_3', 'kb_4'].includes(item.id) && !item.title.includes('TechLife')));
                if (setProducts) {
                  setProducts((prev) => prev.filter((p) => !['prod_1', 'prod_2', 'prod_3'].includes(p.id) && !p.name.includes('TechLife')));
                }
                setScrapeSuccess('✨ Đã dọn dẹp xong dữ liệu mẫu ban đầu! Hiện tại Agent chỉ sử dụng nguồn dữ liệu mới do bạn cung cấp.');
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
              Hỗ trợ tải lên trực tiếp các tệp <b>.pdf</b>, <b>.docx</b>, <b>.xlsx</b>, <b>.txt</b>, <b>.csv</b>, <b>.md</b> và <b>hình ảnh (.png, .jpg, .webp)</b>. Hệ thống sẽ tự động bóc tách văn bản (kể cả PDF scan và ảnh bằng AI Vision/OCR, bảng Excel giữ nguyên link) và trích xuất sản phẩm vào danh mục tự động.
            </p>

            <div className="bg-slate-800/90 border-2 border-dashed border-amber-500/40 rounded-2xl p-6 sm:p-8 text-center hover:border-amber-400/80 transition-all group relative overflow-hidden">
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.csv,.md,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,.bmp,.heic,.heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/csv,image/*"
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
                    {isUploadingFile ? `Đang xử lý và bóc tách dữ liệu tệp ${uploadedFileName}...` : 'Nhấp hoặc Kéo thả NHIỀU TỆP TIN (PDF, Word, Excel, Ảnh, CSV, TXT) vào đây'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Hỗ trợ chọn hoặc kéo thả <b>nhiều tệp cùng lúc (Multi-file upload)</b>: PDF (.pdf), Word (.docx), Excel (.xlsx), Ảnh (.png, .jpg, .webp), CSV (.csv), Text (.txt, .md).
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
          <div className="max-w-3xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-2 border border-indigo-400/30">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span>Thu Thập Tự Động Từ Website (Website Scraping)</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                  Nạp dữ liệu website cho Trợ lý AI
                </h2>
              </div>

              {/* Engine Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-300 text-xs font-bold">
                <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
                <span>Firecrawl API Key: {firecrawlApiKey ? 'Đã cấu hình' : 'Chưa nhập'}</span>
              </div>
            </div>

            {/* FIRECRAWL API KEY CONFIG CARD */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950/30 p-4 sm:p-5 rounded-2xl border border-orange-500/30 space-y-3.5 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-orange-500/20 border border-orange-500/40 rounded-xl">
                    <Flame className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Firecrawl AI Web Scraper & Crawler API</span>
                      <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-extrabold uppercase border border-orange-500/30">
                        Khuyên Dùng
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      Cào trang web chuyên sâu, vượt anti-bot/Cloudflare, render JavaScript & chuyển đổi thành Markdown chuẩn AI.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" />
                    <input
                      type={showFirecrawlKey ? "text" : "password"}
                      value={firecrawlApiKey}
                      onChange={(e) => handleSaveFirecrawlKey(e.target.value)}
                      placeholder="Dán API Key Firecrawl của bạn (fc-xxxxxxxx...)"
                      className="w-full pl-9 pr-20 py-2.5 rounded-xl bg-slate-950/90 border border-orange-500/40 text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFirecrawlKey(!showFirecrawlKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800/80"
                    >
                      {showFirecrawlKey ? "Ẩn" : "Hiện"}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestFirecrawlKey}
                    disabled={isTestingFirecrawl || !firecrawlApiKey.trim()}
                    className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {isTestingFirecrawl ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang kiểm tra...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Kiểm tra Key</span>
                      </>
                    )}
                  </button>
                </div>

                {firecrawlTestResult && (
                  <div className={`p-3 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                    firecrawlTestResult.success 
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200' 
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  }`}>
                    {firecrawlTestResult.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{firecrawlTestResult.message || firecrawlTestResult.error}</span>
                  </div>
                )}
              </div>

              {/* Engine Mode Selection */}
              <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium">Động cơ thu thập:</span>
                  <select
                    value={crawlerEngine}
                    onChange={(e) => setCrawlerEngine(e.target.value as any)}
                    className="bg-slate-900 border border-orange-500/30 text-orange-200 font-semibold rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                  >
                    <option value="auto">🔥 Tự động (Ưu tiên Firecrawl nếu có Key, tự động Fallback)</option>
                    <option value="firecrawl">🔥 Bắt buộc Firecrawl AI Engine (Markdown & Anti-bot)</option>
                    <option value="native">⚡ Hybrid Native Scraper (Sitemap XML + Sublinks)</option>
                  </select>
                </div>

                <a 
                  href="https://firecrawl.dev" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 hover:underline inline-flex items-center gap-1 text-[11px] font-semibold"
                >
                  <span>Lấy API Key Firecrawl miễn phí</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Nhập đường dẫn trang web. Hệ thống hỗ trợ <b>Firecrawl AI Engine</b> (bóc tách Markdown chuẩn LLM) hoặc <b>Chiến lược Cào Lai (Hybrid Strategy)</b> để quét sitemap XML & sublinks.
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
                                {importingFolderId === f.id ? (
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

            <form onSubmit={handleSyncRestApi} className="space-y-4">
              {/* Dedicated API Key & API Secret Credentials Box */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-purple-300">
                  <span className="flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-purple-400" />
                    Cấu Hình API Key & API Secret (Tự Động Lưu & Duy Trì Hệ Thống)
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    ✓ Tự động lưu
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      API Key (Username / Basic Auth Key):
                    </label>
                    <input
                      type="text"
                      value={apiKeyInput}
                      onChange={(e) => handleApiKeyChange(e.target.value)}
                      placeholder="VD: a3dd677f32f74000b7fef2c53e2aab15"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      API Secret (Password / Basic Auth Secret):
                    </label>
                    <input
                      type="password"
                      value={apiSecretInput}
                      onChange={(e) => handleApiSecretChange(e.target.value)}
                      placeholder="VD: 07d6d46288194c87a9e1e41d09b6a643"
                      className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-snug">
                  💡 Khi điền API Key & Secret ở trên, hệ thống sẽ <b>tự động tạo & đính kèm header Basic Authentication</b> khi gọi API. Mọi thay đổi về Key/Secret sẽ được lưu trữ tự động trên thiết bị của bạn.
                </p>
              </div>

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
                    placeholder="VD: https://amallvn.mysapo.net/admin/orders.json"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs sm:text-sm font-mono"
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
          {ragStatus && (
            <p className="text-[11px] mt-0.5 text-slate-500">
              {ragStatus.ragEnabled
                ? <>RAG: đã lập chỉ mục <b>{ragStatus.chunkCount ?? 0}</b> đoạn.</>
                : <span className="text-amber-600">RAG chưa bật (đặt RAG_ENABLED=true trên máy chủ).</span>}
              {ragMessage && <span className="block mt-0.5 text-indigo-600">{ragMessage}</span>}
            </p>
          )}
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
            onClick={handleResyncAll}
            disabled={isResyncingAll || knowledgeSources.filter(k => k.active).length === 0}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 shrink-0"
            title="Tải lại/làm mới toàn bộ các nguồn tri thức đang bật"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResyncingAll ? 'animate-spin' : ''}`} />
            <span>{isResyncingAll ? 'Đang làm mới tất cả...' : 'Làm mới Tất cả (🔄)'}</span>
          </button>

          <button
            onClick={handleBuildRagIndex}
            disabled={isIndexingRag || (ragStatus ? !ragStatus.ragEnabled : false)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs disabled:opacity-50 shrink-0"
            title="Xây/cập nhật chỉ mục RAG để agent tra cứu ngữ nghĩa. Kho lớn: bấm lại nhiều lần cho tới khi 'Hoàn tất'."
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isIndexingRag ? 'animate-spin' : ''}`} />
            <span>{isIndexingRag ? 'Đang lập chỉ mục...' : `Lập chỉ mục RAG${ragStatus?.chunkCount != null ? ` (${ragStatus.chunkCount})` : ''}`}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs shrink-0"
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

              {/* Action Buttons: Re-crawl / Re-sync & Product Extract */}
              <div className="mt-3.5 space-y-2">
                <button
                  onClick={() => handleResyncSource(source)}
                  disabled={resyncingId === source.id}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${resyncingId === source.id ? 'animate-spin' : ''}`} />
                  <span>{resyncingId === source.id ? 'Đang cào & cập nhật dữ liệu...' : 'Cập nhật / Làm mới (Re-crawl 🔄)'}</span>
                </button>

                {setProducts && (
                  <button
                    onClick={() => handleExtractProducts(source)}
                    disabled={extractingId === source.id}
                    className="w-full py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200/80 text-[11px] font-semibold transition-colors flex items-center justify-center gap-1.5"
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
                )}
              </div>

              {/* Auto-sync Schedule Settings */}
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 font-semibold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!source.autoSyncEnabled}
                      onChange={(e) => handleToggleAutoSync(source.id, e.target.checked)}
                      className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span>Tự động cập nhật định kỳ</span>
                  </label>
                  {source.autoSyncEnabled ? (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Đang bật
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 font-medium text-[10px]">
                      Tắt
                    </span>
                  )}
                </div>

                {source.autoSyncEnabled && (
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 text-[10px]">
                    <span className="text-slate-600 font-medium">Chu kỳ quét lại:</span>
                    <select
                      value={source.syncIntervalHours || 24}
                      onChange={(e) => handleChangeSyncInterval(source.id, parseInt(e.target.value, 10))}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={6}>Mỗi 6 giờ</option>
                      <option value={12}>Mỗi 12 giờ</option>
                      <option value={24}>Hằng ngày (24 giờ)</option>
                      <option value={72}>Mỗi 3 ngày (72 giờ)</option>
                      <option value={168}>Hằng tuần (168 giờ)</option>
                    </select>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-200/40">
                  <span>Lần đồng bộ gần nhất:</span>
                  <span className="font-mono text-slate-600 font-medium">
                    {source.lastSyncedAt
                      ? new Date(source.lastSyncedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
                      : source.updatedAt
                      ? new Date(source.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
                      : 'Chưa có'}
                  </span>
                </div>
              </div>
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
                  className={`px-4 py-2 rounded-xl font-semibold transition-all cursor-pointer ${
                    (newTitle.trim() || newContent.trim() || newUrl.trim())
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                      : 'bg-slate-700 hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  Lưu Tri Thức
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CẢNH BÁO FILE TRÙNG LẶP MODAL */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5 sm:p-6 max-w-lg w-full text-white shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-slate-100">Cảnh Báo Tệp Trùng Lặp</h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                    {duplicateFileList.length} tệp trùng
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Hệ thống phát hiện các tệp tin / tài liệu dưới đây đã có sẵn trong Kho Tri Thức của Agent:
                </p>
              </div>
            </div>

            {/* List of duplicate files */}
            <div className="max-h-40 overflow-y-auto p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              {duplicateFileList.map((fileName, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs text-amber-200 font-mono bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
                  <FileCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">{fileName}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-400">
              Vui lòng chọn cách xử lý: Bạn muốn <b>Ghi đè</b> nội dung mới lên tệp cũ hay <b>Bỏ qua</b> không nạp các tệp bị trùng này?
            </p>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancelDuplicateModal}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
              >
                Huỷ Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSkipDuplicates}
                className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold border border-slate-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                <span>Bỏ Qua File Trùng</span>
              </button>
              <button
                type="button"
                onClick={handleConfirmOverwrite}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Nạp & Ghi Đè</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
