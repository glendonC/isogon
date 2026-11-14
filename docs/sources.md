# Sources, attributions, and licenses

This document lists the scientific literature, satellite datasets, elevation and orthoimagery providers, 3D spacecraft meshes, color scales, typefaces, and software libraries used by Isogon, together with their licenses and required attribution strings. Users, redistributors, and maintainers read it to verify provenance and license compliance across tracked assets and local caches. Isogon repository source code itself is released under the [MIT License](../LICENSE).

## Scientific literature and orbital references

The forward sensor model, monthly harmonization, terrain relief calculations, and uncertainty intervals in `backend/model/`, `backend/firms/`, and `backend/terrain/` draw on the following published works and mission specifications:

| Reference | License or access | Role in Isogon |
| --- | --- | --- |
| Sofiev, M. and Kouznetsov, R. (2026), Cross-comparison and probabilistic detection limits of MODIS and VIIRS fire radiative power, *Geoscientific Model Development*, 19, 10123 (`https://gmd.copernicus.org/articles/19/10123/2026/`) | Paper: CC BY 4.0. Companion FORTRAN code `FRP_OOp` (`https://doi.org/10.5281/zenodo.17486820`) is GPL-3.0 and is not copied, linked, or translated; `backend/model/sensor_physics.py` implements the published equations clean-room. | Logistic detection probability parameters (`lambda`, `mu`, `gamma` in Tables 1 and 2) and global VIIRS/MODIS FRP reference ratio (`backend/model/fitted_values/overlap_ratio.json`). |
| Wolfe, R. E., Lin, G., Nishihama, M., Tewari, K. P., Tilton, J. C., and Isaacman, A. R. (2013), Suomi NPP VIIRS prelaunch and on-orbit geometric calibration and characterization, *Journal of Geophysical Research: Atmospheres*, 118, 11508-11521 (`https://doi.org/10.1002/jgrd.50873`) | Published journal article | Three-zone cross-track aggregation boundaries (31.72 deg and 44.86 deg) and outer-row deletion geometry in `backend/model/sensor_physics.py`. |
| Freeborn, P. H., Wooster, M. J., Roberts, G., and Xu, W. (2011; 2014), MODIS fire radiative power uncertainty and slant-path transmittance, *Remote Sensing of Environment* (`https://doi.org/10.1016/j.rse.2010.10.014`; `https://doi.org/10.1016/j.rse.2014.03.018`) | Published journal articles | Nadir 4 um optical depth (`tau4_nadir = 0.085`) and view-zenith transmittance `exp(-tau4_nadir * (sec(vza) - 1))` in `backend/model/sensor_physics.py`. |
| Romano, Y., Patterson, E., and Candes, E. (2019), Conformalized Quantile Regression, *Advances in Neural Information Processing Systems (NeurIPS)* (`https://arxiv.org/abs/1905.03222`) | Open preprint / conference paper | Split conformal calibration of 90% flux intervals in `backend/model/calibrator.py` and `backend/model/gates.py`. |
| Zaksek, K., Ostir, K., and Kokalj, Z. (2011), Sky-view factor as a relief visualization technique, *Remote Sensing*, 3(2), 398-415 (`https://doi.org/10.3390/rs3020398`) | CC BY 3.0 | Horizon-angle sky-view factor stored in the regional terrain auxiliary texture (`backend/terrain/terrain_pack.py`). |
| Chen, Y. et al. (2026), Global Fire Emissions Database `GFED5NRT`, *Earth System Science Data*, 18, 1791 (`https://essd.copernicus.org/articles/18/1791/2026/`) | CC BY 4.0 | Reference comparison for multi-sensor active-fire harmonization across the 2012 Suomi NPP boundary. |
| Spatiotemporal fusion of `MYD14` and `VNP14IMG` active-fire detections (2026), *International Journal of Applied Earth Observation and Geoinformation* (`https://www.sciencedirect.com/science/article/pii/S1569843226002013`) | Open-access journal article | Reference comparison for Aqua MODIS and VIIRS 375 m cross-sensor fusion. |
| NASA Terra (`https://science.nasa.gov/mission/terra/`), NASA Aqua (`https://aqua.nasa.gov/`), and WMO OSCAR satellite sheets (`https://space.oscar.wmo.int/satellites/view/terra`, `aqua`, `snpp`, `noaa_20`, `noaa_21`) | Public mission documentation | Nominal altitudes, inclinations, orbital periods, equator crossing times, and Terra/Aqua drift notes for all five modeled platforms (`backend/model/platforms.py`, `backend/model/sensor_physics.py`). |

