/**
 * 검색어가 '문장'인지 판단한다. 문장이면 GET /search 로 조건을 해석하고, 아니면 GET /equipment?q= 로 찾는다.
 * - 숫자 + 단위가 있으면 문장 ("15kg", "20~2000Hz", "85℃")
 * - 세 단어 이상이면 문장 ("위성 부품 진동 시험")
 * - "진동시험기1", "EDS5000"처럼 숫자만 섞인 이름은 문장이 아니다.
 */
const unitPattern = /\d+(?:\.\d+)?\s*(?:~\s*\d+(?:\.\d+)?\s*)?(?:kg|g|t|khz|mhz|ghz|hz|℃|°c|도|mm|cm|m|kn|n|%|bar|psi|kv|v|ma|a|kw|w|db|분|시간|일)(?![a-z])/i;

export const looksLikeSentence = (text: string) => {
  const trimmed = text.trim();
  return Boolean(trimmed) && (unitPattern.test(trimmed) || trimmed.split(/\s+/).length >= 3);
};
