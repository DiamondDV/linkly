import React, { useEffect, useState } from 'react';
import { Link as LinkType, User } from '../types';
import { 
  ExternalLink, Copy, Check, BarChart3, Calendar, MousePointer2, 
  Search, Trash2, Edit3, ChevronLeft, ChevronRight, ArrowUpDown, 
  AlertTriangle, X, Save
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { getLocalLinks, removeLocalLink, updateLocalLinkUrl } from '../utils/localLinks';

type SortField = 'clicks' | 'created_at' | 'slug';
type SortOrder = 'asc' | 'desc';

interface DashboardProps {
  user: User;
}

export default function Dashboard({ user }: DashboardProps) {
  const [links, setLinks] = useState<LinkType[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Modals
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editLink, setEditLink] = useState<LinkType | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchLinks();
  }, []);

  const fetchLinks = async () => {
    try {
      const res = await fetch('/api/links');
      const data = await res.json();
      const apiLinks = res.ok ? (data.links || []) : [];
      const localLinks = getLocalLinks(user.email);
      const mergedBySlug = new Map<string, LinkType>();
      [...localLinks, ...apiLinks].forEach((link: LinkType) => {
        mergedBySlug.set(link.slug, link);
      });
      setLinks(Array.from(mergedBySlug.values()));
    } catch (err) {
      console.error('Failed to fetch links');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/links/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setLinks(links.filter(l => l.id !== deleteId));
        setDeleteId(null);
      }
      if (deleteId.startsWith('local-')) {
        removeLocalLink(user.email, deleteId);
        setLinks(links.filter(l => l.id !== deleteId));
        setDeleteId(null);
      }
    } catch (err) {
      console.error('Delete failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editLink) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/links/${editLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longUrl: newUrl }),
      });
      if (res.ok) {
        setLinks(links.map(l => l.id === editLink.id ? { ...l, long_url: newUrl } : l));
        setEditLink(null);
      }
      if (editLink.id.startsWith('local-')) {
        updateLocalLinkUrl(user.email, editLink.id, newUrl);
        setLinks(links.map(l => l.id === editLink.id ? { ...l, long_url: newUrl } : l));
        setEditLink(null);
      }
    } catch (err) {
      console.error('Edit failed');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedLinks = [...links].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    
    if (sortField === 'created_at') {
      valA = new Date(a.created_at).getTime();
      valB = new Date(b.created_at).getTime();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredLinks = sortedLinks.filter(link => 
    link.long_url.toLowerCase().includes(searchTerm.toLowerCase()) ||
    link.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredLinks.length / itemsPerPage);
  const paginatedLinks = filteredLinks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 flex justify-center">
        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your Links</h1>
          <p className="text-slate-500 text-sm">Manage and track your shortened URLs</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search links..."
              className="block w-full sm:w-64 pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {links.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">No links yet</h3>
          <p className="text-slate-500 text-sm mb-6">Start by shortening your first URL on the home page.</p>
          <a href="/" className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
            Create Link
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sorting Controls */}
          <div className="flex items-center gap-4 px-4 py-2 bg-slate-100 rounded-lg text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Sort by:</span>
            <button 
              onClick={() => toggleSort('created_at')}
              className={`flex items-center gap-1 hover:text-indigo-600 transition-colors ${sortField === 'created_at' ? 'text-indigo-600' : ''}`}
            >
              Date <ArrowUpDown className="w-3 h-3" />
            </button>
            <button 
              onClick={() => toggleSort('clicks')}
              className={`flex items-center gap-1 hover:text-indigo-600 transition-colors ${sortField === 'clicks' ? 'text-indigo-600' : ''}`}
            >
              Clicks <ArrowUpDown className="w-3 h-3" />
            </button>
            <button 
              onClick={() => toggleSort('slug')}
              className={`flex items-center gap-1 hover:text-indigo-600 transition-colors ${sortField === 'slug' ? 'text-indigo-600' : ''}`}
            >
              Slug <ArrowUpDown className="w-3 h-3" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {paginatedLinks.map((link, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                key={link.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 hover:shadow-md transition-shadow group"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  <div className="hidden sm:block p-2 bg-slate-50 rounded-lg border border-slate-100 shrink-0">
                    <QRCodeSVG 
                      value={`${window.location.origin}/${link.slug}`} 
                      size={64}
                      level="M"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-indigo-600 truncate">
                        {window.location.host}/{link.slug}
                      </span>
                      <button
                        onClick={() => copyToClipboard(`${window.location.origin}/${link.slug}`, link.id)}
                        className="p-1.5 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors border border-transparent hover:border-indigo-100"
                        title="Copy short link"
                      >
                        {copiedId === link.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a 
                        href={`/${link.slug}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <p className="text-sm text-slate-500 truncate mb-3">
                      {link.long_url}
                    </p>
                    
                    <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <MousePointer2 className="w-3.5 h-3.5" />
                        <span className="text-slate-900">{link.clicks} clicks</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(link.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 lg:border-l lg:border-slate-100 lg:pl-6">
                    <button 
                      onClick={() => {
                        setEditLink(link);
                        setNewUrl(link.long_url);
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      title="Edit original URL"
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setDeleteId(link.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Delete link"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-slate-500">
                Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredLinks.length)}</span> of <span className="font-bold text-slate-900">{filteredLinks.length}</span> links
              </p>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteId(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Link?</h3>
              <p className="text-slate-500 text-sm mb-6">This action cannot be undone. The short URL will stop working immediately.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDelete}
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {actionLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editLink && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditLink(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Edit Original URL</h3>
                <button onClick={() => setEditLink(null)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">Short URL</label>
                  <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-sm font-mono text-slate-500">
                    {window.location.host}/{editLink.slug}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">New Destination URL</label>
                  <input
                    type="text"
                    required
                    className="block w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setEditLink(null)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEdit}
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? 'Saving...' : <><Save className="w-4 h-4" /> Save Changes</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
