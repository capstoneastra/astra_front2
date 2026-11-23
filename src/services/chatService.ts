import { getData, mutate } from "./http";
import type { Page, Requirement, RequirementCondition, ResourceId } from "./contracts";

interface ChatSession {
  id: number;
  title: string;
}

interface ChatMessage {
  id: number;
  role: string;
  content: string;
  metadata?: {
    suggestedTestType?: string;
    extractedConditions?: RequirementCondition[];
    missingQuestions?: string[];
    /** 상담 AI가 소개한 그 시험유형의 장비 (최대 5대, 내 조직 제외). 적합 판단은 매칭이 한다 */
    suggestedEquipmentIds?: number[];
  } | null;
}

export interface ChatExchange {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export const chatService = {
  create: (title: string, signal?: AbortSignal) =>
    mutate<ChatSession>("POST", "/chat/sessions", { title }, signal),
  list: (signal?: AbortSignal) => getData<Page<ChatSession>>("/chat/sessions", { size: 100 }, signal),
  messages: (id: ResourceId, signal?: AbortSignal) =>
    getData<Page<ChatMessage>>(`/chat/sessions/${id}/messages`, { size: 100 }, signal),
  send: (id: ResourceId, content: string, signal?: AbortSignal) =>
    mutate<ChatExchange>("POST", `/chat/sessions/${id}/messages`, { content }, signal),
  requirement: (id: ResourceId, signal?: AbortSignal) =>
    mutate<Requirement>("POST", `/chat/sessions/${id}/requirement`, {}, signal),
};
