import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Columns3, Sparkles, X } from "lucide-react";
import SearchAutocomplete from "./ui/SearchAutocomplete";
import { Table, proportional, pixel } from "@astryxdesign/core/Table";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Link } from "@astryxdesign/core/Link";
import { HStack } from "@astryxdesign/core/HStack";
import { useWorkspace } from "../context/AppContext";
import { Button, Panel } from "./ui";
import { useApiQuery } from "../hooks/useApiQuery";
import { equipmentService, equipmentView, testTypeLabel } from "../services/equipmentService";
import type { Equipment } from "../services/equipmentService";
import type { EquipmentSpec } from "../services/contracts";
import { catalogService } from "../services/catalogService";
import { canAccessMenu } from "../auth/permissions";
import type { SearchView } from "../hooks/useWorkspaceNavigation";
import {
  accessScopeLabels,
  availabilityLabels,
  equipmentTypeLabels,
  valueText,
} from "../domain/constants";
import EquipmentDetailDialog from "./EquipmentDetailDialog";
import { looksLikeSentence } from "../domain/search";
import ApiState from "./ui/ApiState";
import { formatFee } from "../domain/format";

const PAGE_SIZE = 20;
const emptyFilters = {
  testType: "",
  regions: [] as string[],
  institutionId: null as number | null,
  equipmentType: "",
  availability: "",
  externalOnly: false,
  accreditedOnly: false,
  includeMock: true,
  sort: "externalId",
};
type Filters = typeof emptyFilters;

/**
 * 검색창 하나로 두 가지를 처리한다.
 * - 짧은 검색어(장비명·모델·시험항목) → GET /equipment?q=
 * - 숫자·단위가 섞인 문장("15kg, 20~2000Hz 진동시험") → GET /search?q= 로 해석
 */


/** 주요 사양 2개와 이용료 한 줄 */
function SpecLine({ specs, fee }: { specs: EquipmentSpec[]; fee?: string | null }) {
  const top = [...specs].sort((a, b) => (a.sourceType === "REAL" ? -1 : 0) - (b.sourceType === "REAL" ? -1 : 0)).slice(0, 2);
  const specText = top.length ? top.map((spec) => `${spec.label ?? spec.key} ${valueText(spec)}`).join(", ") : "사양 정보 없음";
  return <span className="cell-2line">
    <span className="cell-2line__main" title={specText}>{specText}</span>
    <span className="cell-2line__sub">{formatFee(fee)}</span>
  </span>;
}

/** 목록 응답에 keySpecs·usage가 없을 때(AI 검색 결과, 서버 없이 보기)만 장비 상세를 불러온다. */
function SpecFromDetail({ id }: { id: number }) {
  const { resolveEquipment, user } = useWorkspace();
  const detail = useApiQuery((signal) => resolveEquipment(id, signal), `equipment-detail:${user.id}:${id}`);
  if (detail.loading) return <span className="cell-2line"><span className="cell-2line__sub">불러오는 중…</span></span>;
  return <SpecLine specs={detail.data?.specs ?? []} fee={detail.data?.usage?.feeText ?? detail.data?.feeText} />;
}

function SpecSummary({ item }: { item: Equipment }) {
  return item.keySpecs !== undefined
    ? <SpecLine specs={item.keySpecs} fee={item.usage?.feeText ?? item.feeText} />
    : <SpecFromDetail id={item.id} />;
}

/** 장비 가용 상태 → 상태 점 색 */
const availabilityDot: Record<string, "success" | "warning" | "error" | "accent" | "neutral"> = {
  AVAILABLE: "success", BUSY: "warning", MAINTENANCE: "accent", UNAVAILABLE: "error", UNKNOWN: "neutral",
};

/** 목록 응답에는 accessScope가 없을 수 있다(상세·매칭 응답에만 있음). 있으면 배지로 보여 준다. */
function accessScopeOf(item: Equipment) {
  const raw = item.raw as Equipment["raw"] & { accessScope?: string | null };
  return raw.usage?.accessScope ?? raw.accessScope ?? null;
}

