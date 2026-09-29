import type { Persona } from '../types';

const normalizePersonaKey = (value?: string | number | null) =>
  String(value ?? '').toLowerCase().replace(/[\s_\-./]+/g, '');

const HIDDEN_COUNSELOR_PERSONA_KEYS = new Set([
  '할머니',
  '할머님',
  'grandma',
  'grandmother',
  '로또번호추첨기',
  'lotto로또번호추첨기',
  'lotto',
  'lottonumbergenerator',
  '운세술사',
  'fortuneteller',
  'unse술사',
  '나노바나나',
  'nanobanana',
  '가차트론',
  'gachatron',
  '럭키세븐',
  'luckyseven',
  '파치',
  'pachi',
  'patchi',
  '할아버지',
  '할아버님',
  'grandpa',
  'grandfather',
]);

export const isHiddenCounselorPersona = (
  persona: Pick<Persona, 'id' | 'name' | 'icon'>
) => {
  const keys = [
    persona.id,
    persona.name,
    persona.icon,
    persona.icon?.replace(/\.[^.]+$/, ''),
  ].map(normalizePersonaKey);

  return keys.some(key => HIDDEN_COUNSELOR_PERSONA_KEYS.has(key));
};

export const sortPersonasForDisplay = (items: Persona[]) =>
  [...items].sort((a, b) => {
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;
    if (a.isRecommended && !b.isRecommended) return -1;
    if (!a.isRecommended && b.isRecommended) return 1;
    return (b.priority || 0) - (a.priority || 0);
  });

export const getVisibleCounselorPersonas = (items: Persona[]) =>
  items.filter(persona => !isHiddenCounselorPersona(persona));
