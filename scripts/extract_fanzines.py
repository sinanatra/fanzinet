from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote_plus
from urllib.request import Request, urlopen


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_key(key: str) -> str:
    key = _clean_text(key)
    key = key.replace("'", "'").replace("`", "'")
    key = key.strip(":").strip()
    return key.upper()


def _parse_year_range(text: str) -> tuple[int | None, int | None]:
    years = [int(y) for y in re.findall(r"\b(1[89]\d{2}|20\d{2})\b", text)]
    if not years:
        return None, None
    return min(years), max(years)


def _is_unknown_place(text: str) -> bool:
    cleaned = _clean_text(text)
    if not cleaned:
        return True
    if re.fullmatch(r"\?+", cleaned):
        return True
    upper = cleaned.upper()
    return upper in {"N/A", "NA", "N.D.", "ND", "UNKNOWN", "SCONOSCIUTO", "SCONOSCIUTA"}


class ProjectInfoParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.project_info: dict[str, str] = {}
        self.canonical_url: str | None = None
        self.og_image: str | None = None
        self.title: str | None = None
        self.first_pdf_href: str | None = None

        self._in_project_info_div = False
        self._project_info_div_depth = 0
        self._in_h4 = False
        self._in_p = False
        self._in_title = False

        self._buffer: list[str] = []
        self._current_key: str | None = None
        self._current_key_has_value = False

    def _commit_open_p(self) -> None:
        if not self._in_p:
            return
        value = _clean_text(self._flush_buffer())
        if self._current_key and value:
            self.project_info[self._current_key] = value
            self._current_key_has_value = True
        self._in_p = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {k.lower(): (v or "") for k, v in attrs}

        if tag.lower() == "div":
            class_attr = attrs_dict.get("class", "")
            if self._in_project_info_div:
                self._project_info_div_depth += 1
            elif "project-info" in class_attr.split():
                self._in_project_info_div = True
                self._project_info_div_depth = 1
                self._current_key = None
                self._current_key_has_value = False

        if tag.lower() == "h4" and self._in_project_info_div:
            self._commit_open_p()
            self._flush_buffer()
            self._in_h4 = True

        if tag.lower() == "p" and self._in_project_info_div and self._current_key and not self._current_key_has_value:
            self._flush_buffer()
            self._in_p = True

        if tag.lower() == "link":
            rel = attrs_dict.get("rel", "").lower()
            href = attrs_dict.get("href", "")
            if rel == "canonical" and href:
                self.canonical_url = href

        if tag.lower() == "meta":
            prop = attrs_dict.get("property", "").lower()
            content = attrs_dict.get("content", "")
            if prop == "og:image" and content:
                self.og_image = content

        if tag.lower() == "title":
            self._flush_buffer()
            self._in_title = True

        if tag.lower() == "a" and not self.first_pdf_href:
            href = attrs_dict.get("href", "")
            if href.lower().endswith(".pdf"):
                self.first_pdf_href = href

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "h4" and self._in_h4:
            key = _normalize_key(self._flush_buffer())
            if key:
                self._current_key = key
                self._current_key_has_value = False
            self._in_h4 = False

        if tag.lower() == "p" and self._in_p:
            self._commit_open_p()

        if tag.lower() == "title" and self._in_title:
            title = _clean_text(self._flush_buffer())
            self.title = title or self.title
            self._in_title = False

        if tag.lower() == "div" and self._in_project_info_div:
            self._project_info_div_depth -= 1
            if self._project_info_div_depth <= 0:
                self._commit_open_p()
                self._in_project_info_div = False
                self._project_info_div_depth = 0
                self._in_h4 = False
                self._in_p = False
                self._current_key = None
                self._current_key_has_value = False

    def handle_data(self, data: str) -> None:
        if self._in_h4 or self._in_p or self._in_title:
            self._buffer.append(data)

    def _flush_buffer(self) -> str:
        value = "".join(self._buffer)
        self._buffer = []
        return value


def _best_field(info: dict[str, str], candidates: list[str]) -> str | None:
    for key in candidates:
        if key in info and info[key]:
            return info[key]
    return None


def _iter_html_files(input_dir: Path, glob: str) -> list[Path]:
    files = sorted(input_dir.glob(glob))
    return [p for p in files if p.is_file()]


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
    tmp_path.replace(path)


