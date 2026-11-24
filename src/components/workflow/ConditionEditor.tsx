/**
 * 시험 조건 입력 줄. 값을 넣으면 '확인'으로, 비우면 '미입력'으로 저절로 바뀐다.
 * AI가 채운 값(미확인)만 "맞아요" 버튼으로 확인받는다. 상태를 고르는 칸은 따로 두지 않는다.
 */
export default function ConditionEditor({
  rules,
  conditions,
  onChange,
  disabled = false,
  idPrefix = "",
}) {
  const update = (rule, patch) => {
    const previous = conditions.find((c) => c.key === rule.conditionKey) ?? {
      key: rule.conditionKey,
      label: rule.label,
      unit: rule.unit,
      status: "MISSING",
    };
    const next = { ...previous, ...patch, source: "USER" };
    if (!Object.hasOwn(patch, "status")) {
      const complete =
        rule.valueType === "RANGE"
          ? next.min != null && next.max != null
          : rule.valueType === "TEXT"
            ? Boolean(next.valueText?.trim())
            : next.value != null;
      next.status = complete ? "CONFIRMED" : "MISSING";
    }
    onChange([...conditions.filter((c) => c.key !== rule.conditionKey), next]);
  };
  const number = (value) => (value === "" ? null : Number(value));
  // 필수부터
  const ordered = [...rules].sort((a, b) => Number(b.isRequired) - Number(a.isRequired));
  return (
    <div className="condition-grid">
      {ordered.map((rule) => {
        const c = conditions.find((c) => c.key === rule.conditionKey) ?? {
            status: "MISSING",
          },
          id = `${idPrefix}condition-${rule.conditionKey}`;
        const unit = rule.unit ? <span className="condition-row__unit">{rule.unit}</span> : null;
        const state = c.status === "UNCONFIRMED" ? "is-unconfirmed" : rule.isRequired && c.status === "MISSING" ? "condition-row--missing" : "";
        return (
          <div className={`condition-row ${state}`} key={rule.conditionKey}>
            <label className="condition-row__label" id={`${id}-label`} htmlFor={rule.valueType === "RANGE" ? `${id}-min` : id}>
              {rule.label}
              {rule.isRequired && <b aria-label="필수"> *</b>}
              {rule.comparator === "NONE" && <small>시험기관이 확인</small>}
            </label>
            <span className="condition-row__inputs">
              {rule.valueType === "RANGE" ? (
                <>
                  <input id={`${id}-min`} aria-label={`${rule.label} 최솟값`} type="number" step="any" placeholder="최소"
                    value={c.min ?? ""} disabled={disabled} onChange={(e) => update(rule, { min: number(e.target.value) })} />
                  <span aria-hidden="true">~</span>
                  <input id={`${id}-max`} aria-label={`${rule.label} 최댓값`} type="number" step="any" placeholder="최대"
                    value={c.max ?? ""} disabled={disabled} onChange={(e) => update(rule, { max: number(e.target.value) })} />
                </>
              ) : (
                <input id={id} type={rule.valueType === "TEXT" ? "text" : "number"} step="any"
                  value={rule.valueType === "TEXT" ? (c.valueText ?? "") : (c.value ?? "")} disabled={disabled}
                  onChange={(e) => update(rule, rule.valueType === "TEXT" ? { valueText: e.target.value } : { value: number(e.target.value) })} />
              )}
              {unit}
            </span>
            {c.status === "UNCONFIRMED" && (
              <button type="button" className="condition-row__confirm" disabled={disabled}
                title="AI가 채운 값입니다. 맞으면 눌러 확인해 주세요."
                onClick={() => update(rule, { status: "CONFIRMED" })}>
                AI 추정값 확인
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
