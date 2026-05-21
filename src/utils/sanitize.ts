import DOMPurify from 'dompurify';

const sanitizer = DOMPurify;

export const sanitizeHtml = (html: string): string => {
  return sanitizer.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
    FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onkeydown'],
  });
};

export const sanitizeMarkdown = (markdown: string): string => {
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /vbscript:/gi,
    /data:text\/html/i,
  ];
  
  return dangerousPatterns.reduce((result, pattern) => {
    return result.replace(pattern, '');
  }, markdown);
};