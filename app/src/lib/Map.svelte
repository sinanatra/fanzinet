<script>
  import { geoConicConformal, geoPath } from "d3-geo";

  const {
    italy = null,
    points = [],
    filteredItems = [],
    query = "",
    projectionZoom = 1.25,
    labelPlacements = null,
    disablePanZoomOnMobile = true,
    disableVisibleItems = true,
    onSelect = null,
    onvisibleItemsChange
  } = $props();

  const mapWidth = 1500;
  const mapHeight = 1800;

  let projection = $state(null);
  let italyPath = $state("");
  let italyBounds = $state(null);

  let plotted = $state([]);
  let filteredPlotted = $state([]);
  let visibleItems = $state([]);

  const baseTranslateX = 0;
  const baseTranslateY = 0;

  let viewScale = $state(1);
  let viewTranslateX = $state(baseTranslateX);
  let viewTranslateY = $state(baseTranslateY);
  let panning = $state(false);
  let panStart = $state({ x: 0, y: 0, translateX: 0, translateY: 0 });
  let panMoved = $state(false);
  let suppressClick = $state(false);
  let isDragging = $state(false);
  let downOnLabel = $state(false);
  let pendingPan = $state(false);
  let activePointerId = $state(null);
  let rafId = $state(null);
  let pendingView = $state(null);
  let panZoomDisabled = $state(false);

  function svgPointFromEvent(e) {
    const svg = e.currentTarget?.ownerSVGElement || e.currentTarget;
    if (!svg?.createSVGPoint) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM?.();
    if (!ctm) return { x: 0, y: 0 };
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  function isLabelHitEvent(e) {
    const path = e.composedPath?.();
    if (!path) return Boolean(e.target?.closest?.("[data-label-hit]"));
    return path.some((node) => node?.dataset && "labelHit" in node.dataset);
  }

  function handleZoom(
    direction,
    zoomCenterX = mapWidth / 2,
    zoomCenterY = mapHeight / 2,
  ) {
    if (panZoomDisabled) return;
    const factor = direction > 0 ? 1.02 : 1 / 1.02;
    const nextScale = Math.max(0.5, Math.min(8, viewScale * factor));
    if (nextScale === viewScale) return;

    const nextTranslateX =
      zoomCenterX - ((zoomCenterX - viewTranslateX) / viewScale) * nextScale;
    const nextTranslateY =
      zoomCenterY - ((zoomCenterY - viewTranslateY) / viewScale) * nextScale;

    scheduleViewUpdate(nextTranslateX, nextTranslateY, nextScale);
  }

  function scheduleViewUpdate(nextX, nextY, nextScale) {
    pendingView = { x: nextX, y: nextY, scale: nextScale };
    if (typeof requestAnimationFrame === "undefined") {
      viewTranslateX = pendingView.x;
      viewTranslateY = pendingView.y;
      viewScale = pendingView.scale;
      pendingView = null;
      return;
    }
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      if (pendingView) {
        viewTranslateX = pendingView.x;
        viewTranslateY = pendingView.y;
        viewScale = pendingView.scale;
      }
      pendingView = null;
      rafId = null;
    });
  }

  function calculateVisibleItems() {
    if (!projection || !points || points.length === 0) {
      visibleItems = [];
      return;
    }

    const padding = 100;
    visibleItems = points.filter((p) => {
      const lat = parseFloat(p.latitude);
      const lon = parseFloat(p.longitude);
      if (!isFinite(lat) || !isFinite(lon)) return false;

      const [x, y] = projection([lon, lat]);
      const screenX = viewTranslateX + x * viewScale;
      const screenY = viewTranslateY + y * viewScale;

      return (
        screenX > -padding &&
        screenX < mapWidth + padding &&
        screenY > -padding &&
        screenY < mapHeight + padding
      );
    });

    onvisibleItemsChange?.(visibleItems);
  }

  function onWheel(e) {
    if (panZoomDisabled) return;
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    const m = svgPointFromEvent(e);
    handleZoom(direction, m.x, m.y);
  }

  function onPointerDown(e) {
    if (panZoomDisabled) return;
    if (e.button != null && e.button !== 0) return;
    downOnLabel = isLabelHitEvent(e);
    panning = false;
    pendingPan = true;
    activePointerId = e.pointerId;
    panMoved = false;
    isDragging = false;
    const m = svgPointFromEvent(e);
    panStart = {
      x: m.x,
      y: m.y,
      translateX: viewTranslateX,
      translateY: viewTranslateY,
    };
  }

  function onPointerMove(e) {
    if (panZoomDisabled) return;
    if (!pendingPan && !panning) return;
    if (activePointerId != null && e.pointerId !== activePointerId) return;
    const m = svgPointFromEvent(e);
    const dx = m.x - panStart.x;
    const dy = m.y - panStart.y;
    if (!panMoved && Math.hypot(dx, dy) > 3) {
      panMoved = true;
      isDragging = true;
      suppressClick = downOnLabel;
      panning = true;
      if (isLabelHitEvent(e)) suppressClick = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (panMoved) {
      scheduleViewUpdate(
        panStart.translateX + dx,
        panStart.translateY + dy,
        viewScale,
      );
    }
  }

  function onPointerUp(e) {
    if (panZoomDisabled) return;
    endPan(e);
  }

  function onPointerCancel(e) {
    if (panZoomDisabled) return;
    endPan(e, true);
  }

  function endPan(e, cancelled = false) {
    panning = false;
    pendingPan = false;
    activePointerId = null;
    if (e?.currentTarget) {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
    if (panMoved && !cancelled) {
      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
        isDragging = false;
      }, 160);
    } else {
      isDragging = false;
      suppressClick = false;
    }
    downOnLabel = false;
    panMoved = false;
  }

  function applyProjectionZoom(proj, factor) {
    if (!proj || !isFinite(factor) || factor === 1) return;
    const cx = mapWidth / 2;
    const cy = mapHeight / 2;
    const [projTranslateX, projTranslateY] = proj.translate();
    proj.scale(proj.scale() * factor);
    proj.translate([
      cx + (projTranslateX - cx) * factor,
      cy + (projTranslateY - cy) * factor,
    ]);
  }

  function handleKeydown(e, label) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(label);
    }
  }

  $effect(() => {
    if (italy) {
      const p = geoConicConformal().parallels([37, 45]);
      p.fitExtent(
        [
          [0, 0],
          [mapWidth, mapHeight],
        ],
        italy,
      );
      applyProjectionZoom(p, projectionZoom);
      projection = p;
      italyPath = geoPath(p)(italy) || "";
      const b = geoPath(p).bounds(italy);
      italyBounds = b
        ? {
            left: b[0][0],
            top: b[0][1],
            right: b[1][0],
            bottom: b[1][1],
          }
        : null;
    }
  });

  $effect(() => {
    if (labelPlacements && labelPlacements.length) {
      plotted = labelPlacements;
    }
  });

  $effect(() => {
    const base = plotted || [];
    const filtered = !query
      ? base
      : base.filter((label) => {
          const q = query.toLowerCase();
          return (
            label.fanzine?.toLowerCase().includes(q) ||
            label.city?.toLowerCase().includes(q) ||
            label.genre?.toLowerCase().includes(q)
          );
        });

    const padding = 120;
    filteredPlotted = filtered.filter((label) => {
      const screenX = viewTranslateX + label.x * viewScale;
      const screenY = viewTranslateY + label.y * viewScale;
      return (
        screenX > -padding &&
        screenX < mapWidth + padding &&
        screenY > -padding &&
        screenY < mapHeight + padding
      );
    });
  });

  $effect(() => {
    if (!disableVisibleItems) {
      calculateVisibleItems();
    } else {
      visibleItems = [];
    }
  });

  $effect(() => {
    onvisibleItemsChange?.(visibleItems);
  });

  $effect(() => {
    if (typeof window !== "undefined") {
      const coarse =
        window.matchMedia?.("(pointer: coarse)")?.matches ||
        window.matchMedia?.("(hover: none)")?.matches;
      panZoomDisabled = Boolean(disablePanZoomOnMobile && coarse);
    }
  });
