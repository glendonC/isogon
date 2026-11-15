# Sources, credits and licences

This document lists what Isogon is built on: the scientific papers, the NASA data, the elevation and imagery services, the spacecraft models, the colour scales, the typefaces and the software libraries, each with its terms and the credit it asks for. It is for anyone who uses, redistributes or maintains the project.

The repository's own code is under the MIT License ([`LICENSE`](../LICENSE)). Everything below belongs to others and stays under its own terms.

## Scientific references

| Reference | Access | Where it is used |
| --- | --- | --- |
| Sofiev, M. and Kouznetsov, R. (2026), Cross-comparison and probabilistic detection limits of MODIS and VIIRS fire radiative power, *Geoscientific Model Development*, 19, 10123 (`https://gmd.copernicus.org/articles/19/10123/2026/`) | Paper: CC BY 4.0. Its companion code `FRP_OOp` (`https://doi.org/10.5281/zenodo.17486820`) is GPL-3.0 and is not copied, linked or translated: `backend/model/sensor_physics.py` implements the published equations independently. | The detection probability of a pixel (Tables 1 and 2), in the simulated engine and in the real estimate's treatment of passes that flagged nothing; the worldwide VIIRS to MODIS power ratio quoted in `backend/model/fitted_values/overlap_ratio.json`. |
| Wolfe, R. E., Lin, G., Nishihama, M., Tewari, K. P., Tilton, J. C. and Isaacman, A. R. (2013), Suomi NPP VIIRS prelaunch and on-orbit geometric calibration and characterization, *Journal of Geophysical Research: Atmospheres*, 118, 11508-11521 (`https://doi.org/10.1002/jgrd.50873`) | Journal article | The three aggregation zones of VIIRS (boundaries at 31.72 and 44.86 degrees) and the scan geometry in `backend/model/sensor_physics.py`. |
| Freeborn, P. H., Wooster, M. J., Roberts, G. and Xu, W. (2011; 2014), on the uncertainty of MODIS fire radiative power and its slant-path attenuation, *Remote Sensing of Environment* (`https://doi.org/10.1016/j.rse.2010.10.014`; `https://doi.org/10.1016/j.rse.2014.03.018`) | Journal articles | The slant-path transmittance in `backend/model/sensor_physics.py` and the per-pixel power uncertainty in `backend/model/occupancy.py`. |
| Romano, Y., Patterson, E. and Candes, E. (2019), Conformalized quantile regression, *Advances in Neural Information Processing Systems* (`https://arxiv.org/abs/1905.03222`) | Open preprint | The 90 percent interval of the simulated engine (`backend/model/calibrator.py`). |
| Zaksek, K., Ostir, K. and Kokalj, Z. (2011), Sky-view factor as a relief visualization technique, *Remote Sensing*, 3(2), 398-415 (`https://doi.org/10.3390/rs3020398`) | CC BY 3.0 | The sky-view channel of the terrain pack's auxiliary map (`backend/terrain/terrain_pack.py`). |
| NASA Terra (`https://terra.nasa.gov/about`), NASA Aqua (`https://science.nasa.gov/mission/aqua/`) and the WMO OSCAR satellite pages (`https://space.oscar.wmo.int/satellites/view/snpp`, `noaa_20`, `noaa_21`) | Public mission pages | Altitudes, inclinations, periods and equator crossing times of the five platforms (`backend/model/sensor_physics.py`, `backend/model/platforms.py`). Each run quotes them in `observer_passes.orbit_node_rule`. |

Related work that the code does not use:

| Reference | Access |
| --- | --- |
| Chen, Y. et al. (2026), the near real time extension of the Global Fire Emissions Database, `GFED5NRT`, *Earth System Science Data*, 18, 7535 to 7555, doi:10.5194/essd-18-7535-2026 (`https://essd.copernicus.org/articles/18/7535/2026/`) | CC BY 4.0 |
| Spatiotemporal fusion of `MYD14` and `VNP14IMG` active-fire detections (2026), *International Journal of Applied Earth Observation and Geoinformation* (`https://www.sciencedirect.com/science/article/pii/S1569843226002013`) | Open access |

