"use client";

import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { areTaskGridCellKeysEqual, type TaskGridCellKey } from "@/components/tasks/task-grid-dom-registry";

export type TaskGridOverlayAnchorRect = Readonly<{
  top: number;
  left: number;
  width: number;
  height: number;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  color: string;
  fontFamily: string;
  fontSize: string;
  fontStyle: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
  textAlign: string;
  textTransform: string;
}>;

export type TaskInlineEditorOverlayRenderContext = Readonly<{
  activeCell: TaskGridCellKey;
  anchorRect: TaskGridOverlayAnchorRect;
}>;

export type TaskInlineEditorOverlayProps = {
  activeCell: TaskGridCellKey | null;
  pendingFocusCell?: TaskGridCellKey | null;
  getCellNode: (taskId: string, columnKey: string) => HTMLElement | null;
  onFocusHandled: () => void;
  renderEditor: (context: TaskInlineEditorOverlayRenderContext) => ReactNode;
  className?: string;
  style?: CSSProperties;
  portalContainer?: Element | null;
  focusSelector?: string;
  selectTextOnFocus?: boolean;
};

type TaskInlineEditorOverlayAnchorState = Readonly<{
  cell: TaskGridCellKey;
  rect: TaskGridOverlayAnchorRect;
}> | null;

function findFocusableOverlayElement(overlayNode: HTMLElement, focusSelector: string) {
  return overlayNode.querySelector<HTMLElement>(focusSelector);
}

function readAnchorRect(cell: HTMLElement): TaskGridOverlayAnchorRect | null {
  const bounds = cell.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const cellStyle = window.getComputedStyle(cell);
  const cellContent = cell.querySelector<HTMLElement>(".sheet-table__cell-content");
  const cellContentStyle = window.getComputedStyle(cellContent ?? cell);
  const typographySource = cellContent?.firstElementChild instanceof HTMLElement ? cellContent.firstElementChild : (cellContent ?? cell);
  const typographyStyle = window.getComputedStyle(typographySource);

  return {
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    paddingTop: cellStyle.paddingTop,
    paddingRight: cellStyle.paddingRight,
    paddingBottom: cellStyle.paddingBottom,
    paddingLeft: cellStyle.paddingLeft,
    color: typographyStyle.color,
    fontFamily: typographyStyle.fontFamily,
    fontSize: typographyStyle.fontSize,
    fontStyle: typographyStyle.fontStyle,
    fontWeight: typographyStyle.fontWeight,
    letterSpacing: typographyStyle.letterSpacing,
    lineHeight: typographyStyle.lineHeight,
    textAlign: cellContentStyle.textAlign,
    textTransform: typographyStyle.textTransform,
  };
}

function areAnchorRectsEqual(previous: TaskGridOverlayAnchorRect | null, next: TaskGridOverlayAnchorRect | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return (
    previous.top === next.top &&
    previous.left === next.left &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.paddingTop === next.paddingTop &&
    previous.paddingRight === next.paddingRight &&
    previous.paddingBottom === next.paddingBottom &&
    previous.paddingLeft === next.paddingLeft &&
    previous.color === next.color &&
    previous.fontFamily === next.fontFamily &&
    previous.fontSize === next.fontSize &&
    previous.fontStyle === next.fontStyle &&
    previous.fontWeight === next.fontWeight &&
    previous.letterSpacing === next.letterSpacing &&
    previous.lineHeight === next.lineHeight &&
    previous.textAlign === next.textAlign &&
    previous.textTransform === next.textTransform
  );
}

function isFocusableTextLikeElement(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && element.type === "text");
}

