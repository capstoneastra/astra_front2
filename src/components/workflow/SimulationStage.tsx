import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Box, RotateCcw, Rotate3d, Play, Pause, Upload, ZoomIn, ZoomOut, Scan } from "lucide-react";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Box3, BufferGeometry, LoadingManager, Vector3 } from "three";
import type { Object3D } from "three";
import { createSimulationScene, disposeObject } from "./simulationScene";
import type { SimulationSceneState } from "./simulationScene";
import type { SimulationInput, SimulationResult } from "../../services/simulationService";
import { simulationFrame, simulationSceneKind } from "../../domain/simulationView";

const sceneInfo = {
  vibration: { title: "진동 시험대", subtitle: "시료와 시험대의 진동을 입체적으로 살펴보세요.", note: "1자유도 모델의 응답비를 반영한 시연입니다. 움직임은 느리게 재생하며 변위를 과장합니다." },
  thermal: { title: "온도 시험 챔버", subtitle: "챔버 내부 시료와 설정 온도 변화를 살펴보세요.", note: "챔버는 내부를 볼 수 있는 절개 모형입니다. 색상은 설정 온도이며 실제 온도 분포가 아닙니다." },
  load: { title: "하중 시험 프레임", subtitle: "하중 변화와 시료의 개념적 변형을 살펴보세요.", note: "변형은 시험 과정을 설명하는 연출입니다. 실제 변형량·응력·파손을 예측하지 않습니다." },
  impact: { title: "낙하 시험 가이드", subtitle: "시료가 낙하하는 과정을 입체적으로 살펴보세요.", note: "낙하 높이를 화면 크기에 맞춰 표현합니다. 충돌·파손 해석은 수행하지 않습니다." },
  inspection: { title: "3D 시료 둘러보기", subtitle: "시료를 회전하고 확대해 형태를 확인하세요.", note: "선택한 시험은 3D 외형 보기만 지원합니다. 계산 결과는 아래 가상 시연 결과에서 확인하세요." },
};
const specimens = [
  { id: "satellite", name: "소형 위성", detail: "본체 · 태양전지판 · 안테나" },
  { id: "electronics", name: "전자장비", detail: "방열판 · 커넥터 · 고정구" },
  { id: "coupon", name: "금속 시편", detail: "인장 시험용 개념 형상" },
];
const display = (value) => typeof value === "number" ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value) : value;

