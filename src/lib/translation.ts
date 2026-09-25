/**
 * translation.ts — admin "Translate" buttons. Calls the translateToFrench
 * Cloud Function (Cloud Translation API via the function's service
 * account), so no API key ships in the client bundle.
 *
 * Saving content with the French fields left blank also works: the
 * autoTranslate* Firestore triggers fill them in server-side.
 */
import { httpsCallable } from 'firebase/functions';
import { getFunctionsLazy } from '@/lib/firebase';


export async function translateMultipleToFrench(input: string[]): Promise<string[]> {
  if (!input.length) return [];
  const { functions } = await getFunctionsLazy();
  const fn = httpsCallable<{ texts: string[] }, { translations: string[] }>(functions, 'translateToFrench');
  const out: string[] = [];
  for (let i = 0; i < input.length; i += 50) {
    const { data } = await fn({ texts: input.slice(i, i + 50) });
    out.push(...data.translations);
  }
  return out.length === input.length ? out : input;
}
