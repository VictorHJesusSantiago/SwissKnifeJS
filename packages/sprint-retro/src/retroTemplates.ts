export type TemplateId = "start-stop-continue" | "4ls" | "mad-sad-glad";

export interface RetroTemplate {
  id: TemplateId;
  label: string;
  categories: string[];
}

export const RETRO_TEMPLATES: Record<TemplateId, RetroTemplate> = {
  "start-stop-continue": { id: "start-stop-continue", label: "Start / Stop / Continue", categories: ["Start", "Stop", "Continue"] },
  "4ls": { id: "4ls", label: "4Ls", categories: ["Liked", "Learned", "Lacked", "Longed for"] },
  "mad-sad-glad": { id: "mad-sad-glad", label: "Mad / Sad / Glad", categories: ["Mad", "Sad", "Glad"] }
};

export function resolveTemplate(id: string | undefined): RetroTemplate {
  const key = (id ?? "start-stop-continue") as TemplateId;
  const template = RETRO_TEMPLATES[key];
  if (!template) {
    throw new Error(`Template de retro desconhecido: "${id}". Opções: ${Object.keys(RETRO_TEMPLATES).join(", ")}`);
  }
  return template;
}

export interface CategorizedNote {
  category: string;
  text: string;
}

/**
 * Organiza notas fornecidas (mapa categoria -> lista de textos) segundo as categorias do template.
 * A busca de categoria é case-insensitive.
 */
export function categorizeNotes(template: RetroTemplate, notesByCategory: Record<string, string[]>): CategorizedNote[] {
  const lowerCaseMap = new Map<string, string[]>();
  for (const [key, values] of Object.entries(notesByCategory)) lowerCaseMap.set(key.toLowerCase(), values);

  const result: CategorizedNote[] = [];
  for (const category of template.categories) {
    const texts = lowerCaseMap.get(category.toLowerCase()) ?? [];
    for (const text of texts) result.push({ category, text });
  }
  return result;
}
