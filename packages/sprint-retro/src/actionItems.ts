export interface ActionItem {
  text: string;
  assignee?: string;
  source: string;
}

const MENTION_ASSIGN_PATTERN = /@([\w.\-]+)\s+(?:vai|will|deve|precisa|to)\s+(.+)$/i;
const TODO_PATTERN = /^(?:todo|to-do|action)\s*[:\-]\s*(.+)$/i;
const VERB_PATTERN =
  /^(criar|revisar|implementar|investigar|corrigir|ajustar|adicionar|remover|atualizar|documentar|testar|automatizar|configurar|create|review|implement|investigate|fix|add|remove|update|document|test|automate|configure|follow up|acompanhar)\b/i;

function extractMentionAssignee(text: string): string | undefined {
  const match = text.match(/@([\w.\-]+)/);
  return match?.[1];
}

/**
 * Heurística simples para extrair action items de comentários/notas de retro.
 * Reconhece:
 *  - "@nome vai/will/deve/precisa <ação>"
 *  - Linhas começando com "TODO:", "To-do:" ou "action:"
 *  - Linhas começando com um verbo de ação no imperativo (PT/EN)
 */
export function extractActionItems(notes: string[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const raw of notes) {
    const line = raw.trim();
    if (!line) continue;

    const mention = line.match(MENTION_ASSIGN_PATTERN);
    if (mention) {
      items.push({ text: mention[2]!.trim(), assignee: mention[1], source: line });
      continue;
    }

    const todo = line.match(TODO_PATTERN);
    if (todo) {
      const text = todo[1]!.trim();
      items.push({ text, assignee: extractMentionAssignee(text), source: line });
      continue;
    }

    if (VERB_PATTERN.test(line)) {
      items.push({ text: line, assignee: extractMentionAssignee(line), source: line });
    }
  }
  return items;
}