export function TaskInlineEditorOverlay({
  activeCell,
  pendingFocusCell,
  getCellNode,
  onFocusHandled,
  renderEditor,
  className,
  style,
  portalContainer,
  focusSelector = 'textarea, input:not([type="button"]), select, button[data-task-multiselect-trigger="true"]',
  selectTextOnFocus = true,
}: TaskInlineEditorOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const focusHandledRef = useRef(false);
  const [anchorState, setAnchorState] = useState<TaskInlineEditorOverlayAnchorState>(null);
  const anchorRect = activeCell && anchorState && areTaskGridCellKeysEqual(activeCell, anchorState.cell) ? anchorState.rect : null;

  const syncAnchorRect = useCallback(() => {
    if (!activeCell) {
      return false;
    }

    const cell = getCellNode(activeCell.taskId, activeCell.columnKey);
    if (!cell) {
      return false;
    }

    const nextAnchorRect = readAnchorRect(cell);
    if (!nextAnchorRect) {
      return false;
    }

    setAnchorState((previous) => {
      if (
        previous &&
        areTaskGridCellKeysEqual(previous.cell, activeCell) &&
        areAnchorRectsEqual(previous.rect, nextAnchorRect)
      ) {
        return previous;
      }

      return {
        cell: activeCell,
        rect: nextAnchorRect,
      };
    });
    return true;
  }, [activeCell, getCellNode]);

  useLayoutEffect(() => {
    focusHandledRef.current = false;
    if (!activeCell) {
      return;
    }

    let frameId: number | null = null;
    let cancelled = false;
    const cell = getCellNode(activeCell.taskId, activeCell.columnKey);

    const scheduleSync = () => {
      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (!cancelled) {
          syncAnchorRect();
        }
      });
    };

    const retryUntilAnchored = () => {
      if (cancelled) {
        return;
      }

      if (syncAnchorRect()) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        retryUntilAnchored();
      });
    };

    retryUntilAnchored();
    window.addEventListener("scroll", scheduleSync, true);
    window.addEventListener("resize", scheduleSync);

    const resizeObserver = cell ? new ResizeObserver(() => scheduleSync()) : null;
    if (cell) {
      resizeObserver?.observe(cell);
    }

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", scheduleSync, true);
      window.removeEventListener("resize", scheduleSync);
      resizeObserver?.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activeCell, getCellNode, syncAnchorRect]);

  useEffect(() => {
    if (!activeCell || !pendingFocusCell || !areTaskGridCellKeysEqual(activeCell, pendingFocusCell) || !anchorRect) {
      return;
    }

    const overlayNode = overlayRef.current;
    if (!overlayNode || focusHandledRef.current) {
      return;
    }

    const editor = findFocusableOverlayElement(overlayNode, focusSelector);
    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });
    if (selectTextOnFocus && isFocusableTextLikeElement(editor)) {
      editor.select();
    }

    focusHandledRef.current = true;
    onFocusHandled();
  }, [activeCell, anchorRect, focusSelector, onFocusHandled, pendingFocusCell, selectTextOnFocus]);

  if (!activeCell || !anchorRect || typeof document === "undefined") {
    return null;
  }

  const portalRoot = portalContainer ?? document.body;
  if (!portalRoot) {
    return null;
  }

  return createPortal(
    <div
      className={className}
      data-task-portal-interaction="true"
      ref={overlayRef}
      style={{
        top: `${anchorRect.top}px`,
        left: `${anchorRect.left}px`,
        width: `${anchorRect.width}px`,
        height: `${anchorRect.height}px`,
        paddingTop: anchorRect.paddingTop,
        paddingRight: anchorRect.paddingRight,
        paddingBottom: anchorRect.paddingBottom,
        paddingLeft: anchorRect.paddingLeft,
        color: anchorRect.color,
        fontFamily: anchorRect.fontFamily,
        fontSize: anchorRect.fontSize,
        fontStyle: anchorRect.fontStyle,
        fontWeight: anchorRect.fontWeight,
        letterSpacing: anchorRect.letterSpacing,
        lineHeight: anchorRect.lineHeight,
        textAlign: anchorRect.textAlign as CSSProperties["textAlign"],
        textTransform: anchorRect.textTransform as CSSProperties["textTransform"],
        ...style,
      }}
    >
      {renderEditor({
        activeCell,
        anchorRect,
      })}
    </div>,
    portalRoot,
  );
}
