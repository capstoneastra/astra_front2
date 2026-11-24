import { useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { FlaskConical, Microscope, Search, X } from "lucide-react";
import { Highlight } from "../ui/SearchAutocomplete";
import { testTypeLabel } from "../../services/equipmentService";
import type { Equipment } from "../../services/equipmentService";
import { availabilityLabels } from "../../domain/constants";

interface Option {
  key: string;
  group: string;
  icon: ReactNode;
  label: string;
  detail?: string;
  pick: { kind: "type"; code: string } | { kind: "equipment"; id: number; name: string };
}

/**
 * 가상 시험 장비 고르기: 장비 찾기 검색창과 같은 모양의 자동완성.
 * 장비 이름·시험기관·시험 종류 무엇이든 직접 입력할 수 있고, 시험 종류를 고르면 그 시험의 장비만 보여 준다.
 * 목록에는 가상 시험이 되는 장비만 나온다.
 */
export default function SimulationPicker({ equipment, selectedId, onChoose }: {
  equipment: Equipment[];
  selectedId: number | null;
  onChoose: (id: number) => void;
}) {
  const selected = equipment.find((item) => item.id === selectedId) ?? null;
  const [text, setText] = useState(selected?.name ?? "");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  // 고른 장비 이름이 입력칸에 그대로 있으면 전체 목록을 보여 준다
  const term = text.trim() === selected?.name ? "" : text.trim();

  const options = useMemo<Option[]>(() => {
    const lower = term.toLowerCase();
    const pool = typeFilter ? equipment.filter((item) => item.testTypes.includes(typeFilter)) : equipment;
    const matches = (item: Equipment) => !lower || [item.name, item.model, item.institution, ...item.testTypes.map(testTypeLabel)]
      .some((value) => value?.toLowerCase().includes(lower));
    const list: Option[] = [];
    // 시험 종류: 가상 시험이 되는 장비가 있는 종류만, 장비 수와 함께
    if (!typeFilter) {
      const counts = new Map<string, number>();
      for (const item of equipment) for (const code of item.testTypes) counts.set(code, (counts.get(code) ?? 0) + 1);
      [...counts.entries()]
        .filter(([code]) => !lower || testTypeLabel(code).toLowerCase().includes(lower))
        .sort((a, b) => b[1] - a[1]).slice(0, lower ? 4 : 6)
        .forEach(([code, count]) => list.push({ key: `type:${code}`, group: "시험 종류로 좁히기", icon: <FlaskConical size={15} />,
          label: testTypeLabel(code), detail: `가상 시험 장비 ${count}대`,
          pick: { kind: "type", code } }));
    }
    pool.filter(matches).slice(0, 12).forEach((item) => list.push({
      key: `eq:${item.id}`, group: typeFilter ? `${testTypeLabel(typeFilter)} 장비` : "장비", icon: <Microscope size={15} />,
      label: item.name,
      // 가용 상태는 알 때만 (모르는 장비마다 '정보 없음'이 붙으면 지저분하다)
      detail: [item.institution, item.testTypes.map(testTypeLabel).join(", "),
        item.availability && item.availability !== "UNKNOWN" ? availabilityLabels[item.availability] : null].filter(Boolean).join(" · "),
      pick: { kind: "equipment", id: item.id, name: item.name },
    }));
    return list;
  }, [equipment, term, typeFilter]);

  const choose = (pick: Option["pick"]) => {
    setActive(-1);
    if (pick.kind === "type") { setTypeFilter(pick.code); setText(""); input.current?.focus(); return; }
    onChoose(pick.id); setText(pick.name); setTypeFilter(null); setOpen(false); input.current?.blur();
  };

  const close = () => { setOpen(false); setActive(-1); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Enter: 고른 줄, 없으면 첫 번째 장비
    const target = (active >= 0 ? options[active] : undefined) ?? options.find((item) => item.key.startsWith("eq:"));
    if (target) choose(target.pick);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (event.key === "Escape") { close(); input.current?.blur(); }
    else if (event.key === "Backspace" && !text && typeFilter) setTypeFilter(null);
  };
  const groups = [...new Set(options.map((item) => item.group))];

  return <>
    {open && <div className="search-scrim" aria-hidden="true" onMouseDown={close} />}
    <form className={`ac ac--picker ${open ? "ac--open" : ""}`} role="search" onSubmit={submit}>
      <label htmlFor="simulation-picker" className="ac__label">어떤 장비로 가상 시험을 할까요?</label>
      <div className="ac__box">
        <Search size={18} aria-hidden="true" />
        {typeFilter && <button type="button" className="ac__chip" onClick={() => { setTypeFilter(null); input.current?.focus(); }}
          aria-label={`${testTypeLabel(typeFilter)} 조건 지우기`}>{testTypeLabel(typeFilter)} <X size={12} aria-hidden="true" /></button>}
        <input ref={input} id="simulation-picker" type="text" autoComplete="off" value={text}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={typeFilter ? "장비 이름이나 시험기관" : "장비 이름, 시험기관, 시험 종류 (예: 진동시험)"}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          onChange={(event) => { setText(event.target.value); setOpen(true); setActive(-1); }} />
        {(text || typeFilter) && <button type="button" className="ac__clear" aria-label="입력 지우기"
          onMouseDown={(event) => event.preventDefault()} onClick={() => { setText(""); setTypeFilter(null); input.current?.focus(); }}><X size={16} /></button>}
      </div>
      {open && <div className="ac__panel" id={listId} role="listbox" aria-label="가상 시험 장비 추천" onMouseDown={(event) => event.preventDefault()}>
        {groups.map((group) => <div className="ac__group" key={group}>
          <p className="ac__group-label">{group}</p>
          {options.map((item, index) => item.group !== group ? null :
            <button type="button" key={item.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}
              className="ac__item" onMouseEnter={() => setActive(index)} onClick={() => choose(item.pick)}>
              <span className="ac__icon">{item.icon}</span>
              <span className="ac__text"><strong><Highlight text={item.label} term={term} /></strong>{item.detail && <small>{item.detail}</small>}</span>
            </button>)}
        </div>)}
        {options.length === 0 && <p className="ac__hint">
          {equipment.length ? "맞는 장비가 없어요. 다른 이름이나 시험 종류로 찾아보세요." : "가상 시험이 되는 장비를 불러오는 중이에요."}</p>}
        <p className="ac__footer">↑↓ 이동 · Enter 선택 · Esc 닫기</p>
      </div>}
    </form>
  </>;
}
