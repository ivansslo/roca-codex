// Client-side persona metadata for the selector UI (presentation only).
// The actual temperature/topP behavior lives in server/orchestrator.ts PERSONAS.

export interface PersonaMeta {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export const PERSONAS: PersonaMeta[] = [
  { id: 'balanced', label: 'Seimbang', icon: '⚖️', description: 'Jelas, akurat, to-the-point.' },
  { id: 'creative', label: 'Kreatif', icon: '🎨', description: 'Eksploratif & bervariasi.' },
  { id: 'precision', label: 'Presisi', icon: '🎯', description: 'Faktual & ringkas, untuk coding.' },
  { id: 'casual', label: 'Santai', icon: '😎', description: 'Rileks & ramah, gaya ngobrol.' }
];

export const DEFAULT_PERSONA = 'balanced';

export function getPersona(id: string | undefined): PersonaMeta {
  return PERSONAS.find(p => p.id === id) || PERSONAS[0];
}
