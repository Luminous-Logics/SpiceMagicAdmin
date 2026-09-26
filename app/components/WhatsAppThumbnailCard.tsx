'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface Thumbnail {
  _id: string;
  imageUrl: string;
  publicId: string;
  isActive: boolean;
  uploadedByName?: string;
  createdAt: string;
}

/**
 * Admin card to manage the WhatsApp share thumbnail (Open Graph preview image)
 * for the storefront preorder page. Many can be uploaded; exactly one is active
 * at a time, and the active one is what customers see when the menu is shared.
 */
export default function WhatsAppThumbnailCard() {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchThumbnails = useCallback(async () => {
    try {
      const res = await fetch('/api/share-thumbnail');
      const data = await res.json();
      setThumbnails(Array.isArray(data.thumbnails) ? data.thumbnails : []);
    } catch {
      toast.error('Could not load WhatsApp thumbnails');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchThumbnails(); }, [fetchThumbnails]);

  /**
   * Stop the browser's default "open the dropped file" behaviour across the whole
   * window. Without this, a file released even slightly outside the drop zone makes
   * the browser navigate to the file, unloading the page and aborting an in-flight
   * upload (seen server-side as `ECONNRESET`).
   */
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  /**
   * Step 1 — just *select* the file (validate + local preview). We deliberately do
   * NOT upload here. Uploading on the file-input's change event fires the request
   * at the exact moment the OS file-picker closes and the window refocuses (which
   * triggers a next-auth session refetch); that race tore the in-flight request
   * down as `ECONNRESET`. Decoupling selection from upload — the same pattern the
   * food-item form uses — avoids it entirely.
   */
  const selectFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller');
      return;
    }
    // Create/revoke the object URL here in the event handler — NOT inside a
    // setState updater. Updaters are double-invoked under Strict Mode, which would
    // revoke the very blob URL that gets committed to state and break the preview.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    if (fileRef.current) fileRef.current.value = '';
  };

  const clearSelection = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl('');
  };

  /** Step 2 — explicit upload of the already-selected file. */
  const uploadSelected = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch('/api/share-thumbnail', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Upload failed');
        return;
      }
      toast.success('Thumbnail uploaded and set active');
      clearSelection();
      await fetchThumbnails();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) selectFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) selectFile(file);
  };

  const setActive = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/share-thumbnail/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Could not activate');
        return;
      }
      setThumbnails((prev) => prev.map((t) => ({ ...t, isActive: t._id === id })));
      toast.success('This thumbnail is now active');
    } catch {
      toast.error('Could not activate');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/share-thumbnail/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Delete failed');
        return;
      }
      toast.success('Thumbnail deleted');
      await fetchThumbnails();
    } catch {
      toast.error('Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1.5px solid #dcfce7',
      boxShadow: '0 2px 16px rgba(0,0,0,0.05)', padding: '22px 24px', marginBottom: 26,
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="fab fa-whatsapp" style={{ color: '#25D366', fontSize: 20 }} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#222' }}>WhatsApp Share Thumbnail</h3>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#888' }}>
            The active image is shown as the link preview when the food menu is shared on WhatsApp.
          </p>
        </div>
      </div>

      {/* upload area */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {!selectedFile ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragOver ? '#25D366' : '#d1d5db'}`,
            borderRadius: 12, background: dragOver ? '#f0fdf4' : '#fafafa',
            padding: '22px 18px', textAlign: 'center', cursor: 'pointer',
            margin: '14px 0 6px', transition: 'border-color 0.2s, background 0.2s',
          }}
        >
          <i className="fas fa-cloud-upload-alt" style={{ fontSize: 26, color: '#9ca3af', display: 'block', marginBottom: 8 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>Click or drag an image to choose</span>
        </div>
      ) : (
        /* preview + explicit upload — upload only fires on the button, never on
           file selection, so it can't race the file-picker refocus. */
        <div style={{
          border: '2px solid #dcfce7', borderRadius: 12, background: '#f7fef9',
          padding: 14, margin: '14px 0 6px', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected thumbnail preview"
            style={{ width: 132, aspectRatio: '1200 / 630', objectFit: 'cover', borderRadius: 8, background: '#eee', flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#222', wordBreak: 'break-all' }}>
              {selectedFile.name}
            </p>
            <p style={{ margin: '2px 0 12px', fontSize: 12, color: '#888' }}>
              {(selectedFile.size / 1024).toFixed(0)} KB · ready to upload
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={uploadSelected}
                disabled={uploading}
                style={{
                  background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '9px 18px', fontSize: 13.5, fontWeight: 700,
                  cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.75 : 1,
                }}
              >
                {uploading ? (
                  <><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Uploading…</>
                ) : (
                  <><i className="fas fa-cloud-upload-alt" style={{ marginRight: 8 }} />Upload &amp; set active</>
                )}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={uploading}
                style={{
                  background: '#fff', color: '#666', border: '1.5px solid #ddd', borderRadius: 8,
                  padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 4px', textAlign: 'center' }}>
        <i className="fas fa-circle-info" style={{ marginRight: 5 }} />
        For maximum clarity, upload an image sized <strong>1200 × 630 px</strong> (JPEG/PNG/WebP · max 5 MB).
      </p>

      {/* gallery */}
      {loading ? (
        <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '16px 0' }}>Loading…</p>
      ) : thumbnails.length === 0 ? (
        <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '16px 0' }}>
          No thumbnails yet. Upload one to control how the shared link looks.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginTop: 14 }}>
          {thumbnails.map((t) => (
            <div
              key={t._id}
              style={{
                border: `2px solid ${t.isActive ? '#25D366' : '#eee'}`,
                borderRadius: 12, overflow: 'hidden', position: 'relative',
                boxShadow: t.isActive ? '0 4px 14px rgba(37,211,102,0.22)' : 'none',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.imageUrl}
                alt="WhatsApp thumbnail"
                style={{ width: '100%', aspectRatio: '1200 / 630', objectFit: 'cover', display: 'block', background: '#f6f6f6' }}
              />
              {t.isActive && (
                <span style={{
                  position: 'absolute', top: 8, left: 8, background: '#25D366', color: '#fff',
                  borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
                }}>
                  <i className="fas fa-check" style={{ marginRight: 4 }} />Active
                </span>
              )}
              <div style={{ display: 'flex', gap: 8, padding: 10 }}>
                {t.isActive ? (
                  <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#16a34a', padding: '6px 0' }}>
                    In use
                  </span>
                ) : (
                  <button
                    onClick={() => setActive(t._id)}
                    disabled={busyId === t._id}
                    style={{
                      flex: 1, background: '#fff', color: '#16a34a', border: '1.5px solid #bbf7d0',
                      borderRadius: 8, padding: '6px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Set active
                  </button>
                )}
                <button
                  onClick={() => remove(t._id)}
                  disabled={busyId === t._id}
                  title="Delete"
                  style={{
                    background: '#fff', color: '#E31E24', border: '1.5px solid #fecaca',
                    borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