export default function EquipmentSearch({
  setActiveMenu,
  initialSearchTerm = "",
  initialInstitutionId = null,
  initialView = null,
  onViewChange,
}: {
  setActiveMenu: (menu: string) => void;
  initialSearchTerm?: string;
  initialInstitutionId?: number | null;
  initialView?: SearchView | null;
  onViewChange?: (view: SearchView) => void;
}) {
  const { setSelectedEquipment, setDraftRequestId, user, resolveEquipment, comparisonIds, setComparisonIds, openSimulation } = useWorkspace();
  const canSimulate = canAccessMenu(user.role, "simulation");
  const startTerm = initialView?.searchTerm ?? initialSearchTerm;
  // 실제로 검색한 내용. sentence=true면 문장 해석 검색
  const [query, setQuery] = useState({ text: startTerm.trim(), sentence: initialView?.sentence ?? looksLikeSentence(startTerm) });
  const [filters, setFilters] = useState<Filters>(() => ({
    ...emptyFilters,
    institutionId: initialView?.institutionId ?? initialInstitutionId,
    regions: initialView?.regions ?? [],
    testType: initialView?.testType ?? "",
    equipmentType: initialView?.equipmentType ?? "",
    availability: initialView?.availability ?? "",
    externalOnly: initialView?.externalOnly ?? false,
    accreditedOnly: initialView?.accreditedOnly ?? false,
    includeMock: initialView?.includeMock ?? true,
    sort: initialView?.sort ?? "externalId",
  }));
  const [page, setPage] = useState(initialView?.page ?? 0);
  // 자동완성에서 고른 장비는 상세를 바로 연다 (상세 창이 id로 다시 불러온다)
  const [detailEquipment, setDetailEquipment] = useState<Equipment | null>(() =>
    initialView?.equipmentId ? ({ id: initialView.equipmentId, name: initialView.searchTerm } as Equipment) : null);
  const [selecting, setSelecting] = useState<number | null>(null);
  const [selectionError, setSelectionError] = useState(null);
  const selectionRequest = useRef<AbortController | null>(null);
  useEffect(() => () => selectionRequest.current?.abort(), []);
  useEffect(() => {
    onViewChange?.({ searchTerm: query.text, sentence: query.sentence, page, ...filters, equipmentId: detailEquipment?.id });
  }, [query, page, filters, onViewChange, detailEquipment?.id]);

  const types = useApiQuery((signal) => catalogService.testTypes(signal), "test-types");
  const institutions = useApiQuery(
    (signal) => catalogService.institutions(signal) as Promise<{ id: number; name: string; region?: string | null }[]>,
    "institutions",
  );
  const regions = useMemo(
    () => [...new Set((institutions.data ?? []).map((item) => item.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [institutions.data],
  );
  const popularTypes = useMemo(
    () => [...(types.data ?? [])].filter((type) => (type.equipmentCount ?? 0) > 0)
      .sort((a, b) => (b.equipmentCount ?? 0) - (a.equipmentCount ?? 0)).slice(0, 8),
    [types.data],
  );

  const listQuery = useApiQuery(
    async (signal) => {
      if (query.sentence && query.text) {
        // 문장 검색: 서버가 해석해 장비를 돌려주고, 서버가 모르는 필터는 화면에서 거른다.
        const result = await catalogService.search(query.text, signal);
        const items = result.equipment.map(equipmentView).filter((item) =>
          (!filters.regions.length || filters.regions.includes(item.region ?? "")) &&
          (!filters.institutionId || item.institutionId === filters.institutionId) &&
          (!filters.testType || item.testTypes.includes(filters.testType)) &&
          (!filters.equipmentType || item.equipmentType === filters.equipmentType) &&
          (!filters.availability || item.availability === filters.availability) &&
          (filters.includeMock || !item.isMock));
        return { content: items, totalElements: items.length, totalPages: 1, interpreted: result.interpreted };
      }
      return equipmentService.list({ q: query.text || undefined, page, size: PAGE_SIZE, ...filters, region: filters.regions }, signal);
    },
    JSON.stringify([user.id, query, page, filters]),
  );
  const results = listQuery.data?.content ?? [];
  const interpreted = (listQuery.data as { interpreted?: { testTypes?: string[]; conditions?: object[]; regions?: string[] } } | null)?.interpreted;
  const waiting = listQuery.loading;

  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(0);
  };
  const runSearch = (text: string, sentence = looksLikeSentence(text)) => {
    setQuery({ text: text.trim(), sentence: Boolean(text.trim()) && sentence });
    setPage(0);
  };
  const reset = () => {
    setFilters(emptyFilters);
    runSearch("");
  };

  const institutionName = (id: number) => institutions.data?.find((item) => item.id === id)?.name ?? `기관 #${id}`;
  const chips: { label: string; clear: () => void }[] = [
    query.text && { label: `"${query.text}"`, clear: () => runSearch("") },
    filters.testType && { label: testTypeLabel(filters.testType), clear: () => update("testType", "") },
    ...filters.regions.map((region) => ({ label: region, clear: () => update("regions", filters.regions.filter((r) => r !== region)) })),
    filters.institutionId && { label: institutionName(filters.institutionId), clear: () => update("institutionId", null) },
    filters.equipmentType && { label: equipmentTypeLabels[filters.equipmentType], clear: () => update("equipmentType", "") },
    filters.availability && { label: availabilityLabels[filters.availability], clear: () => update("availability", "") },
    filters.externalOnly && { label: "공동활용만", clear: () => update("externalOnly", false) },
    filters.accreditedOnly && { label: "공인시험 가능만", clear: () => update("accreditedOnly", false) },
    !filters.includeMock && { label: "예시 데이터 제외", clear: () => update("includeMock", true) },
  ].filter(Boolean);

  const ownEquipment = (item: Equipment) => user.organization?.id != null && item.institutionId === user.organization.id;
  const canRequest = canAccessMenu(user.role, "request");
  const startRequest = (equipment: Equipment) => {
    setDraftRequestId(null);
    setSelectedEquipment(equipment);
    setActiveMenu("request");
  };
  const requestEquipment = async (item: Equipment) => {
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelecting(item.id);
    setSelectionError(null);
    try {
      const detail = await resolveEquipment(item.id, controller.signal);
      if (!controller.signal.aborted && detail) startRequest(detail);
    } catch (error) {
      if (!controller.signal.aborted) setSelectionError(error);
    } finally {
      if (!controller.signal.aborted) setSelecting(null);
    }
  };
  const toggleCompare = (id: number, checked: boolean) =>
    setComparisonIds((ids) => checked ? [...ids, id] : ids.filter((other) => other !== id));
  const total = waiting || listQuery.error ? null : listQuery.data?.totalElements ?? 0;

  return (
    <div className="content-page page-enter equipment-search-page">
      <div className="search-hero">
        <h1>{canRequest ? "어떤 장비가 필요하세요?" : "장비 조회"}</h1>
        <SearchAutocomplete key={`hero:${query.text}`} variant="hero" initialText={query.text} onPick={(pick) => {
          if (pick.kind === "text") runSearch(pick.text);
          else if (pick.kind === "equipment") { runSearch(pick.name, false); setDetailEquipment({ id: pick.id, name: pick.name } as Equipment); }
          else if (pick.kind === "testType") { runSearch(""); update("testType", pick.code); }
          else { runSearch(""); update("institutionId", pick.id); }
        }} />
        {popularTypes.length > 0 && <div className="search-hero__chips" aria-label="자주 찾는 시험">
          <span>자주 찾는 시험</span>
          {popularTypes.map((type) => <button key={type.code} type="button" aria-pressed={filters.testType === type.code}
            onClick={() => update("testType", filters.testType === type.code ? "" : type.code)}>
            {type.nameKo}<small>{type.equipmentCount}</small>
          </button>)}
        </div>}
      </div>

      <Panel className="search-results">
        <div className="search-filters" aria-label="필터">
          <select aria-label="시험 종류" value={filters.testType} onChange={(event) => update("testType", event.target.value)}>
            <option value="">시험 종류 전체</option>
            {types.data?.map((type) => <option key={type.code} value={type.code}>{type.nameKo}</option>)}
          </select>
          <details className="filter-menu">
            <summary>지역{filters.regions.length ? ` ${filters.regions.length}` : ""} <ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="filter-menu__list">
              {regions.map((region) => <label className="check-row" key={region}>
                <input type="checkbox" checked={filters.regions.includes(region)}
                  onChange={(event) => update("regions", event.target.checked ? [...filters.regions, region] : filters.regions.filter((r) => r !== region))} />
                {region}
              </label>)}
            </div>
          </details>
          <select aria-label="가용 상태" value={filters.availability} onChange={(event) => update("availability", event.target.value)}>
            <option value="">가용 상태 전체</option>
            {Object.entries(availabilityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select aria-label="시험기관" value={filters.institutionId ?? ""} onChange={(event) => update("institutionId", event.target.value ? Number(event.target.value) : null)}>
            <option value="">시험기관 전체</option>
            {institutions.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label="장비 유형" value={filters.equipmentType} onChange={(event) => update("equipmentType", event.target.value)}>
            <option value="">장비 유형 전체</option>
            {Object.entries(equipmentTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label className="check-row"><input type="checkbox" checked={filters.externalOnly} disabled={query.sentence}
            onChange={(event) => update("externalOnly", event.target.checked)} />공동활용만</label>
          <label className="check-row"><input type="checkbox" checked={filters.accreditedOnly} disabled={query.sentence}
            onChange={(event) => update("accreditedOnly", event.target.checked)} />공인시험 가능만</label>
          <label className="check-row"><input type="checkbox" checked={filters.includeMock}
            onChange={(event) => update("includeMock", event.target.checked)} />예시 데이터 포함</label>
        </div>

        <div className="search-summary" aria-live="polite">
          <span>결과 <strong>{total == null ? "—" : total.toLocaleString("ko-KR")}</strong>대</span>
          {chips.map((chip) => <span className="chip" key={chip.label}>{chip.label}
            <button type="button" aria-label={`${chip.label} 지우기`} onClick={chip.clear}><X size={12} /></button>
          </span>)}
          {chips.length > 0 && <button type="button" className="text-link" onClick={reset}>모두 지우기</button>}
          <span className="finder__bar-end">
            {canRequest && <Button variant="secondary" className="button--sm" icon={Columns3} disabled={comparisonIds.length < 2}
              title="목록에서 2~5대를 체크하면 비교할 수 있습니다" onClick={() => setActiveMenu("compare")}>
              비교{comparisonIds.length > 0 && ` ${comparisonIds.length}`}
            </Button>}
            <select aria-label="정렬" value={filters.sort} disabled={query.sentence} onChange={(event) => update("sort", event.target.value)}>
              <option value="externalId">등록번호순</option>
              <option value="infoUpdatedAt,desc">최근 갱신순</option>
            </select>
          </span>
        </div>
        {query.sentence && interpreted && <p className="search-interpreted">
          <Sparkles size={13} aria-hidden="true" />
          문장을 이렇게 이해했어요: <strong>{[...(interpreted.testTypes ?? []).map(testTypeLabel),
            ...(interpreted.conditions ?? []).map((condition) => valueText(condition)),
            ...(interpreted.regions ?? [])].join(" · ") || "시험 종류을 찾지 못해 장비명으로 검색"}</strong>
          <button type="button" className="text-link" onClick={() => setQuery({ ...query, sentence: false })}>검색어 그대로 찾기</button>
        </p>}

        {waiting || listQuery.error ? <ApiState loading={waiting} error={listQuery.error} onRetry={listQuery.reload} /> :
          results.length === 0 ? <p className="inline-empty">조건에 맞는 장비가 없습니다.
            {chips.length > 0 && <Button variant="secondary" onClick={reset}>조건 지우기</Button>}</p> :
          <Table<Equipment>
            data={results}
            idKey="id"
            density="compact"
            hasHover
            columns={[
              ...(canRequest ? [{ key: "compare", header: <span className="sr-only">비교</span>, width: pixel(44), renderCell: (item: Equipment) => {
                const checked = comparisonIds.includes(item.id);
                return <CheckboxInput label={`${item.name} 비교에 담기`} isLabelHidden value={checked}
                  isDisabled={!checked && comparisonIds.length >= 5} onChange={(next) => toggleCompare(item.id, next)} />;
              } }] : []),
              // 모든 줄을 같은 높이(두 줄)로: 윗줄 핵심, 아랫줄 보조. 길면 말줄임, 마우스를 올리면 전체가 보인다.
              { key: "name", header: "장비", width: proportional(2.2, { minWidth: 180 }), renderCell: (item) => <span className="cell-2line">
                <span className="cell-2line__main" title={item.name}><Link onClick={() => setDetailEquipment(item)} weight="semibold" color="primary">{item.name}</Link></span>
                <span className="cell-2line__sub" title={item.model ?? undefined}>{item.model || "모델 정보 없음"}</span>
              </span> },
              { key: "institution", header: "시험기관", width: proportional(1.3, { minWidth: 120 }), renderCell: (item) => <span className="cell-2line">
                <span className="cell-2line__main" title={item.institution || undefined}>{item.institution || "정보 없음"}</span>
                <span className="cell-2line__sub">{item.region || "지역 정보 없음"}</span>
              </span> },
              { key: "specs", header: "주요 사양과 이용료", width: proportional(1.9, { minWidth: 160 }), renderCell: (item) => <SpecSummary item={item} /> },
              { key: "testTypes", header: "시험 종류", width: proportional(1, { minWidth: 96 }), renderCell: (item) => <span className="cell-2line">
                {item.testTypes.length ? <>
                  <span className="cell-2line__main" title={item.testTypes.map(testTypeLabel).join(", ")}>{testTypeLabel(item.testTypes[0])}</span>
                  <span className="cell-2line__sub">{item.testTypes.length > 1 ? `외 ${item.testTypes.length - 1}개` : " "}</span>
                </> : <span className="cell-2line__main cell-2line__main--muted">없음</span>}
              </span> },
              { key: "availability", header: "상태", width: proportional(1.1, { minWidth: 110 }), renderCell: (item) => {
                const scope = accessScopeOf(item);
                const label = availabilityLabels[item.availability ?? "UNKNOWN"] ?? String(item.availability);
                const tags = [scope && accessScopeLabels[scope], item.isMock ? "예시" : null].filter(Boolean).join(", ");
                return <span className="cell-2line">
                  <span className="cell-2line__main cell-status">
                    <StatusDot variant={availabilityDot[item.availability ?? "UNKNOWN"] ?? "neutral"} label={label} />{label}
                  </span>
                  <span className="cell-2line__sub" title={tags || undefined}>{tags || " "}</span>
                </span>;
              } },
              { key: "actions", header: <span className="sr-only">동작</span>, width: pixel(canRequest ? 216 : 80), align: "end", renderCell: (item) => <HStack gap={1} hAlign="end">
                {canSimulate && item.availability !== "AVAILABLE" && <Button variant="ghost" className="button--sm"
                  title="예약이 차 있어도 결과를 미리 가늠해 볼 수 있습니다" onClick={() => openSimulation(item.id)}>가상 시험</Button>}
                {canRequest ? <Button variant="secondary" className="button--sm"
                  disabled={selecting !== null || ownEquipment(item)}
                  title={ownEquipment(item) ? "우리 기관 장비에는 의뢰할 수 없습니다" : undefined}
                  onClick={() => requestEquipment(item)}>
                  {selecting === item.id ? "확인 중…" : "이 장비로 맡기기"}
                </Button> : <Button variant="ghost" className="button--sm" onClick={() => setDetailEquipment(item)}>상세</Button>}
              </HStack> },
            ]}
          />}
        {!query.sentence && !waiting && !listQuery.error && (listQuery.data?.totalPages ?? 0) > 1 && <div className="search-pager">
          <Button variant="secondary" className="button--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전</Button>
          <span>{page + 1} / {listQuery.data.totalPages}</span>
          <Button variant="secondary" className="button--sm" disabled={page + 1 >= listQuery.data.totalPages} onClick={() => setPage((p) => p + 1)}>다음</Button>
        </div>}
        {selectionError && <ApiState error={selectionError} />}
        {(types.error || institutions.error) && <ApiState error={types.error ?? institutions.error}
          onRetry={() => { types.reload(); institutions.reload(); }} />}
      </Panel>
      <EquipmentDetailDialog item={detailEquipment} onClose={() => setDetailEquipment(null)} onSelect={startRequest} />
    </div>
  );
}