export default function SimulationStage({ modelType, input, result, equipmentName }: {
  modelType: string;
  input: SimulationInput;
  result: SimulationResult | null;
  equipmentName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createSimulationScene> | null>(null);
  const loaderVersion = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const motionPreference = useRef(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const state = useRef<SimulationSceneState>({ modelType, input, playing: false, speed: 1, rotate: false, seek: 0 });
  const [specimen, setSpecimen] = useState("satellite"), [custom, setCustom] = useState<Object3D | null>(null);
  const [fileName, setFileName] = useState(""), [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [playing, setPlaying] = useState(false), [rotate, setRotate] = useState(false);
  const [speed, setSpeed] = useState(1), [progress, setProgress] = useState(0), [revision, setRevision] = useState(0);
  const kind = simulationSceneKind(modelType), info = sceneInfo[kind];
  const frame = simulationFrame(modelType, input, progress);
  const animated = kind !== "inspection";

  useEffect(() => {
    Object.assign(state.current, { modelType, input, playing, speed, rotate });
  }, [modelType, input, playing, speed, rotate]);
  useEffect(() => {
    if (result && !motionPreference.current && kind !== "inspection") {
      state.current.seek = 0;
      state.current.playing = true;
      setPlaying(true);
    }
  }, [result, kind]);
  useEffect(() => {
    if (!host.current) return;
    state.current.seek = 0;
    try {
      scene.current = createSimulationScene(host.current, {
        kind, specimen, imported: specimen === "custom" ? custom : null,
        getState: () => state.current, onProgress: setProgress, onError: setError,
        onReady: () => setError(""),
      });
    } catch {
      // Renderer initialization may fail before it can emit an onError callback.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("이 브라우저에서 3D 화면을 열지 못했습니다. WebGL 지원 설정을 확인해주세요. 아래 조건 입력과 결과 조회는 계속 이용할 수 있습니다.");
    }
    return () => {
      scene.current?.dispose(); scene.current = null;
    };
  }, [kind, specimen, custom, revision]);
  useEffect(() => () => { if (custom) disposeObject(custom); }, [custom]);
  useEffect(() => () => { loaderVersion.current++; }, []);

  const seek = (value: number) => {
    state.current.seek = value;
    setProgress(value);
  };
  const togglePlay = () => {
    state.current.playing = !playing;
    setPlaying(!playing);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++loaderVersion.current;
    setFileError("");
    if (!file.name.toLowerCase().endsWith(".glb") || file.size > 25 * 1024 * 1024) {
      setLoading(false);
      setFileError("25MB 이하의 단일 GLB 파일을 선택해주세요.");
      return;
    }
    setLoading(true);
    try {
      const manager = new LoadingManager();
      manager.setURLModifier((url) => {
        if (!/^(blob:|data:)/i.test(url)) throw new Error("External resources are not supported");
        return url;
      });
      const gltf = await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(), "");
      const object = gltf.scene;
      if (version !== loaderVersion.current) { disposeObject(object); return; }
      let vertices = 0;
      object.traverse((node) => {
        if ("geometry" in node && node.geometry instanceof BufferGeometry) {
          vertices += node.geometry.attributes.position?.count ?? 0;
        }
      });
      const bounds = new Box3().setFromObject(object), size = bounds.getSize(new Vector3());
      if (vertices === 0 || vertices > 1_000_000 || ![...size, ...bounds.min, ...bounds.max].every(Number.isFinite) || size.length() < 0.000001) {
        disposeObject(object);
        throw new Error("Unsupported model complexity");
      }
      setCustom(object); setFileName(file.name); setSpecimen("custom");
    } catch {
      if (version === loaderVersion.current) setFileError("모델을 열지 못했습니다. 외부 리소스와 Draco 압축 없이 저장한 GLB 파일(정점 100만 개 이하)을 사용해주세요.");
    } finally {
      if (version === loaderVersion.current) setLoading(false);
    }
  };

  return (
    <section className="sim-lab" aria-label="3D 가상 시험실">
      <div className="sim-lab__heading">
        <div>
          <span className="eyebrow">INTERACTIVE 3D LAB</span>
          <h2>눈앞에서 살펴보는 가상 시험실</h2>
          <p>물체를 돌려보고, 시험 조건에 따른 변화를 확인하세요.</p>
        </div>
        <span className="sim-lab__badge"><Box size={14} /> 3D 시연</span>
      </div>
      <div className="sim-lab__layout">
        <div className="sim-lab__main">
          <div className="sim-viewport">
            <div className="sim-viewport__title">
              <span className="sim-status"><i /> {playing && frame.valid ? "시연 재생 중" : "시료 둘러보기"}</span>
              <h3>{info.title}</h3>
              <p>{info.subtitle}</p>
            </div>
            <div ref={host} className="sim-canvas" />
            {error && <div className="sim-viewport__error" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision((v) => v + 1)}>3D 다시 열기</button></div>}
            <div className="sim-telemetry" aria-label="현재 시연 값">
              <span>{frame.label}</span>
              <strong>{display(frame.value)} <small>{frame.unit}</small></strong>
              {frame.secondaryLabel && <p>{frame.secondaryLabel}{frame.secondaryValue != null ? ` ${display(frame.secondaryValue)}배` : ""}</p>}
            </div>
            <div className="sim-viewport__footer"><span>장비군 개념 모형 · 실제 장비 외형과 다를 수 있음</span><span>Y ↑</span></div>
            <div className="sim-camera-controls" aria-label="3D 카메라 조작">
              <button type="button" aria-label="3D 확대" onClick={() => scene.current?.zoom(0.83)}><ZoomIn size={17} /></button>
              <button type="button" aria-label="3D 축소" onClick={() => scene.current?.zoom(1.2)}><ZoomOut size={17} /></button>
              <button type="button" aria-label="3D 시점 초기화" onClick={() => scene.current?.view("perspective")}><Scan size={17} /></button>
            </div>
          </div>
          <div className="sim-playback">
            <button type="button" className="sim-playback__play" onClick={togglePlay} disabled={!animated || !frame.valid || Boolean(error)} aria-label={playing ? "3D 시연 일시정지" : "3D 시연 재생"}>
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" className="sim-playback__reset" aria-label="3D 시연 처음으로" onClick={() => seek(0)} disabled={!animated}><RotateCcw size={16} /></button>
            <input type="range" aria-label="3D 시연 진행률" min="0" max="1000" value={Math.round(progress * 1000)} onChange={(e) => seek(Number(e.target.value) / 1000)} disabled={!animated || !frame.valid || Boolean(error)} />
            <span className="sim-playback__position">{Math.round(progress * 100)}%</span>
            <select aria-label="3D 시연 재생 속도" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!animated}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select>
          </div>
          <p className="sim-lab__note">{info.note}</p>
        </div>
        <aside className="sim-options">
          <div className="sim-options__group">
            <span className="sim-options__label">01 / 시료 선택</span>
            <h3>무엇을 시험할까요?</h3>
            {specimens.map((item) => <button key={item.id} type="button" className={`sim-specimen ${specimen === item.id ? "is-selected" : ""}`} aria-pressed={specimen === item.id} onClick={() => setSpecimen(item.id)}><Box size={19} /><span><strong>{item.name}</strong><small>{item.detail}</small></span><i /></button>)}
            {custom && <button type="button" className={`sim-specimen ${specimen === "custom" ? "is-selected" : ""}`} aria-pressed={specimen === "custom"} onClick={() => setSpecimen("custom")}><Box size={19} /><span><strong>내 3D 모델</strong><small>{fileName}</small></span><i /></button>}
            <input ref={fileInput} type="file" accept=".glb" onChange={upload} className="sr-only" tabIndex={-1} aria-label="3D GLB 모델 파일" />
            <button type="button" className="sim-upload" onClick={() => fileInput.current?.click()} disabled={loading}><Upload size={15} />{loading ? "모델을 불러오는 중…" : "내 3D 모델 불러오기"}</button>
            <p className="sim-options__hint">GLB · 최대 25MB<br />파일은 서버로 전송되지 않습니다.</p>
            {fileError && <p role="alert" className="sim-file-error">{fileError}</p>}
          </div>
          <div className="sim-options__group">
            <span className="sim-options__label">02 / 관찰 시점</span>
            <div className="sim-view-buttons">{[["perspective", "입체"], ["front", "정면"], ["side", "측면"]].map(([view, label]) => <button type="button" key={view} onClick={() => scene.current?.view(view)}>{label}</button>)}</div>
            <button type="button" className={`sim-rotate ${rotate ? "is-selected" : ""}`} aria-pressed={rotate} onClick={() => setRotate(!rotate)}><Rotate3d size={16} /> 자동 회전 <span>{rotate ? "ON" : "OFF"}</span></button>
            <p className="sim-options__hint">드래그로 회전 · 스크롤로 확대<br />터치로 회전 · 두 손가락으로 확대</p>
          </div>
          <div className="sim-options__context"><span>선택 장비</span><strong>{equipmentName}</strong><p>시료의 외형을 바꿔도 질량·강성 등 입력 조건은 별도로 설정해야 합니다.</p></div>
        </aside>
      </div>
    </section>
  );
}
