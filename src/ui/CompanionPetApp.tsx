import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { CompanionPet } from "./CompanionPet";
import { animationSlotForPetState } from "./animation-state";
import { getBuiltInAvatarPack, loadCompanionPack } from "./avatar-pack";
import { ActiveAvatarPackProvider } from "./avatar-context";
import { clampPanelSize, clampPetPosition, getDefaultPetPosition, getHomePanelHorizontalStyle } from "./geometry";
import { ToolPanel } from "./tool-panels";
import { AttentionToolsPanel } from "./tool-panels/panels/AttentionToolsPanel";
import { DebugProcessingPanel, debugActionResult } from "./DebugProcessingPanel";
import { defaultHomeActionResult, getHomePanelData } from "./home-panel-data";
import type { AnimationSlot, AvatarPack } from "../shared/animation-types";
import type { CompanionConversationMessage, CompanionPetAppProps, HomePanelActionId, HomePanelActionResult, PanelSize, PetPosition } from "./types";

const DEFAULT_PANEL_SIZE: PanelSize = { width: 340, height: 360 };
const DEFAULT_HOME_PANEL_SIZE: PanelSize = { width: 420, height: 500 };
const PANEL_VIEWPORT_MARGIN = 12;
const PANEL_ANCHOR_BOTTOM = 26;
const ROOT_VISUAL_HEIGHT = 132;
type DragState = { active: boolean; offsetX: number; offsetY: number };
type ResizeState = { active: boolean; startX: number; startY: number; width: number; height: number };
type MotionBinding = {
  dragRef: React.MutableRefObject<DragState>;
  resizeRef: React.MutableRefObject<ResizeState>;
  setPosition: React.Dispatch<React.SetStateAction<PetPosition>>;
  setPanelSize: React.Dispatch<React.SetStateAction<PanelSize>>;
  onPositionChange?: (position: PetPosition) => void;
  onPanelSizeChange?: (size: PanelSize) => void;
};
export type CompanionViewProps = {
  appProps: CompanionPetAppProps;
  open: boolean;
  panelSize: PanelSize;
  panelOffsetTop: number;
  homePanelSize: PanelSize;
  homePanelOffsetTop: number;
  position: PetPosition;
  petState: NonNullable<CompanionPetAppProps["petState"]>;
  activePack: AvatarPack;
  animationSlot: AnimationSlot;
  panelSide: "left" | "right";
  rootRef: React.RefObject<HTMLDivElement | null>;
  rootStyle: { transform: string };
  answer: string;
  onAnswerChange: (answer: string) => void;
  onAnswerSubmit?: (answer: string) => void;
  onDisableGlobally?: () => void;
  onHide: () => void;
  onHideSite?: () => void;
  onHomeAction?: (actionId: HomePanelActionId) => HomePanelActionResult | Promise<HomePanelActionResult>;
  onMinimize: () => void;
  onOpenSettings?: () => void;
  onRetry?: () => void;
  onResizeStart: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onToggleOpen: () => void;
  onDragStart: (event: React.MouseEvent<HTMLButtonElement>) => void;
};
type HomePanelMode = "tools" | "processing";
type OpenCompanionPanelProps = {
  props: CompanionViewProps;
  homeActionResult?: HomePanelActionResult;
  homePanelMode: HomePanelMode;
  pendingHomeAction?: HomePanelActionId;
  onQuestionSubmit: (answer: string) => void;
  onRunHomeAction: (actionId: HomePanelActionId) => void;
  onShowLegacyDebug: () => void;
  onShowProcessing: () => void;
  onShowTools: () => void;
};
type DebugPanelResetSetters = {
  setHomeActionResult: React.Dispatch<React.SetStateAction<HomePanelActionResult | undefined>>;
  setHomePanelMode: React.Dispatch<React.SetStateAction<HomePanelMode>>;
};
type CompanionViewBinding = {
  activePack: AvatarPack;
  animationSlot: AnimationSlot;
  answer: string;
  hideCompanion: () => void;
  homePanelSize: PanelSize;
  minimizePanel: () => void;
  open: boolean;
  panelOffsetTop: number;
  panelSide: "left" | "right";
  panelSize: PanelSize;
  position: PetPosition;
  rootRef: React.RefObject<HTMLDivElement | null>;
  rootStyle: { transform: string };
  setAnswer: (answer: string) => void;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  startDrag: (event: React.MouseEvent<HTMLButtonElement>) => void;
  startResize: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

/** Mountable companion UI with draggable pet, compact panel, and adapter callbacks. */
export function CompanionPetApp(props: CompanionPetAppProps) {
  const petState = props.petState ?? "idle";
  const requestedPackId = props.companionPackId ?? props.avatarPackId;
  const activePack = useActiveCompanionPack(requestedPackId, props.companionPackRegistry);
  const animationSlot = animationSlotForPetState(petState);
  const [position, setPosition] = useState<PetPosition>(() => props.initialPosition ? clampPetPosition(props.initialPosition) : getDefaultPetPosition());
  const [panelSize, setPanelSize] = useState<PanelSize>(() => clampPanelSize(props.initialPanelSize ?? DEFAULT_PANEL_SIZE));
  const [open, setOpen] = useState(false);
  const [localHidden, setLocalHidden] = useState(false);
  const [answer, setAnswer] = useState("");
  const dragRef = useRef<DragState>({ active: false, offsetX: 0, offsetY: 0 });
  const resizeRef = useRef<ResizeState>({ active: false, startX: 0, startY: 0, width: panelSize.width, height: panelSize.height });
  const rootRef = useRef<HTMLDivElement>(null);
  const panelSide = position.x > window.innerWidth / 2 ? "left" : "right";
  const rootStyle = useMemo(() => ({ transform: `translate(${position.x}px, ${position.y}px)` }), [position]);

  useEffect(() => bindWindowMotion({ dragRef, resizeRef, setPanelSize, setPosition, onPanelSizeChange: props.onPanelSizeChange, onPositionChange: props.onPositionChange }), [props.onPanelSizeChange, props.onPositionChange]);
  useEffect(() => bindViewportClamp(setPosition, setPanelSize), []);
  useEffect(() => bindOutsidePanelClose(rootRef, open, setOpen), [open]);
  useEffect(() => {
    if (props.hidden) setOpen(false);
  }, [props.hidden]);

  function startDrag(event: React.MouseEvent<HTMLButtonElement>) { dragRef.current = { active: true, offsetX: event.clientX - position.x, offsetY: event.clientY - position.y }; }

  function startResize(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    resizeRef.current = { active: true, startX: event.clientX, startY: event.clientY, width: panelSize.width, height: panelSize.height };
  }

  function hideCompanion() {
    setLocalHidden(true);
    setOpen(false);
    props.onHide?.();
  }

  function restoreCompanion() {
    setLocalHidden(false);
    props.onRestore?.();
  }

  function minimizePanel() {
    setOpen(false);
    props.onMinimize?.(true);
  }

  if (props.hidden ?? localHidden) return <RestoreButton onRestore={restoreCompanion} />;

  return <CompanionView {...getCompanionViewProps(props, petState, {
    activePack,
    animationSlot,
    answer,
    hideCompanion,
    homePanelSize: getHomePanelSize(panelSize),
    minimizePanel,
    open,
    panelOffsetTop: getPanelOffsetTop(position, panelSize),
    panelSide,
    panelSize,
    position,
    rootRef,
    rootStyle,
    setAnswer,
    setOpen,
    startDrag,
    startResize
  })} activePack={activePack} animationSlot={animationSlot} />;
}

function useActiveCompanionPack(
  packId: string | undefined,
  registry: CompanionPetAppProps["companionPackRegistry"]
): AvatarPack {
  const [activePack, setActivePack] = useState<AvatarPack>(() => getBuiltInAvatarPack(packId));
  useEffect(() => bindCompanionPack(packId, registry, setActivePack), [packId, registry]);
  return activePack;
}

function bindCompanionPack(
  packId: string | undefined,
  registry: CompanionPetAppProps["companionPackRegistry"],
  setActivePack: React.Dispatch<React.SetStateAction<AvatarPack>>
) {
  let cancelled = false;
  void loadCompanionPack(packId, registry).then((pack) => {
    if (!cancelled) setActivePack(pack.avatar);
  });
  return () => {
    cancelled = true;
  };
}

function getCompanionViewProps(
  props: CompanionPetAppProps,
  petState: NonNullable<CompanionPetAppProps["petState"]>,
  binding: CompanionViewBinding
): CompanionViewProps {
  return {
    activePack: binding.activePack,
    animationSlot: binding.animationSlot,
    appProps: getCompanionViewAppProps(props),
    answer: binding.answer,
    homePanelOffsetTop: getPanelOffsetTop(binding.position, binding.homePanelSize),
    homePanelSize: binding.homePanelSize,
    onAnswerChange: binding.setAnswer,
    onAnswerSubmit: props.onAnswerSubmit,
    onDisableGlobally: props.onDisableGlobally,
    onDragStart: binding.startDrag,
    onHide: binding.hideCompanion,
    onHideSite: props.onHideSite,
    onHomeAction: props.onHomeAction,
    onMinimize: binding.minimizePanel,
    onOpenSettings: props.onOpenSettings,
    onResizeStart: binding.startResize,
    onRetry: props.onRetry,
    onToggleOpen: () => binding.setOpen((value) => !value),
    open: binding.open,
    panelOffsetTop: binding.panelOffsetTop,
    panelSide: binding.panelSide,
    panelSize: binding.panelSize,
    petState,
    position: binding.position,
    rootRef: binding.rootRef,
    rootStyle: binding.rootStyle
  };
}

function getCompanionViewAppProps(props: CompanionPetAppProps): CompanionPetAppProps {
  return {
    chatTheme: props.chatTheme,
    debugMode: props.debugMode,
    debugSnapshot: props.debugSnapshot,
    greeting: props.greeting ?? "Need a reading check-in?",
    gradeResult: props.gradeResult,
    conversationMessages: props.conversationMessages,
    panelTheme: props.panelTheme,
    questionSession: props.questionSession,
    retryDisplay: props.retryDisplay
  };
}

function CompanionView(props: CompanionViewProps) {
  const [homeActionResult, setHomeActionResult] = useState<HomePanelActionResult>();
  const [homePanelMode, setHomePanelMode] = useState<HomePanelMode>("tools");
  const [pendingHomeAction, setPendingHomeAction] = useState<HomePanelActionId>();

  useDebugModePanelReset(props.appProps.debugMode, homePanelMode, homeActionResult, { setHomeActionResult, setHomePanelMode });

  function submitAnswer(answer: string) {
    props.onAnswerSubmit?.(answer);
    props.onAnswerChange("");
  }

  async function runHomeAction(actionId: HomePanelActionId) {
    setHomePanelMode("tools");
    setPendingHomeAction(actionId);
    try {
      const result = await (props.onHomeAction?.(actionId) ?? defaultHomeActionResult(actionId));
      setHomeActionResult(result);
    } catch {
      setHomeActionResult({
        headline: "I could not do that",
        body: "The reading helper could not be reached. Check your provider settings, then try again."
      });
    } finally {
      setPendingHomeAction(undefined);
    }
  }

  return (
    <CompanionRoot
      props={props}
      homeActionResult={homeActionResult}
      homePanelMode={homePanelMode}
      pendingHomeAction={pendingHomeAction}
      onQuestionSubmit={submitAnswer}
      onRunHomeAction={(actionId) => void runHomeAction(actionId)}
      onShowLegacyDebug={() => setHomeActionResult(debugActionResult(props.appProps))}
      onShowProcessing={() => setHomePanelMode("processing")}
      onShowTools={() => setHomePanelMode("tools")}
    />
  );
}

function CompanionRoot(input: OpenCompanionPanelProps) {
  const props = input.props;
  return (
    <ActiveAvatarPackProvider pack={props.activePack}>
      <div ref={props.rootRef} className="rc-root" style={props.rootStyle} data-panel-side={props.panelSide} data-state={props.petState}>
        {props.open ? <OpenHomePanel {...input} /> : null}
        <button
          className="rc-pet-button"
          type="button"
          onClick={props.onToggleOpen}
          onMouseDown={props.onDragStart}
          aria-label={props.open ? "Close reading companion" : "Open reading companion"}
        >
          <CompanionPet pack={props.activePack} slot={props.animationSlot} />
        </button>
      </div>
    </ActiveAvatarPackProvider>
  );
}

function OpenHomePanel(input: OpenCompanionPanelProps) {
  const props = input.props;
  return (
    <div className="rc-home-panel" style={getHomePanelStyle(props.homePanelSize, props.homePanelOffsetTop, props.position, props.panelSide)}>
      <OpenCompanionPanel {...input} />
      <button
        aria-label="Resize companion panel"
        className="rc-panel__resize"
        type="button"
        onMouseDown={props.onResizeStart}
      />
    </div>
  );
}

/** Clears debug-only local panel state when debug mode is disabled. */
function useDebugModePanelReset(
  debugMode: boolean | undefined,
  homePanelMode: HomePanelMode,
  homeActionResult: HomePanelActionResult | undefined,
  setters: DebugPanelResetSetters
): void {
  useEffect(() => {
    if (debugMode) return;
    if (homePanelMode === "processing") setters.setHomePanelMode("tools");
    if (homeActionResult?.headline === "Debug") setters.setHomeActionResult(undefined);
  }, [debugMode, homeActionResult?.headline, homePanelMode, setters]);
}

function OpenCompanionPanel({
  props,
  homeActionResult,
  homePanelMode,
  pendingHomeAction,
  onQuestionSubmit,
  onRunHomeAction,
  onShowLegacyDebug,
  onShowProcessing,
  onShowTools
}: OpenCompanionPanelProps) {
  const themeId = props.appProps.panelTheme ?? "mint";
  if (props.appProps.questionSession || props.appProps.conversationMessages?.length) {
    return <ToolPanel view="question-response" themeId={themeId} panelData={getQuestionPanelData(props, onQuestionSubmit)} />;
  }
  if (homePanelMode === "processing") {
    return (
      <DebugProcessingPanel
        appProps={props.appProps}
        onBack={onShowTools}
        onOpenLegacyDebug={() => {
          onShowTools();
          onShowLegacyDebug();
        }}
        onOpenSettings={props.onOpenSettings}
        themeId={themeId}
      />
    );
  }
  return (
    <AttentionToolsPanel
      {...getHomePanelData(props, {
        actionResult: homeActionResult,
        onAction: onRunHomeAction,
        onDebug: onShowLegacyDebug,
        onProcessing: onShowProcessing,
        pendingAction: pendingHomeAction
      })}
      themeId={themeId}
    />
  );
}

function getQuestionPanelData(props: CompanionViewProps, onSubmit: (answer: string) => void) {
  const hasActiveSession = Boolean(props.appProps.questionSession);
  const hasConversation = Boolean(props.appProps.conversationMessages?.length);
  return {
    title: props.activePack.name,
    subtitle: props.appProps.greeting ?? "Your reading buddy",
    prompt: props.appProps.questionSession?.question ?? "What stands out in this part?",
    messages: questionConversationMessages(props.appProps),
    helper: questionHelperText(props.appProps),
    inputDisabled: props.petState === "grading",
    placeholder: hasActiveSession ? "Type a quick answer..." : "Ask a follow-up...",
    quickChoices: props.appProps.retryDisplay ? [
      {
        id: "retry",
        icon: <RotateCcw size={18} />,
        label: "Retry",
        onClick: props.appProps.retryDisplay.onRetry ?? props.onRetry
      }
    ] : undefined,
    showInput: hasActiveSession || hasConversation,
    submitLabel: hasActiveSession ? "Submit answer" : "Send message",
    value: props.answer,
    onValueChange: props.onAnswerChange,
    onSubmit: hasActiveSession || hasConversation ? onSubmit : undefined
  };
}

function questionConversationMessages(appProps: CompanionPetAppProps): CompanionConversationMessage[] | undefined {
  if (appProps.conversationMessages && appProps.conversationMessages.length > 0) return appProps.conversationMessages;
  return undefined;
}

function questionHelperText(appProps: CompanionPetAppProps): string | undefined {
  if (appProps.conversationMessages && appProps.conversationMessages.length > 0) return undefined;
  if (appProps.gradeResult) return appProps.gradeResult.feedback;
  if (appProps.retryDisplay) return appProps.retryDisplay.message;
  return undefined;
}

function RestoreButton({ onRestore }: { onRestore: () => void }) {
  return (
    <button className="rc-restore" type="button" onClick={onRestore} aria-label="Show reading companion">
      Show companion
    </button>
  );
}

function getPanelOffsetTop(position: PetPosition, panelSize: PanelSize): number {
  const panelHeight = Math.min(panelSize.height, Math.max(220, window.innerHeight - PANEL_VIEWPORT_MARGIN * 2));
  const desiredTop = ROOT_VISUAL_HEIGHT - PANEL_ANCHOR_BOTTOM - panelHeight;
  const minimumTop = PANEL_VIEWPORT_MARGIN - position.y;
  const maximumTop = window.innerHeight - position.y - panelHeight - PANEL_VIEWPORT_MARGIN;
  return clampNumber(desiredTop, minimumTop, Math.max(minimumTop, maximumTop));
}

function getHomePanelSize(panelSize: PanelSize): PanelSize {
  return {
    width: Math.max(DEFAULT_HOME_PANEL_SIZE.width, panelSize.width),
    height: Math.max(DEFAULT_HOME_PANEL_SIZE.height, panelSize.height)
  };
}

function getHomePanelStyle(
  size: PanelSize,
  offsetTop: number,
  position: PetPosition,
  panelSide: "left" | "right"
): React.CSSProperties {
  return {
    ...getHomePanelHorizontalStyle(size, position, panelSide),
    height: size.height,
    maxHeight: "calc(100dvh - 24px)",
    maxWidth: "calc(100vw - 24px)",
    top: offsetTop
  };
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function bindViewportClamp(
  setPosition: React.Dispatch<React.SetStateAction<PetPosition>>,
  setPanelSize: React.Dispatch<React.SetStateAction<PanelSize>>
) {
  function clampOnResize() {
    setPosition((current) => clampPetPosition(current));
    setPanelSize((current) => clampPanelSize(current));
  }

  window.addEventListener("resize", clampOnResize);
  return () => window.removeEventListener("resize", clampOnResize);
}

function bindOutsidePanelClose(
  rootRef: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  if (!open) return;

  function closeOnOutsidePointer(event: MouseEvent | PointerEvent) {
    const root = rootRef.current;
    if (!root || isEventInsideElement(event, root)) return;
    setOpen(false);
  }

  document.addEventListener("pointerdown", closeOnOutsidePointer);
  return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
}

function isEventInsideElement(event: MouseEvent | PointerEvent, element: HTMLElement): boolean {
  const path = event.composedPath();
  return path.includes(element);
}

function bindWindowMotion(binding: MotionBinding) {
  function move(event: MouseEvent) {
    if (binding.dragRef.current.active) updateDrag(event, binding.dragRef, binding.setPosition);
    if (binding.resizeRef.current.active) updateResize(event, binding.resizeRef, binding.setPanelSize);
  }

  function stop() {
    binding.setPosition((current) => {
      if (binding.dragRef.current.active) binding.onPositionChange?.(current);
      binding.dragRef.current.active = false;
      return current;
    });
    binding.setPanelSize((current) => {
      if (binding.resizeRef.current.active) binding.onPanelSizeChange?.(current);
      binding.resizeRef.current.active = false;
      return current;
    });
  }

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
  return () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
  };
}

function updateDrag(
  event: MouseEvent,
  dragRef: React.MutableRefObject<DragState>,
  setPosition: React.Dispatch<React.SetStateAction<PetPosition>>
) {
  const nextPosition = clampPetPosition({ x: event.clientX - dragRef.current.offsetX, y: event.clientY - dragRef.current.offsetY });
  setPosition(nextPosition);
}

function updateResize(
  event: MouseEvent,
  resizeRef: React.MutableRefObject<ResizeState>,
  setPanelSize: React.Dispatch<React.SetStateAction<PanelSize>>
) {
  const nextSize = clampPanelSize({
    width: resizeRef.current.width + event.clientX - resizeRef.current.startX,
    height: resizeRef.current.height + event.clientY - resizeRef.current.startY
  });
  setPanelSize(nextSize);
}