def _geocode_nominatim(
    query: str,
    *,
    user_agent: str,
    timeout_s: float,
) -> tuple[float, float] | None:
    url = (
        "https://nominatim.openstreetmap.org/search"
        f"?format=jsonv2&limit=1&q={quote_plus(query)}"
    )
    req = Request(url, headers={"User-Agent": user_agent})
    with urlopen(req, timeout=timeout_s) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if not payload:
        return None
    item = payload[0]
    return float(item["lat"]), float(item["lon"])


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Extract structured fanzine data from HTML pages into CSV."
    )
    ap.add_argument("--input", default="data", help="Input directory containing HTML files.")
    ap.add_argument("--glob", default="*.html", help="Glob for input files (relative to --input).")
    ap.add_argument("--output", default="fanzines.csv", help="Output CSV path.")
    ap.add_argument("--default-country", default="", help="Country appended for geocoding queries.")
    ap.add_argument(
        "--geocode",
        action="store_true",
        help="Enable geocoding (requires network).",
    )
    ap.add_argument(
        "--geocode-cache",
        default=".cache/geocode_cache.json",
        help="Path to geocode cache (JSON).",
    )
    ap.add_argument(
        "--geocode-delay-seconds",
        type=float,
        default=1.1,
        help="Delay between geocoding requests (rate limiting).",
    )
    ap.add_argument(
        "--geocode-timeout-seconds",
        type=float,
        default=20.0,
        help="HTTP timeout for geocoding requests.",
    )
    ap.add_argument(
        "--geocode-user-agent",
        default="fanzinet-extract/1.0 (local script)",
        help="User-Agent header for geocoding requests.",
    )
    ap.add_argument(
        "--geocode-max-queries",
        type=int,
        default=0,
        help="Limit geocoding requests (0 = no limit).",
    )
    ap.add_argument(
        "--continue-on-geocode-error",
        action="store_true",
        help="Keep going if geocoding fails for a query.",
    )

    args = ap.parse_args()
    start_time = time.time()
    print(f"\n[INFO] Starting extraction...")
    
    input_dir = Path(args.input)
    files = _iter_html_files(input_dir, args.glob)
    if not files:
        print(f"No input files matched: {input_dir / args.glob}", file=sys.stderr)
        return 2

    print(f"[INFO] Found {len(files)} HTML files to process")
    cache_path = Path(args.geocode_cache)
    geocode_cache: dict = _load_json(cache_path) if args.geocode else {}
    if args.geocode:
        print(f"[INFO] Loaded geocode cache with {len(geocode_cache)} entries")

    rows: list[dict] = []
    for i, path in enumerate(files, 1):
        if i % 50 == 0 or i == len(files):
            print(f"[PROGRESS] Parsed {i}/{len(files)} files...")
        raw = path.read_text(encoding="utf-8", errors="replace")
        parser = ProjectInfoParser()
        parser.feed(raw)

        info = parser.project_info
        fanzine = _best_field(info, ["FANZINE", "RIVISTA"])
        city = _best_field(info, ["CITTA'", "CITTÀ", "CITTA"])
        activity = _best_field(info, ["ATTIVITA'", "ATTIVITÀ", "ATTIVITA"])
        genre = _best_field(info, ["GENERE"])

        year_start, year_end = _parse_year_range(activity or "")

        row = {
            "source_file": path.as_posix(),
            "canonical_url": parser.canonical_url or "",
            "title": parser.title or "",
            "fanzine": fanzine or "",
            "city": city or "",
            "country": args.default_country or "",
            "activity": activity or "",
            "year_start": year_start or "",
            "year_end": year_end or "",
            "genre": genre or "",
            "pdf_href": parser.first_pdf_href or "",
            "og_image": parser.og_image or "",
            "latitude": "",
            "longitude": "",
        }
        rows.append(row)

    if args.geocode:
        print(f"\n[INFO] Starting geocoding...")
        geocode_start = time.time()
        unique_queries: dict[str, str] = {}
        for row in rows:
            city = row["city"]
            if not city or _is_unknown_place(city):
                continue
            query = city if not row["country"] else f"{city}, {row['country']}"
            query_key = query.strip().lower()
            if query_key:
                unique_queries[query_key] = query

        print(f"[INFO] Found {len(unique_queries)} unique queries to geocode")
        max_queries = args.geocode_max_queries
        completed = 0
        api_requests = 0
        for query_idx, (query_key, query) in enumerate(unique_queries.items(), 1):
            if max_queries and completed >= max_queries:
                break

            cached = geocode_cache.get(query_key)
            if isinstance(cached, dict) and "latitude" in cached and "longitude" in cached:
                geocode_cache[query_key] = [cached["latitude"], cached["longitude"]]
                completed += 1
                continue
            if isinstance(cached, dict) and "result" in cached:
                geocode_cache[query_key] = None
                completed += 1
                continue

            if query_key in geocode_cache:
                completed += 1
                continue

            # Geocode the query
            try:
                print(f"[GEOCODE] ({query_idx}/{len(unique_queries)}) Querying: {query}")
                result = _geocode_nominatim(
                    query,
                    user_agent=args.geocode_user_agent,
                    timeout_s=args.geocode_timeout_seconds,
                )
                geocode_cache[query_key] = list(result) if result is not None else None
                if result:
                    print(f"  → Found: {result[0]:.4f}, {result[1]:.4f}")
                else:
                    print(f"  → No results")
                api_requests += 1
            except (HTTPError, URLError, TimeoutError, OSError) as e:
                if not args.continue_on_geocode_error:
                    raise
                print(f"[ERROR] Geocode error for {query!r}: {e}", file=sys.stderr)
                geocode_cache[query_key] = {"error": str(e)}
                api_requests += 1

            time.sleep(args.geocode_delay_seconds)
            completed += 1

        # Apply coordinates to rows
        for row in rows:
            city = row["city"]
            if not city or _is_unknown_place(city):
                continue
            query = city if not row["country"] else f"{city}, {row['country']}"
            query_key = query.strip().lower()
            cached = geocode_cache.get(query_key)
            if isinstance(cached, list) and len(cached) == 2:
                row["latitude"] = cached[0]
                row["longitude"] = cached[1]

        _save_json(cache_path, geocode_cache)
        geocode_duration = time.time() - geocode_start
        print(f"[INFO] Geocoding complete: {api_requests} API requests, {geocode_duration:.1f}s")

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    if args.geocode:
        if "latitude" not in fieldnames:
            fieldnames.append("latitude")
        if "longitude" not in fieldnames:
            fieldnames.append("longitude")
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})

    total_duration = time.time() - start_time
    print(f"\n[SUCCESS] Wrote {len(rows)} rows to {out_path.as_posix()}")
    if args.geocode:
        print(f"[INFO] Geocode cache: {cache_path.as_posix()}")
    print(f"[INFO] Total time: {total_duration:.1f}s\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
