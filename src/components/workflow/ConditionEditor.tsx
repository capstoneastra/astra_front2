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
  return (
    <div className="condition-grid">
      {rules.map((rule) => {
        const c = conditions.find((c) => c.key === rule.conditionKey) ?? {
            status: "MISSING",
          },
          id = `${idPrefix}condition-${rule.conditionKey}`;
        const unit = rule.unit ? <span className="condition-row__unit">{rule.unit}</span> : null;
        return (
          <div className={`condition-row ${rule.isRequired && c.status === "MISSING" ? "condition-row--missing" : ""}`} key={rule.conditionKey}>
            <span className="condition-row__label" id={`${id}-label`}>
              {rule.label}
              {rule.isRequired && <b aria-label="필수"> *</b>}
              {rule.comparator === "NONE" && <small> 조직 확인</small>}
            </span>
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
                <input id={id} aria-labelledby={`${id}-label`} type={rule.valueType === "TEXT" ? "text" : "number"} step="any"
                  value={rule.valueType === "TEXT" ? (c.valueText ?? "") : (c.value ?? "")} disabled={disabled}
                  onChange={(e) => update(rule, rule.valueType === "TEXT" ? { valueText: e.target.value } : { value: number(e.target.value) })} />
              )}
              {unit}
            </span>
            <select id={`${id}-status`} aria-label={`${rule.label} 확인 상태`} value={c.status ?? "MISSING"} disabled={disabled}
              onChange={(e) => update(rule, { status: e.target.value })}>
              <option value="MISSING">미입력</option>
              <option value="UNCONFIRMED">미확인</option>
              <option value="CONFIRMED">확인</option>
            </select>
          </div>
        );
      })}
    </div>
  );
}
