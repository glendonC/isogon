"""Evaluation harness for Isogon on real NASA FIRMS active-fire detections.

What is here:
  rows        FIRMS rows (dicts of the source's own columns) as arrays, with nothing dropped silently
  overpass    detections grouped into satellite overpasses
  grid        a 375 m evaluation grid over a box and the painting of pixel footprints onto it
  metrics     the score definitions, each stated in its docstring and echoed into every report
  baselines   MODIS detections painted as they are, and a single overlap ratio
  holdout     the one place where hidden rows are parted from the visible ones and sealed
  schedule    when to publish a prediction for a hidden instrument, from the platform and the calendar alone
  blind_test  hide one instrument, publish predictions from the other, then score against what was hidden

The harness never fetches data and never calls anything real that is not: the caller says where rows came from and
that label travels into the report. The fixture under backend/tests/fixtures is synthetic and named so.
"""
