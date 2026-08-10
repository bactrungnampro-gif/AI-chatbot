import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Tag, 
  DollarSign, 
  Sparkles, 
  Globe, 
  RefreshCw, 
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  ArrowUpDown,
  Link2,
  Image as ImageIcon
} from 'lucide-react';
import { KnowledgeSource, ProductItem } from '../types';

// [Security] Chỉ cho phép URL http/https khi render link/ảnh sản phẩm (chống XSS javascript:/data:).
const safeHref = (url?: string): string | undefined => {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
};
const safeImg = (url?: string): string | undefined => {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
};

interface ProductCatalogProps {
  products: ProductItem[];
  setProducts: React.Dispatch<React.SetStateAction<ProductItem[]>>;
  knowledgeSources?: KnowledgeSource[];
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  products,
  setProducts,
  knowledgeSources = [],
}) => {
  // View mode: 'table' (default) or 'grid'
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'name_asc'>('newest');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Website Auto-Sync State
  const [syncingWebId, setSyncingWebId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const websiteSources = knowledgeSources.filter(
    (k) => k.type === 'website' || k.url
  );

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const handleSyncFromWebsite = async (source: KnowledgeSource) => {
    setSyncingWebId(source.id);
    setSyncMessage(null);
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
        setSyncMessage(`🎉 Đã trích xuất & đồng bộ thành công ${data.products.length} sản phẩm từ "${source.title}"!`);
      } else {
        alert(data.error || 'Không tìm thấy thông tin sản phẩm trong dữ liệu website này.');
      }
    } catch (err: any) {
      alert('Lỗi kết nối khi đồng bộ: ' + (err.message || String(err)));
    } finally {
      setSyncingWebId(null);
    }
  };

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState<number>(1000000);
  const [originalPrice, setOriginalPrice] = useState<number | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [keyFeaturesStr, setKeyFeaturesStr] = useState('');
  const [idealFor, setIdealFor] = useState('');
  const [usageInstructions, setUsageInstructions] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [inStock, setInStock] = useState(true);

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setCategory('Thiết bị thông minh');
    setPrice(1500000);
    setOriginalPrice(2000000);
    setDescription('');
    setKeyFeaturesStr('Tính năng 1, Tính năng 2, Tính năng 3');
    setIdealFor('Mọi đối tượng khách hàng');
    setUsageInstructions('Bật nguồn và sử dụng theo hướng dẫn');
    setImageUrl('');
    setSourceUrl('');
    setInStock(true);
    setShowModal(true);
  };

  const handleOpenEdit = (p: ProductItem) => {
    setEditingId(p.id);
    setName(p.name);
    setCategory(p.category);
    setPrice(p.price);
    setOriginalPrice(p.originalPrice);
    setDescription(p.description);
    setKeyFeaturesStr(p.keyFeatures ? p.keyFeatures.join(', ') : '');
    setIdealFor(p.idealFor || '');
    setUsageInstructions(p.usageInstructions || '');
    setImageUrl(p.imageUrl || '');
    setSourceUrl(p.sourceUrl || p.productUrl || '');
    setInStock(p.inStock);
    setShowModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const featuresArr = keyFeaturesStr.split(',').map((s) => s.trim()).filter(Boolean);

    if (editingId) {
      setProducts((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
                ...item,
                name,
                category,
                price: Number(price),
                originalPrice: originalPrice ? Number(originalPrice) : undefined,
                description,
                keyFeatures: featuresArr,
                idealFor,
                usageInstructions,
                imageUrl: imageUrl || undefined,
                sourceUrl: sourceUrl.trim() || undefined,
                productUrl: sourceUrl.trim() || undefined,
                inStock,
              }
            : item
        )
      );
    } else {
      const newProduct: ProductItem = {
        id: `prod_${Date.now()}`,
        name,
        category,
        price: Number(price),
        originalPrice: originalPrice ? Number(originalPrice) : undefined,
        description,
        keyFeatures: featuresArr,
        idealFor,
        usageInstructions,
        imageUrl: imageUrl || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        productUrl: sourceUrl.trim() || undefined,
        inStock,
      };
      setProducts((prev) => [newProduct, ...prev]);
    }

    setShowModal(false);
  };

  const handleDeleteProduct = (id: string) => {
    if (window.confirm('Xoá sản phẩm này khỏi danh mục tư vấn?')) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    }
  };

  // Filter & Sort Logic
  const filteredAndSorted = useMemo(() => {
    return products
      .filter((p) => {
        // Search term
        const term = searchTerm.toLowerCase().trim();
        const matchesSearch = !term || 
          p.name.toLowerCase().includes(term) ||
          p.category.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term) ||
          p.id.toLowerCase().includes(term) ||
          (p.sourceUrl && p.sourceUrl.toLowerCase().includes(term)) ||
          (p.productUrl && p.productUrl.toLowerCase().includes(term));

        // Category filter
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;

        // Stock filter
        const matchesStock =
          stockFilter === 'all' ||
          (stockFilter === 'in_stock' && p.inStock) ||
          (stockFilter === 'out_of_stock' && !p.inStock);

        return matchesSearch && matchesCategory && matchesStock;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return a.price - b.price;
        if (sortBy === 'price_desc') return b.price - a.price;
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name, 'vi');
        return 0; // 'newest' keeps array order
      });
  }, [products, searchTerm, selectedCategory, stockFilter, sortBy]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, stockFilter, sortBy, itemsPerPage]);

  // Pagination Calculations
  const totalItems = filteredAndSorted.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  const paginatedProducts = filteredAndSorted.slice(startIndex, endIndex);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header Info & Actions */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Dữ Liệu Sản Phẩm Tư Vấn</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Danh Mục Sản Phẩm ({products.length} sản phẩm)</h2>
          <p className="text-xs text-slate-500 mt-1">
            Agent AI sử dụng danh mục này để tìm sản phẩm, trích xuất link chính thức và tư vấn cho khách hàng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-start lg:justify-end">
          {/* View Mode Switcher */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Dạng Bảng</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Dạng Lưới</span>
            </button>
          </div>

          {products.some(p => ['prod_1', 'prod_2', 'prod_3'].includes(p.id) || p.name.includes('TechLife')) && (
            <button
              onClick={() => {
                if (window.confirm('Xóa các sản phẩm mẫu ban đầu (TechLife)? Các sản phẩm đã trích xuất vẫn giữ nguyên.')) {
                  setProducts(prev => prev.filter(p => !['prod_1', 'prod_2', 'prod_3'].includes(p.id) && !p.name.includes('TechLife')));
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Xóa Mẫu (TechLife)</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm Sản Phẩm Mới</span>
          </button>
        </div>
      </div>

      {/* Website Auto-Sync Banner */}
      {websiteSources.length > 0 && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>Đồng Bộ Danh Mục Từ Website & Sapo ({websiteSources.length} nguồn)</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
              Tự Động Lấy Link & Giá
            </span>
          </div>

          <p className="text-xs text-slate-300">
            Hệ thống tự động đọc toàn bộ bài viết, API Sapo và dữ liệu website đã nạp để trích xuất đầy đủ sản phẩm kèm <b>link chi tiết</b>.
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            {websiteSources.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSyncFromWebsite(ws)}
                disabled={syncingWebId === ws.id}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors"
              >
                {syncingWebId === ws.id ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>Đang trích xuất...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Đồng bộ từ "{ws.title}"</span>
                  </>
                )}
              </button>
            ))}
          </div>

          {syncMessage && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên, danh mục, link, ID..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full bg-slate-50"
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full bg-slate-50"
            >
              <option value="all">Tất cả danh mục ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full bg-slate-50"
            >
              <option value="all">Tất cả trạng thái kho</option>
              <option value="in_stock">🟢 Còn hàng</option>
              <option value="out_of_stock">🔴 Hết hàng</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="relative">
            <ArrowUpDown className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="pl-8 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full bg-slate-50"
            >
              <option value="newest">Mới nhất trước</option>
              <option value="price_asc">Giá: Thấp đến Cao</option>
              <option value="price_desc">Giá: Cao đến Thấp</option>
              <option value="name_asc">Tên: A - Z</option>
            </select>
          </div>

        </div>

        {/* Filter Summary & Page Size Selection */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div>
            Đang hiển thị <b>{filteredAndSorted.length}</b> / tổng số <b>{products.length}</b> sản phẩm
            {searchTerm && <span className="ml-1 text-indigo-600 font-medium">(Kết quả lọc cho: "{searchTerm}")</span>}
          </div>

          <div className="flex items-center gap-2">
            <span>Hiển thị mỗi trang:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-slate-50 font-semibold focus:outline-none"
            >
              <option value={10}>10 sản phẩm</option>
              <option value={25}>25 sản phẩm</option>
              <option value={50}>50 sản phẩm</option>
              <option value={100}>100 sản phẩm</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area: Table View or Grid View */}
      {filteredAndSorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-500 space-y-3">
          <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-700">Không tìm thấy sản phẩm nào phù hợp!</p>
          <p className="text-xs text-slate-400">
            Thử thay đổi từ khóa tìm kiếm hoặc xóa bộ lọc danh mục.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4 min-w-[220px]">Sản Phẩm & Hình Ảnh</th>
                  <th className="py-3.5 px-4 min-w-[130px]">Danh Mục</th>
                  <th className="py-3.5 px-4 min-w-[130px]">Giá Bán</th>
                  <th className="py-3.5 px-4 min-w-[100px] text-center">Trạng Thái</th>
                  <th className="py-3.5 px-4 min-w-[200px]">Mô Tả & Đặc Điểm</th>
                  <th className="py-3.5 px-4 min-w-[130px] text-center">Link Trực Tiếp</th>
                  <th className="py-3.5 px-4 w-20 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedProducts.map((prod, index) => {
                  const productUrl = safeHref(prod.sourceUrl || prod.productUrl);
                  const safeImage = safeImg(prod.imageUrl);
                  const itemIndex = startIndex + index + 1;

                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Index */}
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {itemIndex}
                      </td>

                      {/* Name & Image */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {safeImage ? (
                            <img
                              src={safeImage}
                              alt={prod.name}
                              className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}

                          <div className="min-w-0">
                            {productUrl ? (
                              <a
                                href={productUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5 hover:underline"
                                title="Click để mở trang sản phẩm"
                              >
                                <span>{prod.name}</span>
                                <ExternalLink className="w-3 h-3 text-indigo-500 shrink-0" />
                              </a>
                            ) : (
                              <span className="font-bold text-slate-900">{prod.name}</span>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              ID: {prod.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200/60">
                          {prod.category}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-extrabold text-indigo-600 text-sm">
                          {prod.price.toLocaleString('vi-VN')} VNĐ
                        </div>
                        {prod.originalPrice && (
                          <div className="text-[11px] text-slate-400 line-through mt-0.5">
                            {prod.originalPrice.toLocaleString('vi-VN')} VNĐ
                          </div>
                        )}
                      </td>

                      {/* Stock Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                          prod.inStock
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {prod.inStock ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span>{prod.inStock ? 'Còn hàng' : 'Hết hàng'}</span>
                        </span>
                      </td>

                      {/* Description & Features */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-slate-600 line-clamp-2 text-[11px] leading-relaxed">
                          {prod.description}
                        </p>
                        {prod.keyFeatures && prod.keyFeatures.length > 0 && (
                          <div className="text-[10px] text-slate-500 mt-1 truncate">
                            ✨ {prod.keyFeatures.join(' • ')}
                          </div>
                        )}
                      </td>

                      {/* Product URL Button */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {productUrl ? (
                          <a
                            href={productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-semibold transition-colors"
                          >
                            <Link2 className="w-3 h-3 text-indigo-600" />
                            <span>Mở Link ↗</span>
                          </a>
                        ) : (
                          <span className="text-slate-300 text-[11px] italic">Chưa có link</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(prod)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Chỉnh sửa sản phẩm"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa sản phẩm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {paginatedProducts.map((prod) => {
            const productUrl = safeHref(prod.sourceUrl || prod.productUrl);
            const safeImage = safeImg(prod.imageUrl);

            return (
              <div
                key={prod.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex gap-4">
                    {safeImage ? (
                      <img
                        src={safeImage}
                        alt={prod.name}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        className="w-24 h-24 rounded-xl object-cover border border-slate-100 shrink-0 bg-slate-50"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                        <ImageIcon className="w-8 h-8" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                            {prod.category}
                          </span>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                          prod.inStock ? 'text-emerald-600' : 'text-rose-500'
                        }`}>
                          {prod.inStock ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                          <span>{prod.inStock ? 'Còn hàng' : 'Hết hàng'}</span>
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-900 text-base truncate">{prod.name}</h3>

                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-base font-extrabold text-indigo-600">
                          {prod.price.toLocaleString('vi-VN')} VNĐ
                        </span>
                        {prod.originalPrice && (
                          <span className="text-xs text-slate-400 line-through">
                            {prod.originalPrice.toLocaleString('vi-VN')} VNĐ
                          </span>
                        )}
                      </div>

                      {productUrl && (
                        <div className="mt-2">
                          <a
                            href={productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                          >
                            <Link2 className="w-3 h-3" />
                            <span>Mở link gốc sản phẩm ↗</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                    {prod.description}
                  </p>

                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                    {prod.idealFor && (
                      <div>
                        <span className="font-bold text-slate-700">Dành cho ai: </span>
                        <span className="text-slate-600">{prod.idealFor}</span>
                      </div>
                    )}
                    {prod.keyFeatures && prod.keyFeatures.length > 0 && (
                      <div>
                        <span className="font-bold text-slate-700">Đặc điểm nổi bật: </span>
                        <span className="text-slate-600">{prod.keyFeatures.join(' • ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">ID: {prod.id}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(prod)}
                      className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(prod.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Xoá"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PAGINATION FOOTER */}
      {filteredAndSorted.length > 0 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="text-slate-600 font-medium">
            Hiển thị <b>{startIndex + 1}</b> - <b>{endIndex}</b> trong tổng số <b>{totalItems}</b> sản phẩm
            (Trang <b>{currentPage}</b> / <b>{totalPages}</b>)
          </div>

          <div className="flex items-center gap-1.5">
            {/* First Page */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent text-slate-600 transition-colors"
              title="Trang đầu"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Prev Page */}
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent text-slate-600 transition-colors"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Page Number Buttons */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
              .map((page, idx, array) => {
                const prevPage = array[idx - 1];
                const showEllipsis = prevPage && page - prevPage > 1;

                return (
                  <React.Fragment key={page}>
                    {showEllipsis && <span className="px-1 text-slate-400">...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[32px] h-8 px-2 rounded-xl font-bold transition-all ${
                        currentPage === page
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'border border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      {page}
                    </button>
                  </React.Fragment>
                );
              })}

            {/* Next Page */}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent text-slate-600 transition-colors"
              title="Trang kế"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Last Page */}
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent text-slate-600 transition-colors"
              title="Trang cuối"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 overflow-y-auto max-h-[90vh]">
            <h3 className="text-base font-bold text-slate-900 mb-4">
              {editingId ? 'Chỉnh Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới Vào Tư Vấn'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tên sản phẩm</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Danh mục</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giá bán (VNĐ)</label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-indigo-600"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giá gốc (Tuỳ chọn)</label>
                  <input
                    type="number"
                    value={originalPrice || ''}
                    onChange={(e) => setOriginalPrice(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Link Sản Phẩm */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Link đường dẫn sản phẩm (URL website)</span>
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="VD: https://amallvn.mysapo.net/products/may-mai-san-cong-nghiep"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mô tả tóm tắt</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Đặc điểm nổi bật (Phân cách bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  value={keyFeaturesStr}
                  onChange={(e) => setKeyFeaturesStr(e.target.value)}
                  placeholder="Công suất 3HP, Điện áp 220V, Nhập khẩu Amtek"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Phù hợp nhất cho ai? (Để AI tư vấn khi hỏi)
                </label>
                <input
                  type="text"
                  value={idealFor}
                  onChange={(e) => setIdealFor(e.target.value)}
                  placeholder="Cung cấp bởi Amtek / Mài sàn bê tông xưởng"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">URL Hình ảnh</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://bizweb.dktcdn.net/..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="inStockCheck"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="inStockCheck" className="font-semibold text-slate-700 cursor-pointer">
                  Sản phẩm còn hàng sẵn sàng bán
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all cursor-pointer"
                >
                  Lưu Sản Phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
