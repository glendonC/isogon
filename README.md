# Isogon

Satellites do not record fires directly; they record what their orbit, pixel footprint, detection threshold, and cloud cover allow them to see. Isogon reconstructs wildfire activity across 26 years of NASA MODIS (1 km, since 2000) and VIIRS (375 m, since 2012) detections, predicts what held-out instruments observe, and tests where to spend scarce high-resolution looks on a 3D terrain stage. Every reconstruction and observation policy is graded blind against real held-out satellite overpasses rather than visual plausibility.

## Why raw satellite records disagree

### The 2012 resolution and sensitivity step

MODIS on Terra (since 2000) and Aqua (since 2002) observes at 1 km nadir resolution, while VIIRS I-band on Suomi NPP (since 2012), NOAA-20 (since 2018), and NOAA-21 (since 2023) observes at 375 m and detects smaller, cooler fire fronts. Counting raw detections across decades creates an unphysical jump in 2012, while off-nadir bow-tie growth stretches pixel footprints toward swath edges.

### Ambiguous zero detections

Active-fire catalogues list positive thermal anomalies only. An empty grid cell can mean clear unburned ground, no satellite overpass, steep scan geometry, or cloud and smoke cover.

### Finite high-resolution looks

When coarse passes leave a fire perimeter uncertain, deciding where to aim limited 375 m observations requires distinguishing genuine state uncertainty from terrain already constrained by recent passes.

## License

Copyright © 2026 [Glendon Chin](https://github.com/glendonC).<br />
This project is [MIT](https://github.com/glendonC/isogon/blob/main/LICENSE) licensed.