## NASA active-fire, granule, and global imagery services

| Service and products | Provider and URL | License and attribution terms |
| --- | --- | --- |
| NASA FIRMS active-fire archives and Area API (`MODIS` Collection 6.1 `MODIS_SP` / `MODIS_NRT`; `VIIRS` 375 m Collection 2 `VIIRS_SNPP_SP` / `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_SP` / `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`) | NASA LANCE / EOSDIS (`https://firms.modaps.eosdis.nasa.gov/`) | Open NASA Earth Science data (`https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance`), free for research and redistribution with source acknowledgment (`NASA FIRMS / EOSDIS`). See [docs/data.md](data.md). |
| NASA Common Metadata Repository (`CMR` `granules.json`) for `MOD14`, `MYD14`, `VNP14IMG`, `VJ114IMG`, and `VJ214IMG` | NASA EOSDIS (`https://cmr.earthdata.nasa.gov/search/granules.json`) | Public keyless metadata API (`backend/firms/cmr_passes.py`); recorded test excerpts sit in `backend/tests/fixtures/cmr_recorded/`. |
| NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` | NASA EOSDIS Global Imagery Browse Services (`https://gibs.earthdata.nasa.gov/`) | Public domain US Government work; baked into `website/public/generated/terrain/earth_day.jpg` (`terrain_manifest.json`). |

## Terrain elevation and orthoimagery providers

Attribution strings emitted by the backend tile store (`backend/terrain/tile_store.py`) and rendered in the viewport (`website/src/ui/attribution.ts`) match each upstream provider's terms:

| Source key and asset scope | Provider and service URL | Required attribution string | License and offline caching notes |
| --- | --- | --- | --- |
| `terrarium` (`data/cache/tiles/terrarium/`, `website/public/generated/terrain/ca_dem_f32.bin`, `earth_bump.png`) | AWS Open Data Terrain Tiles / Mapzen Terrarium (`https://registry.opendata.aws/terrain-tiles/`) | `"Terrain Tiles on AWS Open Data (Mapzen Terrarium): USGS 3DEP, NRCan CDEM, EU-DEM, SRTM and others"` | Open redistribution; underlying regional elevation sources are USGS 3DEP (US public domain), Natural Resources Canada CDEM (Open Government Licence - Canada), Copernicus EU-DEM, NASA SRTM (public domain), and NOAA ETOPO1 / USGS GMTED2010. |
| `esri_world_imagery` (`data/cache/tiles/esri_world_imagery/` and derived packs in `data/cache/hires_regions/`) | Esri World Imagery (`https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9`, `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer`) | `"Esri, Vantor, Earthstar Geographics, and the GIS User Community"` | Governed by the Esri Master License Agreement (`https://www.esri.com/en-us/legal/terms/full-master-agreement`). The service item page permits viewing use and states that the layer is not intended to be used to export tiles for offline viewing. In Isogon, `TileStore` and `terrain_pack.py` cache fetched tiles locally under untracked `data/cache/` directories on demand; tracked assets under `website/public/generated/terrain/` contain zero Esri tiles. |
| `eox_s2cloudless_2020` (`website/public/generated/terrain/ca_satellite.jpg` and open fallback in `TileStore`) | EOX IT Services GmbH (`https://s2maps.eu`, `https://cloudless.eox.at`) | `"EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)"` | Published under `CC BY-NC-SA 4.0` for non-commercial use with `CC BY 4.0` licensing documented at `https://s2maps.eu/`; requires exact attribution of EOX and Copernicus Sentinel data. |
| `usgs_naip` (`data/cache/tiles/usgs_naip/`) | USGS The National Map, USGS Imagery Only (`https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer`) | `"USDA, USGS The National Map: Orthoimagery. Data refreshed June, 2024.v1.2"` | US federal public domain (`exportTilesAllowed: true`); NAIP orthoimagery cached up to Web Mercator zoom 16 for the contiguous United States (`"imagery_source": "usgs_naip"` in `POST /api/reconstruct`). |
| Natural Earth 1:110m land polygons (`world-atlas/countries-110m.json`) | Natural Earth (`https://www.naturalearthdata.com/about/terms-of-use/`) | `"Natural Earth"` | Public domain (`CC0`-equivalent terms). |