## NASA data and services

| Service | Provider | Terms |
| --- | --- | --- |
| FIRMS active fire data: the country yearly files and the area API (MODIS Collection 6.1; VIIRS 375 m Collection 2 for Suomi NPP, NOAA-20 and NOAA-21) | NASA LANCE and EOSDIS (`https://firms.modaps.eosdis.nasa.gov/`) | Open NASA Earth science data, free to use and redistribute with acknowledgement of the source (`https://www.earthdata.nasa.gov/data/tools/firms`). The area API needs a free key. See [data.md](data.md). |
| Common Metadata Repository granule search, for `MOD14`, `MYD14`, `VNP14IMG`, `VJ114IMG` and `VJ214IMG` | NASA EOSDIS (`https://cmr.earthdata.nasa.gov/search/granules.json`) | Public metadata, no login. Two recorded answers are kept for the tests in `backend/tests/fixtures/cmr_recorded/`. |
| GIBS `BlueMarble_ShadedRelief_Bathymetry` | NASA EOSDIS Global Imagery Browse Services (`https://gibs.earthdata.nasa.gov/`) | United States Government work in the public domain. One image, `website/public/generated/terrain/earth_day.jpg`. |
| GIBS Corrected Reflectance, the day's photograph of a box: `MODIS_Terra_` and `MODIS_Aqua_CorrectedReflectance_TrueColor`, `_Bands721` and `_Bands367`; `VIIRS_SNPP_`, `VIIRS_NOAA20_` and `VIIRS_NOAA21_CorrectedReflectance_TrueColor`, `_BandsM11-I2-I1` and `_BandsM3-I3-M11`; `VIIRS_SNPP_SurfaceReflectance_BandsM11-M7-M5` and `_BandsI1-I2-I1` (from January 2012; Suomi NPP's Corrected Reflectance begins on 24 November 2015) | NASA EOSDIS Global Imagery Browse Services, keyless WMTS tiles (`https://gibs.earthdata.nasa.gov/wmts/epsg4326/best`) | Open NASA Earth science imagery, free to use with acknowledgement of GIBS. One picture a day per satellite, stitched from its daytime passes, about 250 m a pixel (500 m for `BandsM11-M7-M5`), cropped to a box (`backend/terrain/gibs_day.py`, `backend/server_gibs.py`); each crop keeps its source addresses in a manifest. Shown on demand under its own label; never a pass's detections. |
| GIBS cloud layers, the share of a box under cloud: `MODIS_Terra_` and `MODIS_Aqua_Cloud_Fraction_Day` and `_Night`; `VIIRS_SNPP_` and `VIIRS_NOAA20_Clear_Sky_Confidence_Day` and `_Night`, with their colour maps (`https://gibs.earthdata.nasa.gov/colormaps/v1.3/`) | NASA EOSDIS Global Imagery Browse Services, keyless WMTS tiles | Open NASA Earth science imagery, free to use with acknowledgement of GIBS. Read back to values through the published colour maps (`backend/firms/gibs_cloud.py`); a daily composite, shown beside each pass for display only. |

## Named fires

The names, dates, burned areas and points of the named fires in `backend/firms/places.json` (they name the featured fires) come from the fire agencies and the Copernicus Emergency Management Service; each entry names its page. Only the facts are used; no text or image is copied.

| Region | Fires | Pages |
| --- | --- | --- |
| `plumas_ca` | Dixie (2021), North Complex (2020), Camp (2018), Chips (2012), Park (2024) | CAL FIRE incident pages (`https://www.fire.ca.gov/incidents/`), the NIFC Wildland Fire Incident Locations service (`https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations/FeatureServer/0`), CAL FIRE's list of the largest California wildfires, the USDA Forest Service fire occurrence layer (`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_FireOccurrenceAndPerimeter_01/MapServer`) |
| `lytton_bc` | Lytton Creek (2021), Elephant Hill (2017), Stein Mountain, Ponderosa Creek and Kookipi Creek (2023) | BC Wildfire Service historical fire incidents, BC Data Catalogue (`https://openmaps.gov.bc.ca/geo/pub/wfs`, layer `PROT_HISTORICAL_INCIDENTS_SP`) |
| `evia_greece` | Northern Evia (2021), Mati and eastern Attica (2018), Varnavas (2024) | Copernicus EMS rapid mapping activations EMSR527, EMSR300 and EMSR746 (`https://mapping.emergency.copernicus.eu/activations/`), the European Forest Fire Information System burnt areas (`https://api.effis.emergency.copernicus.eu/rest/2/burntareas/current/`) |

