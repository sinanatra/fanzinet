<svelte:options runes={false} />

<script>
  import { createEventDispatcher } from "svelte";
  import { geoConicConformal, geoPath } from "d3-geo";

  export let italy = null;
  export let points = [];
  export let filteredItems = [];
  export let query = "";
  export let projectionZoom = 1.25;
  export let onSelect = null;

  const dispatch = createEventDispatcher();

  const labelPad = 1;
  const labelGap = 1;
  const minFontSize = 2;
  const maxFontSize = 6;
  const maxLabelDrift = 100;
  const textCache = new Map();

  const mapWidth = 1500;
  const mapHeight = 1800;
  const labelFont = '"Courier New", Courier, monospace';

  let projection = null;
  let italyPath = "";
  let italyBounds = null;

  let plotted = [];
  let filteredPlotted = [];

  let viewScale = 2;
  let viewTranslateX = -800;
  let viewTranslateY = -200;
  let panning = false;
  let panStart = { x: 0, y: 0, translateX: 0, translateY: 0 };
  let panMoved = false;
  let suppressClick = false;

  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const ctx = canvas ? canvas.getContext("2d") : null;

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

  function zoomToBounds(items) {
    if (!items || items.length === 0 || !projection) return;
    
    const lats = items.map(p => parseFloat(p.latitude)).filter(isFinite);
    const lons = items.map(p => parseFloat(p.longitude)).filter(isFinite);
    
    if (lats.length === 0 || lons.length === 0) return;
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    
    const [centerX, centerY] = projection([centerLon, centerLat]);
    
    // Calculate zoom level based on bounds
    const topLeft = projection([minLon, maxLat]);
    const bottomRight = projection([maxLon, minLat]);
    
    const boundsWidth = Math.abs(bottomRight[0] - topLeft[0]);
    const boundsHeight = Math.abs(bottomRight[1] - topLeft[1]);
    
    const padding = 100;
    const zoomX = (mapWidth - padding) / boundsWidth;
    const zoomY = (mapHeight - padding) / boundsHeight;
    const newScale = Math.min(zoomX, zoomY, 6);
    
    viewScale = newScale;
    viewTranslateX = mapWidth / 2 - centerX * newScale;
    viewTranslateY = mapHeight / 2 - centerY * newScale;
  }

  function handleZoom(direction) {
    const factor = direction > 0 ? 1.25 : 1 / 1.25;
    const nextScale = Math.max(0.5, Math.min(8, viewScale * factor));
    if (nextScale === viewScale) return;
    
    // Zoom to bounds of filtered items if available
    if (filteredItems && filteredItems.length > 0 && projection) {
      const lats = filteredItems.map(p => parseFloat(p.latitude)).filter(isFinite);
      const lons = filteredItems.map(p => parseFloat(p.longitude)).filter(isFinite);
      if (lats.length > 0 && lons.length > 0) {
        const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
        const [centerX, centerY] = projection([centerLon, centerLat]);
        viewTranslateX = mapWidth / 2 - centerX * nextScale;
        viewTranslateY = mapHeight / 2 - centerY * nextScale;
      }
    }
    
    viewScale = nextScale;
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (isLabelHitEvent(e)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    panning = true;
    panMoved = false;
    const m = svgPointFromEvent(e);
    panStart = {
      x: m.x,
      y: m.y,
      translateX: viewTranslateX,
      translateY: viewTranslateY,
    };
  }

  function onPointerMove(e) {
    if (!panning) return;
    const m = svgPointFromEvent(e);
    const dx = m.x - panStart.x;
    const dy = m.y - panStart.y;
    if (!panMoved && Math.hypot(dx, dy) > 3) panMoved = true;
    viewTranslateX = panStart.translateX + dx;
    viewTranslateY = panStart.translateY + dy;
  }

  function onPointerUp(e) {
    if (!panning) return;
    panning = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (panMoved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 100);
    }
  }

  function onPointerCancel(e) {
    panning = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function measureText(text, fontSize) {
    if (!ctx) return text.length * fontSize * 0.6;
    const key = `${text}:${fontSize}`;
    if (textCache.has(key)) return textCache.get(key);
    ctx.font = `700 ${fontSize}px ${labelFont}`;
    const width = ctx.measureText(text).width;
    textCache.set(key, width);
    return width;
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

  function createGridIndex(cellSize) {
    const cells = new Map();

    function key(cx, cy) {
      return `${cx},${cy}`;
    }

    function cellsForRect(rect) {
      const x0 = Math.floor(rect.left / cellSize);
      const x1 = Math.floor(rect.right / cellSize);
      const y0 = Math.floor(rect.top / cellSize);
      const y1 = Math.floor(rect.bottom / cellSize);
      return { x0, x1, y0, y1 };
    }

    function insert(id, rect) {
      const { x0, x1, y0, y1 } = cellsForRect(rect);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = key(cx, cy);
          let bucket = cells.get(k);
          if (!bucket) {
            bucket = new Set();
            cells.set(k, bucket);
          }
          bucket.add(id);
        }
      }
    }

    function candidates(rect) {
      const { x0, x1, y0, y1 } = cellsForRect(rect);
      const ids = new Set();
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = cells.get(key(cx, cy));
          if (!bucket) continue;
          for (const id of bucket) ids.add(id);
        }
      }
      return ids;
    }

    return { insert, candidates };
  }

  function rectsOverlap(a, b) {
    return !(
      a.right <= b.left ||
      a.left >= b.right ||
      a.bottom <= b.top ||
      a.top >= b.bottom
    );
  }

  function clampRectCenterToBounds(cx, cy, w, h, bounds) {
    const halfW = w / 2;
    const halfH = h / 2;
    return {
      x: Math.max(bounds.left + halfW, Math.min(bounds.right - halfW, cx)),
      y: Math.max(bounds.top + halfH, Math.min(bounds.bottom - halfH, cy)),
    };
  }

  function placeLabels(
    fanzines,
    projection,
    mapWidth,
    mapHeight,
    boundsOverride,
  ) {
    if (!projection || !fanzines.length) return [];

    const baseFontSize = Math.max(
      minFontSize,
      Math.min(maxFontSize, Math.floor(mapWidth / 140)),
    );
    const maxDrift = Math.min(maxLabelDrift, Math.floor(mapWidth * 0.18));

    const bounds = boundsOverride || {
      left: 16,
      top: 16,
      right: mapWidth - 16,
      bottom: mapHeight - 16,
    };

    const labels = fanzines
      .map((fanzine) => {
        const pt = projection([fanzine.lon, fanzine.lat]);
        if (!pt) return null;
        const [x0, y0] = pt;
        const text = (fanzine.fanzine || "N/A").toUpperCase();
        return { ...fanzine, x0, y0, text };
      })
      .filter(Boolean);

    if (!labels.length) return [];

    labels.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const cellSize = Math.max(24, Math.ceil(baseFontSize + labelGap * 3));
    const index = createGridIndex(cellSize);
    const placedRects = [];
    const placed = [];

    function tryPlace(w, h, cx, cy) {
      const { x, y } = clampRectCenterToBounds(cx, cy, w, h, bounds);
      const rect = {
        left: x - w / 2 - labelGap,
        right: x + w / 2 + labelGap,
        top: y - h / 2 - labelGap,
        bottom: y + h / 2 + labelGap,
      };
      const candidateIds = index.candidates(rect);
      for (const id of candidateIds) {
        if (rectsOverlap(rect, placedRects[id])) return null;
      }
      const id = placedRects.length;
      placedRects.push(rect);
      index.insert(id, rect);
      return { x, y };
    }

    function* candidateCenters(anchorX, anchorY, step, maxRadius) {
      yield { x: anchorX, y: anchorY };
      for (let r = step; r <= maxRadius; r += step) {
        const ringCount = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
        for (let i = 0; i < ringCount; i++) {
          const t = (i / ringCount) * Math.PI * 2;
          yield { x: anchorX + Math.cos(t) * r, y: anchorY + Math.sin(t) * r };
        }
      }
    }

    for (const label of labels) {
      const anchorX = label.x0;
      const anchorY = label.y0;
      let best = null;
      let finalFontSize = baseFontSize;
      let finalWidth = 0;
      let finalHeight = 0;

      for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize--) {
        const w = Math.ceil(measureText(label.text, fontSize) + labelPad * 2);
        const h = Math.ceil(fontSize + labelPad * 2);
        const step = Math.max(10, Math.ceil(h + labelGap));

        for (const c of candidateCenters(anchorX, anchorY, step, maxDrift)) {
          const dx = c.x - anchorX;
          const dy = c.y - anchorY;
          if (dx * dx + dy * dy > maxDrift * maxDrift) continue;

          const placedCenter = tryPlace(w, h, c.x, c.y);
          if (placedCenter) {
            best = placedCenter;
            finalFontSize = fontSize;
            finalWidth = w;
            finalHeight = h;
            break;
          }
        }

        if (best) break;
      }

      if (!best) {
        const w = Math.ceil(
          measureText(label.text, minFontSize) + labelPad * 2,
        );
        const h = Math.ceil(minFontSize + labelPad * 2);
        best = clampRectCenterToBounds(anchorX, anchorY, w, h, bounds);
        finalFontSize = minFontSize;
        finalWidth = w;
        finalHeight = h;
      }

      placed.push({
        ...label,
        x: best.x,
        y: best.y,
        fontSize: finalFontSize,
        width: finalWidth,
        height: finalHeight,
      });
    }

    return placed;
  }

  function handleKeydown(e, label) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      dispatch("select", label);
    }
  }

  $: if (italy) {
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

  $: if (projection && points?.length) {
    const extraLabelSpace = 500;
    const labelBounds = italyBounds
      ? {
          left: italyBounds.left - extraLabelSpace,
          top: italyBounds.top - extraLabelSpace,
          right: italyBounds.right + extraLabelSpace,
          bottom: italyBounds.bottom + extraLabelSpace,
        }
      : null;
    plotted = placeLabels(points, projection, mapWidth, mapHeight, labelBounds);
  }

  $: {
    if (!query) {
      filteredPlotted = plotted;
    } else {
      const q = query.toLowerCase();
      filteredPlotted = plotted.filter(
        (label) =>
          label.fanzine?.toLowerCase().includes(q) ||
          label.city?.toLowerCase().includes(q) ||
          label.genre?.toLowerCase().includes(q),
      );
    }
  }

  $: if (projection && query && filteredItems && filteredItems.length > 0) {
    zoomToBounds(filteredItems);
  }
</script>

<div class="absolute top-4 right-4 flex z-50 space-x-2">
  <button
    on:click={() => handleZoom(-1)}
    class="bg-white px-2 py-1 font-bold text-black border"
  >
    −
  </button>
  <button
    on:click={() => handleZoom(1)}
    class="bg-white px-2 py-1 font-bold text-black border"
  >
    +
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
      <g class="transition-opacity duration-200">
        <g
          data-label-hit
          class="cursor-pointer"
          on:pointerdown|stopPropagation={() => {}}
          on:pointerup|stopPropagation={() => {
            console.log("mapLabelPointerUp", {
              fanzine: label?.fanzine,
              city: label?.city,
              canonicalUrl: label?.canonicalUrl,
            });
            if (!suppressClick) {
              onSelect?.(label);
              dispatch("select", label);
            }
          }}
          on:click={() => {
            console.log("mapLabelClick", {
              fanzine: label?.fanzine,
              city: label?.city,
              canonicalUrl: label?.canonicalUrl,
            });
            if (!suppressClick) {
              onSelect?.(label);
              dispatch("select", label);
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
              stroke-opacity="0.1"
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
