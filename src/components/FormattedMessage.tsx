import React, { useState } from 'react';
import { ExternalLink, Image as ImageIcon, Maximize2, X } from 'lucide-react';

interface FormattedMessageProps {
  content: string;
  isAgent?: boolean;
}

// Chỉ cho phép các scheme URL an toàn để tránh XSS (javascript:, data:, vbscript:, ...)
const isSafeUrl = (url: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  // Cho phép link tương đối và neo trong trang
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  try {
    // new URL cần base cho link tương đối; ở đây link đã là tuyệt đối hoặc đã xử lý ở trên
    const parsed = new URL(trimmed, 'https://placeholder.local');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
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

        // Check if URL is a Google Drive or Google Sheet link (blocked as per requirement)
        const isGoogleDriveOrSheet = linkUrl.includes('docs.google.com') || linkUrl.includes('drive.google.com');
        // Chặn các URL không an toàn (javascript:, data:, ...) để tránh XSS
        const safeLink = isSafeUrl(linkUrl);

        if (!isGoogleDriveOrSheet && safeLink) {
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
          parts.push(<span key={`blocked_${matchIndex}`} className="text-slate-500 italic">[{linkText}]</span>);
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

      // Bỏ qua ảnh có URL không an toàn (chống XSS qua data:/javascript:)
      if (!isSafeUrl(imgUrl)) {
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
