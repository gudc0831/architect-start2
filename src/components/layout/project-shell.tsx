"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import type { FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent } from "react";
import { Sidebar } from "@/components/layout/sidebar";

type ProjectShellProps = {
  children: React.ReactNode;
  contentWidth?: "default" | "wide";
};

export function ProjectShell({ children, contentWidth = "default" }: ProjectShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarHoverOpen, setIsSidebarHoverOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [canHoverSidebar, setCanHoverSidebar] = useState(false);
  const isSidebarExpanded = isSidebarPinned || isSidebarOpen || isSidebarHoverOpen;

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverState = () => setCanHoverSidebar(query.matches);

    syncHoverState();
    query.addEventListener("change", syncHoverState);
    return () => query.removeEventListener("change", syncHoverState);
  }, []);

  useEffect(() => {
    if (!isSidebarExpanded || isSidebarPinned) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
        setIsSidebarHoverOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSidebarExpanded, isSidebarPinned]);

  function expandSidebar() {
    setIsSidebarOpen(true);
  }

  function collapseSidebar() {
    if (!isSidebarPinned) {
      setIsSidebarOpen(false);
      setIsSidebarHoverOpen(false);
    }
  }

  function handleSidebarPointerEnter() {
    if (canHoverSidebar) {
      setIsSidebarHoverOpen(true);
    }
  }

  function handleSidebarPointerLeave(event: ReactPointerEvent<HTMLElement>) {
    if (!canHoverSidebar || isSidebarPinned) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof Node && event.currentTarget.contains(activeElement)) {
      return;
    }

    setIsSidebarHoverOpen(false);
  }

  function handleSidebarFocus(event: ReactFocusEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest(".sidebar__handle")) {
      return;
    }

    expandSidebar();
  }

  function handleSidebarBlur(event: ReactFocusEvent<HTMLElement>) {
    if (isSidebarPinned) {
      return;
    }

    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    collapseSidebar();
  }

  function handleSidebarHandleClick() {
    if (isSidebarPinned) {
      return;
    }

    if (isSidebarOpen) {
      setIsSidebarOpen(false);
      setIsSidebarHoverOpen(false);
      return;
    }

    setIsSidebarOpen(true);
    setIsSidebarHoverOpen(false);
  }

  function handleSidebarPinToggle() {
    if (isSidebarPinned) {
      setIsSidebarPinned(false);
      setIsSidebarOpen(false);
      setIsSidebarHoverOpen(false);
      return;
    }

    setIsSidebarPinned(true);
    setIsSidebarOpen(true);
    setIsSidebarHoverOpen(false);
  }

  return (
    <div
      className={clsx(
        "shell",
        isSidebarExpanded && "shell--sidebar-expanded",
        isSidebarPinned && "shell--sidebar-pinned",
      )}
    >
      <div aria-hidden="true" className="shell__ambient" />
      <Sidebar
        isExpanded={isSidebarExpanded}
        isPinned={isSidebarPinned}
        onBlur={handleSidebarBlur}
        onFocus={handleSidebarFocus}
        onHandleClick={handleSidebarHandleClick}
        onPinToggle={handleSidebarPinToggle}
        onPointerEnter={handleSidebarPointerEnter}
        onPointerLeave={handleSidebarPointerLeave}
      />
      {isSidebarExpanded && !isSidebarPinned ? (
        <div aria-hidden="true" className="shell__sidebar-backdrop" onPointerDown={collapseSidebar} />
      ) : null}
      <main className="shell__content">
        <div className={clsx("shell__content-inner", contentWidth === "wide" && "shell__content-inner--wide")}>
          <div className="shell__content-frame">{children}</div>
        </div>
      </main>
    </div>
  );
}
