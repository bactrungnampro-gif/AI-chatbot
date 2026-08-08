import React, { useState } from 'react';
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
  HelpCircle,
  Globe,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { KnowledgeSource, ProductItem } from '../types';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sync State
  const [syncingWebId, setSyncingWebId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const websiteSources = knowledgeSources.filter(
    (k) => k.type === 'website' || k.url
  );

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
        setSyncMessage(`Đã trích xuất & đồng bộ thành công ${data.products.length} sản phẩm từ "${source.title}"`);
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
    setImageUrl('https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=400&auto=format&fit=crop&q=80');
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
    setKeyFeaturesStr(p.keyFeatures.join(', '));
    setIdealFor(p.idealFor);
    setUsageInstructions(p.usageInstructions);
    setImageUrl(p.imageUrl || '');
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

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Dữ Liệu Sản Phẩm Tư Vấn</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Danh Mục Sản Phẩm & Giải Pháp</h2>
          <p className="text-xs text-slate-500 mt-1">
            Agent AI sử dụng dữ liệu này để gợi ý "Nên dùng sản phẩm nào?" phù hợp với nhu cầu và ngân sách của khách hàng.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {products.some(p => ['prod_1', 'prod_2', 'prod_3'].includes(p.id) || p.name.includes('TechLife')) && (
            <button
              onClick={() => {
                if (window.confirm('Xóa các sản phẩm mẫu ban đầu (TechLife)? Các sản phẩm do bạn thêm/trích xuất vẫn sẽ được giữ nguyên.')) {
                  setProducts(prev => prev.filter(p => !['prod_1', 'prod_2', 'prod_3'].includes(p.id) && !p.name.includes('TechLife')));
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Xóa Sản Phẩm Mẫu (TechLife)</span>
            </button>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm tên, danh mục..."
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-60 bg-slate-50"
            />
          </div>

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
              <span>Tự Động Trích Xuất & Đồng Bộ Danh Mục Từ Website ({websiteSources.length} trang đã cào)</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
              Gemini AI Extractor
            </span>
          </div>

          <p className="text-xs text-slate-300">
            Hệ thống tự động đọc toàn bộ bài viết, chính sách và dữ liệu website đã nạp để trích xuất thành sản phẩm chính thức vào danh mục.
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

      {/* Product List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {filtered.map((prod) => (
          <div
            key={prod.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex gap-4">
                {prod.imageUrl && (
                  <img
                    src={prod.imageUrl}
                    alt={prod.name}
                    className="w-24 h-24 rounded-xl object-cover border border-slate-100 shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                        {prod.category}
                      </span>
                      {prod.sourceUrl && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-medium flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" />
                          <span>Từ Website</span>
                        </span>
                      )}
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
                </div>
              </div>

              <p className="text-xs text-slate-600 mt-3 line-clamp-2 leading-relaxed">
                {prod.description}
              </p>

              {/* Target audience & usage */}
              <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5 text-xs">
                <div>
                  <span className="font-bold text-slate-700">Dành cho ai (Ideal For): </span>
                  <span className="text-slate-600">{prod.idealFor}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">Đặc điểm nổi bật: </span>
                  <span className="text-slate-600">{prod.keyFeatures.join(' • ')}</span>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">ID: {prod.id}</span>
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
        ))}
      </div>

      {/* Add/Edit Modal */}
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
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Danh mục</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Giá gốc (Tuỳ chọn)</label>
                  <input
                    type="number"
                    value={originalPrice || ''}
                    onChange={(e) => setOriginalPrice(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mô tả tóm tắt</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                  placeholder="Lực hút 6000Pa, Tự giặt giẻ lau, Pin 5200mAh"
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                  placeholder="Căn hộ rộng trên 100m2, nhà nuôi mèo chó..."
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Hướng dẫn sử dụng ngắn gọn</label>
                <textarea
                  value={usageInstructions}
                  onChange={(e) => setUsageInstructions(e.target.value)}
                  rows={2}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">URL Hình ảnh</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full p-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="inStockCheck"
                  checked={inStock}
                  onChange={(e) => setInStock(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="inStockCheck" className="font-semibold text-slate-700">
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
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
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
