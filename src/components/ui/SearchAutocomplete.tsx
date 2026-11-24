import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { Building2, Clock, FlaskConical, Microscope, Search, Sparkles, X } from "lucide-react";
import { useApiQuery } from "../../hooks/useApiQuery";
import { catalogService } from "../../services/catalogService";
import { equipmentService } from "../../services/equipmentService";
import { looksLikeSentence } from "../../domain/search";
import { availabilityLabels } from "../../domain/constants";

export type SearchPick =
  | { kind: "text"; text: string }
  | { kind: "equipment"; id: number; name: string }
  | { kind: "testType"; code: string; name: string }
  | { kind: "institution"; id: number; name: string };

interface Suggestion {
  key: string;
  pick: SearchPick;
  icon: ReactNode;
  label: string;
  detail?: string;
  group: string;
}

const RECENT_KEY = "astra.recent-searches";
const readRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").filter((item: unknown) => typeof item === "string").slice(0, 5); }
  catch { return []; }
};
const saveRecent = (text: string) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([text, ...readRecent().filter((item) => item !== text)].slice(0, 5))); }
  catch { /* 저장소를 못 쓰면 최근 검색만 빠진다 */ }
};


/** 입력 중 단어를 굵게 */
function Highlight({ text, term }: { text: string; term: string }) {
  const index = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>;
}

/**
 * 장비 검색창 + DB 기준 자동완성.
 * - 장비: GET /equipment?q= (입력 후 0.2초 뒤, 6개)
 * - 시험 종류: GET /test-types, 시험기관: GET /institutions (한 번 받아 두고 화면에서 거름)
 * - 비어 있을 때: 최근 검색 + 자주 찾는 시험
 * 목록이 열리면 뒤 화면을 반투명하게 덮어(scrim) 목록에 집중하게 한다.
 */
