import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';
import { useToast } from './Toast';

interface Props {
  text: string;
  size?: 'sm' | 'md';
}

export default function CopyButton({ text, size = 'sm' }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      toast('已复制到剪贴板', 'success');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast('复制失败，请手动选择复制', 'error');
    }
  }, [text, toast]);

  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-white/5 rounded transition-colors shrink-0"
    >
      {copied ? (
        <Check className={`${iconSize} text-green-400`} />
      ) : (
        <Copy className={`${iconSize} text-slate-500`} />
      )}
    </button>
  );
}