Where two sources give different areas (the Northern Evia fire: 50,909 ha in the Copernicus activation as of 11 August 2021, 51,881 ha in EFFIS; the Mati fire: 1,275.9 ha for the Rafina area in Copernicus, 1,362 ha in EFFIS), the entry names the one it gives in `area_source`. The Chips Fire's entry gives CAL FIRE's 75,431 acres; the NIFC perimeter history gives 76,349.71 and MTBS 79,959. The Ponderosa Creek fire's entry gives the BC Data Catalogue's 12 July 2023; the BC Wildfire Service's incident feed gives 14 July as its discovery date.

## Elevation and imagery

The credit strings are the ones `backend/terrain/tile_store.py` holds; a run carries the credit of its imagery in `assets.terrain_pack.ortho.attribution` and the site shows it.

| Source key | Provider | Credit | Terms |
| --- | --- | --- | --- |
| `terrarium` | Terrain Tiles on AWS Open Data, Mapzen Terrarium encoding (`https://registry.opendata.aws/terrain-tiles/`) | "Terrain Tiles on AWS Open Data (Mapzen Terrarium): USGS 3DEP, NRCan CDEM, EU-DEM, SRTM and others" | Open data; the underlying elevation sets keep their own terms. Used for every elevation grid, including the tracked `ca_dem_f32.bin`, `ca_normals.png` and `earth_bump.png`. |
| `esri_world_imagery` | Esri World Imagery (`https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9`) | "Esri, Vantor, Earthstar Geographics, and the GIS User Community" | Esri's terms of use. The service is published for viewing, not for exporting tiles. Isogon fetches tiles on demand into the git-ignored `data/cache/`; no tracked file holds an Esri tile. Do not redistribute a cache or a terrain pack built from it. |
| `usgs_naip` | USGS The National Map, imagery only (`https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer`) | "USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2" | United States public domain. Covers the conterminous United States. A run whose request names no imagery takes it where it covers the box; a pack built from it is free to share. |
| `eox_s2cloudless_2016` | EOX IT Services GmbH, Sentinel-2 cloudless 2016, layer `s2cloudless_3857` (`https://cloudless.eox.at`) | "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)" | Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International, as EOX's licence page gives it (`https://cloudless.eox.at/documentation/license`): free for non-commercial use, and the imagery, changed or not, may be passed on as part of a work, with the credit visible wherever it is shown, without keeping anyone from learning of the original licence, and without implying endorsement by the European Commission or ESA. The page gives the 2016 layer no terms of its own, so it is taken under these. Global, 10 m data. A server started with `--imagery-elsewhere eox_s2cloudless_2016` takes it where NAIP does not cover. |
| `eox_s2cloudless_2020` | EOX IT Services GmbH, Sentinel-2 cloudless (`https://cloudless.eox.at`, `https://s2maps.eu`) | "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)" | EOX's licence page (`https://cloudless.eox.at/documentation/license`), which puts the layers of 2018 to 2025 under CC BY-NC-SA 4.0 (non-commercial, share-alike). `terrain_manifest.json` records CC BY 4.0 for the tracked `ca_satellite.jpg`. Used as the fallback when the default imagery cannot be fetched. |
| Natural Earth 1:50m land outlines, through the `world-atlas` package (`land-50m.json`) | Natural Earth (`https://www.naturalearthdata.com/about/terms-of-use/`) | "Natural Earth" | Public domain. |

`website/public/generated/terrain/terrain_manifest.json` lists the five tracked terrain files with their source, licence and SHA-256.

