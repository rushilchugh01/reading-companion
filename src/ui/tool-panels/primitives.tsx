import { BookOpen, Check, Send, X } from "lucide-react";
import type { AriaRole, CSSProperties, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { AnimationSlot } from "../../shared/animation-types";
import { companionAssetUrl } from "../asset-url";
import { resolveRenderableAvatarVariant } from "../avatar-pack";
import { useActiveAvatarPack } from "../avatar-context";
import { companionPanelThemeStyle } from "./themes";
import type { CompanionPanelThemeId, ToolPanelAction } from "./types";

/** Renders a transparent companion asset from the active avatar pack. */
export function CompanionImage(props: { className?: string; slot?: AnimationSlot; alt?: string; style?: CSSProperties }) {
  const variant = resolveRenderableAvatarVariant(useActiveAvatarPack(), props.slot ?? "raise_paw");
  return (
    <img
      className={props.className}
      src={companionAssetUrl(variant.src)}
      alt={props.alt ?? ""}
      aria-hidden={props.alt ? undefined : true}
      style={props.style}
    />
  );
}

/** Provides the themed panel shell, optional close action, and decorative backdrop. */
export function ToolPanelFrame(props: {
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  onClose?: () => void;
  themeId?: CompanionPanelThemeId;
}) {
  return (
    <section className={`rc-tool-panel ${props.className ?? ""}`} style={companionPanelThemeStyle(props.themeId)} aria-label="Companion tool panel">
      {props.onClose ? (
        <button className="rc-tool-icon-button rc-tool-close" type="button" aria-label={props.closeLabel ?? "Close panel"} onClick={props.onClose}>
          <X size={24} />
        </button>
      ) : null}
      <DecorativeSparkles />
      {props.children}
    </section>
  );
}

/** Renders the common companion header with avatar, title, subtitle, and optional menu. */
export function ToolPanelHeader(props: {
  title?: string;
  subtitle?: string;
  menu?: ReactNode;
  avatarSlot?: AnimationSlot;
}) {
  return (
    <header className="rc-tool-header">
      <CompanionAvatar slot={props.avatarSlot ?? "raise_paw"} size="large" />
      <div className="rc-tool-header__copy">
        <h2>{props.title ?? "Companion"}</h2>
        {props.subtitle ? <p>{props.subtitle}</p> : null}
      </div>
      {props.menu ? <div className="rc-tool-header__menu">{props.menu}</div> : null}
    </header>
  );
}

/** Renders the small circular companion avatar used beside chat bubbles. */
export function CompanionAvatar(props: { slot?: AnimationSlot; size?: "small" | "medium" | "large" }) {
  return (
    <span className={`rc-tool-avatar rc-tool-avatar--${props.size ?? "medium"}`} aria-hidden="true">
      <CompanionImage slot={props.slot} />
    </span>
  );
}

/** Renders a themed chat bubble, optionally paired with an avatar lead-in. */
export function CompanionBubble(props: {
  children: ReactNode;
  className?: string;
  leadAvatar?: boolean;
  role?: AriaRole;
  tone?: "default" | "soft" | "highlight" | "primary";
}) {
  const bubble = (
    <div className={`rc-tool-bubble rc-tool-bubble--${props.tone ?? "default"} ${props.className ?? ""}`} role={props.role}>
      {props.children}
    </div>
  );
  if (!props.leadAvatar) return bubble;
  return (
    <div className="rc-tool-message-row">
      <CompanionAvatar size="medium" />
      {bubble}
    </div>
  );
}

/** Renders a themed action button used for CTAs, choices, and chips. */
export function ToolActionButton(props: ToolPanelAction & {
  variant?: "primary" | "secondary" | "ghost";
  wide?: boolean;
}) {
  return (
    <button
      className={`rc-tool-action rc-tool-action--${props.variant ?? "secondary"} ${props.wide ? "rc-tool-action--wide" : ""}`}
      type="button"
      onClick={props.onClick}
    >
      {props.icon ? <span className="rc-tool-action__icon">{props.icon}</span> : null}
      <span>{props.label}</span>
    </button>
  );
}

/** Renders a vertical list of full-width themed tool actions. */
export function ToolChoiceList(props: { actions: ToolPanelAction[] }) {
  return (
    <div className="rc-tool-choice-list">
      {props.actions.map((action) => (
        <ToolActionButton key={action.id} {...action} wide />
      ))}
    </div>
  );
}

/** Renders a compact controlled-or-uncontrolled companion text input. */
export function ToolInput(props: {
  buttonLabel?: string;
  className?: string;
  disabled?: boolean;
  minRows?: number;
  onSubmit?: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const value = props.value ?? uncontrolledValue;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  function setValue(nextValue: string) {
    if (props.value === undefined) setUncontrolledValue(nextValue);
    props.onValueChange?.(nextValue);
  }

  function submitValue() {
    const trimmedValue = value.trim();
    if (props.disabled || trimmedValue.length === 0) return false;
    props.onSubmit?.(trimmedValue);
    if (props.value === undefined) setUncontrolledValue("");
    return true;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitValue();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitValue();
  }

  return (
    <form className={`rc-tool-input ${props.className ?? ""}`} onSubmit={submit}>
      <textarea
        ref={textareaRef}
        aria-label={props.placeholder ?? "Type your answer"}
        placeholder={props.placeholder ?? "Type your answer..."}
        rows={props.minRows ?? 1}
        disabled={props.disabled}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleTextareaKeyDown}
      />
      <button type="submit" aria-label={props.buttonLabel ?? "Send"} disabled={props.disabled || value.trim().length === 0}>
        <Send size={22} />
      </button>
    </form>
  );
}

/** Renders the daily check count footer when a count is available. */
export function ChecksToday(props: { count?: number }) {
  if (props.count === undefined) return null;
  return (
    <div className="rc-tool-checks">
      <span>
        <Check size={15} />
      </span>
      <strong>{props.count} checks today</strong>
    </div>
  );
}

/** Renders small privacy or storage helper text below a panel action row. */
export function PrivacyNote(props: { children: ReactNode }) {
  return (
    <p className="rc-tool-note">
      <BookOpen size={15} />
      <span>{props.children}</span>
    </p>
  );
}

/** Renders lightweight decorative sparkles driven by the active theme tokens. */
export function DecorativeSparkles() {
  return (
    <div className="rc-tool-sparkles" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
