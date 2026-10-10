import { randomUUID } from 'node:crypto';
import { getPersona } from '../server/personaCatalog.js';
import { generateVertex, personaInstruction, readJson, sendError, validateOrigin, validKoreanText } from '../server/vertex.js';

export const config = { maxDuration: 30 };

export default async function advice(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'POST 요청만 지원합니다.');
  }
  if (!validateOrigin(req, res)) return;
  const body = readJson(req, res);
  if (!body) return;
  const persona = getPersona(body.personaId);
  const situation = typeof body.situation === 'string' ? body.situation.trim() : '';
  if (!persona || !situation || situation.length > 200) return sendError(res, 400, 'INVALID_INPUT', '캐릭터를 선택하고 고민을 1~200자로 적어 주세요.');
  const generated = await generateVertex(req, res, {
    systemInstruction: personaInstruction(persona),
    contents: [{ role: 'user', parts: [{ text: situation }] }],
  });
  if (!generated) return;
  if (!validKoreanText(generated.text)) return sendError(res, 502, 'AI_GENERATION_FAILED', '조언을 완성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return res.status(200).json({
    id: randomUUID(), type: 'quote', source: 'vertex', model: generated.model,
    title: `${persona.name}의 조언`, summary: situation, situation,
    personaName: persona.name, content: generated.text, timestamp: Date.now(),
  });
}
