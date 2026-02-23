import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Download, Link2, AlertCircle, ArrowRight, Sparkles, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShortenResponse, User } from '../types';
import { addLocalLink } from '../utils/localLinks';

interface ShortenerProps {
  user: User | null;
}

export default function Shortener({ user }: ShortenerProps) {
  const [url, setUrl] = useState('');
  const [customSlug, setCustomSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'>('idle');
  const [slugMessage, setSlugMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const shortDomain = useMemo(
    () => (typeof window !== 'undefined' ? window.location.host : 'localhost:3000'),
    []
  );
  const trimmedSlug = customSlug.trim();
  const canSubmit = !loading && !!url && (!trimmedSlug || slugStatus === 'available');

  useEffect(() => {
    if (!user) return;

    if (!trimmedSlug) {
      setSlugStatus('idle');
      setSlugMessage('');
      return;
    }

    if (!/^[a-z0-9-]{3,64}$/.test(trimmedSlug)) {
      setSlugStatus('invalid');
      setSlugMessage('Use 3-64 chars: lowercase letters, numbers, hyphens');
      return;
    }

    let cancelled = false;
    setSlugStatus('checking');
    setSlugMessage('Checking availability...');

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/links/check-slug?slug=${encodeURIComponent(trimmedSlug)}`);
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setSlugStatus('invalid');
          setSlugMessage(data.error || 'Invalid slug');
          return;
        }

        if (data.available) {
          setSlugStatus('available');
          setSlugMessage('Slug is available');
        } else {
          setSlugStatus('taken');
          setSlugMessage('Slug is already taken');
        }
      } catch {
        if (cancelled) return;
        setSlugStatus('error');
        setSlugMessage('Could not verify slug right now');
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedSlug, user]);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    if (trimmedSlug && slugStatus !== 'available') {
      setError('Choose an available custom slug or leave it empty for auto-generated slug');
      return;
    }
    
    setLoading(true);
    setError('');
    setResult(null);
    const originalUrl = url;

    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longUrl: url, customSlug: customSlug || undefined }),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to shorten URL');
      
      setResult(data);
      if (user?.email) {
        addLocalLink(user.email, { slug: data.slug, long_url: originalUrl, shortUrl: data.shortUrl });
      }
      setUrl('');
      setCustomSlug('');
      setSlugStatus('idle');
      setSlugMessage('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `qr-${result?.slug}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-sm font-medium mb-4"
        >
          <Sparkles className="w-4 h-4" />
          <span>Shorten links, generate QR codes</span>
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight mb-4"
        >
          Make your links <span className="text-indigo-600">shorter</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-slate-600 max-w-xl mx-auto"
        >
          Paste your long URL below and get a clean, trackable short link with an automatic QR code.
        </motion.p>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100"
      >
        <form onSubmit={handleShorten} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Link2 className="h-5 w-5 text-slate-400" />
              </div>
              <input
                type="text"
                required
                placeholder="https://example.com/very-long-url-to-shorten"
                className="block w-full pl-11 pr-4 py-4 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none text-slate-900"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Shorten
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

          {user && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-xl"
            >
              <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                <div className="px-3 py-2 text-sm text-slate-500 bg-slate-100 border-r border-slate-200 whitespace-nowrap">
                  {shortDomain}/
                </div>
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Hash className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="custom-slug (optional)"
                    className="block w-full pl-9 pr-4 py-2 bg-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  />
                </div>
              </div>
              {!!trimmedSlug && (
                <p
                  className={`mt-2 text-xs ${
                    slugStatus === 'available'
                      ? 'text-green-600'
                      : slugStatus === 'checking'
                      ? 'text-slate-500'
                      : 'text-red-600'
                  }`}
                >
                  {slugMessage}
                </p>
              )}
            </motion.div>
          )}
        </form>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg flex items-center gap-2 text-sm"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-8 pt-8 border-t border-slate-100"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Your Short Link</h3>
                  <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-xl border border-slate-200 group">
                    <span className="flex-1 font-mono text-indigo-600 truncate">{result.shortUrl}</span>
                    <button
                      onClick={copyToClipboard}
                      className="p-2 hover:bg-white rounded-lg transition-colors text-slate-400 hover:text-indigo-600"
                      title="Copy to clipboard"
                    >
                      {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={copyToClipboard}
                      className="flex-1 py-3 px-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                      {copied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-center space-y-4">
                  <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-100">
                    <QRCodeSVG 
                      id="qr-code-svg"
                      value={result.shortUrl} 
                      size={160}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <button
                    onClick={downloadQR}
                    className="flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download QR Code
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { title: 'Fast Redirects', desc: 'Global 301 redirects for lightning speed.' },
          { title: 'QR Codes', desc: 'Automatic QR generation for every link.' },
          { title: 'Analytics', desc: 'Track clicks and engagement in real-time.' }
        ].map((feature, i) => (
          <div key={i} className="p-6 rounded-2xl bg-slate-50 border border-slate-100">
            <h4 className="font-bold text-slate-900 mb-2">{feature.title}</h4>
            <p className="text-sm text-slate-600">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
