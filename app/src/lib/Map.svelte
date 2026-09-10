<script>
  import { geoConicConformal, geoPath } from "d3-geo";

  const {
    italy = null,
    points = [],
    filteredItems = [],
    query = "",
    projectionZoom = 1.25,
    labelPlacements = null,
    disablePanZoomOnMobile = false,
    disableVisibleItems = true,
    selectedLabel = null,
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

  const initialViewScale = 1.3;
  const initialViewTranslateX = -214.46342976888013;
  const initialViewTranslateY = -2.5114542643229925;

  let viewScale = $state(initialViewScale);
  let viewTranslateX = $state(initialViewTranslateX);
  let viewTranslateY = $state(initialViewTranslateY);
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
    factor = null,
  ) {
    if (panZoomDisabled) return;
    const step = 1.2;
    if (factor == null) factor = direction > 0 ? step : 1 / step;
    const currentScale = pendingView ? pendingView.scale : viewScale;
    const currentTranslateX = pendingView ? pendingView.x : viewTranslateX;
    const currentTranslateY = pendingView ? pendingView.y : viewTranslateY;
    const nextScale = Math.max(
      initialViewScale,
      Math.min(8, currentScale * factor),
    );
    if (nextScale === currentScale) return;

    const nextTranslateX =
      zoomCenterX -
      ((zoomCenterX - currentTranslateX) / currentScale) * nextScale;
    const nextTranslateY =
      zoomCenterY -
      ((zoomCenterY - currentTranslateY) / currentScale) * nextScale;

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

  function onPointerDown(e) {
    if (panZoomDisabled) return;
    if (e.button != null && e.button !== 0) return;

    if (pendingView) {
      viewTranslateX = pendingView.x;
      viewTranslateY = pendingView.y;
      viewScale = pendingView.scale;
      pendingView = null;
    }
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
    if (!panMoved && Math.hypot(dx, dy) > 2) {
      panMoved = true;
      isDragging = true;
      suppressClick = downOnLabel;
      panning = true;
      if (isLabelHitEvent(e)) suppressClick = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (panMoved) {
      // Apply panning immediately to reduce perceived lag on mobile.
      viewTranslateX = panStart.translateX + dx;
      viewTranslateY = panStart.translateY + dy;
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

  function labelMatches(a, b) {
    if (!a || !b) return false;
    if (a.canonicalUrl && b.canonicalUrl) return a.canonicalUrl === b.canonicalUrl;
    if (a.sourceFile && b.sourceFile) return a.sourceFile === b.sourceFile;
    return (
      a.fanzine === b.fanzine &&
      a.city === b.city &&
      a.yearStart === b.yearStart &&
      a.yearEnd === b.yearEnd
    );
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

  function matchesQuery(label, q) {
    return (
      label.fanzine?.toLowerCase().includes(q) ||
      label.city?.toLowerCase().includes(q) ||
      label.genre?.toLowerCase().includes(q)
    );
  }

  let queryMatches = $derived.by(() => {
    const base = plotted || [];
    if (!query) return base;
    const q = query.toLowerCase();
    return base.filter((label) => matchesQuery(label, q));
  });

  $effect(() => {
    const filtered = queryMatches;
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
    if (!query) {
      scheduleViewUpdate(
        initialViewTranslateX,
        initialViewTranslateY,
        initialViewScale,
      );
      return;
    }

    const matches = queryMatches;
    if (!matches.length) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const label of matches) {
      const halfW = (label.width || 0) / 2;
      const halfH = (label.height || 0) / 2;
      minX = Math.min(minX, label.x - halfW, label.x0);
      maxX = Math.max(maxX, label.x + halfW, label.x0);
      minY = Math.min(minY, label.y - halfH, label.y0);
      maxY = Math.max(maxY, label.y + halfH, label.y0);
    }

    const bboxWidth = Math.max(maxX - minX, 1);
    const bboxHeight = Math.max(maxY - minY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const fitFraction = 0.8;
    const scaleX = (mapWidth * fitFraction) / bboxWidth;
    const scaleY = (mapHeight * fitFraction) / bboxHeight;
    const nextScale = Math.max(
      initialViewScale,
      Math.min(8, Math.min(scaleX, scaleY)),
    );

    const nextTranslateX = mapWidth / 2 - centerX * nextScale;
    const nextTranslateY = mapHeight / 2 - centerY * nextScale;

    scheduleViewUpdate(nextTranslateX, nextTranslateY, nextScale);
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

<section class="relative h-full w-full bg-[#ccc]">
  
  <div class="absolute top-1 right-1 z-50 space-y-1 text-xs">
    <button
      on:click={() => handleZoom(2)}
      class="bg-white px-2 py-1  cursor-pointer font-bold text-black border disabled:opacity-40"
      disabled={panZoomDisabled}
    >
      +
    </button>
    <br />
    <button
      on:click={() => handleZoom(-2)}
      class="bg-white px-2 py-1  cursor-pointer font-bold text-black border disabled:opacity-40"
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
        {@const isSelected = labelMatches(label, selectedLabel)}
        <g
          style={`opacity: ${
            selectedLabel ? (isSelected ? "1" : "0.35") : "1"
          }`}
        >
          <g
            data-label-hit
            class="cursor-pointer"
            on:pointerup|stopPropagation={(e) => {
              endPan(e);
              if (!suppressClick && !isDragging && !panZoomDisabled) {
                onSelect?.(isSelected ? null : label);
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
              font-weight={isSelected ? "600" : "400"}
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
