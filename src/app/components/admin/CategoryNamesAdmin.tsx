/**
 * CategoryNamesAdmin — edit the English + French display names of the
 * tea categories. Writes /categories/{id} ({ name, nameFr }); the
 * autoTranslateCategory trigger fills nameFr when it's left blank.
 */
import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useCategoriesRealtime, type TeaCategory } from '@/hooks/useCategoriesRealtime';
import { Button } from '@/app/components/ui/button';

function Row({ cat }: { cat: TeaCategory }) {
  const [name, setName] = useState(cat.label);
  const [nameFr, setNameFr] = useState(cat.labelFr ?? '');
  const [saving, setSaving] = useState(false);

  // Pick up live changes (e.g. the auto-translation landing) when the
  // row has no unsaved edits.
  const dirty = name.trim() !== cat.label || nameFr.trim() !== (cat.labelFr ?? '');
  useEffect(() => {
    if (!saving) { setName(cat.label); setNameFr(cat.labelFr ?? ''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat.label, cat.labelFr]);

  const save = async () => {
    if (!name.trim()) { toast.error('English name is required'); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'categories', cat.id), {
        id: cat.id, name: name.trim(), nameFr: nameFr.trim(), updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(nameFr.trim() ? 'Category saved' : 'Category saved — French name is being translated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cna-row">
      <span className="cna-id">{cat.id}</span>
      <input className="field" value={name} maxLength={100} aria-label={`${cat.id} name (English)`}
        onChange={(e) => setName(e.target.value)} />
      <input className="field" value={nameFr} maxLength={100} aria-label={`${cat.id} name (French)`}
        placeholder="Auto-translated if blank" onChange={(e) => setNameFr(e.target.value)} />
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty || saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
      </Button>
    </div>
  );
}

export function CategoryNamesAdmin() {
  const categories = useCategoriesRealtime();
  return (
    <div className="cna-root">
      <div className="cna-row cna-head" aria-hidden="true">
        <span>ID</span><span>English</span><span>French</span><span />
      </div>
      {categories.map((c) => <Row key={c.id} cat={c} />)}
    </div>
  );
}
