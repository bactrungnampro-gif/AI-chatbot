import React, { useState } from 'react';
import { ExternalLink, Image as ImageIcon, Maximize2, X } from 'lucide-react';

interface FormattedMessageProps {
  content: string;
  isAgent?: boolean;
}

// [Security] Chỉ cho phép các scheme an toàn để chống XSS qua javascript:/data: trong Markdown do AI sinh ra.
const isSafeUrl = (url: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  // Cho phép đường dẫn tương đối (không có scheme) và http/https/mailto/tel
  if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return false; // có scheme nhưng không nằm trong allowlist -> chặn
  return true; // không có scheme (đường dẫn tương đối)
};

// [Security] Ảnh chỉ nhận http/https (chặn data:, javascript:).
const isSafeImageUrl = (url: string): boolean => {
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
};

export const FormattedMessage: React.FC<FormattedMessageProps> = ({ content }) => {
  const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string } | null>(null);

  if (!content) return null;

  const renderFormattedText = (rawText: string) => {
    // Regex for image markdown: ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    const formatInline = (str: string) => {
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      const inlineLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      while ((match = inlineLinkRegex.exec(str)) !== null) {
        const [fullMatch, linkText, linkUrl] = match;
        const matchIndex = match.index;

        if (matchIndex > lastIndex) {
          parts.push(str.substring(lastIndex, matchIndex));
        }

        if (isSafeUrl(linkUrl)) {
          parts.push(
            <a
              key={`link_${matchIndex}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 hover:underline bg-blue-50/90 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200/80 my-0.5 transition-colors align-baseline text-xs sm:text-sm shadow-2xs"
            >
              <span>{linkText}</span>
              <ExternalLink className="w-3 h-3 shrink-0 text-blue-500" />
            </a>
          );
        } else {
          // URL không an toàn -> render dưới dạng text thường, không tạo thẻ <a>
          parts.push(<span key={`unsafe_${matchIndex}`}>{linkText}</span>);
        }

        lastIndex = matchIndex + fullMatch.length;
      }

      if (lastIndex < str.length) {
        parts.push(str.substring(lastIndex));
      }

      return parts;
    };

    const blocks: React.ReactNode[] = [];
    let lastIndex = 0;
    let imgMatch: RegExpExecArray | null;

    while ((imgMatch = imageRegex.exec(rawText)) !== null) {
      const [fullMatch, altText, imgUrl] = imgMatch;
      const matchIndex = imgMatch.index;

      if (matchIndex > lastIndex) {
        const prevText = rawText.substring(lastIndex, matchIndex);
        if (prevText.trim()) {
          blocks.push(
            <div key={`txt_${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
              {formatInline(prevText)}
            </div>
          );
        }
      }

      if (!isSafeImageUrl(imgUrl)) {
        // Ảnh có URL không an toàn -> bỏ qua, chỉ hiển thị chú thích (nếu có)
        if (altText && altText.trim()) {
          blocks.push(
            <div key={`imgalt_${matchIndex}`} className="whitespace-pre-wrap leading-relaxed text-slate-500 italic">
              {altText}
            </div>
          );
        }
        lastIndex = matchIndex + fullMatch.length;
        continue;
      }

      blocks.push(
        <div key={`img_${matchIndex}`} className="my-2 space-y-1">
          <div className="relative group overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs max-w-sm">
            <img
              src={imgUrl}
              alt={altText || 'Sản phẩm'}
              className="w-full h-44 sm:h-48 object-cover transition-transform duration-300 group-hover:scale-105 cursor-pointer"
              onClick={() => setSelectedImage({ src: imgUrl, alt: altText })}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <button
              type="button"
              onClick={() => setSelectedImage({ src: imgUrl, alt: altText })}
              className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-xs"
              title="Phóng to hình ảnh"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            {altText && (
              <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">{altText}</span>
              </div>
            )}
          </div>
        </div>
      );

      lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex < rawText.length) {
      const remainingText = rawText.substring(lastIndex);
      if (remainingText.trim()) {
        blocks.push(
          <div key={`txt_${lastIndex}`} className="whitespace-pre-wrap leading-relaxed">
            {formatInline(remainingText)}
          </div>
        );
      }
    }

    return blocks.length > 0 ? blocks : <div className="whitespace-pre-wrap leading-relaxed">{formatInline(rawText)}</div>;
  };

  return (
    <>
      <div className="space-y-1">
        {renderFormattedText(content)}
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-3xl max-h-[90vh] bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3.5 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 truncate">
                <ImageIcon className="w-4 h-4 text-indigo-600" />
                {selectedImage.alt || 'Hình ảnh sản phẩm'}
              </span>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 flex justify-center bg-slate-900">
              <img src={selectedImage.src} alt={selectedImage.alt} className="max-h-[75vh] object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
