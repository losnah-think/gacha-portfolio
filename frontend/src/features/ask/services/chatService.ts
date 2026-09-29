import type { ChatMessage, PersonaGroup, Persona } from '../../../shared/types';
import { apiUrl } from '../../../shared/api/client';

const createRequestId = (prefix: string) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export const chatService = {
    // Get personas grouped by category
    async getGroupedPersonas(): Promise<{ groups: PersonaGroup[]; flat: Persona[] }> {
        try {
            const response = await fetch(apiUrl('/chat/personas', { version: 'v3', query: { grouped: true } }));
            const result = await response.json();

            if (result.resultType === 'SUCCESS' && Array.isArray(result.data)) {
                // Check if response is grouped format (has category/label/personas)
                if (result.data.length > 0 && result.data[0].category && result.data[0].personas) {
                    const groups: PersonaGroup[] = result.data.map((g: any) => ({
                        category: g.category,
                        label: g.label,
                        personas: g.personas.map((p: any) => ({
                            ...p,
                            imageUrl: p.icon && p.icon.startsWith('http') ? p.icon : (p.imageUrl || undefined),
                            icon: p.icon && !p.icon.startsWith('http') ? p.icon : undefined,
                        })),
                    }));
                    const flat = groups.flatMap(g => g.personas);
                    return { groups, flat };
                }
                // Fallback: flat array response
                const flat = result.data.map((p: any) => ({
                    ...p,
                    imageUrl: p.icon && p.icon.startsWith('http') ? p.icon : (p.imageUrl || undefined),
                    icon: p.icon && !p.icon.startsWith('http') ? p.icon : undefined,
                }));
                return { groups: [], flat };
            }
            return { groups: [], flat: [] };
        } catch (error) {
            console.error('Failed to fetch grouped personas:', error);
            return { groups: [], flat: [] };
        }
    },

    // Start a new chat session
    async startChat(userKey: string, personaId: string, requestId = createRequestId('chat_start')): Promise<{ chatId: string; message: string; tickets?: number; requestId?: string }> {
        try {
            const response = await fetch(apiUrl('/chat/start', { version: 'v3' }), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userKey, personaId, requestId }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.error?.message || 'Failed to start chat');
            }

            const payload = await response.json();
            if (payload?.resultType === 'FAIL') {
                throw new Error(payload.error?.message || 'Failed to start chat');
            }
            const data = payload?.data || payload?.success || payload;
            return {
                chatId: data.chatId,
                message: data.message || data.greeting || '',
                tickets: data.tickets,
                requestId: data.requestId || requestId,
            };
        } catch (error) {
            console.error('Chat start error:', error);
            throw error;
        }
    },

    // Send a message to an existing chat
    async sendMessage(userKey: string, chatId: string, message: string, requestId = createRequestId('chat_message')): Promise<{ message: string; tickets?: number; requestId?: string; retryable?: boolean }> {
        try {
            const response = await fetch(apiUrl('/chat/message', { version: 'v3' }), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ userKey, chatId, message, requestId }),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => null);
                throw new Error(errorPayload?.error?.message || 'Failed to send message');
            }

            const payload = await response.json();
            if (payload?.resultType === 'FAIL') {
                throw new Error(payload.error?.message || 'Failed to send message');
            }
            const data = payload?.data || payload?.success || payload;
            return {
                message: data.message || data.answer || data.content || '',
                tickets: data.tickets,
                requestId: data.requestId || requestId,
                retryable: data.retryable,
            };
        } catch (error) {
            console.error('Chat message error:', error);
            throw error;
        }
    },

    // Get chat history
    async getChatHistory(userKey: string, chatId: string): Promise<{ messages: ChatMessage[] }> {
        try {
            const response = await fetch(apiUrl(`/chat/${chatId}`, { version: 'v3', query: { userKey } }));

            if (!response.ok) {
                throw new Error('Failed to fetch chat history');
            }

            const payload = await response.json();
            const data = payload?.data || payload?.success || payload;
            return { messages: data.messages || [] };
        } catch (error) {
            console.error('Chat history error:', error);
            throw error;
        }
    },

    // Get suggested questions for a persona
    async getSuggestedQuestions(personaId: string): Promise<string[]> {
        try {
            const response = await fetch(apiUrl('/chat/suggested-questions', { version: 'v3', query: { personaId } }));

            if (!response.ok) {
                // If the API isn't ready or fails, return empty list instead of crashing
                return [];
            }

            const result = await response.json();
            if (Array.isArray(result.data)) return result.data;
            return result.data?.questions || result.questions || [];
        } catch (error) {
            console.error('Failed to fetch suggested questions:', error);
            return [];
        }
    }
};