</script>

<section class="bg-[#ccc]">
  <div class="absolute top-1 right-1 z-50 space-y-1 text-xs">
    <button
      on:click={() => handleZoom(1)}
      class="bg-white px-2 py-1 font-bold text-black border disabled:opacity-40"
      disabled={panZoomDisabled}
    >
      +
    </button>
    <br />
    <button
      on:click={() => handleZoom(-1)}
      class="bg-white px-2 py-1 font-bold text-black border disabled:opacity-40"
      disabled={panZoomDisabled}
    >
      −
    </button>
  </div>

  <svg
    class="block h-full w-full cursor-grab touch-none select-none overflow-visible active:cursor-grabbing"
    viewBox={`0 0 ${mapWidth} ${mapHeight}`}
    preserveAspectRatio="xMidYMid meet"
    role="application"
    aria-label="Fanzine map (pan and zoom)"
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerCancel}
  >
    <g
      transform={`translate(${viewTranslateX} ${viewTranslateY}) scale(${viewScale})`}
    >
      {#if italyPath}
        <path
          d={italyPath}
          fill="#f5f5f5"
          stroke="#d4d4d8"
          stroke-width="1.5"
          vector-effect="non-scaling-stroke"
        />
      {/if}

      {#each filteredPlotted as label, i (i)}
        <g class="transition-opacity duration-200">
          <g
            data-label-hit
            class="cursor-pointer"
            on:pointerup|stopPropagation={() => {
              endPan();
              if (!suppressClick && !isDragging && !panZoomDisabled) {
                onSelect?.(label);
              }
            }}
            on:click={() => {
              if (!suppressClick && !isDragging && !panZoomDisabled) {
                onSelect?.(label);
              }
            }}
            on:keydown={(e) => handleKeydown(e, label)}
            role="button"
            tabindex="0"
          >
            {#if Math.hypot(label.x - label.x0, label.y - label.y0) > 6}
              <line
                x1={label.x0}
                y1={label.y0}
                x2={label.x}
                y2={label.y}
                stroke="#000"
                stroke-opacity="0.2"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
              />
            {/if}
            <!-- <circle
            cx={label.x0}
            cy={label.y0}
            r={2}
            fill="#000"
            opacity="0.35"
          /> -->
            <rect
              x={label.x - label.width / 2}
              y={label.y - label.height / 2}
              width={label.width}
              height={label.height}
              fill="black"
              stroke="black"
              stroke-width="0"
              vector-effect="non-scaling-stroke"
            />
            <text
              x={label.x}
              y={label.y}
              text-anchor="middle"
              dominant-baseline="middle"
              font-size={label.fontSize}
              font-weight="400"
              fill="white"
              class="pointer-events-none select-none"
              vector-effect="non-scaling-stroke"
            >
              {label.text}
            </text>
            <title>{label.fanzine} ({label.city})</title>
          </g>
        </g>
      {/each}
    </g>
  </svg>
</section>
