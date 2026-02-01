<svelte:options runes={false} />

<script>
  import { onMount } from "svelte";
  import { csvParse } from "d3-dsv";
  import Header from "$lib/Header.svelte";
  import Footer from "$lib/Footer.svelte";
  import Map from "$lib/Map.svelte";
  import SearchPanel from "$lib/SearchPanel.svelte";
  import ResultsGrid from "$lib/ResultsGrid.svelte";

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

  let italy = null;
  let allFanzines = [];
  let points = [];
  let labelPlacements = [];
  let loading = true;
  let error = "";

  let searchQuery = "";
  let selectedCity = null;
  let viewportItems = [];

  $: filteredCities = searchQuery
    ? allFanzines.filter((f) => {
        const q = searchQuery.toLowerCase();
        return (
          f.fanzine?.toLowerCase().includes(q) ||
          f.city?.toLowerCase().includes(q) ||
          f.genre?.toLowerCase().includes(q)
        );
      })
    : [];

  $: visibleCount = searchQuery
    ? points.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.fanzine?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.genre?.toLowerCase().includes(q)
        );
      }).length
    : points.length;

  function onClearSearch() {
    searchQuery = "";
    selectedCity = null;
  }

  function onMapSelect(event) {
    selectedCity = event.detail;
  }

  function onVisibleItemsChange(event) {
    viewportItems = event.detail;
  }

  onMount(async () => {
    try {
      loading = true;

      const geoRes = await fetch("/data/italy2.geojson");
      if (!geoRes.ok) throw new Error("Failed to load geojson");
      italy = await geoRes.json();

      const csvRes = await fetch("/fanzines.csv");
      if (!csvRes.ok) throw new Error("Failed to load fanzines.csv");
      const text = await csvRes.text();
      allFanzines = csvParse(text).map(normalizeRow);

      try {
        const labelsRes = await fetch("/data/label_placements.json");
        if (labelsRes.ok) {
          const labelsData = await labelsRes.json();
          labelPlacements = Array.isArray(labelsData)
            ? labelsData
            : labelsData.labels || [];
        }
      } catch (err) {
        console.warn("Failed to load label placements", err);
      }

      points = allFanzines
        .map((f) => {
          const lat = parseFloat(f.latitude);
          const lon = parseFloat(f.longitude);
          if (!isFinite(lat) || !isFinite(lon)) return null;
          return { ...f, lat, lon };
        })
        .filter(Boolean);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });
</script>


<Header />

<div class="sticky top-0 z-0 h-[65vh] w-full">
  <div class="h-full w-full overflow-hidden bg-white">
    <!-- {#if loading}
        <div class="p-4 text-">Loading…</div>
      {:else if error}
        <div class="p-4 text-sm">{error}</div>
      {:else} -->
    <Map
      {italy}
      {points}
      {labelPlacements}
      query={searchQuery}
      projectionZoom={1}
      filteredItems={selectedCity
        ? [selectedCity]
        : searchQuery
          ? filteredCities
          : allFanzines}
      on:select={onMapSelect}
      on:visibleItemsChange={onVisibleItemsChange}
    />
    <!-- {/if} -->
  </div>
</div>

<div class="relative mx-auto bg-white w-full px-2 py-1">
  <SearchPanel
    bind:query={searchQuery}
    totalCount={allFanzines.length}
    {visibleCount}
    resultsCount={filteredCities.length}
    hasSelection={!!selectedCity}
    on:clear={onClearSearch}
  />

  <ResultsGrid
    items={selectedCity
      ? [selectedCity]
      : searchQuery
        ? filteredCities
        : viewportItems.length > 0
          ? viewportItems
          : allFanzines}
  />
</div>

<Footer />