export default function SearchAutocomplete({ onPick, initialText = "", variant = "header", placeholder, autoFocusKey }: {
  onPick: (pick: SearchPick) => void;
  initialText?: string;
  variant?: "header" | "hero";
  placeholder?: string;
  /** Ctrl+K 같은 단축키로 포커스 (header만) */
  autoFocusKey?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [term, setTerm] = useState(initialText.trim());
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState(readRecent);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    if (!autoFocusKey) return;
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [autoFocusKey]);

  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types", open);
  const institutions = useApiQuery(
    (signal) => catalogService.institutions(signal) as Promise<{ id: number; name: string; region?: string | null; equipmentCount?: number }[]>,
    "institutions", open && term.length > 0,
  );
  const equipment = useApiQuery((signal) => equipmentService.list({ q: term, size: 6, sort: "externalId" }, signal),
    `autocomplete:${term}`, open && term.length > 0);

  const suggestions = useMemo<Suggestion[]>(() => {
    const lower = term.toLowerCase();
    if (!term) return [
      ...recent.map((item) => ({ key: `recent:${item}`, group: "최근 검색", icon: <Clock size={15} />, label: item, pick: { kind: "text", text: item } as SearchPick })),
      ...[...(types.data ?? [])].sort((a, b) => (b.equipmentCount ?? 0) - (a.equipmentCount ?? 0)).slice(0, 6).map((type) => ({
        key: `type:${type.code}`, group: "자주 찾는 시험", icon: <FlaskConical size={15} />, label: type.nameKo,
        detail: `장비 ${type.equipmentCount ?? 0}대`, pick: { kind: "testType", code: type.code, name: type.nameKo } as SearchPick })),
    ];
    const list: Suggestion[] = [];
    if (looksLikeSentence(term))
      list.push({ key: "sentence", group: "문장으로 찾기", icon: <Sparkles size={15} />, label: term, detail: "AI가 조건을 해석해 찾아요",
        pick: { kind: "text", text: term } });
    for (const item of equipment.data?.content ?? [])
      list.push({ key: `eq:${item.id}`, group: "장비", icon: <Microscope size={15} />, label: item.name,
        detail: [item.model, item.institution, availabilityLabels[item.availability ?? "UNKNOWN"]].filter(Boolean).join(" · "),
        pick: { kind: "equipment", id: item.id, name: item.name } });
    for (const type of (types.data ?? []).filter((type) => type.nameKo.toLowerCase().includes(lower) || type.code.toLowerCase().includes(lower)).slice(0, 4))
      list.push({ key: `type:${type.code}`, group: "시험 종류", icon: <FlaskConical size={15} />, label: type.nameKo,
        detail: `장비 ${type.equipmentCount ?? 0}대`, pick: { kind: "testType", code: type.code, name: type.nameKo } });
    for (const org of (institutions.data ?? []).filter((org) => org.name.toLowerCase().includes(lower)).slice(0, 4))
      list.push({ key: `org:${org.id}`, group: "시험기관", icon: <Building2 size={15} />, label: org.name,
        detail: [org.region, org.equipmentCount != null ? `장비 ${org.equipmentCount}대` : null].filter(Boolean).join(" · "),
        pick: { kind: "institution", id: org.id, name: org.name } });
    return list;
  }, [term, recent, types.data, equipment.data, institutions.data]);

  const loading = open && term.length > 0 && (equipment.loading || text.trim() !== term);
  const close = () => { setOpen(false); setActive(-1); };
  const choose = (pick: SearchPick) => {
    const label = pick.kind === "text" ? pick.text : pick.name;
    if (label) { saveRecent(label); setRecent(readRecent()); }
    setText(pick.kind === "text" ? pick.text : pick.kind === "equipment" ? pick.name : "");
    close();
    input.current?.blur();
    onPick(pick);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (active >= 0 && suggestions[active]) return choose(suggestions[active].pick);
    choose({ kind: "text", text: text.trim() });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, suggestions.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, -1)); }
    else if (event.key === "Escape") { close(); input.current?.blur(); }
  };
  const groups = [...new Set(suggestions.map((item) => item.group))];
  const showList = open && (suggestions.length > 0 || loading || term.length > 0);

  return <>
    {showList && <div className="search-scrim" aria-hidden="true" onMouseDown={close} />}
    <form className={`ac ac--${variant} ${showList ? "ac--open" : ""}`} role="search" onSubmit={submit}>
      <div className="ac__box">
        <Search size={variant === "hero" ? 22 : 17} aria-hidden="true" />
        <input ref={input} type="text" enterKeyHint="search" autoComplete="off" value={text}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} aria-label="장비 검색"
          placeholder={placeholder ?? "장비명·시험항목·기관 또는 '15kg 진동시험'처럼 문장으로 검색"}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1); }} />
        {text && <button type="button" className="ac__clear" aria-label="검색어 지우기"
          onMouseDown={(event) => event.preventDefault()} onClick={() => { setText(""); setTerm(""); input.current?.focus(); }}><X size={16} /></button>}
        {variant === "hero" ? <button type="submit" className="button button--primary ac__submit"><Search size={17} aria-hidden="true" />검색</button>
          : <kbd aria-hidden="true">Ctrl K</kbd>}
      </div>
      {showList && <div className="ac__panel" id={listId} role="listbox" aria-label="검색 추천"
        onMouseDown={(event) => event.preventDefault()}>
        {groups.map((group) => <div className="ac__group" key={group}>
          <p className="ac__group-label">{group}</p>
          {suggestions.map((item, index) => item.group !== group ? null :
            <button type="button" key={item.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}
              className="ac__item" onMouseEnter={() => setActive(index)} onClick={() => choose(item.pick)}>
              <span className="ac__icon">{item.icon}</span>
              <span className="ac__text"><strong><Highlight text={item.label} term={term} /></strong>{item.detail && <small>{item.detail}</small>}</span>
            </button>)}
        </div>)}
        {loading && <p className="ac__hint">찾는 중…</p>}
        {!loading && term && suggestions.length === 0 && <p className="ac__hint">일치하는 장비가 없습니다. Enter로 전체 검색해 보세요.</p>}
        <p className="ac__footer">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
      </div>}
    </form>
  </>;
}
