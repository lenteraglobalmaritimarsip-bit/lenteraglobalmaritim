import React, { useEffect, useState } from 'react';
import { ImagePlus, Link2, Newspaper, Plus, Save, SquarePen } from 'lucide-react';
import { NewsContentType, NewsItem } from '../../types';
import { dataApi } from '../../lib/dataApi';

const emptyNews = (): NewsItem => ({
  id: '',
  title: '',
  body: '',
  contentType: 'TEXT',
  targetUrl: null,
  imageMime: null,
  imageDataBase64: null,
  startsAt: null,
  endsAt: null,
  isActive: false,
  createdAt: '',
  updatedAt: '',
});

const toDateTimeInput = (value: string | null) => value || '';

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gambar gagal dibaca.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Format gambar tidak valid.'));
        return;
      }
      resolve(result.split(',')[1] || '');
    };
    reader.readAsDataURL(file);
  });
}

interface Props {
  onSaved: () => void;
}

export const AdminNewsView: React.FC<Props> = ({ onSaved }) => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [form, setForm] = useState<NewsItem>(emptyNews);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      setItems(await dataApi.loadNews(true));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'News gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const updateForm = <K extends keyof NewsItem>(key: K, value: NewsItem[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleImage = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Pilih gambar JPEG, PNG, atau WebP.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran gambar maksimal 2 MB.');
      return;
    }
    try {
      updateForm('imageMime', file.type);
      updateForm('imageDataBase64', await readImage(file));
      setError('');
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : 'Gambar gagal dibaca.');
    }
  };

  const edit = (item: NewsItem) => {
    setForm({ ...item });
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await dataApi.saveNews({
        id: form.id,
        title: form.title,
        body: form.body,
        contentType: form.contentType,
        targetUrl: form.contentType === 'LINK' ? form.targetUrl : null,
        imageMime: form.contentType === 'IMAGE' ? form.imageMime : null,
        imageDataBase64: form.contentType === 'IMAGE' ? form.imageDataBase64 : null,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        isActive: form.isActive,
      });
      setNotice('Info News berhasil disimpan.');
      setForm(emptyNews());
      await reload();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'News gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const changeType = (type: NewsContentType) => {
    updateForm('contentType', type);
    if (type !== 'LINK') updateForm('targetUrl', null);
    if (type !== 'IMAGE') {
      updateForm('imageMime', null);
      updateForm('imageDataBase64', null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Newspaper size={21} /></span>
          <div>
            <h1 className="text-xl font-black text-slate-900">Info News</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola informasi yang tampil di halaman login portal.</p>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Judul
            <input required maxLength={160} value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" />
          </label>

          <label className="grid gap-1.5 text-sm font-bold text-slate-700">
            Isi informasi
            <textarea rows={4} value={form.body} onChange={(event) => updateForm('body', event.target.value)} className="resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              Tipe konten
              <select value={form.contentType} onChange={(event) => changeType(event.target.value as NewsContentType)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="TEXT">Teks</option>
                <option value="LINK">Teks dan tautan</option>
                <option value="IMAGE">Gambar</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} className="h-4 w-4 accent-blue-600" />
              Tampilkan di halaman login
            </label>
          </div>

          {form.contentType === 'LINK' && (
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              URL tujuan
              <input type="url" required value={form.targetUrl || ''} onChange={(event) => updateForm('targetUrl', event.target.value)} placeholder="https://..." className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-500" />
            </label>
          )}

          {form.contentType === 'IMAGE' && (
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Gambar (JPEG, PNG, WebP; maks. 2 MB)
              <span className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-600">
                <ImagePlus size={18} />
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleImage(event.target.files?.[0])} className="min-w-0 flex-1 text-xs" />
              </span>
              {form.imageDataBase64 && form.imageMime && <img src={`data:${form.imageMime};base64,${form.imageDataBase64}`} alt="Pratinjau Info News" className="max-h-48 w-fit rounded-lg border border-slate-200 object-contain" />}
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              Tanggal mulai (opsional)
              <input type="datetime-local" value={toDateTimeInput(form.startsAt)} onChange={(event) => updateForm('startsAt', event.target.value || null)} className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="grid gap-1.5 text-sm font-bold text-slate-700">
              Tanggal berakhir (opsional)
              <input type="datetime-local" value={toDateTimeInput(form.endsAt)} onChange={(event) => updateForm('endsAt', event.target.value || null)} className="rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
          </div>

          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <Save size={16} /> {saving ? 'Menyimpan...' : form.id ? 'Simpan perubahan' : 'Tambah Info News'}
            </button>
            {form.id && <button type="button" onClick={() => { setForm(emptyNews()); setError(''); setNotice(''); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Batal edit</button>}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="font-black text-slate-900">Daftar Info News</h2><p className="mt-1 text-xs text-slate-500">{items.length} informasi tersimpan</p></div>
          <button type="button" onClick={() => { setForm(emptyNews()); setError(''); setNotice(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"><Plus size={15} /> Baru</button>
        </div>
        {loading ? <p className="py-6 text-center text-sm text-slate-500">Memuat Info News...</p> : items.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Belum ada Info News.</p> : (
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
                {item.contentType === 'IMAGE' && item.imageMime && item.imageDataBase64
                  ? <img src={`data:${item.imageMime};base64,${item.imageDataBase64}`} alt="" className="h-16 w-24 rounded-md border border-slate-200 object-cover" />
                  : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">{item.contentType === 'LINK' ? <Link2 size={18} /> : <Newspaper size={18} />}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">{item.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.isActive ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.body || item.targetUrl || 'Gambar Info News'}</p>
                  <small className="mt-1 block text-[10px] text-slate-400">{item.contentType}{item.startsAt ? ` · Mulai ${item.startsAt.replace('T', ' ')}` : ''}{item.endsAt ? ` · Berakhir ${item.endsAt.replace('T', ' ')}` : ''}</small>
                </div>
                <button type="button" onClick={() => edit(item)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50"><SquarePen size={14} /> Edit</button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