**The pictures of the ground on the public page.** In the United States the ground is USGS NAIP (public domain). Elsewhere it is the 2016 EOxCloudless layer, with its credit on screen wherever that ground is drawn. The pictures of the ground made from that layer (the terrain packs' images and their contexts) are under the same licence, Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International, and are not covered by any other licence the repository may take. The public page is non-commercial. It holds no Esri imagery.

## Spacecraft models

The models under `website/public/models/spacecraft/` come from NASA 3D Resources (`https://github.com/nasa/NASA-3D-Resources`). `manifest.json` beside them records each file's source, size, SHA-256 and terms. Credit: NASA.

| File | Source |
| --- | --- |
| `aqua.glb` | NASA's "Aqua (B)", unmodified |
| `suomi_npp.glb` | NASA's Suomi NPP model, unmodified |
| `terra.glb` | NASA's `Terra.glb` with two references to missing external texture files removed by `backend/terrain/glb_tools.py`; the geometry is byte for byte the original |

NOAA-20 and NOAA-21 are drawn from simple shapes in `website/src/stage/engine/spacecraft.ts`, because NASA 3D Resources has no separate model for them.

NASA media is generally not subject to copyright in the United States (`https://www.nasa.gov/nasa-brand-center/images-and-media/`). The NASA insignia and logotype are not in the public domain and are not used, and no endorsement by NASA is implied.

## Colour scales

`website/src/lib/colormaps.ts` holds three scales from Fabio Crameri's Scientific Colour Maps, version 8.0 (`https://www.fabiocrameri.ch/colourpalettes/`, `https://doi.org/10.5281/zenodo.8409685`), released under the MIT License: `lipari`, `batlow` and `roma`. Reference: Crameri, Shephard and Heron (2020), *Nature Communications* (`https://doi.org/10.1038/s41467-020-19160-7`).

## Typefaces

`website/index.html` loads two typefaces from Google Fonts. No font file is in the repository.

- Geist (`https://github.com/vercel/geist-font`), SIL Open Font License 1.1.
- IBM Plex Mono (`https://github.com/IBM/plex`), SIL Open Font License 1.1.

## Software

The backend runs on the Python 3.12 standard library with two packages. The site's packages and version ranges are in `website/package.json`; exact versions are in `website/package-lock.json`.

| Package | Used for | Licence |
| --- | --- | --- |
| `numpy` | Arrays, the estimate and the scores | BSD-3-Clause (`https://numpy.org/`) |
| `Pillow` | Reading and writing PNG and JPEG | MIT-CMU (`https://python-pillow.org/`) |
| `react`, `react-dom` | The site's interface | MIT (`https://react.dev/`) |
| `three` | The stage; its bundled Draco decoder reads two of the spacecraft models | MIT (`https://threejs.org/`); Draco is Apache-2.0 (`https://github.com/google/draco`) |
| `postprocessing` | Bloom and tone mapping on the stage | Zlib (`https://github.com/pmndrs/postprocessing`) |
| `topojson-client`, `world-atlas` | Land outlines (`website/src/lib/earthAtlas.ts`) | ISC (`https://github.com/topojson/topojson-client`, `https://github.com/topojson/world-atlas`) |
| `vite`, `@vitejs/plugin-react` | Development server and build | MIT (`https://vite.dev/`) |
| `typescript` | Type checking | Apache-2.0 (`https://www.typescriptlang.org/`) |
| Pyodide 0.27.7, with its builds of `numpy` 2.0.2 and `Pillow` 10.2.0 | Python compiled to WebAssembly, so the published page runs the backend's own held-out run and round in the visitor's browser. Its seven files, 17.9 MB, are copied into the page under `runtime/pyodide/` and served from it (`website/scripts/runtime-files.json` pins each by size and sha256; `website/scripts/fetch-runtime.mjs` fetches them for the build from `https://cdn.jsdelivr.net/pyodide/v0.27.7/full/`); a visitor's browser fetches nothing from another site | Pyodide MPL-2.0 (`https://pyodide.org/`); the CPython it compiles and its standard library PSF-2.0 (`https://www.python.org/`); `numpy` BSD-3-Clause; `Pillow` MIT-CMU |
