// Appels de lecture du Builder. Aucune écriture : le Builder ne touche pas au dépôt du parcours.

export const STALE_SERVER =
  "Le Builder qui tourne est plus ancien que la page : ferme ses onglets (il s'arrête seul au bout de 30 min, ou Ctrl+C s'il a été lancé à la main), puis relance Claude Code.";

const INJOIGNABLE = "Builder injoignable : vérifie qu'il tourne toujours.";

export type ProjectFile = { path: string; content: string; kind: "markdown" | "text" };
export type ProjectDoc = { path: string; size: number; mtime: string };
export type Skill = { path: string; description: string; content: string };

// 404 sur une route attendue : la page est plus récente que le Builder qui tourne.
async function call<T>(url: string, staleOn404 = true): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url);
    if (res.status === 404 && staleOn404) return { ok: false, message: STALE_SERVER };
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, message: data.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, message: INJOIGNABLE };
  }
}

/** Un fichier texte du projet (document, plan), en lecture seule. */
export async function getProjectFile(token: string, path: string): Promise<{ ok: true; file: ProjectFile } | { ok: false; message: string }> {
  const r = await call<ProjectFile>(`/api/file?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`, false);
  return r.ok ? { ok: true, file: r.data } : r;
}

/** Tous les documents Markdown du projet (bouton « Documents »). */
export async function listDocs(token: string): Promise<{ ok: true; docs: ProjectDoc[] } | { ok: false; message: string }> {
  const r = await call<{ docs: ProjectDoc[] }>(`/api/docs?token=${encodeURIComponent(token)}`);
  return r.ok ? { ok: true, docs: r.data.docs ?? [] } : r;
}

/** La fiche d'une étape : le SKILL.md que Claude suivra. */
export async function getSkill(token: string, id: string): Promise<{ ok: true; skill: Skill } | { ok: false; message: string }> {
  const r = await call<Skill>(`/api/skill?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`, false);
  return r.ok ? { ok: true, skill: r.data } : r;
}