## 3D spacecraft models

Spacecraft meshes under `website/public/models/spacecraft/` come from NASA 3D Resources (`https://github.com/nasa/NASA-3D-Resources`), verified in `website/public/models/spacecraft/manifest.json` and credited in `website/src/ui/attribution.ts` (`Credit: NASA`):

- `aqua.glb` (1,104,016 bytes): unmodified copy of NASA's `Aqua (B).glb`.
- `suomi_npp.glb` (2,283,576 bytes): unmodified copy of NASA's `Suomi National Polar-orbiting Partnership (Suomi NPP).glb`.
- `terra.glb` (2,150,364 bytes): derived from NASA's `Terra.glb` (2,150,600 bytes) via `backend/terrain/glb_tools.py strip-external-images`, which strips two broken external `.tga` texture references from the glTF JSON header while keeping the binary geometry chunk byte-for-byte identical.
- `NOAA-20` and `NOAA-21`: rendered procedurally in `website/src/stage/engine/spacecraft.ts` because NASA 3D Resources does not publish separate JPSS-1 or JPSS-2 `.glb` meshes.

NASA 3D models are US Government works subject to NASA Media Usage Guidelines (`https://www.nasa.gov/nasa-brand-center/images-and-media/`): the NASA insignia and logotype are not used, and no NASA endorsement is implied.

## Color scales

`website/src/lib/colormaps.ts` embeds three perceptually uniform lookup tables (`lipari` for thermal flux density, `batlow` for epistemic uncertainty `sigma`, and `roma` for diverging sensor residuals) from Fabio Crameri's *Scientific Colour Maps* v8.0 (`https://www.fabiocrameri.ch/colourpalettes/`), released under the MIT License (`https://doi.org/10.5281/zenodo.8409685`; Crameri, Shephard, and Heron, 2020, *Nature Communications*, `https://doi.org/10.1038/s41467-020-19160-7`).

## Typography

`website/index.html` and `website/src/styles/tokens.css` load two open-licensed typefaces from Google Fonts (`https://fonts.googleapis.com`) without bundling font binaries in the repository:

- `Geist` by Vercel (`https://vercel.com/font`, `https://github.com/vercel/geist-font`), licensed under the SIL Open Font License 1.1.
- `IBM Plex Mono` by IBM (`https://github.com/IBM/plex`), licensed under the SIL Open Font License 1.1.

## Runtime and build software

Isogon uses the Python 3.12 standard library alongside the following open-source packages (`website/package.json` and backend CLI entrypoints):

| Package | Scope | Version or constraint | License and upstream URL |
| --- | --- | --- | --- |
| `numpy` | Backend numerical arrays, solvers, and evaluation | Runtime CLI dependency (`--with numpy`) | BSD-3-Clause (`https://numpy.org/`) |
| `Pillow` | Backend PNG/JPEG terrain and tile encoding | Runtime CLI dependency (`--with pillow`) | MIT-CMU (`https://python-pillow.org/`) |
| `react`, `react-dom` | Frontend UI components | `^19.0.0` | MIT (`https://react.dev/`) |
| `three` | WebGL2 globe, terrain mesh, and Draco loader (`three/examples/jsm/libs/draco/`) | `^0.187.0` | MIT (`https://threejs.org/`); bundled Draco WASM decoder under Apache-2.0 (`https://github.com/google/draco`) |
| `postprocessing` | WebGL post-processing pass pipeline | `^6.39.6` | Zlib / MIT (`https://github.com/pmndrs/postprocessing`) |
| `topojson-client` | TopoJSON decoding for globe coastlines | `^3.1.0` | ISC (`https://github.com/topojson/topojson-client`) |
| `world-atlas` | Pre-built TopoJSON Natural Earth boundaries | `^2.0.2` | ISC (`https://github.com/topojson/world-atlas`) |
| `vite` | Frontend dev server and bundler | `^6.1.0` | MIT (`https://vite.dev/`) |
| `typescript` | Frontend static type checker | `^5.7.3` | Apache-2.0 (`https://www.typescriptlang.org/`) |
