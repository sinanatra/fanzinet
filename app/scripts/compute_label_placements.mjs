import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";
import { geoConicConformal, geoPath } from "d3-geo";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultCsv = path.resolve(__dirname, "../static/fanzines.csv");
const defaultGeo = path.resolve(__dirname, "../static/data/italy2.geojson");
const defaultOut = path.resolve(
  __dirname,
  "../static/data/label_placements.json",
);

const mapWidth = 1500;
const mapHeight = 1800;
const labelPad = 0.5;
const labelGap = 0.2;
const minFontSize = 1;
const maxFontSize = 6;
const maxLabelDrift = 100;
const projectionZoom = 1;

function parseArgs(argv) {
  const args = {
    csv: defaultCsv,
    geo: defaultGeo,
    out: defaultOut,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--csv") {
      args.csv = argv[i + 1];
      i += 1;
    } else if (arg === "--geo") {
      args.geo = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function normalizeRow(row) {
  return {
    sourceFile: row.source_file,
    canonicalUrl: row.canonical_url,
    title: row.title,
    fanzine: row.fanzine || "N/A",
    city: row.city || "Unknown",
    country: row.country,
    activity: row.activity,
    yearStart: row.year_start,
    yearEnd: row.year_end,
    genre: row.genre,
    description: row.description,
    pdfHref: row.pdf_href,
    ogImage: row.og_image,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function measureText(text, fontSize) {
  return text.length * fontSize * 0.6;
}

function applyProjectionZoom(proj, factor) {
  if (!proj || !Number.isFinite(factor) || factor === 1) return;
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
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
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
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
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

function placeLabels(fanzines, projection, boundsOverride) {
  if (!projection || fanzines.length === 0) return [];

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

  if (labels.length === 0) return [];

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

  function forcePlace(w, h, cx, cy) {
    const rect = {
      left: cx - w / 2 - labelGap,
      right: cx + w / 2 + labelGap,
      top: cy - h / 2 - labelGap,
      bottom: cy + h / 2 + labelGap,
    };
    const id = placedRects.length;
    placedRects.push(rect);
    index.insert(id, rect);
  }

  function* candidateCenters(anchorX, anchorY, step, maxRadius) {
    yield { x: anchorX, y: anchorY };
    for (let r = step; r <= maxRadius; r += step) {
      const ringCount = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
      for (let i = 0; i < ringCount; i += 1) {
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

    for (let fontSize = baseFontSize; fontSize >= minFontSize; fontSize -= 1) {
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
      const w = Math.ceil(measureText(label.text, minFontSize) + labelPad * 2);
      const h = Math.ceil(minFontSize + labelPad * 2);
      best = clampRectCenterToBounds(anchorX, anchorY, w, h, bounds);
      finalFontSize = minFontSize;
      finalWidth = w;
      finalHeight = h;
      forcePlace(w, h, best.x, best.y);
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

async function main() {
  const { csv, geo, out } = parseArgs(process.argv);

  const [csvText, geoText] = await Promise.all([
    readFile(csv, "utf8"),
    readFile(geo, "utf8"),
  ]);

  const italy = JSON.parse(geoText);
  const rows = csvParse(csvText).map(normalizeRow);

  const points = rows
    .map((f) => {
      const lat = parseFloat(f.latitude);
      const lon = parseFloat(f.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { ...f, lat, lon };
    })
    .filter(Boolean);

  const projection = geoConicConformal().parallels([37, 45]);
  projection.fitExtent(
    [
      [0, 0],
      [mapWidth, mapHeight],
    ],
    italy,
  );
  applyProjectionZoom(projection, projectionZoom);

  const bounds = geoPath(projection).bounds(italy);
  const italyBounds = bounds
    ? {
        left: bounds[0][0],
        top: bounds[0][1],
        right: bounds[1][0],
        bottom: bounds[1][1],
      }
    : null;

  const extraLabelSpace = 500;
  const labelBounds = italyBounds
    ? {
        left: italyBounds.left - extraLabelSpace,
        top: italyBounds.top - extraLabelSpace,
        right: italyBounds.right + extraLabelSpace,
        bottom: italyBounds.bottom + extraLabelSpace,
      }
    : null;

  const labels = placeLabels(points, projection, labelBounds);

  const payload = {
    meta: {
      mapWidth,
      mapHeight,
      projection: {
        type: "geoConicConformal",
        parallels: [37, 45],
        zoom: projectionZoom,
      },
      labelPad,
      labelGap,
      minFontSize,
      maxFontSize,
      maxLabelDrift,
      generatedAt: new Date().toISOString(),
    },
    labels,
  };

  await writeFile(out, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${labels.length} labels to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
