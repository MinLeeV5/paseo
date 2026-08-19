import { useCallback, useEffect, useRef } from "react";
import type React from "react";

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

interface PanZoomTransform {
  x: number;
  y: number;
  scale: number;
}

interface PanZoomDrag {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

/**
 * Web-only pan/zoom for mermaid diagrams. The diagram lives in a sandboxed
 * iframe with `pointerEvents: "none"`, so all pointer interaction happens on
 * the surrounding viewport element; this hook applies a CSS transform to a
 * content element for drag-to-pan, ctrl/cmd+wheel zoom, and button zoom.
 *
 * The transform math assumes the content element's untransformed top-left
 * coincides with the viewport's top-left (transform-origin `0 0`). Callers
 * that center the diagram must do so inside the content element, not by
 * offsetting the content element itself.
 */
export function useMermaidPanZoom(enabled: boolean) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef<PanZoomTransform>({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<PanZoomDrag | null>(null);

  const applyTransformToElement = useCallback(
    (element: HTMLDivElement, transform: PanZoomTransform) => {
      const { x, y, scale } = transform;
      element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    },
    [],
  );
  const applyTransform = useCallback(() => {
    if (contentRef.current) {
      applyTransformToElement(contentRef.current, transformRef.current);
    }
  }, [applyTransformToElement]);
  const setContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (node) {
        applyTransformToElement(node, transformRef.current);
      }
    },
    [applyTransformToElement],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const activeViewport = viewport;
    function zoomWithWheel(event: WheelEvent): void {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const transform = transformRef.current;
      const factor = Math.min(1.25, Math.max(0.8, Math.exp(-event.deltaY * 0.01)));
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * factor));
      const rect = activeViewport.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      transform.x = x - ((x - transform.x) / transform.scale) * scale;
      transform.y = y - ((y - transform.y) / transform.scale) * scale;
      transform.scale = scale;
      applyTransform();
    }
    activeViewport.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => activeViewport.removeEventListener("wheel", zoomWithWheel);
  }, [applyTransform, enabled]);

  // Re-apply the transform when pan/zoom becomes active again after the
  // diagram was swapped out for the source view. The content node persists
  // across the swap, but re-applying keeps the visible state in sync.
  useEffect(() => {
    if (enabled && contentRef.current) {
      applyTransformToElement(contentRef.current, transformRef.current);
    }
  }, [applyTransformToElement, enabled]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== "mouse") {
      return;
    }
    const transform = transformRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      transformRef.current.x = drag.originX + event.clientX - drag.startX;
      transformRef.current.y = drag.originY + event.clientY - drag.startY;
      applyTransform();
    },
    [applyTransform],
  );
  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);
  const resetTransform = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    applyTransform();
  }, [applyTransform]);
  const zoomBy = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const x = rect.width / 2;
      const y = rect.height / 2;
      const transform = transformRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale * factor));
      transform.x = x - ((x - transform.x) / transform.scale) * scale;
      transform.y = y - ((y - transform.y) / transform.scale) * scale;
      transform.scale = scale;
      applyTransform();
    },
    [applyTransform],
  );
  const zoomIn = useCallback(() => zoomBy(1.25), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(0.8), [zoomBy]);

  return {
    viewportRef,
    setContentRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onDoubleClick: resetTransform,
    resetTransform,
    zoomIn,
    zoomOut,
  };
}
